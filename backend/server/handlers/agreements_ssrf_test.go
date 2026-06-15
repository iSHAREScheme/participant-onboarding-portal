package handlers

import (
	"net"
	"testing"
)

// TestIsBlockedIP verifies the SSRF allow/deny list used when fetching
// admin-supplied agreement URLs: internal/loopback/link-local must be blocked,
// public addresses allowed.
func TestIsBlockedIP(t *testing.T) {
	blocked := []string{
		"127.0.0.1",       // loopback
		"::1",             // loopback v6
		"10.0.0.5",        // private
		"172.16.0.1",      // private
		"192.168.1.1",     // private
		"169.254.169.254", // link-local (cloud metadata)
		"100.64.0.1",      // CGNAT
		"0.0.0.0",         // unspecified
		"fe80::1",         // link-local v6
		"fc00::1",         // unique-local v6
	}
	for _, s := range blocked {
		if ip := net.ParseIP(s); ip == nil || !isBlockedIP(ip) {
			t.Errorf("expected %s to be blocked", s)
		}
	}
	allowed := []string{
		"8.8.8.8",
		"1.1.1.1",
		"93.184.216.34", // example.com
		"2606:2800:220:1:248:1893:25c8:1946",
	}
	for _, s := range allowed {
		if ip := net.ParseIP(s); ip == nil || isBlockedIP(ip) {
			t.Errorf("expected %s to be allowed", s)
		}
	}
}

// TestSSRFGuardControl verifies the dialer hook rejects internal targets and
// permits public ones (the address arg is the resolved "ip:port").
func TestSSRFGuardControl(t *testing.T) {
	for _, addr := range []string{"127.0.0.1:443", "169.254.169.254:80", "10.1.2.3:8080"} {
		if err := ssrfGuardControl("tcp", addr, nil); err == nil {
			t.Errorf("expected %s to be blocked", addr)
		}
	}
	if err := ssrfGuardControl("tcp", "8.8.8.8:443", nil); err != nil {
		t.Errorf("expected public address allowed, got %v", err)
	}
}
