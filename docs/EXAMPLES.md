# PSTN2 Code Examples

Six working examples, in TypeScript, Python and Go, for PSTN2 protocol
**v1.1**. Every example uses **Number Discovery** to find the CP that holds a
number now: the regulator's numbering list names the block's Range Holder, the
Range Holder redirects if the number has been ported, and the holder answers.
There is no central database.

All examples run offline against the **local mock network**; example 06 also
runs against the **dummy test CP** at https://pstn2.org/testcp/. Every example
exits non-zero if something did not go as expected.

## Overview

| # | Example | What it shows |
|---|---|---|
| 01 | **Basic Authentication** | A terminating CP verifies four inbound caller IDs (Direct Query), including a spoofed one and a ported one |
| 02 | **Direct Routing** | An originating CP asks the destination's holder for a direct media path, with codec and SRTP negotiation |
| 03 | **Token Pool** | The originating CP creates a token at the caller ID's holder; the terminating CP verifies it; a forged token is rejected |
| 04 | **Emergency Services** | A PSAP gets live location for 999 callers from each number's holder, and falls back when there is none |
| 05 | **Complete Call Flow** | Discovery with a Range Holder redirect → authentication → routing → timing summary, then a cache hit on the second call |
| 06 | **Number Discovery** | "Who has this number?" hop by hop: scenarios A–G locally, or the six dummy test CP numbers with signatures verified |

## Directory Structure

```
code/
├── typescript/                       # @pstn2/core (Node.js 18+, no runtime dependencies)
│   └── examples/
│       ├── 01-basic-authentication.ts
│       ├── 02-direct-routing.ts
│       ├── 03-token-pool.ts
│       ├── 04-emergency-services.ts
│       ├── 05-complete-call-flow.ts
│       ├── 06-number-discovery.ts
│       └── shared.ts                 # printing helpers (not part of the SDK)
├── python/                           # pstn2 (Python 3.11+)
│   └── examples/
│       ├── 01_basic_authentication.py
│       ├── 02_direct_routing.py
│       ├── 03_token_pool.py
│       ├── 04_emergency_services.py
│       ├── 05_complete_call_flow.py
│       └── 06_number_discovery.py
└── go/                               # pkg/pstn2 (Go 1.21+, standard library only)
    └── examples/                     # one main package per example
        ├── 01-basic-authentication/main.go
        ├── 02-direct-routing/main.go
        ├── 03-token-pool/main.go
        ├── 04-emergency-services/main.go
        ├── 05-complete-call-flow/main.go
        └── 06-number-discovery/main.go
```

Source: [TypeScript](https://github.com/njjholland-dot/pstn2/tree/main/code/typescript/examples) ·
[Python](https://github.com/njjholland-dot/pstn2/tree/main/code/python/examples) · [Go](https://github.com/njjholland-dot/pstn2/tree/main/code/go/examples) ·
[GitHub](https://github.com/njjholland-dot/pstn2/tree/main/code)

## Prerequisites

You need no PSTN2 account, keys or credentials. The examples act as fictional
CPs on a test network. Each client generates an ephemeral Ed25519 identity key
when none is configured.

- **Node.js 18+** (20+ recommended) for the mock network, and for the
  TypeScript SDK
- **Python 3.11+** for the Python SDK
- **Go 1.21+** for the Go SDK

```bash
git clone https://github.com/njjholland-dot/pstn2.git
cd pstn2

# TypeScript
cd code/typescript && npm ci && cd ../..

# Python
cd code/python && python3 -m venv .venv && .venv/bin/pip install -e '.[dev]' && cd ../..

# Go: nothing to install (standard library only)
```

See the language READMEs for the full SDK documentation:
[TypeScript](../code/typescript/README.md) ·
[Python](../code/python/README.md) · [Go](../code/go/README.md)

## The Test Networks

### Local mock network (examples 01–06)

```bash
# from the repository root, in its own terminal
node test-environment/mock-network/server.mjs        # http://127.0.0.1:47901
```

It serves a simulated Ofcom numbering list and three participating CPs over
real HTTP (Node.js only, no dependencies):

| CP | cpId | Range Holder for | Numbers used in the examples |
|---|---|---|---|
| Alpha Telecom | `CP1-UK-0101` | 020 7946 0xxx | +442079460100 (Alice) |
| Bravo Networks | `CP1-UK-0102` | 0161 496 0xxx | +441614960123; +441134960456 ported **in** from Charlie; +441614960999 not in service |
| Charlie Comms | `CP1-UK-0103` | 0113 496 0xxx | +441134960789; +441134960456 ported **out** to Bravo (Bob) |
| Delta Voice | `CP1-UK-0104` | 0117 496 0xxx | not participating (no Range Holder URL): +441174960555 |
| (none) | | 0115 496 0xxx | not allocated: +441154960555 |

All numbers are from Ofcom's reserved drama ranges and all CPs are fictional.
In the mock, a CP verifies any caller ID it holds, accepts routing to any
number it holds (`media.{cp}.example:5061/tls`) and returns a fixed
Manchester location for emergency queries. For a number it does not hold it
answers `200 {"result":"not_held","cache":{"invalidate":true}}`, so the
SDKs' rediscover-and-retry path is exercised too.

### Dummy test CP (example 06)

https://pstn2.org/testcp/ is two fictional CPs hosted as static files with
**signed** answers. Test CP A (`CP1-UK-9001`) is Range Holder for
07700 900 0xx, Test CP B (`CP1-UK-9002`) for 07700 900 1xx. It answers Number
Discovery only.

## Running the Examples

```bash
# terminal 1, repository root
node test-environment/mock-network/server.mjs

# terminal 2
cd code/typescript && npm run example:01            # … example:06
cd code/python && .venv/bin/python examples/01_basic_authentication.py
cd code/go && go run ./examples/01-basic-authentication
```

| # | TypeScript (`code/typescript`) | Python (`code/python`) | Go (`code/go`) |
|---|---|---|---|
| 01 | `npm run example:01` | `.venv/bin/python examples/01_basic_authentication.py` | `go run ./examples/01-basic-authentication` |
| 02 | `npm run example:02` | `.venv/bin/python examples/02_direct_routing.py` | `go run ./examples/02-direct-routing` |
| 03 | `npm run example:03` | `.venv/bin/python examples/03_token_pool.py` | `go run ./examples/03-token-pool` |
| 04 | `npm run example:04` | `.venv/bin/python examples/04_emergency_services.py` | `go run ./examples/04-emergency-services` |
| 05 | `npm run example:05` | `.venv/bin/python examples/05_complete_call_flow.py` | `go run ./examples/05-complete-call-flow` |
| 06 | `npm run example:06` | `.venv/bin/python examples/06_number_discovery.py` | `go run ./examples/06-number-discovery` |

The TypeScript examples run with `ts-node`; `npm run typecheck:examples`
type-checks them. Example 06 resets the mock network before and after it runs
(it ports a number in scenario D), so the examples can run in any order.

### Environment variables

| Variable | Default | Meaning |
|---|---|---|
| `PSTN2_NETWORK` | `local` | `local` = mock network, `live` = dummy test CP on pstn2.org |
| `PSTN2_MOCK_PORT` | `47901` | Mock network port (start it with `--port N`, or `PSTN2_MOCK_PORT=N`, to match) |
| `PSTN2_NUMBERING_LIST_URL` | per network | Overrides the numbering list URL (e.g. the local static emulator) |
| `PSTN2_CP_ID` | per example; `CP1-UK-TEST-CLIENT` live | Acting CP |
| `PSTN2_VERIFY_SIGNATURES` | on for live, off for local | `1` / `0` |
| `PSTN2_LOG_LEVEL` | quiet | SDK request log (TypeScript `info`/`debug`; Python `INFO`/`DEBUG`) |
| `PSTN2_PSAP_ID` | `UK-999-MANCHESTER-01` | Python and Go example 04 |
| `PSTN2_TERMINATING_CP_ID` | `CP1-UK-0102` | Python examples 03 and 05 |
| `PSTN2_PRIVATE_KEY` | ephemeral | Python: Ed25519 key (PEM or base64) for request signatures |

Each example starts by printing the network, numbering-list URL, acting CP,
whether signatures are verified and the list version
(`2026-10-06T06:00:00Z (4 blocks)` on the mock). If the list cannot be loaded
it explains how to start the mock network and exits 1.

---

## Example 1: Basic Authentication

**Files:** `typescript/examples/01-basic-authentication.ts`,
`python/examples/01_basic_authentication.py`,
`go/examples/01-basic-authentication/main.go`

**Acting CP:** Charlie Comms (`CP1-UK-0103`), the **terminating** CP. Called
number +441134960789 (a Charlie customer). For each inbound call the SDK
discovers the caller ID's current holder and sends `POST /pstn2/v1/auth/verify`
there.

```typescript
// TypeScript
const v = await client.verifyCall({ callerID, calledID: '+441134960789', callReference: client.generateCallReference() });
if (v.verified) console.log(`✓ VERIFIED by ${v.holder?.cpName}`);
else if (v.fallbackToTraditional) console.log('✗ NOT VERIFIED: flag it, traditional PSTN treatment');
```

```python
# Python
v = await client.auth.verify_call(caller_id, "+441134960789")
print(v.verified, v.holder, v.trust_level, v.reason, v.fallback_to_pstn)
```

```go
// Go
v, err := client.Auth().VerifyCall(ctx, pstn2.VerifyCallRequest{CallerID: callerID, CalledID: "+441134960789"})
// err → traditional PSTN; v.Verified; v.Reason; v.Fallback; v.Via.Holder
```

**Results (all three SDKs):**

| Caller ID | Discovery | Outcome |
|---|---|---|
| +442079460100 (Alpha customer) | held by Alpha Telecom, 1 hop | ✓ verified by Alpha Telecom, trust `verified` |
| +441614960123 (Bravo customer) | held by Bravo Networks, 1 hop | ✓ verified by Bravo Networks |
| +441614960999 (spoofed, not in service) | `unknown`: Bravo (Range Holder) answered 404, 1 hop | ✗ not verified → flag as possible spoofing → traditional PSTN treatment |
| +441134960456 (Charlie's range, ported to Bravo) | held by Bravo (ported in), 2 hops: Charlie → Bravo | ✓ verified by Bravo: verification went to the CP that holds the number now |

The not-verified reason is `unknown` in TypeScript, `discovery_unknown` in
Python and `caller_id_unknown` in Go. TypeScript ends with
`Summary: 3 verified, 1 flagged / PSTN fallback` and
`Number cache now holds 3 entries (per number, never per block)`; Go with
`3 of 4 caller IDs verified; 1 flagged and handled as traditional PSTN`.

**Sample output (TypeScript):**

```
Call 4: +441134960456 (0113 496 0456) → +441134960789 (0113 496 0789)
  (Charlie's own range, ported to Bravo Networks)
  Discovery:   held by Bravo Networks (ported in) — 2 hops: Charlie Comms → Bravo Networks
  ✓ VERIFIED by Bravo Networks
    Caller:      Bravo Networks customer (Bravo Networks)
    Trust level: verified
    Ported number: verification went to the CP that holds it now
```

---

## Example 2: Direct Routing

**Files:** `typescript/examples/02-direct-routing.ts`,
`python/examples/02_direct_routing.py`,
`go/examples/02-direct-routing/main.go`

**Acting CP:** Alpha Telecom (`CP1-UK-0101`), the **originating** CP. Caller
+442079460100. It offers codecs `opus, g722, pcmu`, encryption
`srtp-aes256, srtp-aes128` and its Ed25519 identity key, and sends
`POST /pstn2/v1/routing/request` to the destination's holder.

```typescript
// TypeScript
const routing = await client.requestRouting({
  destinationNumber: '+441614960123',
  callerID: '+442079460100',
  mediaCapabilities: { codecs: ['opus', 'g722', 'pcmu'], encryption: ['srtp-aes256', 'srtp-aes128'] },
});
if (routing.accepted) connect(routing.connectionDetails);   // else: routing.reason → traditional PSTN
```

**Results:**

| Call | Discovery | Outcome | SDKs |
|---|---|---|---|
| → +441614960123 | held by Bravo Networks, 1 hop | ✓ accepted by Bravo: `media.bravo.example` (203.0.113.11 / 2001:db8::11) port 5061/tls; agreed `opus` + `srtp-aes256`, no video; peer Ed25519 identity key (authenticates the DTLS fingerprint) | all |
| → +441174960555 | `not_participating`: Range Holder Delta Voice has no PSTN2 URL, no queries | ✗ no direct route → traditional PSTN | Python, Go |
| → +441614960123 offering only `g729` | held by Bravo | ✗ not accepted (`unsupported_codec`, the mock's HTTP 400) → traditional PSTN | Python |

The next step is a SIP INVITE straight to the returned endpoint (Go prints
`sips:+441614960123@media.bravo.example:5061;transport=tls`); media keys come
from DTLS-SRTP. `requestRouting` never throws for a rejection: it returns
`accepted: false` with a `reason`.

---

## Example 3: Token Pool

**Files:** `typescript/examples/03-token-pool.ts`,
`python/examples/03_token_pool.py`,
`go/examples/03-token-pool/main.go`

**Acting CPs:** Alpha Telecom (`CP1-UK-0101`, originating) and Bravo Networks
(`CP1-UK-0102`, terminating). Call +442079460100 → +441614960123, TTL 30 s.
Tokens are held by the CP that holds the caller ID, found by discovery.

```typescript
// TypeScript
const token = await alpha.createToken({ callerID, calledID, ttl: 30 });   // POST {holder}/pstn2/v1/auth/tokens
// INVITE carries X-PSTN2-Token: token.tokenId
const data = await bravo.verifyToken(token.tokenId, callerID);            // GET {holder}/pstn2/v1/auth/tokens/{id}; null if unknown
const v = await bravo.verifyCall({ callerID, calledID, tokenId: token.tokenId }); // token first, Direct Query fallback
```

**Flow (all three SDKs):**

1. Alpha creates a token for the call: discovery of the caller ID → held by
   Alpha, 1 hop → `TK-xxxxxxxxxxxxxxxx` (matches `^TK-[A-Za-z0-9]{16}$`) with
   its expiry and call reference.
2. The call is signalled with `X-PSTN2-Token: TK-…` (simulated).
3. Bravo verifies the token at Alpha: ✓ verified, originating CP
   `CP1-UK-0101`, caller → called, call reference matches.
4. A forged `TK-AAAAAAAAAAAAAAAA`:
   - TypeScript: `verifyToken` returns `null` (treat as unverified); a
     separate `verifyCall({ tokenId })` with the real token is ✓ verified.
   - Python and Go: the pool answers 404 `invalid_token` → fall back to
     Direct Query → ✓ verified by Alpha Telecom.

A short TTL limits the fraud window; each call needs one create and one `GET`.

---

## Example 4: Emergency Services

**Files:** `typescript/examples/04-emergency-services.ts`,
`python/examples/04_emergency_services.py`,
`go/examples/04-emergency-services/main.go`

**Acting party:** a PSAP, ID `UK-999-MANCHESTER-01` (TypeScript acts as
`PSAP-UK-999-01`). For each 999 call it discovers the caller ID's holder and
sends `POST /pstn2/v1/emergency/location` there.

```python
# Python
try:
    loc = await client.emergency.get_location(caller_id, PSAP_ID)
    print(loc.location.latitude, loc.location.longitude, loc.address)
except DiscoveryError as e:
    ...  # no PSTN2 holder: use cell location / billing address
```

The location call **raises** (TypeScript `DiscoveryError`/`PSTN2Error`,
Python `DiscoveryError`, Go a discovery error) when there is no PSTN2 holder,
so the PSAP always knows to use its other sources.

**Results:**

| 999 caller | Discovery | Outcome | SDKs |
|---|---|---|---|
| +441614960123 | held by Bravo, 1 hop | ✓ location from Bravo: 53.4808, -2.2426 (±12 m, gps), 1 Example Street, Manchester M1 1AA, GB → dispatch (Go also prints an OpenStreetMap link) | all |
| +441134960456 | held by Bravo (ported in), 2 hops: Charlie → Bravo | ✓ same location from Bravo | TypeScript |
| +441614960999 | `unknown` (404), 1 hop | ✗ no PSTN2 location → cell-tower / billing-address location | TypeScript, Python |
| +441174960555 | `not_participating` (Delta Voice) | ✗ fallback to cell location / billing address | Go |

---

## Example 5: Complete Call Flow

**Files:** `typescript/examples/05-complete-call-flow.ts`,
`python/examples/05_complete_call_flow.py`,
`go/examples/05-complete-call-flow/main.go`

Alice +442079460100 (Alpha) calls Bob +441134960456 (Charlie's range, ported
to Bravo). Two clients: Alpha (originating) and Bravo (terminating).

- **Phase 1, Number Discovery**, printed hop by hop: cache miss → numbering
  list block `0113 496 0xxx` → Range Holder Charlie Comms →
  `GET …/cp/charlie/pstn2/v1/numbers/441134960456` ← 200 redirect → ported to
  Bravo → `GET …/cp/bravo/…` ← 200 held → cached. Result: held by Bravo,
  `ported: true`, hops `CP1-UK-0103 → CP1-UK-0102`.
- **Phase 2, Authentication:** Bravo discovers Alice's caller ID (held by
  Alpha, 1 hop) and verifies it there: ✓ verified, trust `verified`.
- **Phase 3, Direct routing:** Alpha → Bravo. The discovery comes from the
  cache (Python passes Phase 1's answer with `holder=`). ✓ accepted:
  `media.bravo.example:5061/tls`, `opus` + `srtp-aes256`.
- **Phase 4, Summary:** per-phase timings and total setup (a few ms to ~25 ms on
  localhost; target < 1000 ms).
- **Second call:** cache hit → one query straight to Bravo, `fromCache: true`,
  hops `CP1-UK-0102`: no Range Holder redirect.

**Sample output (TypeScript):**

```
🔍 Phase 1 — Number Discovery: who holds the destination?
     · cache miss for +441134960456
     · numbering list: block 0113 496 0xxx → Range Holder Charlie Comms
     · GET http://127.0.0.1:47901/cp/charlie/pstn2/v1/numbers/441134960456
       ← 200 redirect from Charlie Comms
     · redirect: ported to Bravo Networks
     · GET http://127.0.0.1:47901/cp/bravo/pstn2/v1/numbers/441134960456
       ← 200 held from Bravo Networks
     · cached +441134960456 → Bravo Networks
   ✓ held by Bravo Networks (ported in) — 2 hops: Charlie Comms → Bravo Networks [3ms]

🔐 Phase 2 — Authentication: CP1-UK-0102 verifies Alice's caller ID
   Discovery (caller ID): held by Alpha Telecom — 1 hop: Alpha Telecom
   ✓ verified by Alpha Telecom — trust verified [9ms]

🔄 Phase 3 — Direct routing: CP1-UK-0101 asks the holder for a media path
   Discovery: held by Bravo Networks (ported in) — 1 hop: Bravo Networks (from cache)
   ✓ accepted by Bravo Networks: media.bravo.example:5061/tls, opus + srtp-aes256 [2ms]

📋 Phase 4 — Summary
────────────────────────────────────────────────────────────────
   Number Discovery:    3ms  2 hops (CP1-UK-0103 → CP1-UK-0102)
   Authentication:      9ms  verified
   Direct routing:      2ms  accepted
   Total setup:        15ms
────────────────────────────────────────────────────────────────
```

---

## Example 6: Number Discovery

**Files:** `typescript/examples/06-number-discovery.ts`,
`python/examples/06_number_discovery.py`,
`go/examples/06-number-discovery/main.go`

The heart of PSTN2 v1.1: "which CP currently holds this number?" The example
prints every step of the algorithm through the SDK's discovery events
(`cache-hit` / `cache-miss`, `list-lookup`, `query`, `response`, `redirect`,
`cache-purge`, `cache-store`, `result`), checks each result against the
expected outcome, prints the cache contents and exits 1 if anything differs.
It picks its mode from the numbering list it loads.

```typescript
// TypeScript
const r = await client.discover(number, { onEvent: (e) => print(e) });
// r.result, r.holder, r.ported, r.hops, r.fromCache, r.invalidated
```

```python
# Python
r = await client.discover(number, on_event=printer)
```

```go
// Go
res := client.Discover(ctx, number, pstn2.WithEvents(printer))
```

### Local mock network: scenarios A–G

Acting CP Alpha Telecom; one client, so the cache carries over from step to
step. The example resets the mock (`POST /admin/reset`) before and after.

| | Scenario | Number | Result | Hops | Flags |
|---|---|---|---|---|---|
| A | Unported number | +441614960123 | held by Bravo | Bravo | |
| B | Ported number (Range Holder redirects) | +441134960456 | held by Bravo (ported in) | Charlie → Bravo | |
| C | Repeat call goes direct from cache | +441134960456 | held by Bravo (ported in) | Bravo | `fromCache` |
| D | Number ports back (`POST /admin/port` Bravo → Charlie): Bravo answers `not_held` → purge → restart from the Range Holder | +441134960456 | held by Charlie | Bravo → Charlie | `invalidated` |
| E | Number not in service | +441614960999 | `unknown` (404) → traditional PSTN | Bravo | |
| F | Range Holder not participating | +441174960555 | `not_participating` (Delta Voice has no PSTN2 URL) | none | |
| G | Number not allocated | +441154960555 | `unallocated` | none | |

Final line: `7/7 lookups behaved as specified.` (TypeScript),
`7/7 lookups as expected.` (Python), `7/7 steps as expected` (Go).

**Sample output (TypeScript, scenario D):**

```
D. Number ports back: stale cache is invalidated: +441134960456 (0113 496 0456)
   (mock network: +441134960456 ported Bravo → Charlie (POST /admin/port); our cache still says Bravo)
   1 CACHE   hit → Bravo Networks (expires 2026-10-07T11:41:15.934Z)
   → QUERY   Bravo Networks: GET http://127.0.0.1:47901/cp/bravo/pstn2/v1/numbers/441134960456
   ← 200     not_held
   ✗ PURGE   Bravo Networks says not_held: cache entry purged, restart from the Range Holder
   2 LIST    block 0113 496 0xxx → Range Holder Charlie Comms http://127.0.0.1:47901/cp/charlie
   → QUERY   Charlie Comms: GET http://127.0.0.1:47901/cp/charlie/pstn2/v1/numbers/441134960456
   ← 200     held
   ✓ STORE   +441134960456 → Charlie Comms
   = held by Charlie Comms — 2 hops: Bravo Networks → Charlie Comms (stale cache invalidated)
```

**Sample output (Go, scenario B):**

```
── B  Ported number (Range Holder redirects)
   Alpha Telecom asks: who holds 0113 496 0456 (+441134960456)?
   cache     miss
   list      0113 496 0xxx → Range Holder Charlie Comms
   hop 1  →  Charlie Comms  GET http://127.0.0.1:47901/cp/charlie/pstn2/v1/numbers/441134960456
          ←  200 redirect → portedTo Bravo Networks (http://127.0.0.1:47901/cp/bravo)
   redirect  ported to Bravo Networks
   hop 2  →  Bravo Networks  GET http://127.0.0.1:47901/cp/bravo/pstn2/v1/numbers/441134960456
          ←  200 held by Bravo Networks (ported in)
   cache     stored → Bravo Networks until 2026-10-07T11:41:28Z
   result    held by Bravo Networks (ported) · hops [CP1-UK-0103, CP1-UK-0102] · fromCache=false invalidated=false · 0ms  ✓
```

### Dummy test CP: six test numbers, signed

```bash
PSTN2_NETWORK=live npm run example:06                               # TypeScript
PSTN2_NETWORK=live .venv/bin/python examples/06_number_discovery.py  # Python
PSTN2_NETWORK=live go run ./examples/06-number-discovery            # Go
```

Acting CP `CP1-UK-TEST-CLIENT`; signature verification is on by default in this
mode, so every `200` answer is checked against the answering CP's key from
`{url}/pstn2/v1/keys` (kids `a-test-2026-10`, `b-test-2026-10`).

| Number | Result | Hops |
|---|---|---|
| +447700900001 | held by Test CP A | A |
| +447700900002 | held by Test CP A | A |
| +447700900003 | held by Test CP B (ported in): Test CP A redirects | A → B |
| +447700900004 | held by Test CP A. The cache is pre-seeded with Test CP B, which answers `not_held` → purge → Range Holder A (`invalidated`) | B → A |
| +447700900101 | held by Test CP B | B |
| +447700900099 | `unknown`: Test CP A's static host returns its HTML 404 page | A |

Final line: `6/6 lookups behaved as specified (all 200 answers
signature-verified).` (TypeScript), `6/6 lookups as expected.` (Python). Go
adds a seventh step, a repeat of 003 from the cache (`7/7 steps as expected`).

**Run the same thing locally** with the static-host emulator, which serves the
same signed files the way pstn2.org does (JSON for extensionless files, HTML
404 pages, 403 for generic user agents):

```bash
node tools/testcp/build.mjs --base http://127.0.0.1:47902/testcp --out /tmp/testcp-local
node test-environment/mock-network/static-server.mjs --dir /tmp/testcp-local --port 47902
PSTN2_NUMBERING_LIST_URL=http://127.0.0.1:47902/testcp/numbering-list.json npm run example:06
```

`build.mjs` signs with the keys in `$PSTN2_TESTCP_KEYS` or
`tools/testcp/.keys.json`, generating test keys there if neither exists (never
commit them).

If `PSTN2_NETWORK=live` prints `Could not load the numbering list: HTTP 404`,
the dummy test CP has not been deployed: use the emulator. (A `403` would mean
the request was sent with a generic user agent; the SDKs always send
`pstn2-{language}-sdk/1.1.0`.)

---

## Common Patterns

### Discovery first, then the holder

Every service call follows the same pattern, inside the SDK:

1. `discover(number)`: cache → numbering list → Range Holder → (redirect) → holder.
2. Call `{holder.url}/pstn2/v1/...`.
3. If that CP answers `200 {"result":"not_held","cache":{"invalidate":true}}`,
   purge the cache entry, rediscover from the Range Holder and retry **once**
   (`retried` in TypeScript, `rediscovered` in Python, `Via.Retried` in Go).

### Outcomes, not exceptions

Discovery never throws; a non-`held` result means traditional PSTN.
Verification and routing return outcomes (`verified: false` / `accepted:
false` with a reason and a fallback flag); only transport failures and
emergency location without a holder raise.

**TypeScript:**
```typescript
const v = await client.verifyCall({ callerID, calledID });
if (v.verified) {
  // add verification (and branding) to the call
} else if (v.fallbackToTraditional) {
  // no PSTN2 holder (v.reason): traditional PSTN treatment
} else {
  // the holder did not confirm the call: flag as possible spoofing
}
```

**Python:**
```python
v = await client.verify_call(caller_id, called_id)
if v.verified:
    ...
elif v.fallback_to_pstn:
    ...   # v.reason, e.g. "discovery_unknown"
```

**Go:**
```go
v, err := client.Auth().VerifyCall(ctx, pstn2.VerifyCallRequest{CallerID: callerID, CalledID: calledID})
if err != nil || !v.Verified {
	// err: the request failed; v.Reason / v.Fallback: why it is not verified
	// → handle the call the traditional way
}
```

### Configuration

The examples build their clients from the environment:

```typescript
// TypeScript
const client = PSTN2Client.fromEnv({ cpId: 'CP1-UK-0103', cpName: 'Charlie Comms' });
await client.start();   // load the numbering list
```

```python
# Python
config = NetworkConfig.from_env(default_cp_id="CP1-UK-0103")
async with PSTN2Client.from_config(config) as client:
    ...
```

```go
// Go
env := pstn2.LoadEnv()
client, err := pstn2.NewClient(env.Config())
```

In production, configure the regulator's numbering-list URL, your RCPID and
your Ed25519 key directly (see the
[Implementation Guide](../docs/IMPLEMENTATION-GUIDE.md), Appendix).

### Client cleanup

Always close clients when done:

```typescript
// TypeScript: try/finally
await client.close();
```

```python
# Python: async with, or
await client.close()
```

```go
// Go
defer client.Close()
```

## Testing

The examples double as smoke tests; the SDK test suites run the same
scenarios automatically and offline:

```bash
cd code/typescript && npm test
cd code/python && .venv/bin/pytest
cd code/go && go test ./...
```

See [TESTING-SPECIFICATION.md](../docs/TESTING-SPECIFICATION.md) for the mock
network, the static emulator, the browser test harness
(https://pstn2.org/src/test-harness/), the dummy test CP and the Number
Discovery conformance requirements.

## Integration Patterns

### SIP Integration

PSTN2 is designed to work alongside existing SIP infrastructure:

1. **Inbound Calls**: When receiving a SIP INVITE:
   - Extract the caller ID (and `X-PSTN2-Token`, if present)
   - Call `verifyCall()`: discovery finds the caller ID's holder
   - Add verification results to SIP headers
   - Route call to destination

2. **Outbound Calls**: When placing a SIP INVITE:
   - Call `requestRouting()`: discovery finds the destination's holder
   - If accepted, send the INVITE to the returned endpoint (DTLS-SRTP media)
   - If rejected, or there is no PSTN2 holder, route via traditional PSTN

3. **Emergency Calls**: When receiving 999/112:
   - Route to appropriate PSAP
   - PSAP calls `getEmergencyLocation()` immediately
   - Display location to operator
   - Dispatch emergency services

### Backward Compatibility

All examples demonstrate graceful fallback to traditional PSTN when PSTN2
features are unavailable (number unallocated, Range Holder not participating,
number unknown, CP unreachable, routing rejected):

```typescript
if (routing.accepted) {
  // Use PSTN2 direct routing
  await connectToPeer(routing.connectionDetails);
} else {
  // Fall back to traditional PSTN
  await routeViaPSTN(destinationNumber);
}
```

## Performance Considerations

On the local mock network each step takes a few milliseconds. On real
networks (SPECIFICATION.md §12.3):

- **Number Discovery**: cache and numbering-list lookups < 1 ms; < 50 ms per
  network hop. A cache hit needs one query (straight to the cached holder); a
  cache miss needs one, or two for a ported number
- **Authentication**: < 100 ms (95th percentile)
- **Routing Request**: < 200 ms (95th percentile)
- **Total Call Setup**: < 1 second (vs. 5–8 seconds traditional PSTN)

Performance tips:
1. Reuse one client per CP so its number cache stays warm (cached per number,
   24 h default TTL)
2. Load the numbering list at start-up (`start()` / first discovery)
3. Use Token Pool for high-volume scenarios
4. Keep HTTP connections alive (the SDKs do)

## Security Best Practices

All examples demonstrate:

1. **Private Key Protection**: never hardcode keys; the examples use ephemeral keys
2. **TLS Everywhere**: production APIs use HTTPS/TLS 1.3 (the mock network is plain HTTP on localhost only)
3. **Signature Verification**: example 06 verifies every signed discovery answer from the dummy test CP
4. **Short TTLs**: Token Pool tokens expire in 30 seconds
5. **Descriptive User-Agent**: `pstn2-{language}-sdk/1.1.0`; generic agents are rejected by many WAFs
6. **Error Information**: never expose sensitive data in error messages

## Troubleshooting

### "Could not load the numbering list"
- Start the mock network: `node test-environment/mock-network/server.mjs`
- If it runs on another port, set `PSTN2_MOCK_PORT` to match
- Live: HTTP 404 means the dummy test CP is not deployed yet (use the emulator); 403 means a generic user agent was sent

### "NOT VERIFIED (unknown)" or "not_participating"
- Expected for +441614960999 (not in service) and +441174960555 (Delta Voice is not on PSTN2)
- The call is handled as traditional PSTN; that is the designed fallback

### Unexpected holder or "invalidated"
- Example 06 ports +441134960456 during scenario D and resets the mock afterwards; if it was interrupted, reset with `curl -X POST -A pstn2-reset/1.1 http://127.0.0.1:47901/admin/reset` or restart the mock

### "invalid_signature"
- Signatures are only published by the dummy test CP; set `PSTN2_VERIFY_SIGNATURES=0` against the mock network (the default)
- With the emulator, rebuild the files with `tools/testcp/build.mjs` after changing keys

### "Routing rejected"
- The destination may not support the offered codecs (`unsupported_codec`)
- Fallback to traditional PSTN is normal

### "Token expired"
- Default TTL is 30 seconds
- Increase TTL if needed for longer call setup times
- Ensure clocks are synchronized (use NTP)

## Further Reading

- [SPECIFICATION.md](../docs/SPECIFICATION.md) - PSTN2 protocol v1.1 (§9 Number Discovery)
- [API-SPECIFICATION.yaml](../docs/API-SPECIFICATION.yaml) - REST API (OpenAPI 3.0)
- [IMPLEMENTATION-GUIDE.md](../docs/IMPLEMENTATION-GUIDE.md) - Implementation patterns and best practices
- [TESTING-SPECIFICATION.md](../docs/TESTING-SPECIFICATION.md) - Test environment, conformance and certification
- SDK READMEs: [TypeScript](../code/typescript/README.md) · [Python](../code/python/README.md) · [Go](../code/go/README.md)

## Support

For issues with the examples:
1. Check the language-specific README
2. Review the troubleshooting section above
3. Consult the specification documents
4. Open an issue: https://github.com/njjholland-dot/pstn2/issues

## License

These examples are reference implementations for the PSTN2 protocol, released
into the public domain (CC0). See the project
[LICENSE](https://github.com/njjholland-dot/pstn2/blob/main/LICENSE).
