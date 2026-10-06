package pstn2

import (
	"crypto/rand"
	"fmt"
	"strings"
	"time"
)

// Version is the SDK version.
const Version = "1.1.0"

// ProtocolVersion is the PSTN2 protocol version sent in X-PSTN2-Version and
// in message bodies.
const ProtocolVersion = "1.1"

// UserAgent is sent on every request. pstn2.org's WAF (and many others)
// rejects Go's default "Go-http-client/*" user agent, so the SDK never sends it.
const UserAgent = "pstn2-go-sdk/" + Version

// Default values (SPECIFICATION.md §9.4, §10.3).
const (
	DefaultTTL             = 86400 // seconds a number → holder answer may be cached
	DefaultHopLimit        = 5
	DefaultTimeout         = 2 * time.Second
	DefaultRetries         = 3
	DefaultRefreshInterval = 24 * time.Hour
)

// Digits returns the E.164 digits of a number without the leading "+"
// (any non-digit characters are dropped).
func Digits(number string) string {
	var b strings.Builder
	for _, r := range strings.TrimPrefix(number, "+") {
		if r >= '0' && r <= '9' {
			b.WriteRune(r)
		}
	}
	return b.String()
}

// E164 normalises a number to "+" followed by its digits.
func E164(number string) string { return "+" + Digits(number) }

// DisplayNumber renders a +44 number in UK national form, e.g.
// +441614960123 → "0161 496 0123". Other numbers are returned as E.164.
func DisplayNumber(number string) string {
	d := Digits(number)
	if !strings.HasPrefix(d, "44") {
		return "+" + d
	}
	n := "0" + d[2:]
	switch {
	case len(n) >= 3 && strings.HasPrefix(n, "02") && n[2] >= '0' && n[2] <= '9' && len(n) >= 7:
		return n[:3] + " " + n[3:7] + " " + n[7:]
	case strings.HasPrefix(n, "07") && len(n) > 5:
		return n[:5] + " " + n[5:]
	case (strings.HasPrefix(n, "011") || (len(n) >= 4 && n[:2] == "01" && n[3] == '1')) && len(n) >= 7:
		return n[:4] + " " + n[4:7] + " " + n[7:]
	case len(n) > 5:
		return n[:5] + " " + n[5:]
	}
	return n
}

// NewCallReference returns a random UUID v4 (SPECIFICATION.md §3.1.3).
func NewCallReference() string { return newUUID() }

func newUUID() string {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		// crypto/rand never fails on supported platforms; fall back to time.
		t := time.Now().UnixNano()
		for i := range b {
			b[i] = byte(t >> (uint(i%8) * 8))
		}
	}
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}

// Timestamp formats t as ISO 8601 UTC with milliseconds, e.g.
// 2026-10-06T09:00:00.000Z (the same form as JavaScript's toISOString).
func Timestamp(t time.Time) string { return t.UTC().Format("2006-01-02T15:04:05.000Z07:00") }
