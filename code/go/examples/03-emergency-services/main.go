/*
Example 03: Emergency Services location

A 999 call from +441614960123 reaches the Manchester PSAP. The PSAP discovers
the CP that currently holds the caller's number (Bravo Networks) and asks it
for the caller's live location. A second caller on a non-participating
network (+441174960555) shows the fallback to traditional location sources.

	node test-environment/mock-network/server.mjs     # in another terminal
	go run ./examples/03-emergency-services

Environment: PSTN2_PSAP_ID (default UK-999-MANCHESTER-01).
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

	psapID := os.Getenv("PSTN2_PSAP_ID")
	if psapID == "" {
		psapID = "UK-999-MANCHESTER-01"
	}
	env := pstn2.LoadEnv()
	cfg := env.Config()
	if os.Getenv("PSTN2_CP_ID") == "" {
		cfg.CPID = psapID
	}
	client, err := pstn2.NewClient(cfg)
	if err != nil {
		fmt.Println("Failed to initialise PSTN2 client:", err)
		os.Exit(1)
	}
	defer client.Close()

	fmt.Println(strings.Repeat("=", 64))
	fmt.Println("PSTN2 Example 03: Emergency Services Location")
	fmt.Println(strings.Repeat("=", 64))
	fmt.Printf("Network: %s   Numbering list: %s\n", env.Network, env.NumberingListURL)
	fmt.Printf("PSAP: %s\n\n", psapID)

	if err := client.Discovery().NumberingList().EnsureFresh(ctx); err != nil {
		fmt.Println("✗ Cannot load the numbering list:", err)
		fmt.Println("  Start the mock network first: node test-environment/mock-network/server.mjs")
		os.Exit(1)
	}

	for _, caller := range []string{"+441614960123", "+441174960555"} {
		fmt.Printf("999 call from %s (%s)\n", caller, pstn2.DisplayNumber(caller))
		start := time.Now()
		cctx, cancel := context.WithTimeout(ctx, 3*time.Second)
		loc, err := client.Emergency().GetLocation(cctx, pstn2.LocationRequest{CallerID: caller, PSAPID: psapID})
		cancel()
		if err != nil {
			if de, ok := pstn2.IsDiscoveryError(err); ok {
				fmt.Printf("  Discovery: %s", de.Result.Result)
				if de.Result.RangeHolder != nil {
					fmt.Printf(" (%s is not on PSTN2)", de.Result.RangeHolder.CPName)
				}
				fmt.Println()
			} else {
				fmt.Println("  ✗ Location request failed:", err)
			}
			fmt.Println("  → Fallback: use network cell location / billing address (traditional 999 handling)")
			fmt.Println()
			continue
		}
		l := loc.Location
		fmt.Printf("  Discovery: held by %s, hops %v\n", loc.Via.Holder.CPName, loc.Via.Discovery.Hops)
		fmt.Printf("  ✓ Location received in %dms\n", time.Since(start).Milliseconds())
		fmt.Printf("    %.6f, %.6f  ±%.0fm  (source: %s)\n", l.Latitude, l.Longitude, l.Accuracy, l.Source)
		if loc.Address != nil {
			a := loc.Address
			fmt.Printf("    Address: %s, %s %s, %s\n", a.Street, a.City, a.Postcode, a.Country)
		}
		fmt.Printf("    Map: https://www.openstreetmap.org/?mlat=%.6f&mlon=%.6f#map=18/%.6f/%.6f\n", l.Latitude, l.Longitude, l.Latitude, l.Longitude)
		fmt.Println("  → Dispatch emergency services to this location")
		fmt.Println()
	}
}
