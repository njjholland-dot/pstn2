/*
Example 3: Token Pool Authentication

This example demonstrates Token Pool authentication (Option 2),
which creates a shared token before placing the call.
*/

package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/pstn2/pstn2-go/pkg/client"
	"github.com/pstn2/pstn2-go/pkg/types"
)

func main() {
	// Initialize client with Token Pool mode
	pstn2Client, err := client.NewClient(&client.Config{
		CPID:              "CP1-UK-0001",
		APIEndpoint:       "https://api.yourcp.com/pstn2/v1",
		PrivateKey:        os.Getenv("PSTN2_PRIVATE_KEY"),
		AuthMode:          types.AuthModeTokenPool,
		TokenPoolEndpoint: "https://tokenpool.pstn2.org",
		TokenPoolAuth:     os.Getenv("TOKEN_POOL_JWT"),
	})
	if err != nil {
		log.Fatalf("Failed to initialize client: %v", err)
	}
	defer pstn2Client.Close()

	fmt.Println("Token Pool Authentication Example")
	fmt.Println("---")

	// STEP 1: Create token before placing call (Originating CP)
	fmt.Println("Step 1: Creating authentication token...")

	ctx := context.Background()

	token, err := pstn2Client.Auth().CreateToken(ctx, &types.CreateTokenRequest{
		CallerID:      "+441234567890",
		CalledID:      "+447700900123",
		CallReference: "token-call-123",
		TTL:           30, // 30 seconds
		Branding: &types.CallBranding{
			DisplayName: "ACME Corp",
			CallPurpose: "Customer Service",
		},
	})

	if err != nil {
		log.Fatalf("Error creating token: %v", err)
	}

	fmt.Println("✓ Token created successfully")
	fmt.Printf("  Token ID: %s\n", token.TokenID)
	fmt.Printf("  Expires: %s\n", token.ExpiresAt.Format(time.RFC3339))
	fmt.Printf("  Call Reference: %s\n", token.CallReference)
	fmt.Println("")

	// STEP 2: Place call with token in SIP INVITE
	fmt.Println("Step 2: Placing call with token...")
	fmt.Println("  SIP INVITE Header:")
	fmt.Printf("    X-PSTN2-Token: %s\n", token.TokenID)
	fmt.Println("")

	// Simulate some time passing
	time.Sleep(1 * time.Second)

	// STEP 3: Recipient CP verifies token (on different CP)
	fmt.Println("Step 3: Recipient CP verifying token...")

	verification, err := pstn2Client.Auth().VerifyToken(ctx, token.TokenID)
	if err != nil {
		fmt.Printf("✗ Token verification failed: %v\n", err)
		fmt.Println("Token may have expired or been tampered with")
		return
	}

	if verification != nil {
		fmt.Println("✓ Token verified successfully")
		fmt.Printf("  Originating CP: %s\n", verification.OriginatingCP)
		fmt.Printf("  Caller ID: %s\n", verification.CallerID)
		fmt.Printf("  Called ID: %s\n", verification.CalledID)
		fmt.Printf("  Verified: %t\n", verification.Verified)

		if verification.Branding != nil {
			fmt.Printf("  Display Name: %s\n", verification.Branding.DisplayName)
			fmt.Printf("  Call Purpose: %s\n", verification.Branding.CallPurpose)
		}
		fmt.Println("")
		fmt.Println("Call can proceed with confidence!")
	} else {
		fmt.Println("✗ Token verification failed")
		fmt.Println("Token may have expired or been tampered with")
	}

	// STEP 4: Show token pool benefits
	fmt.Println("")
	fmt.Println("Token Pool Benefits:")
	fmt.Println("  ✓ Reduced query load (one create, many verifies)")
	fmt.Println("  ✓ Works with any SIP header")
	fmt.Println("  ✓ Short TTL limits fraud window")
	fmt.Println("  ✓ Shared pool enables analytics")
}
