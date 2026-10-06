/*
Example 02: Direct Routing with media negotiation

Alpha Telecom (CP1-UK-0101) places a call from +442079460100 to
+441614960123. It discovers the destination's holder (Bravo Networks), asks it
for a direct route offering codecs and SRTP ciphers plus an Ed25519 identity
key, and receives the media endpoint to send the SIP INVITE to.

A second call to +441174960555 (Delta Voice, not on PSTN2) shows the fallback
to traditional PSTN routing.

	node test-environment/mock-network/server.mjs     # in another terminal
	go run ./examples/02-direct-routing
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
	client, err := pstn2.NewClient(env.Config())
	if err != nil {
		fmt.Println("Failed to initialise PSTN2 client:", err)
		os.Exit(1)
	}
	defer client.Close()

	fmt.Println(strings.Repeat("=", 64))
	fmt.Println("PSTN2 Example 02: Direct Routing")
	fmt.Println(strings.Repeat("=", 64))
	fmt.Printf("Network: %s   Numbering list: %s\n", env.Network, env.NumberingListURL)
	fmt.Printf("Acting CP: %s (originating CP)\n\n", env.CPID)

	if err := client.Discovery().NumberingList().EnsureFresh(ctx); err != nil {
		fmt.Println("✗ Cannot load the numbering list:", err)
		fmt.Println("  Start the mock network first: node test-environment/mock-network/server.mjs")
		os.Exit(1)
	}

	// Ed25519 identity key for this call (authenticates the DTLS fingerprint, §6.3/§7.1).
	identity, _, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		fmt.Println("Failed to generate identity key:", err)
		os.Exit(1)
	}

	caller := "+442079460100"
	offer := pstn2.MediaCapabilities{
		Codecs:       []string{"opus", "g722", "pcmu"},
		Encryption:   []string{"srtp-aes256", "srtp-aes128"},
		MaxBandwidth: 128000,
	}

	for _, dest := range []string{"+441614960123", "+441174960555"} {
		fmt.Printf("Call %s → %s (%s)\n", caller, dest, pstn2.DisplayNumber(dest))
		fmt.Printf("  Offer: codecs %v, encryption %v\n", offer.Codecs, offer.Encryption)
		start := time.Now()
		cctx, cancel := context.WithTimeout(ctx, 5*time.Second)
		route, err := client.Routing().RequestRouting(cctx, pstn2.RoutingRequest{
			CallerID:          caller,
			DestinationNumber: dest,
			MediaCapabilities: offer,
			PublicKey:         pstn2.PublicKeyBase64(identity),
		})
		cancel()
		elapsed := time.Since(start)

		if err != nil {
			if de, ok := pstn2.IsDiscoveryError(err); ok {
				d := de.Result
				fmt.Printf("  Discovery: %s", d.Result)
				if d.RangeHolder != nil {
					fmt.Printf(" (Range Holder %s has no PSTN2 URL)", d.RangeHolder.CPName)
				}
				fmt.Println()
			} else {
				fmt.Println("  ✗ Routing request failed:", err)
			}
			fmt.Println("  → Falling back to traditional PSTN routing")
			fmt.Println()
			continue
		}
		d := route.Via.Discovery
		fmt.Printf("  Discovery: held by %s (%s), hops %v\n", route.Via.Holder.CPName, route.Via.Holder.CPID, d.Hops)
		if !route.Accepted {
			fmt.Printf("  ✗ Route rejected: %s → falling back to traditional PSTN routing\n\n", route.Reason)
			continue
		}
		cd := route.ConnectionDetails
		fmt.Println("  ✓ Direct route accepted")
		fmt.Printf("    Media endpoint: %s (%s / %s) port %d over %s\n", cd.FQDN, cd.IPv4, cd.IPv6, cd.Port, cd.Protocol)
		if route.AgreedCapabilities != nil {
			fmt.Printf("    Agreed: codec %v, encryption %v, video %v\n", route.AgreedCapabilities.Codecs, route.AgreedCapabilities.Encryption, route.AgreedCapabilities.Video)
		}
		if cd.PublicKey != "" {
			fmt.Printf("    Peer identity key: %s…\n", cd.PublicKey[:16])
		}
		fmt.Printf("    Next: SIP INVITE sips:%s@%s:%d;transport=%s\n", dest, cd.FQDN, cd.Port, cd.Protocol)
		fmt.Printf("    Setup time: %dms\n\n", elapsed.Milliseconds())
	}
}
