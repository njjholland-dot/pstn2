/*
Example 05: Number Discovery — "who has this number?"

Walks through Number Discovery (SPECIFICATION.md §9) hop by hop.

Local mock network (default) — scenarios A–G from
test-environment/fixtures/scenarios.json, in order, with one client so the
cache carries over (scenario D ports a number back with POST /admin/port):

	node test-environment/mock-network/server.mjs     # in another terminal
	go run ./examples/05-number-discovery

Live dummy test CPs at https://pstn2.org/testcp (signatures verified):

	PSTN2_NETWORK=live go run ./examples/05-number-discovery

or a local copy of them (static host emulator):

	node tools/testcp/build.mjs --base http://127.0.0.1:47902/testcp --out /tmp/testcp-local
	node test-environment/mock-network/static-server.mjs --dir /tmp/testcp-local --port 47902
	PSTN2_NUMBERING_LIST_URL=http://127.0.0.1:47902/testcp/numbering-list.json \
	    go run ./examples/05-number-discovery

The test-CP walkthrough is chosen automatically when the numbering list holds
the 07700 900 test blocks.
*/
package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"time"

	"github.com/njjholland-dot/pstn2/code/go/pkg/pstn2"
)

type expect struct {
	result, holder string
	ported         bool
	fromCache      bool
	invalidated    bool
	hops           []string
}

type step struct {
	id, title, number string
	before            func(ctx context.Context, c *pstn2.Client) error
	want              expect
}

const (
	alpha, bravo, charlie = "CP1-UK-0101", "CP1-UK-0102", "CP1-UK-0103"
	testA, testB          = "CP1-UK-9001", "CP1-UK-9002"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()

	env := pstn2.LoadEnv()
	cfg := env.Config()

	// Find out which network we are talking to before building the client.
	list, err := pstn2.LoadNumberingList(ctx, env.NumberingListURL, pstn2.NumberingListOptions{HTTP: pstn2.HTTPOptions{CPID: env.CPID}})
	if err != nil {
		fmt.Println("✗ Cannot load the numbering list", env.NumberingListURL+":", err)
		if env.Network == pstn2.NetworkLocal {
			fmt.Println("  Start the mock network first: node test-environment/mock-network/server.mjs")
		}
		os.Exit(1)
	}
	testCP := list.FindBlock("+447700900001") != nil
	if testCP && !env.VerifySignaturesSet {
		cfg.VerifySignatures = true // the dummy test CPs sign every answer
	}
	cfg.List = list

	names := map[string]string{}
	for _, b := range list.Data().Blocks {
		names[b.CPID] = b.CPName
	}

	fmt.Println(strings.Repeat("=", 72))
	fmt.Println("PSTN2 Example 05: Number Discovery — who has this number?")
	fmt.Println(strings.Repeat("=", 72))
	fmt.Printf("SDK:            %s\n", pstn2.UserAgent)
	fmt.Printf("Numbering list: %s\n", env.NumberingListURL)
	fmt.Printf("                %s, version %s, %d blocks, ETag %s\n", list.Data().Publisher, list.Data().ListVersion, len(list.Data().Blocks), orDash(list.ETag()))
	fmt.Printf("Acting CP:      %s\n", cfg.CPID)
	fmt.Printf("Signatures:     %s\n\n", map[bool]string{true: "verified (Ed25519, §9.6)", false: "not checked"}[cfg.VerifySignatures])

	var steps []step
	resetURL := ""
	if testCP {
		steps = testCPSteps()
		fmt.Println("Walkthrough: dummy test CPs (07700 900 test range)")
	} else {
		steps = harnessSteps(env.BaseURL())
		resetURL = env.BaseURL() + "/admin/reset"
		fmt.Println("Walkthrough: scenarios A–G on the local mock network")
		if err := adminPost(ctx, resetURL, map[string]any{}); err != nil {
			fmt.Println("  (could not reset the mock network:", err, "— results may differ)")
		}
		defer func() { _ = adminPost(context.Background(), resetURL, map[string]any{}) }()
	}
	fmt.Println()

	client, err := pstn2.NewClient(cfg)
	if err != nil {
		fmt.Println("Failed to initialise PSTN2 client:", err)
		os.Exit(1)
	}
	defer client.Close()

	passed := 0
	for _, s := range steps {
		fmt.Printf("── %s  %s\n", s.id, s.title)
		if s.before != nil {
			if err := s.before(ctx, client); err != nil {
				fmt.Println("   ✗ setup failed:", err)
				continue
			}
		}
		fmt.Printf("   %s asks: who holds %s (%s)?\n", orDefault(names[cfg.CPID], cfg.CPID), pstn2.DisplayNumber(s.number), s.number)
		hop := 0
		cctx, cancel := context.WithTimeout(ctx, 10*time.Second)
		res := client.Discover(cctx, s.number, pstn2.WithEvents(func(e pstn2.DiscoveryEvent) {
			switch e.Type {
			case pstn2.EventCacheHit:
				fmt.Printf("   cache     hit: %s (expires %s)\n", e.Entry.Holder.CPName, e.Entry.ExpiresAt.UTC().Format(time.RFC3339))
			case pstn2.EventCacheMiss:
				fmt.Println("   cache     miss")
			case pstn2.EventListLookup:
				if e.Block == nil {
					fmt.Println("   list      no block matches → not allocated")
				} else if !e.Block.Participating() {
					fmt.Printf("   list      %s → Range Holder %s has no PSTN2 URL\n", e.Block.Display, e.Block.CPName)
				} else {
					fmt.Printf("   list      %s → Range Holder %s\n", e.Block.Display, e.Block.CPName)
				}
			case pstn2.EventQuery:
				hop++
				fmt.Printf("   hop %d  →  %s  GET %s\n", hop, e.To.CPName, e.URL)
			case pstn2.EventResponse:
				fmt.Printf("          ←  %s\n", describeResponse(e))
			case pstn2.EventRedirect:
				fmt.Printf("   redirect  ported to %s\n", e.To.CPName)
			case pstn2.EventCachePurge:
				fmt.Printf("   purge     cache entry invalidated by %s (%s) → restart from the numbering list\n", e.From.CPName, e.Reason)
			case pstn2.EventCacheStore:
				fmt.Printf("   cache     stored → %s until %s\n", e.Entry.Holder.CPName, e.Entry.ExpiresAt.UTC().Format(time.RFC3339))
			}
		}))
		cancel()
		ok := check(res, s.want)
		mark := "✓"
		if ok {
			passed++
		} else {
			mark = "✗ UNEXPECTED"
		}
		fmt.Printf("   result    %s · hops [%s] · fromCache=%v invalidated=%v · %dms  %s\n",
			summary(res), strings.Join(res.Hops, ", "), res.FromCache, res.Invalidated, res.Duration.Milliseconds(), mark)
		if !ok {
			fmt.Printf("             expected %s by %s, hops %v, fromCache=%v invalidated=%v\n",
				s.want.result, s.want.holder, s.want.hops, s.want.fromCache, s.want.invalidated)
		}
		if res.Fallback() {
			fmt.Println("   action    no PSTN2 holder → traditional PSTN handling")
		}
		fmt.Println()
	}

	fmt.Println(strings.Repeat("-", 72))
	fmt.Printf("%d/%d steps as expected\n", passed, len(steps))
	fmt.Println("Cache now holds:")
	for _, e := range client.Discovery().Cache().Entries() {
		fmt.Printf("   %s → %s (ported %v)\n", e.Number, e.Holder.CPName, e.Ported)
	}
	if passed != len(steps) {
		os.Exit(1)
	}
}

func harnessSteps(base string) []step {
	return []step{
		{id: "A", title: "Unported number", number: "+441614960123",
			want: expect{result: "held", holder: bravo, hops: []string{bravo}}},
		{id: "B", title: "Ported number (Range Holder redirects)", number: "+441134960456",
			want: expect{result: "held", holder: bravo, ported: true, hops: []string{charlie, bravo}}},
		{id: "C", title: "Repeat call goes direct from cache", number: "+441134960456",
			want: expect{result: "held", holder: bravo, ported: true, fromCache: true, hops: []string{bravo}}},
		{id: "D", title: "Number ports back: stale cache is invalidated", number: "+441134960456",
			before: func(ctx context.Context, _ *pstn2.Client) error {
				fmt.Println("   setup     POST /admin/port +441134960456 Bravo → Charlie")
				return adminPost(ctx, base+"/admin/port", map[string]string{"number": "+441134960456", "fromCpId": bravo, "toCpId": charlie})
			},
			want: expect{result: "held", holder: charlie, invalidated: true, hops: []string{bravo, charlie}}},
		{id: "E", title: "Number not in service", number: "+441614960999",
			want: expect{result: "unknown", hops: []string{bravo}}},
		{id: "F", title: "Range Holder not participating", number: "+441174960555",
			want: expect{result: "not_participating", hops: []string{}}},
		{id: "G", title: "Number not allocated by Ofcom", number: "+441154960555",
			want: expect{result: "unallocated", hops: []string{}}},
	}
}

func testCPSteps() []step {
	return []step{
		{id: "001", title: "Held by Test CP A (unported)", number: "+447700900001",
			want: expect{result: "held", holder: testA, hops: []string{testA}}},
		{id: "002", title: "Held by Test CP A (unported)", number: "+447700900002",
			want: expect{result: "held", holder: testA, hops: []string{testA}}},
		{id: "003", title: "Ported: Test CP A redirects to Test CP B", number: "+447700900003",
			want: expect{result: "held", holder: testB, ported: true, hops: []string{testA, testB}}},
		{id: "004", title: "Stale cache: cached at Test CP B, which no longer holds it", number: "+447700900004",
			before: func(_ context.Context, c *pstn2.Client) error {
				b := c.Discovery().NumberingList().FindBlock("+447700900101")
				if b == nil {
					return fmt.Errorf("no block for Test CP B")
				}
				c.Discovery().Cache().Set("+447700900004", b.RangeHolder(), true, 3600)
				fmt.Printf("   setup     pre-seed cache: +447700900004 → %s (stale)\n", b.CPName)
				return nil
			},
			want: expect{result: "held", holder: testA, invalidated: true, hops: []string{testB, testA}}},
		{id: "101", title: "Held by Test CP B (unported)", number: "+447700900101",
			want: expect{result: "held", holder: testB, hops: []string{testB}}},
		{id: "099", title: "Not in service: Test CP A answers 404", number: "+447700900099",
			want: expect{result: "unknown", hops: []string{testA}}},
		{id: "003′", title: "Repeat call to the ported number goes direct from cache", number: "+447700900003",
			want: expect{result: "held", holder: testB, ported: true, fromCache: true, hops: []string{testB}}},
	}
}

func check(r *pstn2.DiscoveryResult, w expect) bool {
	if r.Result != w.result || r.Ported != w.ported || r.FromCache != w.fromCache || r.Invalidated != w.invalidated {
		return false
	}
	if strings.Join(r.Hops, ",") != strings.Join(w.hops, ",") {
		return false
	}
	if w.holder != "" && (r.Holder == nil || r.Holder.CPID != w.holder) {
		return false
	}
	return true
}

func summary(r *pstn2.DiscoveryResult) string {
	switch r.Result {
	case pstn2.ResultHeld:
		s := "held by " + r.Holder.CPName
		if r.Ported {
			s += " (ported)"
		}
		return s
	case pstn2.ResultError:
		return "error: " + r.Error
	case pstn2.ResultNotParticipating:
		if r.RangeHolder != nil {
			return "not_participating (" + r.RangeHolder.CPName + ")"
		}
	}
	return r.Result
}

func describeResponse(e pstn2.DiscoveryEvent) string {
	if e.Err != "" {
		return "no response: " + e.Err
	}
	sig := ""
	switch e.Signature {
	case pstn2.SignatureVerified:
		sig = fmt.Sprintf("  [signature ✓ kid %v]", e.Body["kid"])
	case pstn2.SignatureUnsigned:
		sig = "  [UNSIGNED]"
	case pstn2.SignatureInvalid:
		sig = "  [signature INVALID]"
	}
	if e.Status == http.StatusNotFound {
		return "404 unknown (not in service)" + sig
	}
	if e.Body == nil {
		return fmt.Sprintf("%d (not JSON)", e.Status) + sig
	}
	result, _ := e.Body["result"].(string)
	out := fmt.Sprintf("%d %s", e.Status, result)
	switch result {
	case "held":
		if h, ok := e.Body["holder"].(map[string]any); ok {
			out += fmt.Sprintf(" by %v", h["cpName"])
		}
		if p, _ := e.Body["ported"].(bool); p {
			out += " (ported in)"
		}
	case "redirect":
		if p, ok := e.Body["portedTo"].(map[string]any); ok {
			out += fmt.Sprintf(" → portedTo %v (%v)", p["cpName"], p["url"])
		}
	case "not_held":
		out += " + cache.invalidate"
	}
	return out + sig
}

// adminPost calls the mock network's admin API (with the SDK's User-Agent).
func adminPost(ctx context.Context, url string, body any) error {
	data, _ := json.Marshal(body)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(data))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", pstn2.UserAgent)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("%s: HTTP %d", url, res.StatusCode)
	}
	return nil
}

func orDefault(s, def string) string {
	if s == "" {
		return def
	}
	return s
}

func orDash(s string) string { return orDefault(s, "-") }
