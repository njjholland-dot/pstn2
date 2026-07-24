/*
Example 4: Emergency Services

This example demonstrates how PSAPs query real-time location
data for emergency calls (999/112/911).
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
	// Initialize as a PSAP (Public Safety Answering Point)
	psapClient, err := client.NewClient(&client.Config{
		CPID:        "PSAP-UK-LONDON-01",
		APIEndpoint: "https://api.psap-london.gov.uk/pstn2/v1",
		PrivateKey:  os.Getenv("PSAP_PRIVATE_KEY"),
		AuthMode:    types.AuthModeDirectQuery,
	})
	if err != nil {
		log.Fatalf("Failed to initialize PSAP client: %v", err)
	}
	defer psapClient.Close()

	fmt.Println("Emergency Services Location Query")
	fmt.Println("PSAP: London Central 999")
	fmt.Println("---")

	// Scenario: Someone calls 999
	emergencyCall := struct {
		CallerID      string
		CallReference string
		Timestamp     time.Time
	}{
		CallerID:      "+441234567890",
		CallReference: "emergency-456-789",
		Timestamp:     time.Now(),
	}

	fmt.Println("Emergency call received:")
	fmt.Printf("  From: %s\n", emergencyCall.CallerID)
	fmt.Printf("  Time: %s\n", emergencyCall.Timestamp.Format(time.RFC3339))
	fmt.Println("")
	fmt.Println("Querying real-time location...")

	ctx := context.Background()

	// Query the CP for caller's location
	location, err := psapClient.Emergency().GetLocation(ctx, &types.LocationRequest{
		CallerID:      emergencyCall.CallerID,
		CallReference: emergencyCall.CallReference,
		PSAPID:        "UK-999-LONDON-CENTRAL",
	})

	if err != nil {
		fmt.Printf("Error retrieving location: %v\n", err)
		fmt.Println("Falling back to billing address...")
		return
	}

	fmt.Println("✓ Location retrieved successfully")
	fmt.Println("")
	fmt.Println("GPS Coordinates:")
	fmt.Printf("  Latitude: %.6f\n", location.Location.Latitude)
	fmt.Printf("  Longitude: %.6f\n", location.Location.Longitude)
	fmt.Printf("  Accuracy: %.1f meters\n", location.Location.Accuracy)
	if location.Location.Altitude != nil {
		fmt.Printf("  Altitude: %.1f meters\n", *location.Location.Altitude)
	} else {
		fmt.Println("  Altitude: N/A")
	}
	fmt.Printf("  Source: %s\n", location.Location.Source)
	fmt.Println("")
	fmt.Println("Address:")
	fmt.Printf("  Street: %s\n", location.Address.Street)
	fmt.Printf("  City: %s\n", location.Address.City)
	fmt.Printf("  Postcode: %s\n", location.Address.Postcode)
	fmt.Printf("  Country: %s\n", location.Address.Country)
	fmt.Println("")

	if location.AdditionalInfo != nil {
		fmt.Println("Additional Information:")
		if location.AdditionalInfo.CellTowerID != "" {
			fmt.Printf("  Cell Tower: %s\n", location.AdditionalInfo.CellTowerID)
		}
		if len(location.AdditionalInfo.WiFiAccessPoints) > 0 {
			fmt.Printf("  WiFi APs: %d detected\n", len(location.AdditionalInfo.WiFiAccessPoints))
		}
		fmt.Printf("  Last Updated: %s\n", location.AdditionalInfo.LastUpdated.Format(time.RFC3339))
		fmt.Println("")
	}

	// Calculate response recommendations
	accuracy := location.Location.Accuracy
	fmt.Println("Dispatch Recommendations:")
	if accuracy < 20 {
		fmt.Println("  ✓ Excellent accuracy - dispatch to exact location")
		fmt.Println("  ✓ GPS lock strong")
	} else if accuracy < 100 {
		fmt.Println("  ⚠ Good accuracy - dispatch to general area")
		fmt.Println("  ⚠ May need caller confirmation")
	} else {
		fmt.Println("  ⚠ Low accuracy - use cell tower triangulation")
		fmt.Println("  ⚠ Caller assistance required")
	}
	fmt.Println("")

	// Compare with traditional PSTN
	fmt.Println("Traditional PSTN comparison:")
	fmt.Println("  Old: Billing address (often incorrect)")
	fmt.Println("  Old: 100-1000m accuracy")
	fmt.Println("  Old: 30-60 second delay")
	fmt.Println("  ---")
	fmt.Println("  New: Real-time GPS location")
	fmt.Println("  New: 5-15m accuracy")
	fmt.Println("  New: < 100ms response time")
	fmt.Println("  Result: Faster response, lives saved! 🚑")
}
