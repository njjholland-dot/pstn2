package pstn2

import (
	"context"
	"testing"
)

// TestMockNetworkScenarios runs scenarios A–G (fixtures/scenarios.json) in
// order against test-environment/mock-network/server.mjs over real HTTP with
// one persistent client, asserting the same results as the reference engine.
func TestMockNetworkScenarios(t *testing.T) {
	base := startMock(t)
	scenarios := loadScenarios(t)
	c, err := NewClient(Config{CPID: scenarios[0].CallerCp, NumberingListURL: base + "/numbering-list.json"})
	if err != nil {
		t.Fatal(err)
	}
	defer c.Close()
	for _, sc := range scenarios {
		if sc.Before != nil && sc.Before.Port != nil {
			p := sc.Before.Port
			adminPort(t, base, p.Number, p.FromCPID, p.ToCPID)
		}
		res := c.Discover(context.Background(), sc.Number)
		checkScenario(t, sc, res)
		if res.Held() && res.Holder.URL == "" {
			t.Errorf("%s: holder without URL", sc.ID)
		}
	}

	// Every request carried the SDK's User-Agent.
	log := adminLog(t, base)
	if len(log) == 0 {
		t.Fatal("empty admin log")
	}
	for _, e := range log {
		if e.UserAgent != UserAgent {
			t.Fatalf("request with UA %q", e.UserAgent)
		}
	}
	// Query count equals the total hops of A–G (A1 B2 C1 D2 E1 F0 G0 = 7).
	if len(log) != 7 {
		t.Errorf("mock saw %d discovery queries, want 7", len(log))
	}

	// The numbering list revalidates with If-None-Match → 304.
	changed, err := c.Discovery().NumberingList().Refresh(context.Background())
	if err != nil || changed {
		t.Fatalf("refresh = %v, %v (want 304 / unchanged)", changed, err)
	}
	if c.Discovery().NumberingList().ETag() == "" {
		t.Fatal("no ETag kept")
	}
	// After /admin/reset the list version changes → 200.
	adminPost(t, base, "/admin/reset", map[string]any{})
	changed, err = c.Discovery().NumberingList().Refresh(context.Background())
	if err != nil || !changed {
		t.Fatalf("refresh after reset = %v, %v", changed, err)
	}
}
