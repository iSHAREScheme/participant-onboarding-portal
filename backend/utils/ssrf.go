package utils

import (
	"fmt"
	"net"
	"net/http"
	"syscall"
	"time"
)

// SSRF protection for outbound fetches of caller-influenced URLs. This lives in
// utils because two subsystems need the identical rule: agreement documents
// fetched from an admin-supplied URL, and the DID documents / status lists the
// VC verifier resolves from identifiers found inside a wallet's presentation.

// IsBlockedIP reports whether an address must not be reached when fetching a
// URL that a caller can influence (loopback, private, link-local including the
// cloud metadata endpoint 169.254.169.254, unspecified, and CGNAT 100.64.0.0/10).
func IsBlockedIP(ip net.IP) bool {
	if ip.IsLoopback() || ip.IsPrivate() || ip.IsUnspecified() ||
		ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() ||
		ip.IsInterfaceLocalMulticast() {
		return true
	}
	if ip4 := ip.To4(); ip4 != nil && ip4[0] == 100 && ip4[1] >= 64 && ip4[1] <= 127 {
		return true
	}
	return false
}

// SSRFGuardControl is the net.Dialer Control hook: it rejects connections to
// non-public IP ranges. Because Control runs for every connection attempt with
// the already-resolved address, it also covers redirects and DNS rebinding.
func SSRFGuardControl(network, address string, _ syscall.RawConn) error {
	host, _, err := net.SplitHostPort(address)
	if err != nil {
		return err
	}
	ip := net.ParseIP(host)
	if ip == nil {
		return fmt.Errorf("could not parse dial address %q", address)
	}
	if IsBlockedIP(ip) {
		return fmt.Errorf("blocked non-public address %s", ip)
	}
	return nil
}

// GuardedHTTPClient returns a client that can only reach public addresses.
// Use it for any URL derived from untrusted input.
func GuardedHTTPClient(timeout time.Duration) *http.Client {
	dialer := &net.Dialer{Timeout: 10 * time.Second, Control: SSRFGuardControl}
	return &http.Client{
		Timeout:   timeout,
		Transport: &http.Transport{DialContext: dialer.DialContext},
	}
}
