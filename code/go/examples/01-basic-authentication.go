/*
Example 1: Basic Authentication

This example demonstrates how to verify an inbound call using
PSTN2 authentication (Option 1: Direct Query).
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
	// Initialize PSTN2 client
	pstn2Client, err := client.NewClient(&client.Config{
		CPID:        "CP1-UK-0001",
		APIEndpoint: "https://api.yourcp.com/pstn2/v1",
		PrivateKey:  os.Getenv("PSTN2_PRIVATE_KEY"),
		AuthMode:    types.AuthModeDirectQuery,
		Timeout:     2 * time.Second,
		Retries:     3,
		LogLevel:    "info",
	})
	if err != nil {
		log.Fatalf("Failed to initialize client: %v", err)
	}
	defer pstn2Client.Close()

	fmt.Println("PSTN2 Client initialized")
	fmt.Printf("CP ID: %s\n", pstn2Client.Config().CPID)
	fmt.Printf("Auth Mode: %s\n", pstn2Client.Config().AuthMode)
	fmt.Println("---")

	// Scenario: Verify an inbound call
	fmt.Println("Verifying inbound call...")

	ctx := context.Background()
	verification, err := pstn2Client.Auth().VerifyCall(ctx, &types.VerifyCallRequest{
		CallerID:      "+441234567890",
		CalledID:      "+447700900123",
		CallReference: "abc-123-def-456",
	})

	if err != nil {
		fmt.Printf("Error during verification: %v\n", err)
		fmt.Println("Falling back to traditional PSTN routing")
		return
	}

	if verification.Verified {
		fmt.Println("✓ Call verified successfully!")
		fmt.Printf("  Caller Name: %s\n", strOrDefault(verification.CallerName, "Unknown"))
		fmt.Printf("  Organization: %s\n", strOrDefault(verification.CallerOrg, "N/A"))
		fmt.Printf("  Call Purpose: %s\n", strOrDefault(verification.CallPurpose, "General"))
		fmt.Printf("  Trust Level: %s\n", verification.TrustLevel)

		if verification.Branding != nil {
			fmt.Println("  Branding:")
			fmt.Printf("    Display Name: %s\n", verification.Branding.DisplayName)
			fmt.Printf("    Logo: %s\n", verification.Branding.Logo)
			fmt.Printf("    Colors: %s\n", verification.Branding.BackgroundColor)
		}

		if len(verification.PortingChain) > 1 {
			fmt.Printf("  Porting Chain: %s\n", joinStrings(verification.PortingChain, " → "))
		}
	} else {
		fmt.Println("✗ Call NOT verified")
		fmt.Println("  This may indicate caller ID spoofing")
		fmt.Println("  Recommended: Block or warn user")
	}
}

func strOrDefault(value, defaultValue string) string {
	if value == "" {
		return defaultValue
	}
	return value
}

func joinStrings(strs []string, sep string) string {
	if len(strs) == 0 {
		return ""
	}
	result := strs[0]
	for i := 1; i < len(strs); i++ {
		result += sep + strs[i]
	}
	return result
}
