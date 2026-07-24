/*
Example 2: Direct Routing

This example demonstrates how to request direct peer-to-peer routing
for an outbound call, including media capability negotiation.
*/

package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"github.com/pstn2/pstn2-go/pkg/client"
	"github.com/pstn2/pstn2-go/pkg/types"
)

func main() {
	pstn2Client, err := client.NewClient(&client.Config{
		CPID:        "CP1-UK-0001",
		APIEndpoint: "https://api.yourcp.com/pstn2/v1",
		PrivateKey:  os.Getenv("PSTN2_PRIVATE_KEY"),
		AuthMode:    types.AuthModeDirectQuery,
	})
	if err != nil {
		log.Fatalf("Failed to initialize client: %v", err)
	}
	defer pstn2Client.Close()

	fmt.Println("Requesting direct routing for outbound call...")
	fmt.Println("---")

	ctx := context.Background()

	// Request routing with media capabilities
	routing, err := pstn2Client.Routing().RequestRouting(ctx, &types.RoutingRequest{
		DestinationNumber: "+447700900123",
		CallerID:          "+441234567890",
		CallReference:     "xyz-789-abc-012",
		MediaCapabilities: &types.MediaCapabilities{
			Codecs:       []string{"opus", "g722", "pcmu"},
			Encryption:   []string{"srtp-aes256", "srtp-aes128"},
			Video:        false,
			MaxBandwidth: 128000, // 128 kbps
		},
		Branding: &types.CallBranding{
			DisplayName:     "ACME Support",
			Logo:            "https://cdn.acme.com/logo.png",
			BackgroundColor: "#0066cc",
			TextColor:       "#ffffff",
			CallPurpose:     "Account Security Alert",
		},
	})

	if err != nil {
		fmt.Printf("Error requesting routing: %v\n", err)
		fmt.Println("Falling back to traditional PSTN")
		return
	}

	if routing.Accepted {
		fmt.Println("✓ Routing accepted!")
		fmt.Println("")
		fmt.Println("Connection Details:")
		fmt.Printf("  FQDN: %s\n", routing.ConnectionDetails.FQDN)
		fmt.Printf("  IPv4: %s\n", routing.ConnectionDetails.IPv4)
		fmt.Printf("  IPv6: %s\n", strOrNA(routing.ConnectionDetails.IPv6))
		fmt.Printf("  Port: %d\n", routing.ConnectionDetails.Port)
		fmt.Printf("  Protocol: %s\n", routing.ConnectionDetails.Protocol)
		fmt.Println("")
		fmt.Println("Agreed Capabilities:")
		fmt.Printf("  Codecs: %s\n", strings.Join(routing.AgreedCapabilities.Codecs, ", "))
		fmt.Printf("  Encryption: %s\n", strings.Join(routing.AgreedCapabilities.Encryption, ", "))
		fmt.Printf("  Video: %s\n", boolToYesNo(routing.AgreedCapabilities.Video))
		fmt.Println("")
		fmt.Println("Encryption:")
		if routing.ConnectionDetails.PublicKey != "" {
			pk := routing.ConnectionDetails.PublicKey
			if len(pk) > 32 {
				pk = pk[:32] + "..."
			}
			fmt.Printf("  Public Key: %s\n", pk)
		} else {
			fmt.Println("  Public Key: N/A")
		}
		fmt.Println("  Algorithm: Ed25519")
		fmt.Println("")

		// Now you can establish the media connection
		fmt.Println("Ready to establish encrypted media connection!")
		fmt.Printf("Connect to: %s:%d\n", routing.ConnectionDetails.FQDN, routing.ConnectionDetails.Port)

		// Simulate media connection
		simulateMediaConnection(routing.ConnectionDetails)
	} else {
		fmt.Println("✗ Routing rejected")
		fmt.Printf("Reason: %s\n", routing.Reason)
		fmt.Println("Falling back to traditional PSTN")
	}
}

func simulateMediaConnection(details *types.ConnectionDetails) {
	fmt.Println("")
	fmt.Println("Establishing media connection...")
	fmt.Println("  1. Performing DTLS handshake")
	fmt.Println("  2. Exchanging SRTP keys")
	fmt.Println("  3. Setting up Opus codec")
	fmt.Println("  4. Media connection established!")
	fmt.Println("")
	fmt.Println("✓ Call connected - encrypted HD audio ready")
}

func strOrNA(value string) string {
	if value == "" {
		return "N/A"
	}
	return value
}

func boolToYesNo(value bool) string {
	if value {
		return "Yes"
	}
	return "No"
}
