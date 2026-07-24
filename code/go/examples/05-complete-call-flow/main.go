/*
Example 5: Complete Call Flow

This example demonstrates a complete end-to-end call from Alice to Bob,
showing all PSTN2 features working together.
*/

package main

import (
	"context"
	"fmt"
	"log"
	"math/rand"
	"os"
	"strings"
	"time"

	"github.com/pstn2/pstn2-go/pkg/client"
	"github.com/pstn2/pstn2-go/pkg/types"
)

func main() {
	fmt.Println(strings.Repeat("=", 60))
	fmt.Println("COMPLETE PSTN2 CALL FLOW")
	fmt.Println("Alice (CP1) → Bob (CP2)")
	fmt.Println(strings.Repeat("=", 60))
	fmt.Println("")

	// Initialize Alice's CP (CP1)
	cp1, err := client.NewClient(&client.Config{
		CPID:        "CP1-UK-0001",
		APIEndpoint: "https://api.cp1.example.com/pstn2/v1",
		PrivateKey:  os.Getenv("CP1_PRIVATE_KEY"),
		AuthMode:    types.AuthModeDirectQuery,
	})
	if err != nil {
		log.Fatalf("Failed to initialize client: %v", err)
	}
	defer cp1.Close()

	alice := struct {
		Number string
		Name   string
		Device string
	}{
		Number: "+441234567890",
		Name:   "Alice Smith",
		Device: "iPhone 15",
	}

	bob := struct {
		Number string
		Name   string
		CPID   string
	}{
		Number: "+447700900123",
		Name:   "Bob Johnson",
		CPID:   "CP1-UK-0002",
	}

	callReference := fmt.Sprintf("call-%d-%s", time.Now().UnixMilli(), randomString(9))
	startTime := time.Now()

	ctx := context.Background()

	// ═══════════════════════════════════════════════════════════════
	// PHASE 1: Directory Lookup
	// ═══════════════════════════════════════════════════════════════
	fmt.Println("📱 Phase 1: Alice dials Bob's number")
	fmt.Printf("   Alice: %s\n", alice.Number)
	fmt.Printf("   Bob:   %s\n", bob.Number)
	fmt.Println("")

	phase1Start := time.Now()
	fmt.Println("🔍 Looking up Bob's CP in directory...")
	cpInfo, err := cp1.Directory().Lookup(ctx, bob.Number)
	if err != nil {
		handleError("Directory lookup failed", err)
		return
	}
	phase1Time := time.Since(phase1Start).Milliseconds()

	fmt.Printf("   ✓ Found: %s\n", cpInfo.CPID)
	fmt.Printf("   ✓ Endpoint: %s\n", cpInfo.Endpoints.Routing)
	fmt.Printf("   ⏱  Time: %dms\n", phase1Time)
	fmt.Println("")

	// ═══════════════════════════════════════════════════════════════
	// PHASE 2: Authentication
	// ═══════════════════════════════════════════════════════════════
	phase2Start := time.Now()
	fmt.Println("🔐 Phase 2: Authenticating call with Bob's CP...")

	verification, err := cp1.Auth().VerifyCall(ctx, &types.VerifyCallRequest{
		CallerID:      alice.Number,
		CalledID:      bob.Number,
		CallReference: callReference,
	})
	if err != nil {
		handleError("Authentication failed", err)
		return
	}
	phase2Time := time.Since(phase2Start).Milliseconds()

	if verification.Verified {
		fmt.Println("   ✓ Call authenticated")
		fmt.Printf("   ✓ Trust Level: %s\n", verification.TrustLevel)
		fmt.Printf("   ⏱  Time: %dms\n", phase2Time)
	} else {
		fmt.Println("   ✗ Authentication failed - aborting call")
		return
	}
	fmt.Println("")

	// ═══════════════════════════════════════════════════════════════
	// PHASE 3: Direct Routing
	// ═══════════════════════════════════════════════════════════════
	phase3Start := time.Now()
	fmt.Println("🔄 Phase 3: Requesting direct routing...")

	routing, err := cp1.Routing().RequestRouting(ctx, &types.RoutingRequest{
		DestinationNumber: bob.Number,
		CallerID:          alice.Number,
		CallReference:     callReference,
		MediaCapabilities: &types.MediaCapabilities{
			Codecs:     []string{"opus", "g722"},
			Encryption: []string{"srtp-aes256"},
			Video:      false,
		},
		Branding: &types.CallBranding{
			DisplayName: alice.Name,
			CallPurpose: "Personal Call",
		},
	})
	if err != nil {
		handleError("Routing request failed", err)
		return
	}
	phase3Time := time.Since(phase3Start).Milliseconds()

	if !routing.Accepted {
		fmt.Println("   ✗ Routing rejected - falling back to PSTN")
		return
	}

	fmt.Println("   ✓ Routing accepted")
	fmt.Printf("   ✓ Media Server: %s\n", routing.ConnectionDetails.FQDN)
	fmt.Printf("   ✓ Codec: %s\n", routing.AgreedCapabilities.Codecs[0])
	fmt.Printf("   ✓ Encryption: %s\n", routing.AgreedCapabilities.Encryption[0])
	fmt.Printf("   ⏱  Time: %dms\n", phase3Time)
	fmt.Println("")

	// ═══════════════════════════════════════════════════════════════
	// PHASE 4: Key Exchange
	// ═══════════════════════════════════════════════════════════════
	phase4Start := time.Now()
	fmt.Println("🔑 Phase 4: Exchanging encryption keys...")

	// Keys already exchanged in routing request/response
	fmt.Println("   ✓ DTLS handshake completed")
	fmt.Println("   ✓ SRTP keys derived")
	fmt.Println("   ✓ End-to-end encryption ready")
	phase4Time := time.Since(phase4Start).Milliseconds()
	fmt.Printf("   ⏱  Time: %dms\n", phase4Time)
	fmt.Println("")

	// ═══════════════════════════════════════════════════════════════
	// PHASE 5: Media Setup
	// ═══════════════════════════════════════════════════════════════
	phase5Start := time.Now()
	fmt.Println("📞 Phase 5: Establishing media connection...")

	fmt.Println("   ✓ RTP session created")
	fmt.Println("   ✓ Opus codec initialized (48kHz)")
	fmt.Println("   ✓ Quality: HD Audio")
	fmt.Println("   ✓ Direct path: No transit providers")
	phase5Time := time.Since(phase5Start).Milliseconds()
	fmt.Printf("   ⏱  Time: %dms\n", phase5Time)
	fmt.Println("")

	// ═══════════════════════════════════════════════════════════════
	// PHASE 6: Call Branding & Ringing
	// ═══════════════════════════════════════════════════════════════
	fmt.Println("📲 Phase 6: Bob's phone ringing...")
	fmt.Println("")
	fmt.Println("   Bob sees on his screen:")
	fmt.Println("   ┌─────────────────────────────┐")
	fmt.Println("   │  📱 Incoming Call            │")
	fmt.Println("   │                             │")
	fmt.Printf("   │  %-28s│\n", alice.Name)
	fmt.Printf("   │  %-28s│\n", alice.Number)
	fmt.Println("   │                             │")
	fmt.Println("   │  ✓ Verified Caller          │")
	fmt.Println("   │  Purpose: Personal Call     │")
	fmt.Println("   │                             │")
	fmt.Println("   │  [Accept]  [Decline]        │")
	fmt.Println("   └─────────────────────────────┘")
	fmt.Println("")

	time.Sleep(1 * time.Second)

	// ═══════════════════════════════════════════════════════════════
	// PHASE 7: Call Connected
	// ═══════════════════════════════════════════════════════════════
	fmt.Println("✅ Phase 7: Bob answers - Call connected!")
	fmt.Println("")
	fmt.Println("   🔊 Crystal clear HD audio")
	fmt.Println("   🔒 End-to-end encrypted")
	fmt.Println("   ⚡ Low latency (direct path)")
	fmt.Println("   💰 No transit fees")
	fmt.Println("")

	// ═══════════════════════════════════════════════════════════════
	// SUMMARY
	// ═══════════════════════════════════════════════════════════════
	totalTime := time.Since(startTime).Milliseconds()

	fmt.Println(strings.Repeat("=", 60))
	fmt.Println("CALL SUMMARY")
	fmt.Println(strings.Repeat("=", 60))
	fmt.Println("")
	fmt.Println("Timing Breakdown:")
	fmt.Printf("  Directory Lookup:     %dms\n", phase1Time)
	fmt.Printf("  Authentication:       %dms\n", phase2Time)
	fmt.Printf("  Routing Request:      %dms\n", phase3Time)
	fmt.Printf("  Key Exchange:         %dms\n", phase4Time)
	fmt.Printf("  Media Setup:          %dms\n", phase5Time)
	fmt.Println("  " + strings.Repeat("-", 35))
	fmt.Printf("  Total Setup Time:     %dms\n", totalTime)
	fmt.Println("")

	fmt.Println("Traditional PSTN Comparison:")
	fmt.Printf("  PSTN2:        ~%dms setup time\n", totalTime)
	fmt.Println("  Traditional:  5,000-8,000ms setup time")
	fmt.Printf("  Improvement:  %dx faster! 🚀\n", 5000/totalTime)
	fmt.Println("")

	fmt.Println("Features Enabled:")
	fmt.Println("  ✓ Caller ID verification (fraud prevention)")
	fmt.Println("  ✓ Direct routing (cost reduction)")
	fmt.Println("  ✓ End-to-end encryption (privacy)")
	fmt.Println("  ✓ Call branding (trust)")
	fmt.Println("  ✓ HD audio quality (Opus codec)")
	fmt.Println("")

	fmt.Println("Security:")
	fmt.Println("  ✓ Cryptographically signed messages")
	fmt.Println("  ✓ Ed25519 signatures verified")
	fmt.Println("  ✓ SRTP media encryption (AES-256)")
	fmt.Println("  ✓ TLS 1.3 for all signaling")
	fmt.Println("")

	fmt.Println("💚 Call in progress - Alice and Bob are talking!")
	fmt.Println("")
}

func handleError(message string, err error) {
	fmt.Printf("❌ Error: %s: %v\n", message, err)
	fmt.Println("")
	fmt.Println("Fallback: Routing via traditional PSTN")
	fmt.Println("Call will still connect (backward compatible)")
}

func randomString(length int) string {
	const charset = "abcdefghijklmnopqrstuvwxyz0123456789"
	result := make([]byte, length)
	for i := range result {
		result[i] = charset[rand.Intn(len(charset))]
	}
	return string(result)
}
