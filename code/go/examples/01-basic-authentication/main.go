/*
Example 01: Basic Authentication (Direct Query)

Charlie Comms (CP1-UK-0103) is the terminating CP. Four calls arrive and it
verifies each caller ID with the CP that currently holds it, found with
Number Discovery:

 1. +442079460100  Alpha Telecom, unported           → verified
 2. +441614960123  Bravo Networks                    → verified
 3. +441614960999  spoofed: not in service anywhere  → not verified, flag, PSTN fallback
 4. +441134960456  Charlie's own range, ported to Bravo: discovery follows the
    Range Holder's redirect and Bravo verifies

Run (local mock network):

	node test-environment/mock-network/server.mjs     # in another terminal
	go run ./examples/01-basic-authentication
*/
package main

import (
	"context"
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
	if os.Getenv("PSTN2_CP_ID") == "" && env.Network == pstn2.NetworkLocal {
		env.CPID = "CP1-UK-0103" // Charlie Comms is the terminating CP in this story
	}
	client, err := pstn2.NewClient(env.Config())
	if err != nil {
		fmt.Println("Failed to initialise PSTN2 client:", err)
		os.Exit(1)
	}
	defer client.Close()

	fmt.Println(strings.Repeat("=", 64))
	fmt.Println("PSTN2 Example 01: Basic Authentication (Direct Query)")
	fmt.Println(strings.Repeat("=", 64))
	fmt.Printf("SDK:            %s\n", pstn2.UserAgent)
	fmt.Printf("Network:        %s\n", env.Network)
	fmt.Printf("Numbering list: %s\n", env.NumberingListURL)
	fmt.Printf("Acting CP:      %s (terminating CP)\n", env.CPID)
	fmt.Println()

	if err := client.Discovery().NumberingList().EnsureFresh(ctx); err != nil {
		fmt.Println("✗ Cannot load the numbering list:", err)
		fmt.Println("  Start the mock network first: node test-environment/mock-network/server.mjs")
		fmt.Println("  (without it every call falls back to traditional PSTN handling)")
		os.Exit(1)
	}
	names := cpNames(client)

	called := "+441134960789" // a Charlie Comms subscriber
	calls := []struct{ label, callerID string }{
		{"Inbound call 1: Alpha Telecom caller", "+442079460100"},
		{"Inbound call 2: Bravo Networks caller", "+441614960123"},
		{"Inbound call 3: suspicious caller ID", "+441614960999"},
		{"Inbound call 4: ported caller ID", "+441134960456"},
	}
	verified := 0
	for _, call := range calls {
		fmt.Printf("%s\n", call.label)
		fmt.Printf("  Caller ID: %s (%s) → %s\n", call.callerID, pstn2.DisplayNumber(call.callerID), called)

		cctx, cancel := context.WithTimeout(ctx, 5*time.Second)
		v, err := client.Auth().VerifyCall(cctx, pstn2.VerifyCallRequest{CallerID: call.callerID, CalledID: called})
		cancel()
		if v != nil && v.Via != nil && v.Via.Discovery != nil {
			d := v.Via.Discovery
			fmt.Printf("  Discovery: %s · hops: %s%s\n", d.Result, hopList(d.Hops, names), cacheNote(d))
			if d.Ported && d.Holder != nil {
				fmt.Printf("             ported: the Range Holder redirected to %s\n", d.Holder.CPName)
			}
		}
		switch {
		case err != nil:
			fmt.Println("  ✗ Verification request failed:", err)
			fmt.Println("  Action: treat as unverified; deliver via traditional PSTN handling")
		case v.Verified:
			verified++
			fmt.Printf("  ✓ VERIFIED by %s\n", v.Via.Holder.CPName)
			fmt.Printf("    Caller: %s (%s), trust level: %s\n", orDefault(v.CallerName, "unknown"), orDefault(v.CallerOrg, "n/a"), v.TrustLevel)
			if v.Via.Retried {
				fmt.Printf("    (%s answered not_held; cache purged, rediscovered and retried)\n", v.Via.NotHeldBy.CPName)
			}
			fmt.Println("  Action: present the call with a verified caller ID")
		default:
			fmt.Printf("  ✗ NOT VERIFIED (%s)\n", describe(v.Reason))
			fmt.Println("  Action: flag as suspected spoof; deliver via traditional PSTN handling")
		}
		fmt.Println()
	}

	fmt.Println(strings.Repeat("-", 64))
	fmt.Printf("Summary: %d of %d caller IDs verified; %d flagged and handled as traditional PSTN\n",
		verified, len(calls), len(calls)-verified)
}

func describe(reason string) string {
	switch reason {
	case pstn2.ReasonCallerIDUnknown:
		return "caller ID is not in service at the CP that should hold it — likely spoofed"
	case pstn2.ReasonUnallocated:
		return "caller ID is not an allocated number — spoofed"
	case pstn2.ReasonNotParticipating:
		return "the caller ID's Range Holder does not participate in PSTN2"
	case pstn2.ReasonCallNotFound:
		return "the holder has no matching outbound call"
	case pstn2.ReasonNotVerified:
		return "the holder did not confirm the call"
	default:
		return "discovery failed"
	}
}

func cpNames(c *pstn2.Client) map[string]string {
	names := map[string]string{}
	for _, b := range c.Discovery().NumberingList().Data().Blocks {
		names[b.CPID] = b.CPName
	}
	return names
}

func hopList(hops []string, names map[string]string) string {
	if len(hops) == 0 {
		return "numbering list only"
	}
	parts := make([]string, len(hops))
	for i, h := range hops {
		parts[i] = orDefault(names[h], h)
	}
	return strings.Join(parts, " → ")
}

func cacheNote(d *pstn2.DiscoveryResult) string {
	if d.FromCache {
		return " (from cache)"
	}
	return ""
}

func orDefault(s, def string) string {
	if s == "" {
		return def
	}
	return s
}
