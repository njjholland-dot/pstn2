/*
Example 05: Complete call flow

Alice (+442079460100, Alpha Telecom) calls Bob (+441134960456). Bob's number
is in Charlie Comms' range but has been ported to Bravo Networks.

	Phase 1  Number Discovery  Alpha asks the Range Holder (Charlie), follows the
	                           redirect to Bravo, caches the answer
	Phase 2  Authentication    Bravo verifies Alice's caller ID with Alpha
	Phase 3  Direct routing    Alpha asks Bravo for a direct media route
	Phase 4  Summary
	Then a second call to Bob goes straight to Bravo from the cache.

	node test-environment/mock-network/server.mjs     # in another terminal
	go run ./examples/05-complete-call-flow
*/
package main

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"fmt"
	"os"
	"os/signal"
	"strings"
	"time"

	"github.com/njjholland-dot/pstn2/code/go/pkg/pstn2"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()

	env := pstn2.LoadEnv()
	aliceCfg := env.Config() // Alpha Telecom
	bobCfg := env.Config()
	bobCfg.CPID = "CP1-UK-0102" // Bravo Networks, Bob's CP since the port

	var trace []string
	aliceCfg.OnEvent = func(e pstn2.DiscoveryEvent) {
		switch e.Type {
		case pstn2.EventCacheHit:
			trace = append(trace, fmt.Sprintf("cache hit → %s", e.Entry.Holder.CPName))
		case pstn2.EventCacheMiss:
			trace = append(trace, "cache miss")
		case pstn2.EventListLookup:
			if e.Block != nil {
				trace = append(trace, fmt.Sprintf("numbering list: %s → Range Holder %s", e.Block.Display, e.Block.CPName))
			}
		case pstn2.EventQuery:
			trace = append(trace, fmt.Sprintf("query %s: GET %s", e.To.CPName, e.URL))
		case pstn2.EventRedirect:
			trace = append(trace, fmt.Sprintf("redirect: %s says the number was ported to %s", e.From.CPName, e.To.CPName))
		case pstn2.EventCachePurge:
			trace = append(trace, fmt.Sprintf("cache purged (%s from %s)", e.Reason, e.From.CPName))
		case pstn2.EventCacheStore:
			trace = append(trace, fmt.Sprintf("cached → %s until %s", e.Entry.Holder.CPName, e.Entry.ExpiresAt.UTC().Format(time.RFC3339)))
		}
	}

	alpha, err := pstn2.NewClient(aliceCfg)
	if err != nil {
		fmt.Println("Failed to initialise PSTN2 client:", err)
		os.Exit(1)
	}
	defer alpha.Close()
	bravo, err := pstn2.NewClient(bobCfg)
	if err != nil {
		fmt.Println("Failed to initialise PSTN2 client:", err)
		os.Exit(1)
	}
	defer bravo.Close()

	alice := struct{ Name, Number string }{"Alice Smith", "+442079460100"}
	bob := struct{ Name, Number string }{"Bob Johnson", "+441134960456"}

	fmt.Println(strings.Repeat("=", 64))
	fmt.Println("PSTN2 Example 05: Complete Call Flow")
	fmt.Printf("%s (%s, %s) → %s (%s)\n", alice.Name, alice.Number, aliceCfg.CPID, bob.Name, bob.Number)
	fmt.Println(strings.Repeat("=", 64))
	fmt.Printf("Network: %s   Numbering list: %s\n\n", env.Network, env.NumberingListURL)

	if err := alpha.Discovery().NumberingList().EnsureFresh(ctx); err != nil {
		fmt.Println("✗ Cannot load the numbering list:", err)
		fmt.Println("  Start the mock network first: node test-environment/mock-network/server.mjs")
		os.Exit(1)
	}
	callRef := pstn2.NewCallReference()
	total := time.Now()

	// Phase 1 — Number Discovery
	fmt.Println("Phase 1: Number Discovery — who holds Bob's number?")
	t1 := time.Now()
	disc := alpha.Discover(ctx, bob.Number)
	p1 := time.Since(t1)
	for _, line := range trace {
		fmt.Println("   ·", line)
	}
	if !disc.Held() {
		fmt.Printf("   ✗ %s %s → traditional PSTN call\n", disc.Result, disc.Error)
		return
	}
	fmt.Printf("   ✓ Held by %s (ported: %v), hops %s, %dms\n\n", disc.Holder.CPName, disc.Ported, strings.Join(disc.Hops, " → "), p1.Milliseconds())

	// Phase 2 — Authentication (performed by the terminating CP)
	fmt.Println("Phase 2: Authentication — Bravo verifies Alice's caller ID")
	t2 := time.Now()
	v, err := bravo.Auth().VerifyCall(ctx, pstn2.VerifyCallRequest{CallerID: alice.Number, CalledID: bob.Number, CallReference: callRef})
	p2 := time.Since(t2)
	if err != nil || !v.Verified {
		reason := ""
		if v != nil {
			reason = v.Reason
		}
		fmt.Printf("   ✗ Not verified (%v %s) → deliver as traditional PSTN call, flagged\n", err, reason)
		return
	}
	fmt.Printf("   ✓ Verified by %s: %s, trust %s, %dms\n\n", v.Via.Holder.CPName, v.CallerOrg, v.TrustLevel, p2.Milliseconds())

	// Phase 3 — Direct routing
	fmt.Println("Phase 3: Direct Routing — Alpha requests a media route from Bravo")
	identity, _, _ := ed25519.GenerateKey(rand.Reader)
	t3 := time.Now()
	route, err := alpha.Routing().RequestRouting(ctx, pstn2.RoutingRequest{
		CallerID: alice.Number, DestinationNumber: bob.Number, CallReference: callRef,
		MediaCapabilities: pstn2.DefaultMediaCapabilities(), PublicKey: pstn2.PublicKeyBase64(identity),
	})
	p3 := time.Since(t3)
	if err != nil || !route.Accepted {
		fmt.Printf("   ✗ No direct route (%v) → route via traditional PSTN\n", err)
		return
	}
	cd := route.ConnectionDetails
	fmt.Printf("   ✓ Route accepted: %s:%d (%s), codec %v, %v, %dms\n", cd.FQDN, cd.Port, cd.Protocol,
		route.AgreedCapabilities.Codecs, route.AgreedCapabilities.Encryption, p3.Milliseconds())
	fmt.Printf("   ✓ Discovery for routing came from cache: %v\n\n", route.Via.Discovery.FromCache)

	// Phase 4 — Summary
	fmt.Println("Phase 4: Summary")
	fmt.Printf("   Call reference:   %s\n", callRef)
	fmt.Printf("   Discovery:        %4dms  (%d hops, redirect via Range Holder)\n", p1.Milliseconds(), len(disc.Hops))
	fmt.Printf("   Authentication:   %4dms\n", p2.Milliseconds())
	fmt.Printf("   Routing:          %4dms\n", p3.Milliseconds())
	fmt.Printf("   Total setup:      %4dms  (target < 1000ms)\n", time.Since(total).Milliseconds())
	fmt.Printf("   Media:            SIP INVITE sips:%s@%s:%d, SRTP %v\n\n", bob.Number, cd.FQDN, cd.Port, route.AgreedCapabilities.Encryption)

	// Second call — straight from the cache
	fmt.Println("Second call to Bob")
	trace = nil
	t5 := time.Now()
	again := alpha.Discover(ctx, bob.Number)
	for _, line := range trace {
		fmt.Println("   ·", line)
	}
	if again.Held() {
		fmt.Printf("   ✓ fromCache=%v: one query, direct to %s (hops %s), %dms\n", again.FromCache, again.Holder.CPName,
			strings.Join(again.Hops, " → "), time.Since(t5).Milliseconds())
	} else {
		fmt.Printf("   ✗ %s → traditional PSTN call\n", again.Result)
	}
}
