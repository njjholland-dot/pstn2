package pstn2

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestStaticDummyCP runs the live dummy test CP's numbers against a local
// build served by the static host emulator, with signature verification on.
func TestStaticDummyCP(t *testing.T) {
	s := startStatic(t)
	f := loadTestCP(t)
	listURL := s.Base + "/numbering-list.json"

	// The static host's WAF rejects Go's default User-Agent…
	res, err := http.Get(listURL)
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if res.StatusCode != http.StatusForbidden {
		t.Fatalf("default Go UA: HTTP %d, want 403", res.StatusCode)
	}
	// …and accepts the SDK's.
	if _, err := LoadNumberingList(context.Background(), listURL, NumberingListOptions{}); err != nil {
		t.Fatalf("SDK UA rejected: %v", err)
	}

	sigStates := map[string][]string{}
	c, err := NewClient(Config{CPID: "CP1-UK-TEST-CLIENT", NumberingListURL: listURL, VerifySignatures: true,
		OnEvent: func(e DiscoveryEvent) {
			if e.Type == EventResponse {
				sigStates[e.Number] = append(sigStates[e.Number], e.Signature)
			}
		}})
	if err != nil {
		t.Fatal(err)
	}
	defer c.Close()
	ctx := context.Background()
	a, b := "CP1-UK-9001", "CP1-UK-9002"
	cases := []struct {
		number string
		result string
		holder string
		ported bool
		hops   string
	}{
		{"+447700900001", ResultHeld, a, false, a},
		{"+447700900002", ResultHeld, a, false, a},
		{"+447700900003", ResultHeld, b, true, a + "," + b},
		{"+447700900004", ResultHeld, a, false, a},
		{"+447700900101", ResultHeld, b, false, b},
		{"+447700900099", ResultUnknown, "", false, a},
	}
	if len(cases) != len(f.TestNumbers) {
		t.Fatalf("fixture has %d test numbers", len(f.TestNumbers))
	}
	for _, tc := range cases {
		r := c.Discover(ctx, tc.number)
		if r.Result != tc.result || strings.Join(r.Hops, ",") != tc.hops || r.Ported != tc.ported || r.FromCache {
			t.Errorf("%s: %+v", tc.number, r)
			continue
		}
		if tc.holder != "" {
			if r.Holder.CPID != tc.holder || !strings.HasPrefix(r.Holder.URL, s.Base) {
				t.Errorf("%s: holder %+v", tc.number, r.Holder)
			}
			for _, st := range sigStates[r.Number] {
				if st != SignatureVerified {
					t.Errorf("%s: signature states %v", tc.number, sigStates[r.Number])
				}
			}
		}
	}

	// Stale cache for 004: pre-seed with Test CP B, which answers not_held +
	// invalidate (previouslyHeld) → purge → Range Holder A.
	cpB := c.Discovery().NumberingList().FindBlock("+447700900101").RangeHolder()
	c.Discovery().Cache().Set("+447700900004", cpB, true, 3600)
	r := c.Discover(ctx, "+447700900004")
	if r.Result != ResultHeld || r.Holder.CPID != a || !r.Invalidated || r.FromCache || strings.Join(r.Hops, ",") != b+","+a {
		t.Fatalf("stale cache 004: %+v", r)
	}
	if e, ok := c.Discovery().Cache().Get("+447700900004"); !ok || e.Holder.CPID != a {
		t.Fatalf("cache after invalidation: %+v", e)
	}
	// Second lookup: straight from cache.
	if r := c.Discover(ctx, "+447700900003"); !r.FromCache || strings.Join(r.Hops, ",") != b {
		t.Fatalf("cached 003: %+v", r)
	}

	// A forged key for Test CP A makes its answers fail verification.
	wrong, _, _ := ed25519GenerateKey()
	c.Discovery().Cache().Clear()
	cpA := c.Discovery().NumberingList().FindBlock("+447700900001").RangeHolder()
	var keysJSON struct {
		Keys []PublicKey `json:"keys"`
	}
	readJSONFile(t, filepath.Join(s.Dir, "a", "pstn2", "v1", "keys"), &keysJSON)
	c.Discovery().Keys().Add(cpA, keysJSON.Keys[0].Kid, wrong)
	if r := c.Discover(ctx, "+447700900001"); r.Result != ResultError || r.Error != DiscoveryInvalidSignature {
		t.Fatalf("forged key: %+v", r)
	}
}

// TestResponderMatchesStaticBuild checks that RangeHolderResponder, given the
// same keys, produces byte-identical signed answers to tools/testcp/build.mjs.
func TestResponderMatchesStaticBuild(t *testing.T) {
	s := startStatic(t)
	f := loadTestCP(t)
	var keys map[string]struct {
		Kid           string `json:"kid"`
		PrivateKeyPem string `json:"privateKeyPem"`
	}
	readJSONFile(t, s.KeyFile, &keys)

	rebase := func(u string) string { return strings.Replace(u, f.BaseURL, s.Base, 1) }
	for i := range f.Cps {
		f.Cps[i].URL = rebase(f.Cps[i].URL)
	}
	for i := range f.NumberingList.Blocks {
		f.NumberingList.Blocks[i].RangeHolderURL = rebase(f.NumberingList.Blocks[i].RangeHolderURL)
	}
	list := NewNumberingList(f.NumberingList)
	files := 0
	for _, cp := range f.Cps {
		priv, err := ParsePrivateKeyPEM(keys[cp.CPID].PrivateKeyPem)
		if err != nil {
			t.Fatal(err)
		}
		r := NewRangeHolderResponder(ResponderConfig{DB: cp.NumberDatabase, NumberingList: list, Resolve: ResolverFromList(list), KeyID: keys[cp.CPID].Kid, PrivateKey: priv})
		// Published key matches.
		var ks KeySet
		readJSONFile(t, filepath.Join(s.Dir, cp.Key, "pstn2", "v1", "keys"), &ks)
		if got := r.KeySet(); got.Keys[0].PublicKey != ks.Keys[0].PublicKey || got.Keys[0].Kid != ks.Keys[0].Kid {
			t.Fatalf("%s key set %+v vs %+v", cp.CPID, got, ks)
		}
		dir := filepath.Join(s.Dir, cp.Key, "pstn2", "v1", "numbers")
		entries, _ := os.ReadDir(dir)
		for _, e := range entries {
			if strings.HasPrefix(e.Name(), ".") {
				continue
			}
			data, err := os.ReadFile(filepath.Join(dir, e.Name()))
			if err != nil {
				t.Fatal(err)
			}
			status, body := r.RespondAt("+"+e.Name(), f.NumberingList.ListVersion)
			want, _ := CanonicalJSON(json.RawMessage(data))
			got, _ := CanonicalJSON(body)
			if status != 200 || string(got) != string(want) {
				t.Errorf("%s %s:\n Go    %s\n build %s", cp.CPID, e.Name(), got, want)
			}
			files++
		}
	}
	if files != 7 {
		t.Errorf("compared %d answer files, want 7", files)
	}
}
