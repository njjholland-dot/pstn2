package pstn2

import (
	"context"
	"strings"
	"sync"
	"testing"
)

const (
	alphaID   = "CP1-UK-0101"
	bravoID   = "CP1-UK-0102"
	charlieID = "CP1-UK-0103"
)

func mockClient(t *testing.T, base, cpID string, onEvent func(DiscoveryEvent)) *Client {
	t.Helper()
	c, err := NewClient(Config{CPID: cpID, NumberingListURL: base + "/numbering-list.json", OnEvent: onEvent})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = c.Close() })
	return c
}

// portAfterFirstDiscovery returns an event hook that ports number the first
// time its discovery completes — i.e. between discovery and the module
// request, so the module request reaches a CP that answers not_held.
func portAfterFirstDiscovery(t *testing.T, base, number, from, to string) func(DiscoveryEvent) {
	var once sync.Once
	return func(e DiscoveryEvent) {
		if e.Type == EventResult && e.Number == number {
			once.Do(func() { adminPort(t, base, number, from, to) })
		}
	}
}

func TestModulesVerifyCall(t *testing.T) {
	base := startMock(t)
	ctx := context.Background()
	charlie := mockClient(t, base, charlieID, nil)
	called := "+441134960789"

	v, err := charlie.Auth().VerifyCall(ctx, VerifyCallRequest{CallerID: "+442079460100", CalledID: called})
	if err != nil || !v.Verified || v.Reason != ReasonVerified || v.Fallback || v.Via.Holder.CPID != alphaID || v.CallerOrg != "Alpha Telecom" {
		t.Fatalf("alpha caller: %+v %v", v, err)
	}
	if v.CallReference == "" || len(v.CallReference) != 36 {
		t.Fatalf("call reference %q", v.CallReference)
	}
	v, err = charlie.Auth().VerifyCall(ctx, VerifyCallRequest{CallerID: "+441614960123", CalledID: called, CallReference: "0d1f2a3b-4c5d-4e6f-8a7b-9c0d1e2f3a4b"})
	if err != nil || !v.Verified || v.Via.Holder.CPID != bravoID || v.CallReference != "0d1f2a3b-4c5d-4e6f-8a7b-9c0d1e2f3a4b" {
		t.Fatalf("bravo caller: %+v %v", v, err)
	}
	// Spoofed / not in service → discovery unknown → not verified, no error.
	v, err = charlie.Auth().VerifyCall(ctx, VerifyCallRequest{CallerID: "+441614960999", CalledID: called})
	if err != nil || v.Verified || v.Reason != ReasonCallerIDUnknown || !v.Fallback || v.Via.Discovery.Result != ResultUnknown {
		t.Fatalf("spoofed: %+v %v", v, err)
	}
	// Unallocated and non-participating.
	if v, _ := charlie.Auth().VerifyCall(ctx, VerifyCallRequest{CallerID: "+441154960555", CalledID: called}); v.Reason != ReasonUnallocated {
		t.Fatalf("unallocated: %+v", v)
	}
	if v, _ := charlie.Auth().VerifyCall(ctx, VerifyCallRequest{CallerID: "+441174960555", CalledID: called}); v.Reason != ReasonNotParticipating {
		t.Fatalf("not participating: %+v", v)
	}
	// Ported caller ID: Charlie (Range Holder) redirects to Bravo, which verifies.
	v, err = charlie.Auth().VerifyCall(ctx, VerifyCallRequest{CallerID: "+441134960456", CalledID: called})
	if err != nil || !v.Verified || v.Via.Holder.CPID != bravoID || strings.Join(v.Via.Discovery.Hops, ",") != charlieID+","+bravoID || !v.Via.Discovery.Ported {
		t.Fatalf("ported: %+v %+v %v", v, v.Via.Discovery, err)
	}

	// The verify request went to the holder with the right body.
	var ops []logEntry
	for _, e := range adminLog(t, base) {
		if e.Op == "auth/verify" {
			ops = append(ops, e)
			if e.UserAgent != UserAgent {
				t.Fatalf("UA %q", e.UserAgent)
			}
		}
	}
	if len(ops) != 3 || ops[0].CPID != alphaID || ops[1].CPID != bravoID || ops[2].CPID != bravoID {
		t.Fatalf("verify ops %+v", ops)
	}
}

func TestModulesNotHeldRetry(t *testing.T) {
	base := startMock(t)
	ctx := context.Background()

	// Bravo's own number ports to Alpha between discovery and verification:
	// Bravo answers not_held → purge → rediscover (Bravo redirects to Alpha) →
	// retry at Alpha.
	n := "+441614960123"
	charlie := mockClient(t, base, charlieID, portAfterFirstDiscovery(t, base, n, bravoID, alphaID))
	v, err := charlie.Auth().VerifyCall(ctx, VerifyCallRequest{CallerID: n, CalledID: "+441134960789"})
	if err != nil || !v.Verified {
		t.Fatalf("verify: %+v %v", v, err)
	}
	via := v.Via
	if !via.Retried || via.NotHeldBy.CPID != bravoID || via.Holder.CPID != alphaID ||
		strings.Join(via.FirstDiscovery.Hops, ",") != bravoID || strings.Join(via.Discovery.Hops, ",") != bravoID+","+alphaID || via.Discovery.FromCache {
		t.Fatalf("via %+v first %+v second %+v", via, via.FirstDiscovery, via.Discovery)
	}
	if e, ok := charlie.Discovery().Cache().Get(n); !ok || e.Holder.CPID != alphaID || !e.Ported {
		t.Fatalf("cache after retry: %+v", e)
	}

	// Routing: Alpha's number +442079460101 ports to Charlie mid-call setup.
	adminPost(t, base, "/admin/reset", map[string]any{})
	n = "+442079460101"
	alpha := mockClient(t, base, alphaID, portAfterFirstDiscovery(t, base, n, alphaID, charlieID))
	r, err := alpha.Routing().RequestRouting(ctx, RoutingRequest{CallerID: "+442079460100", DestinationNumber: n})
	if err != nil || !r.Accepted || !r.Via.Retried || r.Via.Holder.CPID != charlieID || r.ConnectionDetails.FQDN != "media.charlie.example" {
		t.Fatalf("routing: %+v %v", r, err)
	}

	// Emergency: Bravo's +441614960500 ports to Charlie.
	adminPost(t, base, "/admin/reset", map[string]any{})
	n = "+441614960500"
	psap := mockClient(t, base, "UK-999-MANCHESTER-01", portAfterFirstDiscovery(t, base, n, bravoID, charlieID))
	loc, err := psap.Emergency().GetLocation(ctx, LocationRequest{CallerID: n, PSAPID: "UK-999-MANCHESTER-01"})
	if err != nil || !loc.Via.Retried || loc.Via.Holder.CPID != charlieID || loc.Location.Latitude == 0 {
		t.Fatalf("emergency: %+v %v", loc, err)
	}

	// Token creation: Charlie's +441134960789 ports to Bravo.
	adminPost(t, base, "/admin/reset", map[string]any{})
	n = "+441134960789"
	charlie2 := mockClient(t, base, charlieID, portAfterFirstDiscovery(t, base, n, charlieID, bravoID))
	tok, err := charlie2.Auth().CreateToken(ctx, TokenRequest{CallerID: n, CalledID: "+442079460100"})
	if err != nil || !tok.Via.Retried || tok.Via.Holder.CPID != bravoID {
		t.Fatalf("token: %+v %v", tok, err)
	}

	// A stale *cache* (port before the call) is handled inside discovery
	// itself: the cached holder answers not_held to the discovery query.
	adminPost(t, base, "/admin/reset", map[string]any{})
	alpha2 := mockClient(t, base, alphaID, nil)
	if r := alpha2.Discover(ctx, "+441134960456"); r.Holder.CPID != bravoID {
		t.Fatalf("%+v", r)
	}
	adminPort(t, base, "+441134960456", bravoID, charlieID)
	r2, err := alpha2.Routing().RequestRouting(ctx, RoutingRequest{CallerID: "+442079460100", DestinationNumber: "+441134960456"})
	if err != nil || !r2.Accepted || r2.Via.Retried || r2.Via.Holder.CPID != charlieID || !r2.Via.Discovery.Invalidated {
		t.Fatalf("stale cache routing: %+v %+v %v", r2, r2.Via.Discovery, err)
	}
}

func TestModulesTokenRoutingEmergency(t *testing.T) {
	base := startMock(t)
	ctx := context.Background()
	alpha := mockClient(t, base, alphaID, nil)
	bravo := mockClient(t, base, bravoID, nil)

	// Token Pool: Alpha creates a token for its caller ID, Bravo verifies it.
	tok, err := alpha.Auth().CreateToken(ctx, TokenRequest{CallerID: "+442079460100", CalledID: "+441614960123", TTL: 30})
	if err != nil || !TokenPattern.MatchString(tok.TokenID) || tok.ExpiresAt == "" || tok.Via.Holder.CPID != alphaID {
		t.Fatalf("create: %+v %v", tok, err)
	}
	tv, err := bravo.Auth().VerifyToken(ctx, "+442079460100", tok.TokenID)
	if err != nil || !tv.Verified || tv.OriginatingCP != alphaID || tv.CallReference != tok.CallReference || tv.CalledID != "+441614960123" {
		t.Fatalf("verify: %+v %v", tv, err)
	}
	if _, err := bravo.Auth().VerifyToken(ctx, "+442079460100", "TK-AAAAAAAAAAAAAAAA"); ErrorCode(err) != CodeInvalidToken {
		t.Fatalf("unknown token: %v", err)
	}
	if _, err := bravo.Auth().VerifyToken(ctx, "+442079460100", "bogus"); ErrorCode(err) != CodeInvalidToken {
		t.Fatalf("malformed token: %v", err)
	}
	// A token is only valid at the caller ID's holder.
	if _, err := bravo.Auth().VerifyToken(ctx, "+441614960123", tok.TokenID); ErrorCode(err) != CodeInvalidToken {
		t.Fatalf("token at wrong holder: %v", err)
	}

	// Routing with media negotiation.
	r, err := alpha.Routing().RequestRouting(ctx, RoutingRequest{
		CallerID: "+442079460100", DestinationNumber: "+441614960123",
		MediaCapabilities: MediaCapabilities{Codecs: []string{"g729", "opus", "pcmu"}, Encryption: []string{"srtp-aes256"}},
		PublicKey:         "dGVzdA==",
	})
	if err != nil || !r.Accepted || r.ConnectionDetails.Port != 5061 || r.AgreedCapabilities.Codecs[0] != "opus" || r.AgreedCapabilities.Encryption[0] != "srtp-aes256" {
		t.Fatalf("routing: %+v %v", r, err)
	}
	// No common codec → 400 unsupported_codec.
	_, err = alpha.Routing().RequestRouting(ctx, RoutingRequest{CallerID: "+442079460100", DestinationNumber: "+441614960123",
		MediaCapabilities: MediaCapabilities{Codecs: []string{"g729"}}})
	if ErrorCode(err) != CodeUnsupportedCodec {
		t.Fatalf("codec: %v", err)
	}
	// No PSTN2 holder → DiscoveryError → PSTN fallback.
	_, err = alpha.Routing().RequestRouting(ctx, RoutingRequest{CallerID: "+442079460100", DestinationNumber: "+441174960555"})
	if de, ok := IsDiscoveryError(err); !ok || de.Result.Result != ResultNotParticipating {
		t.Fatalf("not participating: %v", err)
	}

	// Emergency location.
	loc, err := bravo.Emergency().GetLocation(ctx, LocationRequest{CallerID: "+441614960123", PSAPID: "UK-999-MANCHESTER-01"})
	if err != nil || loc.Location.Source != "gps" || loc.Address == nil || loc.Address.Postcode != "M1 1AA" {
		t.Fatalf("location: %+v %v", loc, err)
	}
	if _, err := bravo.Emergency().GetLocation(ctx, LocationRequest{CallerID: "+441614960999", PSAPID: "UK-999-MANCHESTER-01"}); ErrorCode(err) != ResultUnknown {
		t.Fatalf("unknown caller: %v", err)
	}
}
