# PSTN2 Go SDK

Go implementation of the PSTN2 protocol **v1.1**: caller ID verification, direct
routing, end-to-end encryption support and enhanced emergency location for the
existing PSTN, built on **Number Discovery** and no central database.

- **Standard library only.** No dependencies, no `go.sum`.
- **Go 1.21 or later.**
- Module `github.com/njjholland-dot/pstn2/code/go`, package `pkg/pstn2`.
- SDK version `1.1.0` (`pstn2.Version`), protocol `1.1` (`pstn2.ProtocolVersion`).

Every PSTN2 interaction begins by answering one question: *which CP currently
holds this number?* The SDK answers it the way SPECIFICATION.md §9 describes:

```
cache ──hit──▶ query the cached holder directly
  │ miss
  ▼
regulator numbering list (longest prefix) ──no block──▶ unallocated
  │                                       └─no URL───▶ not_participating
  ▼
Range Holder: GET {url}/pstn2/v1/numbers/{digits}
  ├─ 200 held      → cache number → holder (ttl), done
  ├─ 200 redirect  → ported: query portedTo (the new holder)
  ├─ 200 not_held  → stale cache: purge, restart from the numbering list
  └─ 404           → unknown (not in service)
max 5 hops · a CP seen twice in one pass = loop · any failure = traditional PSTN
```

## Installation

```bash
go get github.com/njjholland-dot/pstn2/code/go/pkg/pstn2
```

```go
import "github.com/njjholland-dot/pstn2/code/go/pkg/pstn2"
```

## Quick start

```go
package main

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/njjholland-dot/pstn2/code/go/pkg/pstn2"
)

func main() {
	client, err := pstn2.NewClient(pstn2.Config{
		CPID:             "CP1-UK-0101",
		NumberingListURL: "http://127.0.0.1:47901/numbering-list.json", // local mock network
	})
	if err != nil {
		log.Fatal(err)
	}
	defer client.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Who holds this number? (Charlie's range, ported to Bravo)
	res := client.Discover(ctx, "+441134960456")
	if res.Fallback() {
		fmt.Println("no PSTN2 holder:", res.Result, res.Error, "→ traditional PSTN")
		return
	}
	fmt.Printf("held by %s (ported %v) via %v\n", res.Holder.CPName, res.Ported, res.Hops)
	// held by Bravo Networks (ported true) via [CP1-UK-0103 CP1-UK-0102]

	// Verify an inbound caller ID with whoever holds it now.
	v, err := client.Auth().VerifyCall(ctx, pstn2.VerifyCallRequest{
		CallerID: "+441614960123",
		CalledID: "+442079460100",
	})
	switch {
	case err != nil:
		fmt.Println("verification failed:", err, "→ traditional PSTN")
	case v.Verified:
		fmt.Println("verified by", v.Via.Holder.CPName)
	default:
		fmt.Println("not verified:", v.Reason, "→ flag, traditional PSTN")
	}
}
```

Start the local mock network first (Node 18+, no dependencies), from the
repository root:

```bash
node test-environment/mock-network/server.mjs            # http://127.0.0.1:47901
```

## Configuration

`pstn2.Config` (all fields optional except a numbering list source):

| Field | Default | Meaning |
|---|---|---|
| `CPID` | — | Acting CP's RCPID; sent as `X-PSTN2-CP-ID` and `requestingCP` |
| `NumberingListURL` | — | Regulator numbering list, fetched lazily with ETag/If-None-Match |
| `NumberingList` / `List` | — | In-memory list data, or a shared `*NumberingList` |
| `ListRefresh` | 24h | Revalidate the list after this long (`refreshSeconds` 86400) |
| `VerifySignatures` | false | Require Ed25519-signed discovery answers (§9.6) |
| `HopLimit` | 5 | Maximum discovery queries per lookup |
| `DefaultTTL` | 86400 | Seconds to cache a held answer that carries no `cache.ttl` |
| `Timeout` | 2s | Per HTTP attempt |
| `Retries` | 3 | 503/504/network retries, 100/200/400ms backoff (§10.3); negative disables |
| `HTTPClient` | pooled client | Custom `*http.Client` |
| `PrivateKey` | — | Ed25519 key to sign request bodies |
| `Cache` | new | Shared `*DiscoveryCache` |
| `OnEvent` | — | Receives every discovery event |

Every request carries `User-Agent: pstn2-go-sdk/1.1.0` and `X-PSTN2-Version: 1.1`.
Go's default `Go-http-client/*` agent is rejected by the pstn2.org WAF (and many
others), so the SDK never sends it. Discovery `GET`s carry no body and no
`Content-Type`; responses are parsed as JSON whatever their `Content-Type`
(static hosts may send `application/octet-stream`).

### Environment (`pstn2.LoadEnv()`)

The examples, and any program that wants the same switches, read:

| Variable | Default | Meaning |
|---|---|---|
| `PSTN2_NETWORK` | `local` | `local` = mock network, `live` = dummy test CPs on pstn2.org |
| `PSTN2_MOCK_PORT` | `47901` | Local mock network port |
| `PSTN2_NUMBERING_LIST_URL` | per network | Overrides the numbering list URL |
| `PSTN2_CP_ID` | `CP1-UK-0101` (local), `CP1-UK-TEST-CLIENT` (live) | Acting CP |
| `PSTN2_VERIFY_SIGNATURES` | on for live, off for local | `1`/`0` |

```go
env := pstn2.LoadEnv()
client, err := pstn2.NewClient(env.Config())
```

## API reference

### Number Discovery

```go
// The numbering list: from a URL (lazy, ETag, daily refresh) or from data.
list := pstn2.NewNumberingListFromURL(url, pstn2.NumberingListOptions{})
list, err := pstn2.LoadNumberingList(ctx, url, pstn2.NumberingListOptions{}) // fetch now
list := pstn2.NewNumberingList(pstn2.NumberingListData{Blocks: blocks})
block := list.FindBlock("+441614960123")   // longest prefix, numberLength must match
changed, err := list.Refresh(ctx)            // conditional GET; false on 304

// The number cache: number → holder hints with TTL. Never block-level.
cache := pstn2.NewDiscoveryCache(nil)
cache.Set(number, holder, ported, ttlSeconds)
entry, ok := cache.Get(number)               // expired entries are dropped
cache.Purge(number); cache.Clear(); cache.Entries()

// The discovery client (Client.Discovery() returns the client's own).
d, err := pstn2.NewDiscoveryClient(pstn2.DiscoveryConfig{
	CPID: "CP1-UK-0101", NumberingList: list, VerifySignatures: true,
})
res := d.Discover(ctx, "+441134960456", pstn2.WithEvents(func(e pstn2.DiscoveryEvent) {
	fmt.Println(e.Type) // cache-miss, list-lookup, query, response, redirect, cache-store, result
}))
```

`Discover` never returns an error; failures are results. `DiscoveryResult`:

| Field | Meaning |
|---|---|
| `Number` | E.164 |
| `Result` | `held`, `unknown`, `unallocated`, `not_participating`, `error` |
| `Holder` | `*CpRef{CPID, CPName, URL}` when held |
| `Ported` | holder is not the Range Holder |
| `Hops` | cpIds queried, in order |
| `FromCache` | the answer came from the cached holder |
| `Invalidated` | a `cache.invalidate` was received and the entry purged |
| `Error` | `hop_limit_exceeded`, `loop_detected`, `timeout`, `invalid_response`, `invalid_signature` |
| `RangeHolder` | the non-participating Range Holder (`not_participating`) |

`res.Held()` / `res.Fallback()` tell you which way the call goes. Events have the
same names as the reference engine: `cache-hit`, `cache-miss`, `list-lookup`,
`query`, `response`, `redirect`, `cache-purge`, `cache-store`, `result`;
`response` events also report `Signature` (`verified`, `unsigned`, `invalid`).

`CpRef.DiscoveryURL(n)` is `{url}/pstn2/v1/numbers/{digits}`; `CpRef.APIBase()`
is `{url}/pstn2/v1`.

### Authentication

```go
// Direct Query (§5.1): discover the caller ID's holder, POST /auth/verify there.
v, err := client.Auth().VerifyCall(ctx, pstn2.VerifyCallRequest{CallerID: callerID, CalledID: calledID})
// v.Verified, v.Reason (verified | caller_id_unknown | unallocated | not_participating |
// call_not_found | not_verified | discovery_error), v.Fallback, v.Via (holder, discovery, retry)

// Token Pool (§5.2): created at the caller ID's holder, verified there by the terminating CP.
tok, err := originating.Auth().CreateToken(ctx, pstn2.TokenRequest{CallerID: callerID, CalledID: calledID, TTL: 30})
tv, err := terminating.Auth().VerifyToken(ctx, callerID, tok.TokenID) // invalid_token (404), expired_token (410)
```

An unverifiable caller ID is an outcome, not an error: `VerifyCall` returns
`Verified == false` with a `Reason` and `Fallback == true`. An error means the
verification request itself failed.

### Routing

```go
route, err := client.Routing().RequestRouting(ctx, pstn2.RoutingRequest{
	CallerID:          "+442079460100",
	DestinationNumber: "+441614960123",
	MediaCapabilities: pstn2.MediaCapabilities{Codecs: []string{"opus", "g722", "pcmu"}, Encryption: []string{"srtp-aes256"}},
	PublicKey:         pstn2.PublicKeyBase64(identityKey),
})
// route.Accepted, route.ConnectionDetails (fqdn, ipv4/6, port, protocol, publicKey), route.AgreedCapabilities
```

### Emergency

```go
loc, err := psap.Emergency().GetLocation(ctx, pstn2.LocationRequest{CallerID: callerID, PSAPID: "UK-999-MANCHESTER-01"})
// loc.Location (lat, lon, accuracy, source), loc.Address
```

### Ported numbers and stale caches

All modules find the holder with `Discover()` and call `{holder.url}/pstn2/v1/...`.
If that CP answers `200 {"result":"not_held","cache":{"invalidate":true}}` (the number
moved since it was cached, §5.1.2), the SDK purges the entry, rediscovers from the
Range Holder and retries **once** at the new holder. `Via.Retried`,
`Via.NotHeldBy` and `Via.FirstDiscovery` record what happened. `cache.scope:
"block"` also re-downloads the numbering list.

### Errors and fallback

```go
_, err := client.Routing().RequestRouting(ctx, req)
if de, ok := pstn2.IsDiscoveryError(err); ok {
	// no PSTN2 holder: de.Result.Result is unknown / unallocated / not_participating / error
}
switch pstn2.ErrorCode(err) {
case pstn2.CodeUnsupportedCodec, pstn2.CodeCapacityExceeded: // §10.2 codes from the holder
case pstn2.CodeTimeout, pstn2.CodeNetworkError:              // no response after retries
}
// Whatever the error: route the call over traditional PSTN. PSTN2 never blocks a call.
```

`*pstn2.Error` carries `Code`, `Message`, `HTTPStatus` and `URL`;
`pstn2.IsTimeout(err)` and `pstn2.IsNetworkError(err)` are helpers.

### Answering discovery queries (server side)

`RangeHolderResponder` builds a CP's §9.2 answers from its own number data and
serves them as an `http.Handler` (`…/pstn2/v1/numbers/{digits}` and `…/pstn2/v1/keys`).
Its answers are identical to `Network.respond()` in the reference engine, and
signed answers are byte-identical to those of `tools/testcp/build.mjs`.

```go
r := pstn2.NewRangeHolderResponder(pstn2.ResponderConfig{
	DB: pstn2.NumberDatabase{
		CPID: "CP1-UK-0103", CPName: "Charlie Comms", URL: "https://pstn2.charlie-comms.example",
		Ranges:    []string{"441134960"},
		InService: []string{"+441134960789"},
		PortedOut: []pstn2.PortedOut{{Number: "+441134960456", ToCPID: "CP1-UK-0102"}},
	},
	NumberingList: list,                         // not_held vs 404 for numbers it doesn't serve
	Resolve:       pstn2.ResolverFromList(list), // cpId → CpRef for portedTo
	KeyID:         "charlie-2026-10",
	PrivateKey:    signingKey,                   // optional Ed25519 signing
})
http.Handle("/pstn2/v1/", r)
status, body := r.Respond("+441134960456") // 200 redirect → Bravo Networks
```

### Signatures

```go
b, _ := pstn2.CanonicalJSON(body)                 // sorted keys, no whitespace, "/" and non-ASCII unescaped
signed, _ := pstn2.SignBody(body, kid, privateKey)
err := pstn2.VerifySignature(signed, publicKey)   // ErrUnsigned / ErrInvalidSignature
keys := pstn2.NewKeyStore(pstn2.HTTPOptions{})    // fetches {url}/pstn2/v1/keys, cached per CP
err = keys.VerifyFrom(ctx, cp, body)              // picks the key by "kid"
```

With `VerifySignatures: true`, every `200` discovery answer must be signed by the
answering CP with a key it publishes; unsigned or invalid answers give
`Result: "error", Error: "invalid_signature"`.

## Examples

Each example is its own `main` package, reads its configuration from the
environment, logs every step, falls back to traditional PSTN handling on any
failure and closes its clients on exit.

| Example | Storyline |
|---|---|
| `01-basic-authentication` | Charlie Comms (terminating) verifies four caller IDs: Alpha's, Bravo's, a spoofed not-in-service number (flagged, PSTN fallback) and a ported number (Range Holder redirect → Bravo verifies) |
| `02-direct-routing` | Alpha routes +441614960123 directly to Bravo with codec/SRTP negotiation; a call to non-participating Delta falls back to PSTN |
| `03-token-pool` | Alpha creates a token, Bravo verifies it; a forged token is rejected and Bravo falls back to Direct Query |
| `04-emergency-services` | A PSAP gets the live location of a 999 caller from the number's holder; a non-participating caller falls back to traditional location |
| `05-complete-call-flow` | Discovery (with redirect), authentication, routing and timing summary; the second call is a cache hit |
| `06-number-discovery` | "Who has this number?" hop by hop: scenarios A–G locally, or the dummy test CPs (signatures verified) |

```bash
# from the repository root, in one terminal:
node test-environment/mock-network/server.mjs

# in another, from code/go:
go run ./examples/01-basic-authentication
go run ./examples/02-direct-routing
go run ./examples/03-token-pool
go run ./examples/04-emergency-services
go run ./examples/05-complete-call-flow
go run ./examples/06-number-discovery
```

Example 06 resets the mock network before and after it runs (it ports a number
in scenario D), so the examples can be run in any order.

### Live dummy test CPs

`https://pstn2.org/testcp/` hosts two dummy CPs as static files, with signed
answers for the Ofcom drama range 07700 900xxx:

| Number | Expect |
|---|---|
| +447700900001, +447700900002 | held by Test CP A |
| +447700900003 | Test CP A redirects → held by Test CP B (ported) |
| +447700900004 | held by Test CP A; Test CP B answers `not_held` + invalidate (stale-cache test) |
| +447700900101 | held by Test CP B |
| +447700900099 | 404 from Test CP A |

```bash
PSTN2_NETWORK=live go run ./examples/06-number-discovery
```

Or emulate them locally (same files, same 403-for-generic-agents behaviour):

```bash
node tools/testcp/build.mjs --base http://127.0.0.1:47902/testcp --out /tmp/testcp-local
node test-environment/mock-network/static-server.mjs --dir /tmp/testcp-local --port 47902
PSTN2_NUMBERING_LIST_URL=http://127.0.0.1:47902/testcp/numbering-list.json go run ./examples/06-number-discovery
```

Only Number Discovery is available on the static test CPs; examples 01–05 need
the mock network.

## Running the tests

```bash
cd code/go
go vet ./... && go test ./...
go test -race -v ./pkg/pstn2
```

The suite is offline. Unit tests cover the numbering list (longest prefix,
length check, ETag/304, refresh interval), the cache (TTL, purge, concurrency),
canonical JSON and Ed25519 signatures, the discovery algorithm (all scenarios
in memory, loops, hop limit, errors, signatures) and HTTP retries. When `node`
is on `PATH` the integration tests also:

- run scenarios A–G from `test-environment/fixtures/scenarios.json` against
  `test-environment/mock-network/server.mjs` on a free port, with one client;
- build the dummy test CP into a temp directory (temporary keys) and run all six
  test numbers, the stale-cache invalidation and a 403 check for Go's default
  User-Agent against the static host emulator, with signatures verified;
- compare `RangeHolderResponder` with the reference engine's `Network.respond()`
  and with the signed files from `build.mjs`;
- exercise auth, tokens, routing and emergency against the mock network,
  including `not_held` → purge → rediscover → retry after `POST /admin/port`.

Without `node` those tests are skipped.

## Best practices

1. **Reuse one client** per CP. It is safe for concurrent use; the cache, key
   store and numbering list are shared and lock-protected.
2. **Pass a context with a deadline.** Discovery must never hold up call setup.
3. **Always have a PSTN path.** Any `Fallback()` result or error means: handle
   the call the traditional way.
4. **Turn on `VerifySignatures`** wherever the Range Holders sign their answers.
5. **Never cache by block.** Porting is per number; the SDK keeps number-level
   and block-level knowledge separate.

## Further reading

- [SPECIFICATION.md](../../docs/SPECIFICATION.md) — protocol v1.1 (§9 Number Discovery)
- [API-SPECIFICATION.yaml](../../docs/API-SPECIFICATION.yaml) — REST API
- [EXAMPLES.md](../EXAMPLES.md) — examples in all three languages
- `animations/src/test-harness/harness-engine.js` — the reference discovery engine

## License

See the main project LICENSE file.
