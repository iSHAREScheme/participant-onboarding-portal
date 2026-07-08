package satellite

import (
	"encoding/base64"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"onboardingportal/config"
)

// DetectFrameworkVersion probes the satellite's version-discovery endpoints and
// returns the latest supported iSHARE framework version it can determine:
//
//   - GET /v3.0/frameworks responds 200             → "3.0" (the v3.0 frameworks
//     endpoint is specific to 3.0; it lives under the versioned /v3.0 path)
//   - GET /versions advertises 2.x/3.x versions      → the greatest one
//   - GET /capabilities → supported_versions[]       → the greatest 2.x/3.x one
//
// It returns ("", false) when no recognisable framework version is exposed —
// e.g. a middleware that only reports its own API version like "1.0" — so the
// caller can fall back to the configured SATELLITE_VERSION.
func DetectFrameworkVersion(cfg *config.Config) (string, bool) {
	base := strings.TrimRight(cfg.SatelliteBaseUrl, "/")
	if base == "" {
		return "", false
	}

	client := &http.Client{Timeout: 6 * time.Second}

	// A real access token from the satellite's /connect/token endpoint. The raw
	// client assertion is not a valid API bearer on conformant satellites, so we
	// exchange it here too. Best-effort: /versions and /capabilities are typically
	// public, so if the exchange fails we still probe them unauthenticated — only
	// /frameworks actually needs the token.
	token, _ := GetOwnerAccessToken(client, cfg)
	get := func(path string) (int, []byte) {
		req, err := http.NewRequest(http.MethodGet, base+path, nil)
		if err != nil {
			return 0, nil
		}
		if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		resp, err := client.Do(req)
		if err != nil {
			if cfg.SatelliteDebug {
				log.Printf("satellite: version-detect GET %s error: %v", path, err)
			}
			return 0, nil
		}
		defer resp.Body.Close()
		body, _ := io.ReadAll(resp.Body)
		if cfg.SatelliteDebug {
			log.Printf("satellite: version-detect GET %s → %d", path, resp.StatusCode)
		}
		return resp.StatusCode, body
	}

	// 1) A working /v3.0/frameworks endpoint is specific to v3.0. (It must be the
	// versioned path: the satellite keeps the UNVERSIONED endpoints on legacy 2.x
	// behaviour and has no unversioned /frameworks, so probing /frameworks would
	// miss a v3 satellite.)
	if status, _ := get("/v3.0/frameworks"); status == http.StatusOK {
		return "3.0", true
	}

	// 2) /versions advertises supported iSHARE versions.
	if v, ok := latestFromTokenArray(get, "/versions", []string{"versions_info", "versions"}, "version_name"); ok {
		return v, true
	}

	// 3) /capabilities → capabilities_info.supported_versions[].version
	if v, ok := latestFromCapabilities(get); ok {
		return v, true
	}

	return "", false
}

// decodeTokenPayload finds the first "*_token" field in the JSON body, decodes
// the JWT payload segment and returns it as a map.
func decodeTokenPayload(body []byte) map[string]interface{} {
	var top map[string]interface{}
	if json.Unmarshal(body, &top) != nil {
		return nil
	}
	for k, v := range top {
		tok, ok := v.(string)
		if !ok || !strings.Contains(k, "token") {
			continue
		}
		parts := strings.Split(tok, ".")
		if len(parts) != 3 {
			continue
		}
		raw, err := base64.RawURLEncoding.DecodeString(parts[1])
		if err != nil {
			continue
		}
		var payload map[string]interface{}
		if json.Unmarshal(raw, &payload) == nil {
			return payload
		}
	}
	return nil
}

func latestFromTokenArray(get func(string) (int, []byte), path string, arrayKeys []string, nameKey string) (string, bool) {
	status, body := get(path)
	if status != http.StatusOK {
		return "", false
	}
	payload := decodeTokenPayload(body)
	if payload == nil {
		return "", false
	}
	var arr []interface{}
	for _, k := range arrayKeys {
		if a, ok := payload[k].([]interface{}); ok {
			arr = a
			break
		}
	}
	return latestRecognised(arr, nameKey)
}

func latestFromCapabilities(get func(string) (int, []byte)) (string, bool) {
	status, body := get("/capabilities")
	if status != http.StatusOK {
		return "", false
	}
	payload := decodeTokenPayload(body)
	if payload == nil {
		return "", false
	}
	info, ok := payload["capabilities_info"].(map[string]interface{})
	if !ok {
		return "", false
	}
	arr, _ := info["supported_versions"].([]interface{})
	return latestRecognised(arr, "version")
}

// latestRecognised returns the greatest version in arr that looks like an
// iSHARE framework version (starts with "2." or "3.") and isn't flagged
// non-active.
func latestRecognised(arr []interface{}, nameKey string) (string, bool) {
	best := ""
	for _, it := range arr {
		m, ok := it.(map[string]interface{})
		if !ok {
			continue
		}
		name := strings.TrimSpace(asString(m[nameKey]))
		if !isFrameworkVersion(name) || !activeStatus(m["version_status"]) {
			continue
		}
		if best == "" || compareVersions(name, best) > 0 {
			best = name
		}
	}
	return best, best != ""
}

func asString(v interface{}) string {
	if s, ok := v.(string); ok {
		return s
	}
	return ""
}

func isFrameworkVersion(v string) bool {
	return strings.HasPrefix(v, "2.") || strings.HasPrefix(v, "3.")
}

// activeStatus is lenient: a version counts unless it is explicitly non-active.
func activeStatus(v interface{}) bool {
	if s, ok := v.(string); ok {
		s = strings.ToLower(strings.TrimSpace(s))
		return s == "" || s == "active" || s == "current" || s == "supported"
	}
	return true // status absent or structured → don't exclude
}

// compareVersions does a numeric dotted comparison: >0 if a>b, <0 if a<b, 0 if equal.
func compareVersions(a, b string) int {
	pa := strings.Split(a, ".")
	pb := strings.Split(b, ".")
	n := len(pa)
	if len(pb) > n {
		n = len(pb)
	}
	for i := 0; i < n; i++ {
		var x, y int
		if i < len(pa) {
			x, _ = strconv.Atoi(pa[i])
		}
		if i < len(pb) {
			y, _ = strconv.Atoi(pb[i])
		}
		if x != y {
			if x > y {
				return 1
			}
			return -1
		}
	}
	return 0
}
