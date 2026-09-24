package verification

import (
	"bytes"
	"compress/gzip"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"onboardingportal/utils"
)

// Revocation follows W3C Bitstring Status List v1.0, which is what the iSHARE
// VC profile mandates (schemas/v3/common/credential-status.json) and what the
// companion issuer produces: a GZIP-compressed bitstring, base64url-encoded and
// prefixed with the multibase code 'u', where bit N (counted MSB-first within
// each byte) is set when the credential at statusListIndex N is revoked.

const (
	statusFetchTimeout = 10 * time.Second
	maxStatusListBytes = 2 * 1024 * 1024
	statusListTTL      = 5 * time.Minute

	// StatusCheckRequired treats an unreachable or unreadable status list as a
	// verification failure.
	StatusCheckRequired = "required"
	// StatusCheckSoft (the default) reports an unreachable list as a warning but
	// still fails closed when the list is readable and says "revoked".
	StatusCheckSoft = "soft"
	// StatusCheckOff skips revocation entirely.
	StatusCheckOff = "off"
)

// CredentialStatus is one BitstringStatusListEntry from a credential.
type CredentialStatus struct {
	ID                   string `json:"id"`
	Type                 string `json:"type"`
	StatusPurpose        string `json:"statusPurpose"`
	StatusListIndex      string `json:"statusListIndex"`
	StatusListCredential string `json:"statusListCredential"`
}

// StatusChecker answers whether a credential has been revoked or suspended.
type StatusChecker interface {
	// Check returns the set purposes (e.g. "revocation") for the entry. An empty
	// result means the credential is in good standing.
	Check(entry CredentialStatus) ([]string, error)
}

type cachedStatusList struct {
	bits    []byte
	expires time.Time
}

// HTTPStatusChecker fetches and caches status list credentials.
type HTTPStatusChecker struct {
	Client *http.Client

	mu    sync.Mutex
	cache map[string]cachedStatusList
}

func NewHTTPStatusChecker() *HTTPStatusChecker {
	// A statusListCredential URL comes from inside the presentation, so it is
	// untrusted input and always goes through the SSRF-guarded client.
	return &HTTPStatusChecker{
		Client: utils.GuardedHTTPClient(statusFetchTimeout),
		cache:  map[string]cachedStatusList{},
	}
}

func (s *HTTPStatusChecker) Check(entry CredentialStatus) ([]string, error) {
	if strings.TrimSpace(entry.StatusListCredential) == "" {
		return nil, fmt.Errorf("status entry has no statusListCredential")
	}
	index, err := strconv.Atoi(strings.TrimSpace(entry.StatusListIndex))
	if err != nil {
		return nil, fmt.Errorf("statusListIndex %q is not a number", entry.StatusListIndex)
	}
	if index < 0 {
		return nil, fmt.Errorf("statusListIndex %d is negative", index)
	}

	bits, err := s.loadList(entry.StatusListCredential)
	if err != nil {
		return nil, err
	}
	set, err := bitAt(bits, index)
	if err != nil {
		return nil, err
	}
	if !set {
		return nil, nil
	}
	purpose := strings.TrimSpace(entry.StatusPurpose)
	if purpose == "" {
		purpose = "revocation"
	}
	return []string{purpose}, nil
}

func (s *HTTPStatusChecker) loadList(listURL string) ([]byte, error) {
	s.mu.Lock()
	if entry, ok := s.cache[listURL]; ok && time.Now().Before(entry.expires) {
		s.mu.Unlock()
		return entry.bits, nil
	}
	s.mu.Unlock()

	if !strings.HasPrefix(listURL, "http://") && !strings.HasPrefix(listURL, "https://") {
		return nil, fmt.Errorf("statusListCredential must be an http(s) URL")
	}
	client := s.Client
	if client == nil {
		client = utils.GuardedHTTPClient(statusFetchTimeout)
	}
	resp, err := client.Get(listURL)
	if err != nil {
		return nil, fmt.Errorf("fetching status list: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("status list returned %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, maxStatusListBytes+1))
	if err != nil {
		return nil, err
	}
	if len(body) > maxStatusListBytes {
		return nil, fmt.Errorf("status list exceeds %d bytes", maxStatusListBytes)
	}

	encoded, err := encodedListFromCredential(body)
	if err != nil {
		return nil, err
	}
	bits, err := DecodeEncodedList(encoded)
	if err != nil {
		return nil, err
	}

	s.mu.Lock()
	if s.cache == nil {
		s.cache = map[string]cachedStatusList{}
	}
	s.cache[listURL] = cachedStatusList{bits: bits, expires: time.Now().Add(statusListTTL)}
	s.mu.Unlock()
	return bits, nil
}

// encodedListFromCredential pulls credentialSubject.encodedList out of a status
// list credential served either as plain JSON or as a vc+jwt.
func encodedListFromCredential(body []byte) (string, error) {
	trimmed := strings.TrimSpace(string(body))
	payload := body
	if looksLikeCompactJWT(trimmed) {
		decoded, err := DecodeJWTPayload(trimmed)
		if err != nil {
			return "", fmt.Errorf("status list JWT is unreadable: %w", err)
		}
		payload = decoded
	}

	var envelope struct {
		VC                json.RawMessage `json:"vc"`
		CredentialSubject json.RawMessage `json:"credentialSubject"`
	}
	if err := json.Unmarshal(payload, &envelope); err != nil {
		return "", fmt.Errorf("status list is not valid JSON: %w", err)
	}
	subjectRaw := envelope.CredentialSubject
	if len(subjectRaw) == 0 && len(envelope.VC) > 0 {
		var inner struct {
			CredentialSubject json.RawMessage `json:"credentialSubject"`
		}
		if err := json.Unmarshal(envelope.VC, &inner); err == nil {
			subjectRaw = inner.CredentialSubject
		}
	}
	if len(subjectRaw) == 0 {
		return "", fmt.Errorf("status list has no credentialSubject")
	}

	// credentialSubject may be an object or (rarely) an array of them.
	var subject struct {
		EncodedList string `json:"encodedList"`
	}
	if err := json.Unmarshal(subjectRaw, &subject); err != nil {
		var subjects []struct {
			EncodedList string `json:"encodedList"`
		}
		if err := json.Unmarshal(subjectRaw, &subjects); err != nil || len(subjects) == 0 {
			return "", fmt.Errorf("status list credentialSubject is malformed")
		}
		subject.EncodedList = subjects[0].EncodedList
	}
	if strings.TrimSpace(subject.EncodedList) == "" {
		return "", fmt.Errorf("status list has no encodedList")
	}
	return subject.EncodedList, nil
}

// DecodeEncodedList reverses the multibase+GZIP+base64url encoding of an
// `encodedList` into its raw bitstring.
func DecodeEncodedList(encoded string) ([]byte, error) {
	encoded = strings.TrimSpace(encoded)
	if encoded == "" {
		return nil, fmt.Errorf("encodedList is empty")
	}
	if encoded[0] != 'u' {
		return nil, fmt.Errorf("unsupported multibase prefix %q (want 'u')", encoded[0])
	}
	compressed, err := base64.RawURLEncoding.DecodeString(strings.TrimRight(encoded[1:], "="))
	if err != nil {
		return nil, fmt.Errorf("encodedList is not base64url: %w", err)
	}
	reader, err := gzip.NewReader(bytes.NewReader(compressed))
	if err != nil {
		return nil, fmt.Errorf("encodedList is not gzip: %w", err)
	}
	defer reader.Close()
	// Bound the inflated size so a zip bomb cannot exhaust memory.
	bits, err := io.ReadAll(io.LimitReader(reader, maxStatusListBytes+1))
	if err != nil {
		return nil, fmt.Errorf("inflating encodedList: %w", err)
	}
	if len(bits) > maxStatusListBytes {
		return nil, fmt.Errorf("inflated status list exceeds %d bytes", maxStatusListBytes)
	}
	return bits, nil
}

// bitAt reports whether bit index is set, counting MSB-first within each byte
// as the Bitstring Status List specification requires.
func bitAt(bits []byte, index int) (bool, error) {
	if index >= len(bits)*8 {
		return false, fmt.Errorf("statusListIndex %d is past the end of a %d-bit list", index, len(bits)*8)
	}
	return bits[index/8]&(1<<(7-uint(index%8))) != 0, nil
}
