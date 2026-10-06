package pstn2

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"
)

func ed25519GenerateKey() (ed25519.PublicKey, ed25519.PrivateKey, error) {
	return ed25519.GenerateKey(rand.Reader)
}

func newMemClient(t *testing.T, m *memNetwork, cfg DiscoveryConfig) *DiscoveryClient {
	t.Helper()
	cfg.NumberingList = m.list
	cfg.Query = m.query
	d, err := NewDiscoveryClient(cfg)
	if err != nil {
		t.Fatal(err)
	}
	return d
}

// TestDiscoveryScenariosOffline runs scenarios A–G against RangeHolderResponders
// in memory (no node needed) with one persistent client, as the reference
// engine tests do.
func TestDiscoveryScenariosOffline(t *testing.T) {
	m := newMemNetwork(loadHarness(t))
	d := newMemClient(t, m, DiscoveryConfig{CPID: "CP1-UK-0101"})
	for _, sc := range loadScenarios(t) {
		if sc.Before != nil && sc.Before.Port != nil {
			p := sc.Before.Port
			m.port(p.Number, p.FromCPID, p.ToCPID)
		}
		checkScenario(t, sc, d.Discover(context.Background(), sc.Number))
	}
}

func TestDiscoveryEvents(t *testing.T) {
	m := newMemNetwork(loadHarness(t))
	d := newMemClient(t, m, DiscoveryConfig{})
	var types []string
	res := d.Discover(context.Background(), "+441134960456", WithEvents(func(e DiscoveryEvent) {
		types = append(types, e.Type)
		if e.Number != "+441134960456" {
			t.Errorf("event number %q", e.Number)
		}
		if e.Type == EventRedirect && (e.From.CPID != "CP1-UK-0103" || e.To.CPID != "CP1-UK-0102") {
			t.Errorf("redirect %+v → %+v", e.From, e.To)
		}
		if e.Type == EventQuery && !strings.HasSuffix(e.URL, "/pstn2/v1/numbers/441134960456") {
			t.Errorf("query url %s", e.URL)
		}
	}))
	want := "cache-miss list-lookup query response redirect query response cache-store result"
	if strings.Join(types, " ") != want {
		t.Fatalf("events:\n got %s\nwant %s", strings.Join(types, " "), want)
	}
	if !res.Held() || !res.Ported {
		t.Fatalf("result %+v", res)
	}

	// Stale cache: cache-hit → query → not_held → purge → list → Range Holder.
	m.port("+441134960456", "CP1-UK-0102", "CP1-UK-0103")
	types = nil
	res = d.Discover(context.Background(), "+441134960456", WithEvents(func(e DiscoveryEvent) { types = append(types, e.Type) }))
	want = "cache-hit query response cache-purge list-lookup query response cache-store result"
	if strings.Join(types, " ") != want || !res.Invalidated || res.FromCache {
		t.Fatalf("events:\n got %s\nwant %s\n%+v", strings.Join(types, " "), want, res)
	}
}

type fakeAnswer struct {
	status int
	body   any
	err    error
}

func fakeClient(t *testing.T, blocks []NumberingBlock, answers map[string]fakeAnswer, cfg DiscoveryConfig) (*DiscoveryClient, *[]string) {
	t.Helper()
	var hits []string
	cfg.NumberingList = NewNumberingList(NumberingListData{Blocks: blocks})
	cfg.Query = func(_ context.Context, target CpRef, number string) (int, []byte, error) {
		hits = append(hits, target.CPID)
		a, ok := answers[target.CPID]
		if !ok {
			return 404, nil, nil
		}
		if a.err != nil {
			return 0, nil, a.err
		}
		var data []byte
		switch b := a.body.(type) {
		case string:
			data = []byte(b)
		default:
			data, _ = json.Marshal(b)
		}
		return a.status, data, nil
	}
	d, err := NewDiscoveryClient(cfg)
	if err != nil {
		t.Fatal(err)
	}
	return d, &hits
}

func ref(id string) map[string]any {
	return map[string]any{"cpId": id, "cpName": id, "url": "https://" + strings.ToLower(id) + ".example"}
}

func redirectTo(id string) fakeAnswer {
	return fakeAnswer{200, map[string]any{"version": "1.1", "result": "redirect", "number": "+441614960123", "portedTo": ref(id), "cache": map[string]any{"ttl": 60}}, nil}
}

var oneBlock = []NumberingBlock{{Prefix: "441614960", NumberLength: 12, CPID: "A", CPName: "A", RangeHolderURL: "https://a.example"}}

func TestDiscoveryLoopDetected(t *testing.T) {
	d, hits := fakeClient(t, oneBlock, map[string]fakeAnswer{"A": redirectTo("B"), "B": redirectTo("A")}, DiscoveryConfig{})
	res := d.Discover(context.Background(), "+441614960123")
	if res.Result != ResultError || res.Error != DiscoveryLoopDetected || strings.Join(res.Hops, ",") != "A,B" || len(*hits) != 2 {
		t.Fatalf("%+v hits %v", res, *hits)
	}
	if !res.Fallback() {
		t.Fatal("must fall back")
	}
}

func TestDiscoveryHopLimit(t *testing.T) {
	answers := map[string]fakeAnswer{}
	for i := 0; i < 10; i++ {
		answers[fmt.Sprintf("C%d", i)] = redirectTo(fmt.Sprintf("C%d", i+1))
	}
	blocks := []NumberingBlock{{Prefix: "441614960", NumberLength: 12, CPID: "C0", RangeHolderURL: "https://c0.example"}}
	d, hits := fakeClient(t, blocks, answers, DiscoveryConfig{})
	res := d.Discover(context.Background(), "+441614960123")
	if res.Result != ResultError || res.Error != DiscoveryHopLimitExceeded || len(res.Hops) != 5 || len(*hits) != 5 {
		t.Fatalf("%+v hits %v", res, *hits)
	}
	// Configurable limit.
	d, _ = fakeClient(t, blocks, answers, DiscoveryConfig{HopLimit: 2})
	if res := d.Discover(context.Background(), "+441614960123"); res.Error != DiscoveryHopLimitExceeded || len(res.Hops) != 2 {
		t.Fatalf("%+v", res)
	}
}

func TestDiscoveryNotHeldLoopsAreBounded(t *testing.T) {
	// A Range Holder that (wrongly) answers not_held forever: the visited set is
	// cleared on each restart, so the hop limit must stop it.
	notHeld := fakeAnswer{200, map[string]any{"result": "not_held", "number": "+441614960123", "cache": map[string]any{"invalidate": true}}, nil}
	d, _ := fakeClient(t, oneBlock, map[string]fakeAnswer{"A": notHeld}, DiscoveryConfig{})
	res := d.Discover(context.Background(), "+441614960123")
	if res.Error != DiscoveryHopLimitExceeded || strings.Join(res.Hops, ",") != "A,A,A,A,A" || !res.Invalidated {
		t.Fatalf("%+v", res)
	}
}

func TestDiscoveryErrors(t *testing.T) {
	cases := []struct {
		name   string
		answer fakeAnswer
		result string
		code   string
	}{
		{"timeout", fakeAnswer{err: errors.New("dial tcp: i/o timeout")}, ResultError, DiscoveryTimeout},
		{"html 404", fakeAnswer{status: 404, body: "<html>404</html>"}, ResultUnknown, ""},
		{"json 404", fakeAnswer{status: 404, body: `{"result":"unknown"}`}, ResultUnknown, ""},
		{"503", fakeAnswer{status: 503, body: ""}, ResultError, DiscoveryTimeout},
		{"403 html", fakeAnswer{status: 403, body: "<html>403</html>"}, ResultError, DiscoveryInvalidResponse},
		{"not json", fakeAnswer{status: 200, body: "hello"}, ResultError, DiscoveryInvalidResponse},
		{"bad result", fakeAnswer{status: 200, body: `{"result":"maybe"}`}, ResultError, DiscoveryInvalidResponse},
		{"held no holder", fakeAnswer{status: 200, body: `{"result":"held"}`}, ResultError, DiscoveryInvalidResponse},
		{"wrong number", fakeAnswer{status: 200, body: map[string]any{"result": "held", "number": "+441614960124", "holder": ref("A")}}, ResultError, DiscoveryInvalidResponse},
	}
	for _, c := range cases {
		d, _ := fakeClient(t, oneBlock, map[string]fakeAnswer{"A": c.answer}, DiscoveryConfig{})
		res := d.Discover(context.Background(), "+441614960123")
		if res.Result != c.result || res.Error != c.code {
			t.Errorf("%s: %+v", c.name, res)
		}
	}
	// Unallocated / not participating never query anyone.
	blocks := append([]NumberingBlock{{Prefix: "441174960", NumberLength: 12, CPID: "D", CPName: "Delta"}}, oneBlock...)
	d, hits := fakeClient(t, blocks, nil, DiscoveryConfig{})
	if r := d.Discover(context.Background(), "+441174960555"); r.Result != ResultNotParticipating || r.RangeHolder == nil || r.RangeHolder.CPName != "Delta" {
		t.Fatalf("%+v", r)
	}
	if r := d.Discover(context.Background(), "+441154960555"); r.Result != ResultUnallocated || len(r.Hops) != 0 {
		t.Fatalf("%+v", r)
	}
	if len(*hits) != 0 {
		t.Fatalf("hits %v", *hits)
	}
}

func TestDiscoveryCacheTTLFromResponse(t *testing.T) {
	now := time.Date(2026, 10, 6, 9, 0, 0, 0, time.UTC)
	held := fakeAnswer{200, map[string]any{"result": "held", "number": "+441614960123", "holder": ref("A"), "cache": map[string]any{"ttl": 30}}, nil}
	d, hits := fakeClient(t, oneBlock, map[string]fakeAnswer{"A": held}, DiscoveryConfig{Now: func() time.Time { return now }})
	d.Discover(context.Background(), "+441614960123")
	e, ok := d.Cache().Get("+441614960123")
	if !ok || !e.ExpiresAt.Equal(now.Add(30*time.Second)) {
		t.Fatalf("entry %+v", e)
	}
	if r := d.Discover(context.Background(), "+441614960123"); !r.FromCache {
		t.Fatalf("%+v", r)
	}
	now = now.Add(31 * time.Second)
	if r := d.Discover(context.Background(), "+441614960123"); r.FromCache {
		t.Fatalf("expired entry used: %+v", r)
	}
	if len(*hits) != 3 {
		t.Fatalf("hits %v", *hits)
	}
}

func TestDiscoveryVerifySignatures(t *testing.T) {
	f := loadHarness(t)
	m := newMemNetwork(f)
	pubs := map[string]ed25519.PublicKey{}
	for id, r := range m.cps {
		pub, priv, _ := ed25519GenerateKey()
		pubs[id] = pub
		db := r.Database()
		m.cps[id] = NewRangeHolderResponder(ResponderConfig{DB: db, Resolve: r.cfg.Resolve, IsAllocated: m.rangeHolderKnown, KeyID: id + "-k", PrivateKey: priv})
	}
	keys := NewKeyStore(HTTPOptions{})
	for _, cp := range f.Cps {
		keys.Add(cp.Ref(), cp.CPID+"-k", pubs[cp.CPID])
	}
	var states []string
	d := newMemClient(t, m, DiscoveryConfig{VerifySignatures: true, Keys: keys, OnEvent: func(e DiscoveryEvent) {
		if e.Type == EventResponse {
			states = append(states, e.Signature)
		}
	}})
	res := d.Discover(context.Background(), "+441134960456")
	if !res.Held() || strings.Join(states, ",") != "verified,verified" {
		t.Fatalf("%+v %v", res, states)
	}
	// A wrong key for Bravo → invalid_signature, and nothing is cached.
	wrong, _, _ := ed25519GenerateKey()
	keys.Add(f.Cps[1].Ref(), "CP1-UK-0102-k", wrong)
	d.Cache().Clear()
	res = d.Discover(context.Background(), "+441614960123")
	if res.Result != ResultError || res.Error != DiscoveryInvalidSignature || d.Cache().Len() != 0 {
		t.Fatalf("%+v", res)
	}
	// Unsigned answers are rejected when verification is on.
	d2, _ := fakeClient(t, oneBlock, map[string]fakeAnswer{"A": {200, map[string]any{"result": "held", "number": "+441614960123", "holder": ref("A")}, nil}}, DiscoveryConfig{VerifySignatures: true, Keys: keys})
	if r := d2.Discover(context.Background(), "+441614960123"); r.Error != DiscoveryInvalidSignature {
		t.Fatalf("%+v", r)
	}
}

func TestDiscoveryConcurrent(t *testing.T) {
	m := newMemNetwork(loadHarness(t))
	// memNetwork.query appends to a slice; wrap it with a lock for this test.
	var mu = make(chan struct{}, 1)
	q := func(ctx context.Context, target CpRef, n string) (int, []byte, error) {
		mu <- struct{}{}
		defer func() { <-mu }()
		return m.query(ctx, target, n)
	}
	d, _ := NewDiscoveryClient(DiscoveryConfig{NumberingList: m.list, Query: q})
	done := make(chan *DiscoveryResult)
	for i := 0; i < 20; i++ {
		go func(i int) {
			n := []string{"+441614960123", "+441134960456", "+442079460100", "+441614960999"}[i%4]
			done <- d.Discover(context.Background(), n)
		}(i)
	}
	for i := 0; i < 20; i++ {
		if r := <-done; r.Result == ResultError {
			t.Errorf("%+v", r)
		}
	}
}
