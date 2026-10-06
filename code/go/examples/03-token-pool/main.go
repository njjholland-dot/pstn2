/*
Example 03: Token Pool authentication

The originating CP (Alpha Telecom) creates a short-lived token for an outbound
call from +442079460100 to +441614960123 at the CP holding the caller ID
(found with Number Discovery — here Alpha's own server). The token travels with
the call; the terminating CP (Bravo Networks) discovers the caller ID's holder
and verifies the token there.

An unknown token is rejected, and the terminating CP falls back to a Direct
Query verification.

	node test-environment/mock-network/server.mjs     # in another terminal
	go run ./examples/03-token-pool
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
	origCfg := env.Config() // Alpha Telecom (PSTN2_CP_ID, default CP1-UK-0101)
	termCfg := env.Config()
	termCfg.CPID = "CP1-UK-0102" // Bravo Networks

	originating, err := pstn2.NewClient(origCfg)
	if err != nil {
		fmt.Println("Failed to initialise PSTN2 client:", err)
		os.Exit(1)
	}
	defer originating.Close()
	terminating, err := pstn2.NewClient(termCfg)
	if err != nil {
		fmt.Println("Failed to initialise PSTN2 client:", err)
		os.Exit(1)
	}
	defer terminating.Close()

	fmt.Println(strings.Repeat("=", 64))
	fmt.Println("PSTN2 Example 03: Token Pool Authentication")
	fmt.Println(strings.Repeat("=", 64))
	fmt.Printf("Network: %s   Numbering list: %s\n", env.Network, env.NumberingListURL)
	fmt.Printf("Originating CP: %s   Terminating CP: %s\n\n", origCfg.CPID, termCfg.CPID)

	if err := originating.Discovery().NumberingList().EnsureFresh(ctx); err != nil {
		fmt.Println("✗ Cannot load the numbering list:", err)
		fmt.Println("  Start the mock network first: node test-environment/mock-network/server.mjs")
		os.Exit(1)
	}

	caller, called := "+442079460100", "+441614960123"

	// Step 1 — originating CP creates the token.
	fmt.Println("Step 1: originating CP creates a token")
	fmt.Printf("  Call %s → %s, TTL 30s\n", caller, called)
	cctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	token, err := originating.Auth().CreateToken(cctx, pstn2.TokenRequest{CallerID: caller, CalledID: called, TTL: 30})
	cancel()
	if err != nil {
		fmt.Println("  ✗ Token creation failed:", err)
		fmt.Println("  → Place the call without a token; the terminating CP can use Direct Query")
		os.Exit(1)
	}
	fmt.Printf("  ✓ Token %s (format %s ✓)\n", token.TokenID, pstn2.TokenPattern.String())
	fmt.Printf("    created at %s, expires %s\n", token.Via.Holder.CPName, token.ExpiresAt)
	fmt.Printf("    call reference %s\n\n", token.CallReference)

	// Step 2 — the token travels with the call (e.g. in a SIP header).
	fmt.Println("Step 2: call signalled with header  X-PSTN2-Token: " + token.TokenID)
	fmt.Println()

	// Step 3 — terminating CP verifies it at the caller ID's holder.
	fmt.Println("Step 3: terminating CP verifies the token")
	start := time.Now()
	cctx, cancel = context.WithTimeout(ctx, 5*time.Second)
	tv, err := terminating.Auth().VerifyToken(cctx, caller, token.TokenID)
	cancel()
	if err != nil {
		fmt.Println("  ✗ Token verification failed:", err)
		fmt.Println("  → Treat the call as unverified (traditional PSTN handling)")
		os.Exit(1)
	}
	fmt.Printf("  ✓ Token verified by %s in %dms\n", tv.Via.Holder.CPName, time.Since(start).Milliseconds())
	fmt.Printf("    Originating CP: %s\n", tv.OriginatingCP)
	fmt.Printf("    Caller → called: %s → %s\n", tv.CallerID, tv.CalledID)
	fmt.Printf("    Call reference matches: %v\n\n", tv.CallReference == token.CallReference)

	// Step 4 — a forged token is rejected; fall back to Direct Query.
	forged := "TK-AAAAAAAAAAAAAAAA"
	fmt.Println("Step 4: a call arrives with an unknown token " + forged)
	cctx, cancel = context.WithTimeout(ctx, 5*time.Second)
	_, err = terminating.Auth().VerifyToken(cctx, caller, forged)
	cancel()
	if err == nil {
		fmt.Println("  ✗ Unexpected: forged token accepted")
		os.Exit(1)
	}
	fmt.Printf("  ✓ Rejected: %s\n", pstn2.ErrorCode(err))
	fmt.Println("  → Falling back to Direct Query verification")
	cctx, cancel = context.WithTimeout(ctx, 5*time.Second)
	v, err := terminating.Auth().VerifyCall(cctx, pstn2.VerifyCallRequest{CallerID: caller, CalledID: called})
	cancel()
	switch {
	case err != nil:
		fmt.Println("  ✗ Direct Query failed:", err, "→ traditional PSTN handling")
	case v.Verified:
		fmt.Printf("  ✓ Direct Query: verified by %s (%s)\n", v.Via.Holder.CPName, v.TrustLevel)
	default:
		fmt.Printf("  ✗ Direct Query: not verified (%s) → flag the call\n", v.Reason)
	}
}
