# PSTN2 Implementation Guide

**Version:** 1.1 (protocol v1.1)
**Last Updated:** 2026-10-06
**Target Audience:** Software engineers implementing PSTN2 clients/servers

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Architecture Patterns](#architecture-patterns)
3. [Number Discovery](#number-discovery)
4. [TypeScript Implementation](#typescript-implementation)
5. [Python Implementation](#python-implementation)
6. [Go Implementation](#go-implementation)
7. [Testing Strategy](#testing-strategy)
8. [Deployment Guide](#deployment-guide)
9. [Performance Optimization](#performance-optimization)
10. [Security Checklist](#security-checklist)
11. [Common Pitfalls](#common-pitfalls)

---

## 1. Getting Started

### 1.1 Prerequisites

**Knowledge Required:**
- RESTful API design
- Cryptographic signatures (Ed25519)
- TLS/HTTPS
- Async/await patterns
- Error handling strategies

**Infrastructure:**
- TLS certificate (Let's Encrypt recommended)
- Public IP address with DNS, and a stable base URL for your PSTN2 API
  (this is the **Range Holder URL** published against your blocks in the
  numbering list, SPECIFICATION.md §9.1)
- Key management system (AWS KMS, HashiCorp Vault, etc.)
- Logging infrastructure (ELK, Datadog, etc.)
- Your own number database: the blocks the regulator allocated to you, the
  numbers you have in service, the numbers ported in, and where your
  ported-out numbers went. PSTN2 adds no central database; it only asks you to
  answer for these numbers.

### 1.2 Quick Start Checklist

- [ ] Generate an Ed25519 key pair and choose a key id (`kid`)
- [ ] Register your RCPID with the regulator
- [ ] Set up TLS endpoints and your PSTN2 base URL
- [ ] Ask the regulator to publish your Range Holder URL against your blocks in the numbering list
- [ ] Download the numbering list and keep a local copy (refresh at least daily, `ETag` / `If-None-Match`)
- [ ] Implement the Number Discovery client: cache → numbering list → Range Holder → redirect, per-number cache, `not_held` invalidation, 5-hop limit, loop detection
- [ ] Serve `GET /pstn2/v1/numbers/{digits}` (held / redirect / not_held / 404) and `GET /pstn2/v1/keys` from your number database
- [ ] Implement the authentication API (`POST /pstn2/v1/auth/verify`)
- [ ] Implement the routing API (`POST /pstn2/v1/routing/request`)
- [ ] Answer `not_held` + `cache.invalidate` on every endpoint for numbers you do not hold
- [ ] Send a descriptive `User-Agent` and `X-PSTN2-Version: 1.1` on every request
- [ ] Set up monitoring/alerting
- [ ] Test against the local mock network and the dummy test CP (https://pstn2.org/testcp/)
- [ ] Deploy with fallback to traditional PSTN

### 1.3 Development Environment

The reference SDKs, the local mock network and the conformance tests live in one
repository (open source, public domain):

```bash
git clone https://github.com/njjholland-dot/pstn2.git
cd pstn2

# TypeScript SDK (Node.js 18+; CI uses Node 20+)
cd code/typescript && npm ci && npm test
cd ../..

# Python SDK (Python 3.11+)
cd code/python && python3 -m venv .venv && .venv/bin/pip install -e '.[dev]' && .venv/bin/pytest
cd ../..

# Go SDK (Go 1.21+, standard library only)
cd code/go && go test ./...
cd ../..

# Local mock network: Ofcom-style numbering list + 3 participating CPs
# (Alpha, Bravo, Charlie) and one non-participating Range Holder (Delta).
# Node.js only, no dependencies. Serves http://127.0.0.1:47901
node test-environment/mock-network/server.mjs
```

The SDK test suites run offline. Where Node.js is on `PATH` they start the mock
network and a static emulator of the dummy test CP on free ports themselves;
you only need to start the mock network by hand to run the examples
(see [EXAMPLES.md](https://pstn2.org/docs/EXAMPLES.md)).

The reference discovery engine that the SDKs are checked against is
`animations/src/test-harness/harness-engine.js`; its own tests run with
`node --test test-environment/conformance/engine.test.mjs`.

---

## 2. Architecture Patterns

### 2.1 Client Library Structure

**Recommended Module Structure** (this is how the reference SDKs are organised):
```
pstn2-client/
├── src/
│   ├── client.{ts,py,go}          # Main client: one per acting CP
│   ├── types.{ts,py,go}           # Wire and result types
│   ├── errors.{ts,py,go}          # Error classes
│   ├── discovery/                 # Number Discovery (§9)
│   │   ├── numbering-list.{...}   # Regulator list: longest-prefix match, ETag refresh
│   │   ├── cache.{...}            # number → holder hints with TTL (never per block)
│   │   ├── client.{...}           # discover(): hops, redirects, not_held, loops
│   │   ├── signatures.{...}       # Canonical JSON + Ed25519, key store per CP
│   │   └── responder.{...}        # Server side: answer for your own numbers
│   ├── auth/                      # Authentication module
│   │   └── direct-query.{...}
│   ├── routing/                   # Routing module
│   ├── encryption/                # Identity keys (media keys come from DTLS-SRTP)
│   ├── emergency/                 # Emergency services
│   ├── messaging/                 # HTTP client with retry; holder calls with not_held retry
│   └── utils/
│       ├── crypto.{...}           # Cryptographic functions
│       └── logger.{...}           # Logging utilities
├── examples/                      # Usage examples
├── tests/                         # Test suite
└── docs/                          # API documentation
```

Every module that talks to another CP follows the same pattern: discover the
subject number's holder, call `{holder.url}/pstn2/v1/...`, and if that CP
answers `not_held`, purge the cache entry, rediscover and retry once
(§2.3.2).

### 2.2 Server Implementation Structure

**Recommended Server Structure:**
```
pstn2-server/
├── src/
│   ├── server.{ts,py,go}          # HTTP server setup
│   ├── routes/                    # API route handlers
│   │   ├── numbers.{...}          # GET /pstn2/v1/numbers/{digits} (Number Discovery)
│   │   ├── keys.{...}             # GET /pstn2/v1/keys
│   │   ├── auth.{...}
│   │   ├── routing.{...}
│   │   └── emergency.{...}
│   ├── middleware/                # Signature checks, rate limiting
│   ├── models/                    # Data models
│   ├── services/                  # Business logic
│   │   ├── call-records.{...}     # Track active calls
│   │   ├── number-database.{...}  # Ranges, in service, ported in/out (your existing data)
│   │   ├── numbering-list.{...}   # Regulator list download and refresh
│   │   └── location.{...}         # Location services
│   └── utils/
│       ├── validation.{...}       # Request validation
│       └── signing.{...}          # Signature creation and verification
├── config/                        # Configuration files
├── migrations/                    # Database migrations
└── tests/                         # Integration tests
```

There is no synchronisation service: a CP never copies another CP's numbers.
The only shared input is the regulator's numbering list, downloaded
periodically.

### 2.3 Design Patterns

#### 2.3.1 Retry with Exponential Backoff

Retry only `503`, `504` and network timeouts, with 100 / 200 / 400 ms backoff
and at most 3 retries (SPECIFICATION.md §10.3). Never retry `400`, `401` or
`404`. The reference SDKs do this inside their HTTP clients (`retries` option);
the pattern is:

```typescript
// TypeScript
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 100
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= maxRetries || !isRetryable(error)) throw error;
      await sleep(baseDelay * Math.pow(2, attempt));   // 100, 200, 400 ms
    }
  }
}
```

```python
# Python
import asyncio
from typing import Awaitable, Callable, TypeVar

T = TypeVar("T")

async def retry_with_backoff(
    fn: Callable[[], Awaitable[T]],
    max_retries: int = 3,
    base_delay: float = 0.1,
) -> T:
    attempt = 0
    while True:
        try:
            return await fn()
        except Exception as e:
            if attempt >= max_retries or not is_retryable(e):
                raise
            await asyncio.sleep(base_delay * (2 ** attempt))  # 0.1, 0.2, 0.4 s
            attempt += 1
```

```go
// Go
func retryWithBackoff(ctx context.Context, fn func() error, maxRetries int, baseDelay time.Duration) error {
	for attempt := 0; ; attempt++ {
		err := fn()
		if err == nil || attempt >= maxRetries || !isRetryable(err) {
			return err
		}
		select {
		case <-time.After(baseDelay << attempt): // 100, 200, 400 ms
		case <-ctx.Done():
			return ctx.Err()
		}
	}
}
```

A Number Discovery `redirect` and a `not_held` answer are successful `200 OK`
responses, not errors: they are never retried against the same CP.

#### 2.3.2 Holder Calls with `not_held` Retry

Authentication, routing and emergency requests all go to the CP
that currently holds the subject number (the caller ID for verification and
emergency, the destination for routing). A cached holder can be stale, so
every PSTN2 response may carry `"result": "not_held"` and
`"cache": {"invalidate": true}` (§5.1.2, §9.5):

```typescript
// TypeScript: a simplified sketch of what the SDKs' messaging layer does
async function callHolder<T>(number: string, path: string, body: object): Promise<T> {
  let found = await discovery.discover(number);
  if (found.result !== 'held') throw new DiscoveryError(found);     // → traditional PSTN

  let res = await http.post(`${found.holder!.url}/pstn2/v1/${path}`, body);
  if (isNotHeld(res.body)) {
    cache.purge(number);                                             // stale hint
    if (res.body.cache?.scope === 'block') await numberingList.refresh(true);   // re-download
    found = await discovery.discover(number);                        // from the Range Holder
    if (found.result !== 'held') throw new DiscoveryError(found);
    res = await http.post(`${found.holder!.url}/pstn2/v1/${path}`, body);
    if (isNotHeld(res.body)) throw new NotHeldError(number);         // give up → PSTN
  }
  return res.body as T;
}
```

Retry **once**. Discovery itself already enforces the 5-hop limit and loop
detection.

#### 2.3.3 Circuit Breaker Pattern

Wrap calls to each peer CP (keyed by `holder.url`) so a failing CP is skipped
quickly and its calls go to traditional PSTN:

```typescript
class CircuitBreaker {
  private failures = 0;
  private lastFailTime = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';

  constructor(
    private threshold: number = 5,
    private timeout: number = 30000
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailTime > this.timeout) {
        this.state = 'half-open';
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess() {
    this.failures = 0;
    this.state = 'closed';
  }

  private onFailure() {
    this.failures++;
    this.lastFailTime = Date.now();

    if (this.failures >= this.threshold) {
      this.state = 'open';
    }
  }
}
```

---

## 3. Number Discovery

Number Discovery answers one question before every PSTN2 interaction:
**"Which CP currently holds this number?"** (SPECIFICATION.md §9). There is no
central database and no central lookup service. Everything needed already exists:

| Party | Already knows |
|---|---|
| Regulator (Ofcom) | Which CP each number block is allocated to: the **Range Holder** |
| Range Holder | Which of its numbers have been ported out, and to which CP |
| Every CP | The numbers it serves, including numbers ported in |

PSTN2 adds one field to the regulator's S1–S9 numbering lists: the Range
Holder's PSTN2 URL.

### 3.1 The Numbering List

```json
{
  "listVersion": "2026-10-06T06:00:00Z",
  "publisher": "Ofcom",
  "source": "S1-S9 numbering lists with Range Holder URL",
  "blocks": [
    { "prefix": "441134960", "display": "0113 496 0xxx", "numberLength": 12,
      "status": "Allocated", "cpId": "CP1-UK-0103", "cpName": "Charlie Comms",
      "rangeHolderUrl": "https://pstn2.charlie-comms.example" }
  ]
}
```

Implementation rules:

- **Download, don't query.** Fetch the list at start-up and keep it in memory
  (the full UK list is about a million blocks). Never contact the regulator per
  call.
- **Refresh at least daily** with `If-None-Match`; a `304` means your copy is
  current. Also refresh when any response carries `cache.scope: "block"`.
- **Match** by stripping the `+` and choosing the block with the **longest
  matching prefix** whose `numberLength` equals the number's digit count. No
  match → `unallocated`.
- **Empty `rangeHolderUrl`** → `not_participating`: the Range Holder has not
  joined PSTN2; handle the call as today.

### 3.2 The Discovery Query

`GET {url}/pstn2/v1/numbers/{e164digits}`, with no body and no
`Content-Type`, a descriptive `User-Agent` and `X-PSTN2-Version: 1.1`.

| Answer | Sent by | Client action |
|---|---|---|
| `200 {"result":"held", "holder":{…}, "ported":…, "cache":{"ttl":86400}}` | The CP that serves the number | Cache `number → holder` for `cache.ttl` seconds; done |
| `200 {"result":"redirect", "portedTo":{…}}` | Only the **Range Holder**, for a number it ported out | Query `portedTo.url` |
| `200 {"result":"not_held", "cache":{"invalidate":true,"scope":"number"}}` | A non-Range-Holder that does not serve the number (stale cache) | Purge the cache entry; restart from the numbering list |
| `404` (body optional, may be HTML) | Range Holder or holder with no record | `unknown`: not in service |

A redirect is a `200` result, never an HTTP 3xx, so it can be signed, cached
and served identically by any hosting stack.

### 3.3 The Algorithm

```
discover(number):
  1. CACHE   unexpired entry → query entry.holder.url directly (step 4)
  2. LIST    longest-prefix block in the local numbering list
               no block           → "unallocated"        (traditional PSTN)
               no rangeHolderUrl  → "not_participating"  (traditional PSTN)
  3. RANGE HOLDER  query block.rangeHolderUrl
  4. QUERY   GET {url}/pstn2/v1/numbers/{digits}
               held      → cache {number → holder, ttl}; done
               redirect  → query portedTo.url (step 4 again)
               not_held  → purge the cache entry; restart at step 2
               404       → "unknown"
  At most 5 queries in total; reaching the same CP twice in one discovery = loop.
```

Results:

| `result` | Meaning | What to do |
|---|---|---|
| `held` | `holder` serves the number (`ported: true` if not the Range Holder) | Call `{holder.url}/pstn2/v1/...` |
| `unknown` | The holder answered 404 | Treat the caller ID as unverified; traditional PSTN |
| `unallocated` | No block matches | Traditional PSTN (a caller ID here is spoofed) |
| `not_participating` | The Range Holder has no PSTN2 URL | Traditional PSTN |
| `error` | `hop_limit_exceeded`, `loop_detected`, `timeout`, `invalid_response`, `invalid_signature`, `numbering_list_unavailable` | Traditional PSTN |

Discovery never blocks a call. Every outcome other than `held` means "handle
it the traditional way".

The SDKs also return `hops` (cpIds queried, in order), `fromCache` (the first
query went to a cached holder) and `invalidated` (a response purged the cache
entry), which is what the conformance scenarios check.

### 3.4 Caching Rules

- **Per number, never per block.** Porting is per number; keep block-level
  knowledge (the numbering list) and number-level knowledge (the cache)
  separate. Never infer a port for a whole block.
- **TTL** comes from `cache.ttl` in the `held` answer (default 86400 s).
  Expired entries are dropped, not used.
- **Entries are hints.** The Range Holder is always the authority for its
  blocks. A stale entry costs one extra query, never a misrouted call.
- **Cache in memory.** A number → holder entry is a few dozen bytes; bound the
  cache with an LRU if memory matters. Share one cache per CP process (the
  SDKs let several clients share a cache).

### 3.5 Invalidation

Any PSTN2 response (discovery, verification, routing, emergency) MAY
carry:

```json
"cache": { "invalidate": true, "scope": "number" }
```

| `scope` | Client action |
|---|---|
| `number` (default) | Purge the cached entry for the subject number, rediscover from the Range Holder |
| `block` | Re-download the numbering list (the block moved Range Holder), then rediscover |

This is how porting changes reach caches without broadcasts or replication:
the first CP to rely on stale data is told at the moment it matters.

### 3.6 Signatures and Keys

Discovery answers SHOULD be signed (§9.6):

- Ed25519 over the UTF-8 bytes of the **canonical JSON** of the body without
  `signature`: keys sorted at every level, no insignificant whitespace, `/`
  not escaped, non-ASCII left unescaped. `kid` names the key.
- Each CP publishes its keys at `GET {url}/pstn2/v1/keys`; clients cache key
  sets per CP and pick the key by `kid`.
- With signature verification on, an unsigned or invalid `200` answer is
  `error` / `invalid_signature`. A `404` needs no signature.
- Discovery data is public and idempotent, so the ±30 s timestamp window and
  replay cache do not apply to it; `issued` records when the answer was made.

### 3.7 Answering Discovery Queries (Server Side)

Your answer for a number depends only on your own number database:

| Your relationship to the number | Answer |
|---|---|
| Range Holder, number ported out | `200 redirect` to the CP it went to |
| Range Holder, number in service | `200 held`, `ported: false` |
| Number ported in | `200 held`, `ported: true` |
| You used to serve it, or it is in another participating CP's block | `200 not_held` + `cache.invalidate` |
| Range Holder, no record / not in service | `404` |
| Anything else | `404` |

Because the answers change only when your number database changes, they can be
precomputed and served as static files behind a CDN: the dummy test CP at
https://pstn2.org/testcp/ is exactly that (built by
[`tools/testcp/build.mjs`](https://github.com/njjholland-dot/pstn2/blob/main/tools/testcp/build.mjs)).
Serve extensionless answers as `application/json`, allow a short
`Cache-Control` (the test CP uses `max-age=300`), and let missing numbers fall
through to the host's 404.

**Data minimisation:** answer only about your own numbers. A Range Holder's
redirect reveals only the identity and URL of the CP the number moved to,
never subscriber data.

### 3.8 Code: Discovery with the Reference SDKs

**TypeScript** (`@pstn2/core`):
```typescript
import { PSTN2Client } from '@pstn2/core';

const client = new PSTN2Client({
  cpId: 'CP1-UK-0101',
  numberingListUrl: 'https://pstn2.org/testcp/numbering-list.json',
  verifySignatures: true,
});
await client.start();                       // load the numbering list now (optional)

const r = await client.discover('+447700900003', {
  onEvent: (e) => console.log(e.type),      // cache-miss, list-lookup, query, response, redirect, …
});
if (r.result === 'held') {
  console.log(r.holder!.cpName, r.ported, r.hops, r.fromCache, r.invalidated);
} else {
  // unknown / unallocated / not_participating / error → traditional PSTN
}
```

**Python** (`pstn2`):
```python
from pstn2 import PSTN2Client

async with PSTN2Client(
    "CP1-UK-0101",
    numbering_list_url="https://pstn2.org/testcp/numbering-list.json",
    verify_signatures=True,
) as client:
    r = await client.discover("+447700900003", on_event=lambda e: print(e.type))
    if r.fallback_to_pstn:
        ...  # unknown / unallocated / not_participating / error
    else:
        print(r.holder.cp_name, r.ported, r.hops, r.from_cache, r.invalidated)
```

**Go** (`github.com/njjholland-dot/pstn2/code/go/pkg/pstn2`):
```go
client, err := pstn2.NewClient(pstn2.Config{
	CPID:             "CP1-UK-0101",
	NumberingListURL: "https://pstn2.org/testcp/numbering-list.json",
	VerifySignatures: true,
})
if err != nil {
	log.Fatal(err)
}
defer client.Close()

res := client.Discover(ctx, "+447700900003", pstn2.WithEvents(func(e pstn2.DiscoveryEvent) {
	log.Println(e.Type)
}))
if res.Fallback() {
	// res.Result is unknown / unallocated / not_participating / error (res.Error)
} else {
	log.Println(res.Holder.CPName, res.Ported, res.Hops, res.FromCache, res.Invalidated)
}
```

The building blocks (numbering list, cache, discovery client) can be used on
their own; see each SDK's README.

### 3.9 Code: Answering for Your Own Numbers

Each SDK has a `RangeHolderResponder` that builds §9.2 answers from your
number database. Their answers are identical to the reference engine's
`Network.respond()`, and signed answers match the files built by
`tools/testcp/build.mjs`.

**TypeScript:**
```typescript
import http from 'node:http';
import { RangeHolderResponder, NumberingList } from '@pstn2/core';

const numberingList = await NumberingList.load(LIST_URL);
const responder = new RangeHolderResponder(
  {
    cpId: 'CP1-UK-0103', cpName: 'Charlie Comms', url: 'https://pstn2.charlie-comms.example',
    ranges: ['441134960'],
    inService: ['+441134960789'],
    portedIn: [{ number: '+442079460321', fromCpId: 'CP1-UK-0101' }],
    portedOut: [{ number: '+441134960456', toCpId: 'CP1-UK-0102' }],
    previouslyHeld: [],
  },
  {
    resolve: (cpId) => knownCps.get(cpId),             // cpId → { cpId, cpName, url }
    numberingList,                                     // not_held vs 404 for others' numbers
    signer: { privateKey: pem, kid: 'charlie-2026-10' },
  }
);

http.createServer((req, res) => {
  const answer = responder.handle(new URL(req.url!, 'http://x').pathname); // numbers/{digits} or keys
  res.writeHead(answer?.status ?? 404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(answer?.body ?? { result: 'unknown' }));
}).listen(8443);
```

**Python:**
```python
from pstn2 import RangeHolderResponder

responder = RangeHolderResponder(
    db,                                  # same fields: cpId, cpName, url, ranges, inService, portedIn, portedOut, previouslyHeld
    peers,                               # mapping or callable: cpId → {cpId, cpName, url}
    numbering_list=nl,
    signing_key=private_key, kid="charlie-2026-10",
)
answer = responder.respond("+441134960456")   # ResponderAnswer(status=200, body={... "result": "redirect" ...})
keys = responder.keys_document()              # body for GET {url}/pstn2/v1/keys
```

**Go** (the responder is an `http.Handler`):
```go
list := pstn2.NewNumberingListFromURL(listURL, pstn2.NumberingListOptions{})
r := pstn2.NewRangeHolderResponder(pstn2.ResponderConfig{
	DB: pstn2.NumberDatabase{
		CPID: "CP1-UK-0103", CPName: "Charlie Comms", URL: "https://pstn2.charlie-comms.example",
		Ranges:    []string{"441134960"},
		InService: []string{"+441134960789"},
		PortedOut: []pstn2.PortedOut{{Number: "+441134960456", ToCPID: "CP1-UK-0102"}},
	},
	NumberingList: list,
	Resolve:       pstn2.ResolverFromList(list),
	KeyID:         "charlie-2026-10",
	PrivateKey:    signingKey,
})
http.Handle("/pstn2/v1/", r) // serves /pstn2/v1/numbers/{digits} and /pstn2/v1/keys
```

---

## 4. TypeScript Implementation

### 4.1 Project Setup

The reference SDK is `@pstn2/core` in `code/typescript`: Node.js 18+, **zero
runtime dependencies** (built-in `fetch` and `node:crypto` Ed25519). It is not
yet on npm, so build it from the repository:

```bash
git clone https://github.com/njjholland-dot/pstn2.git
cd pstn2/code/typescript
npm ci
npm run build          # → dist/
npm test               # unit + integration (offline; spawns the mock network)
```

Once published, installation will be `npm install @pstn2/core`.

### 4.2 TypeScript Configuration

The SDK compiles with a strict configuration; an application using it needs
only `"strict": true` and a Node 18+ target:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "sourceMap": true,
    "moduleResolution": "node",
    "resolveJsonModule": true,
    "types": ["node"]
  },
  "include": ["src/**/*"]
}
```

### 4.3 Core Client

One `PSTN2Client` per acting CP. It wires Number Discovery into every module:

```typescript
import { PSTN2Client } from '@pstn2/core';

const client = new PSTN2Client({
  cpId: 'CP1-UK-0103',
  numberingListUrl: process.env.PSTN2_NUMBERING_LIST_URL!,
  privateKey: process.env.PSTN2_PRIVATE_KEY_PEM,   // Ed25519 PEM; ephemeral if omitted
  verifySignatures: true,
});

// Authentication: discovery finds the caller ID's holder, then POST /auth/verify there
const v = await client.verifyCall({ callerID: '+442079460100', calledID: '+441134960789' });
if (v.verified) {
  console.log(`Verified by ${v.holder?.cpName}`, v.retried ? '(after not_held retry)' : '');
} else if (v.fallbackToTraditional) {
  console.log(`No PSTN2 holder (${v.reason}): traditional PSTN handling`);
} else {
  console.log('Holder did not confirm the call: flag as possible spoofing');
}

// Routing: never throws for rejections
const route = await client.requestRouting({
  destinationNumber: '+441614960123',
  callerID: '+442079460100',
  mediaCapabilities: { codecs: ['opus', 'g722', 'pcmu'], encryption: ['srtp-aes256', 'srtp-aes128'] },
});
if (route.accepted) console.log(route.connectionDetails.fqdn, route.connectionDetails.port);
else console.log('Traditional PSTN:', route.reason);

await client.close();
```

`PSTN2Client.fromEnv()` builds a client from the `PSTN2_*` environment
variables (see the [Appendix](#appendix-configuration-examples)).

### 4.4 Errors

Discovery outcomes are results, not exceptions. Exceptions are `PSTN2Error`
(`code`, `status`, `toJSON()` → spec `ErrorResponse`) and its subclasses
`DiscoveryError` (`.discovery`), `NotHeldError`, `TimeoutError`,
`NetworkError`, `RateLimitError` and `ValidationError`.
`getEmergencyLocation()` throws `DiscoveryError` when there is no PSTN2 holder,
so a PSAP always knows to use its other location sources.

### 4.5 TypeScript Testing Strategy

The SDK's own suite (`npm test`) shows the pattern: unit tests drive the
discovery client through an in-memory `transport` and compare its results and
event sequences with the reference engine; integration tests spawn the mock
network on a free port.

```typescript
import { PSTN2Client } from '@pstn2/core';

describe('verifyCall against the mock network', () => {
  let client: PSTN2Client;

  beforeEach(() => {
    client = new PSTN2Client({
      cpId: 'CP1-UK-0103',
      numberingListUrl: `http://127.0.0.1:${port}/numbering-list.json`,
    });
  });

  afterEach(async () => {
    await client.close();
  });

  it('verifies a ported caller ID at its current holder', async () => {
    const v = await client.verifyCall({ callerID: '+441134960456', calledID: '+441134960789' });
    expect(v.verified).toBe(true);
    expect(v.discovery.hops).toEqual(['CP1-UK-0103', 'CP1-UK-0102']);
    expect(v.holder?.cpId).toBe('CP1-UK-0102');
  });

  it('flags a caller ID that is not in service', async () => {
    const v = await client.verifyCall({ callerID: '+441614960999', calledID: '+441134960789' });
    expect(v.verified).toBe(false);
    expect(v.discovery.result).toBe('unknown');
    expect(v.fallbackToTraditional).toBe(true);
  });
});
```

---

## 5. Python Implementation

### 5.1 Project Setup

The reference SDK is the `pstn2` package in `code/python`: Python 3.11+, async
throughout (`httpx`), Pydantic v2 models, Ed25519 via `cryptography`. It is not
on PyPI; install it from the repository:

```bash
cd code/python
python3 -m venv .venv
.venv/bin/pip install -e '.[dev]'     # httpx, pydantic, cryptography + pytest, pytest-asyncio
.venv/bin/pytest

# or, from GitHub
pip install "pstn2 @ git+https://github.com/njjholland-dot/pstn2#subdirectory=code/python"
```

### 5.2 Package Structure

```
pstn2/
├── __init__.py      # PSTN2Client, NumberingList, DiscoveryCache, DiscoveryClient,
│                    # RangeHolderResponder, canonical_json, sign_body, verify_body, errors…
├── client.py        # PSTN2Client
├── config.py        # NetworkConfig.from_env() (PSTN2_* variables)
├── discovery.py     # numbering list, cache, key store, discovery client, responder
├── _holder.py       # holder calls with not_held → rediscover → retry once
├── auth.py          # Caller authentication (direct query)
├── routing.py
├── emergency.py
├── crypto.py        # Ed25519, canonical JSON
├── transport.py     # httpx transport: User-Agent, retries, timeouts
├── types.py         # Pydantic models and results
└── errors.py
```

### 5.3 Core Client

```python
import asyncio
from pstn2 import PSTN2Client, DiscoveryError

async def main() -> None:
    async with PSTN2Client(
        "CP1-UK-0103",
        numbering_list_url="http://127.0.0.1:47901/numbering-list.json",
        timeout=2.0, retries=3,              # retries only 503/504/network errors (§10.3)
    ) as client:
        v = await client.verify_call("+441134960456", "+441134960789")
        if v.verified:
            print("verified by", v.holder.cp_name, "(retried)" if v.rediscovered else "")
        elif v.fallback_to_pstn:
            print("no PSTN2 holder:", v.reason)            # e.g. discovery_unknown
        else:
            print("holder did not confirm the call: flag it")

        r = await client.request_routing(
            "+441614960123", "+442079460100",
            {"codecs": ["opus", "g722", "pcmu"], "encryption": ["srtp-aes256"]},
        )
        print(r.accepted, r.connection_details if r.accepted else r.reason)

        try:
            loc = await client.get_emergency_location("+441614960123", "UK-999-MANCHESTER-01")
        except DiscoveryError as e:
            print("no PSTN2 location:", e.discovery.result)  # use other location sources

asyncio.run(main())
```

`PSTN2Client.from_env()` reads the `PSTN2_*` variables. Pass `holder=` (a
`CpRef` or a held `DiscoveryResult`) to a module call to reuse a discovery you
already made.

### 5.4 Models

All wire messages and results are Pydantic v2 models (`pstn2.types`).
`DiscoveryResult` has `number`, `result`, `holder` (`CpRef(cp_id, cp_name,
url)`), `ported`, `hops`, `from_cache`, `invalidated`, `error` and
`range_holder`, plus `held` / `fallback_to_pstn` helpers and `to_wire()` for
the camelCase JSON form. Service results (`VerificationResult`,
`RoutingResult`, `EmergencyLocationResult`) are the wire
response plus `holder`, `discovery` and `rediscovered`.

Errors: `PSTN2Error` (with `.code`, `.status`) → `PSTN2TimeoutError`,
`NetworkError`, `InvalidResponseError`, `ApiError` (`CallNotFoundError`,
`RateLimitError`), `DiscoveryError`,
`NotHeldError`, `ValidationError`.

---

## 6. Go Implementation

### 6.1 Project Setup

The reference SDK is module `github.com/njjholland-dot/pstn2/code/go`, package
`pkg/pstn2`: Go 1.21+, **standard library only** (no `go.sum`).

```bash
go get github.com/njjholland-dot/pstn2/code/go/pkg/pstn2

# in the repository
cd code/go
go vet ./... && go test ./...
```

### 6.2 Package Structure

```
code/go/
├── go.mod
├── pkg/
│   └── pstn2/
│       ├── client.go        # Config, NewClient, LoadEnv
│       ├── numbering.go     # NumberingList (longest prefix, ETag refresh)
│       ├── cache.go         # DiscoveryCache
│       ├── discovery.go     # DiscoveryClient, DiscoveryResult, events
│       ├── signature.go     # SignBody, VerifySignature, KeyStore
│       ├── canonical.go     # CanonicalJSON
│       ├── responder.go     # RangeHolderResponder (http.Handler)
│       ├── auth.go          # VerifyCall
│       ├── routing.go
│       ├── emergency.go
│       ├── httpclient.go    # User-Agent, retries, timeouts
│       ├── errors.go
│       └── types.go
└── examples/                # one main package per example
```

### 6.3 Core Client

```go
client, err := pstn2.NewClient(pstn2.Config{
	CPID:             "CP1-UK-0103",
	NumberingListURL: "http://127.0.0.1:47901/numbering-list.json",
	Timeout:          2 * time.Second,
})
if err != nil {
	log.Fatal(err)
}
defer client.Close()

ctx, cancel := context.WithTimeout(context.Background(), time.Second)
defer cancel()

v, err := client.Auth().VerifyCall(ctx, pstn2.VerifyCallRequest{
	CallerID: "+441134960456",
	CalledID: "+441134960789",
})
switch {
case err != nil:
	log.Println("verification failed:", err, "→ traditional PSTN")
case v.Verified:
	log.Println("verified by", v.Via.Holder.CPName, "retried:", v.Via.Retried)
default:
	log.Println("not verified:", v.Reason, "→ flag, traditional PSTN") // caller_id_unknown, unallocated, …
}

route, err := client.Routing().RequestRouting(ctx, pstn2.RoutingRequest{
	CallerID:          "+442079460100",
	DestinationNumber: "+441614960123",
	MediaCapabilities: pstn2.MediaCapabilities{Codecs: []string{"opus", "g722", "pcmu"}, Encryption: []string{"srtp-aes256"}},
})
if de, ok := pstn2.IsDiscoveryError(err); ok {
	log.Println("no PSTN2 holder:", de.Result.Result) // → traditional PSTN
} else if err == nil && route.Accepted {
	log.Println(route.ConnectionDetails.FQDN, route.ConnectionDetails.Port)
}
```

The client is safe for concurrent use: reuse one per CP. `pstn2.LoadEnv().Config()`
builds a `Config` from the `PSTN2_*` variables.

### 6.4 Types and Errors

`DiscoveryResult` has `Number`, `Result`, `Holder` (`*CpRef{CPID, CPName,
URL}`), `Ported`, `Hops`, `FromCache`, `Invalidated`, `Error` and
`RangeHolder`, with `Held()` / `Fallback()` helpers. `Discover` never returns
an error; failures are results.

Errors are `*pstn2.Error` (`Code`, `Message`, `HTTPStatus`, `URL`), with
`pstn2.ErrorCode(err)`, `pstn2.IsDiscoveryError(err)`, `pstn2.IsTimeout(err)`
and `pstn2.IsNetworkError(err)`. Codes follow SPECIFICATION.md §10.2
(`CodeUnsupportedCodec`, `CodeCapacityExceeded`, `CodeHopLimitExceeded`,
`CodeLoopDetected`, `CodeNotHeld`, …).

---

## 7. Testing Strategy

The full testing and conformance requirements are in
[TESTING-SPECIFICATION.md](https://pstn2.org/docs/TESTING-SPECIFICATION.md).
In short:

### 7.1 Unit Testing

Test modules in isolation. For Number Discovery, inject a transport instead of
HTTP (all three SDKs accept one) and check results, `hops` and the event
sequence:

```typescript
import { DiscoveryClient, NumberingList } from '@pstn2/core';

it('follows a Range Holder redirect', async () => {
  const transport = async (cp: { cpId: string }, number: string) =>
    cp.cpId === 'CP1-UK-0103'
      ? { status: 200, body: { result: 'redirect', portedTo: bravo } }
      : { status: 200, body: { result: 'held', holder: bravo, ported: true, cache: { ttl: 86400 } } };

  const d = new DiscoveryClient({ cpId: 'CP1-UK-0101', numberingList: NumberingList.fromObject(list), transport });
  const r = await d.discover('+441134960456');

  expect(r.result).toBe('held');
  expect(r.hops).toEqual(['CP1-UK-0103', 'CP1-UK-0102']);
  expect(r.ported).toBe(true);
});
```

### 7.2 Integration Testing

Run against the **local mock network** (`node
test-environment/mock-network/server.mjs`): a simulated Ofcom numbering list,
Alpha, Bravo and Charlie participating, Delta not. It answers discovery,
auth, routing and emergency over real HTTP, and has admin endpoints to
port a number (`POST /admin/port`), reset (`POST /admin/reset`) and read the
query log (`GET /admin/log`). Run scenarios A–G from
`test-environment/fixtures/scenarios.json` in order with one client:

```
A  +441614960123  unported                          → held by Bravo, hops [Bravo]
B  +441134960456  ported (Range Holder redirects)   → held by Bravo, hops [Charlie, Bravo]
C  +441134960456  repeat call                       → from cache, hops [Bravo]
D  +441134960456  ports back Bravo → Charlie        → not_held, purge, held by Charlie, invalidated
E  +441614960999  not in service                    → unknown (404)
F  +441174960555  Range Holder not participating    → not_participating, no hops
G  +441154960555  not allocated                     → unallocated, no hops
```

Then test against the **dummy test CP** (static, signed answers) at
https://pstn2.org/testcp/, or its local emulator, with signature verification
on.

### 7.3 Load Testing

Use tools like k6, Artillery, or Locust. Discovery answers are cacheable `GET`s,
so load-test your numbers endpoint separately from authentication.

**Example k6 script:**
```javascript
import http from 'k6/http';
import { check } from 'k6';
import { uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

export let options = {
  stages: [
    { duration: '1m', target: 100 },  // Ramp to 100 RPS
    { duration: '5m', target: 100 },  // Sustain 100 RPS
    { duration: '1m', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<100'],  // 95% under 100ms
  },
};

const headers = {
  'Content-Type': 'application/json',
  'User-Agent': 'pstn2-k6-loadtest/1.1',
  'X-PSTN2-Version': '1.1',
  'X-PSTN2-CP-ID': 'CP1-UK-0001',
};

export default function () {
  // Number Discovery (no body)
  const d = http.get('https://api.cp2.example.com/pstn2/v1/numbers/447700900123',
    { headers: { 'User-Agent': headers['User-Agent'], 'X-PSTN2-Version': '1.1' } });
  check(d, { 'discovery 200/404': (r) => r.status === 200 || r.status === 404 });

  // Authentication
  const payload = JSON.stringify({
    messageId: uuidv4(),
    timestamp: new Date().toISOString(),
    version: '1.1',
    requestingCP: 'CP1-UK-0001',
    callerID: '+441234567890',
    calledID: '+447700900123',
    callReference: uuidv4(),
    signature: 'load-test-signature',
  });
  const v = http.post('https://api.cp2.example.com/pstn2/v1/auth/verify', payload, { headers });
  check(v, {
    'status is 200': (r) => r.status === 200,
    'response time OK': (r) => r.timings.duration < 100,
  });
}
```

---

## 8. Deployment Guide

### 8.1 Production Checklist

- [ ] TLS certificate installed and valid
- [ ] DNS records configured (A/AAAA) for your PSTN2 base URL
- [ ] Range Holder URL published against all your blocks in the regulator's numbering list
- [ ] `GET /pstn2/v1/numbers/{digits}` answers correctly for every number in your number database (held, redirect, not_held, 404)
- [ ] `GET /pstn2/v1/keys` publishes current and next keys (`validFrom` / `validTo`)
- [ ] Numbering list download and daily refresh scheduled; alert if the local copy is older than 48 hours
- [ ] Firewall rules allow inbound 443
- [ ] WAF allows PSTN2 SDK user agents (`pstn2-*-sdk/*`) and does not require a request body on `GET`
- [ ] Keys stored in secure key management system
- [ ] Monitoring/alerting configured
- [ ] Log aggregation set up
- [ ] Rate limiting configured (discovery ≥ 200 req/s, auth ≥ 100 req/s per CP)
- [ ] DDoS protection active
- [ ] Backup/disaster recovery plan
- [ ] Tested failover to traditional PSTN

### 8.2 Keeping Discovery Answers Current

When a number ports, update your number database and your discovery answers in
the same transaction as the porting change itself:

- **Number ported out** (you are the Range Holder): answer `redirect` to the
  new holder.
- **Number ported in**: answer `held`, `ported: true`.
- **Number ported away again** (you were not the Range Holder): answer
  `not_held` + `cache.invalidate`. Keep this answer for at least the longest
  `cache.ttl` you have issued (default 24 h), so stale caches heal.
- **Block transferred to another Range Holder**: answer with `cache.scope:
  "block"` so callers re-download the numbering list.

Nothing has to be pushed to other CPs.

### 8.3 Docker Deployment

**Dockerfile:**
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./

ENV NODE_ENV=production
EXPOSE 443

CMD ["node", "dist/server.js"]
```

**docker-compose.yml:**
```yaml
services:
  pstn2-server:
    build: .
    ports:
      - "443:443"
    environment:
      - PSTN2_CP_ID=${PSTN2_CP_ID}
      - PSTN2_NUMBERING_LIST_URL=${PSTN2_NUMBERING_LIST_URL}
      - PSTN2_VERIFY_SIGNATURES=1
      - PRIVATE_KEY_PATH=/run/secrets/private_key
    secrets:
      - private_key
    restart: unless-stopped

secrets:
  private_key:
    file: ./secrets/private_key.pem
```

The numbering list and the number cache live in process memory; no external
cache is required. Add Redis only if you want several replicas to share a
number cache.

### 8.4 Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: pstn2-server
spec:
  replicas: 3
  selector:
    matchLabels:
      app: pstn2-server
  template:
    metadata:
      labels:
        app: pstn2-server
    spec:
      containers:
      - name: pstn2-server
        image: yourorg/pstn2-server:1.1.0
        ports:
        - containerPort: 443
        env:
        - name: PSTN2_CP_ID
          valueFrom:
            configMapKeyRef:
              name: pstn2-config
              key: cp-id
        - name: PSTN2_NUMBERING_LIST_URL
          valueFrom:
            configMapKeyRef:
              name: pstn2-config
              key: numbering-list-url
        - name: PSTN2_PRIVATE_KEY
          valueFrom:
            secretKeyRef:
              name: pstn2-secrets
              key: private-key
        resources:
          requests:
            memory: "256Mi"
            cpu: "500m"
          limits:
            memory: "512Mi"
            cpu: "1000m"
        livenessProbe:
          httpGet:
            path: /health
            port: 443
            scheme: HTTPS
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready          # ready once the numbering list is loaded
            port: 443
            scheme: HTTPS
          initialDelaySeconds: 5
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: pstn2-server
spec:
  type: LoadBalancer
  selector:
    app: pstn2-server
  ports:
  - protocol: TCP
    port: 443
    targetPort: 443
```

### 8.5 Static Hosting of Discovery Answers

A CP that only wants to be discoverable (for example, to let others verify its
caller IDs) can publish its answers as static files, as the dummy test CP
does:

```
{base}/pstn2/v1/keys                         → key set (JSON)
{base}/pstn2/v1/numbers/447700900001         → signed "held" answer
{base}/pstn2/v1/numbers/447700900003         → signed "redirect" answer
{base}/pstn2/v1/numbers/447700900004         → signed "not_held" answer (on the CP that no longer holds it)
(anything else)                              → the host's 404 page = unknown
```

Configure the host to serve the extensionless files as `application/json` and
to allow CORS if browser clients should use them. Regenerate and redeploy the
files whenever your number database changes.

---

## 9. Performance Optimization

### 9.1 Caching Strategy

**Numbering list:**
- Held in memory in full; index blocks by prefix (a trie or a map per prefix
  length) so lookup is a handful of map reads.
- Refreshed at least daily with `If-None-Match`; refreshed immediately on a
  `cache.scope: "block"` invalidation.
- Pre-load at start-up; report not-ready until loaded.

**Number cache:**
- Per number, TTL from `cache.ttl` (default 24 h).
- Purge on any `cache.invalidate`.
- LRU bound if memory is constrained.
- A warmed cache makes most discoveries one query, straight to the holder
  (local lookups < 1 ms, < 50 ms per network hop, §12.3).

**Authentication results:**
- Do not cache verification results across calls: each call reference is
  verified once.
- Cache key sets per CP (`/pstn2/v1/keys`) until `validTo`.

### 9.2 Connection Pooling

All three SDKs reuse connections to each CP (Node's built-in `fetch` keeps
connections alive, Python shares one `httpx.AsyncClient`, Go uses a pooled
`http.Client`). If you bring your own HTTP client, keep connections alive and
pass it in (`fetch` in TypeScript, `http_client` in Python, `HTTPClient` in Go):

```python
# Python: share one httpx.AsyncClient
import httpx
http = httpx.AsyncClient(http2=False, limits=httpx.Limits(max_keepalive_connections=100))
client = PSTN2Client("CP1-UK-0101", numbering_list_url=LIST_URL, http_client=http)
```

```go
// Go: pass a tuned *http.Client
client, _ := pstn2.NewClient(pstn2.Config{
	CPID:             "CP1-UK-0101",
	NumberingListURL: listURL,
	HTTPClient: &http.Client{Transport: &http.Transport{
		MaxIdleConns: 100, MaxIdleConnsPerHost: 10, IdleConnTimeout: 90 * time.Second,
	}},
})
```

### 9.3 Database Optimization

**Call Records Table (PostgreSQL):**
```sql
CREATE TABLE call_records (
  call_reference UUID PRIMARY KEY,
  caller_id VARCHAR(20) NOT NULL,
  called_id VARCHAR(20) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL
);

-- Index for fast lookups
CREATE INDEX idx_call_records_expires
  ON call_records (expires_at);

-- Auto-delete expired records
CREATE FUNCTION delete_expired_calls() RETURNS VOID AS $$
  DELETE FROM call_records WHERE expires_at < NOW();
$$ LANGUAGE SQL;

-- Run cleanup every minute
SELECT cron.schedule('cleanup-calls', '* * * * *', 'SELECT delete_expired_calls()');
```

**Number database** (the data behind your discovery answers; most CPs already
have it in their porting and provisioning systems):
```sql
CREATE TABLE numbers (
  number       VARCHAR(16) PRIMARY KEY,           -- E.164
  state        VARCHAR(16) NOT NULL,              -- in_service | ported_in | ported_out | previously_held
  other_cp_id  VARCHAR(20),                       -- ported_out: to; ported_in: from
  updated_at   TIMESTAMP NOT NULL DEFAULT NOW()
);
```

---

## 10. Security Checklist

### 10.1 Cryptography

- [ ] Ed25519 keys properly generated (256-bit entropy)
- [ ] Private keys stored in hardware security module (HSM) or key vault
- [ ] Key rotation policy: 90 days; publish the next key in `/pstn2/v1/keys` before using it
- [ ] Signature verification on all incoming requests
- [ ] Discovery answers signed; signature verification enabled in clients
- [ ] Canonical JSON implemented exactly (sorted keys, no whitespace, `/` and non-ASCII unescaped)
- [ ] TLS 1.3 enforced (no TLS 1.2 or lower)
- [ ] Certificate pinning implemented (optional but recommended)

### 10.2 Network Security

- [ ] HTTPS only (no HTTP)
- [ ] HSTS headers set (`Strict-Transport-Security`)
- [ ] Rate limiting per IP/CP
- [ ] DDoS protection (Cloudflare, AWS Shield, etc.)
- [ ] Firewall rules: only 443 inbound
- [ ] No sensitive data in logs

### 10.3 Application Security

- [ ] Input validation on all fields (E.164 `^\+[1-9]\d{1,14}$`, digits-only path segment on `/numbers/`)
- [ ] Discovery answers reveal nothing beyond holder identity and URL (§9.7)
- [ ] SQL injection prevention (parameterized queries)
- [ ] XSS prevention (output encoding)
- [ ] CSRF tokens (for admin interfaces)
- [ ] Dependency security scanning (Snyk, Dependabot)
- [ ] Regular security audits

---

## 11. Common Pitfalls

### 11.1 Clock Skew

**Problem:** Timestamp validation fails due to clock drift.

**Solution:**
- Use NTP to sync clocks
- Accept timestamps ±30 seconds
- Log clock skew warnings
- (Discovery answers are exempt from the timestamp window; `issued` is informational)

### 11.2 Redirect Loops and Long Chains

**Problem:** A misconfigured CP redirects back to a CP already visited, or
redirects without end.

**Solution:**
- At most 5 discovery queries per lookup (`hop_limit_exceeded`)
- Track visited CPs; the same CP twice in one discovery is `loop_detected`
- Bound total discovery time with the call-setup deadline
- Fall back to traditional PSTN

### 11.3 Caching by Block

**Problem:** A client sees one ported number and caches the new holder for the
whole block, misrouting every other number in it.

**Solution:** Cache per number only. Block-level knowledge comes only from the
numbering list.

### 11.4 Ignoring Invalidation on Service Responses

**Problem:** A client handles `not_held` on discovery but not on
`/auth/verify` or `/routing/request`, so a stale cache entry turns into a
failed verification.

**Solution:** Check every PSTN2 response for `result: "not_held"` /
`cache.invalidate`; purge, rediscover, retry once.

### 11.5 Treating a Redirect as HTTP 3xx

**Problem:** Code expects HTTP redirects, or an HTTP library follows 3xx
automatically.

**Solution:** A PSTN2 redirect is `200 OK` with `"result": "redirect"` and
`portedTo`. Read the body.

### 11.6 Generic User Agents Blocked

**Problem:** Requests from `curl/*` or `Go-http-client/*` get `403` from
hosting WAFs (pstn2.org included), which looks like an outage.

**Solution:** Always send a descriptive `User-Agent`
(`pstn2-{language}-sdk/{version}` in the SDKs). Do not send `Content-Type` on
bodyless `GET`s. Accept JSON whatever the response `Content-Type`, and treat
a 404 with an HTML body as `unknown`.

### 11.7 Stale Numbering List

**Problem:** The local list is never refreshed; new blocks show as
`unallocated` and moved blocks query the wrong Range Holder.

**Solution:** Refresh daily with `ETag`, alert when the copy is older than 48
hours, and honour `cache.scope: "block"`.

### 11.8 Memory Growth

**Problem:** The number cache grows unbounded.

**Solution:**
- Set TTL on all cache entries
- Use LRU eviction policy
- Monitor memory usage

### 11.9 Signature Verification

**Problem:** Signature verification fails silently, or always fails because
the canonical JSON differs (key order, escaped `/`, whitespace).

**Solution:**
- Test against the signed answers of the dummy test CP
- Log all verification failures
- Alert on high failure rate
- Provide clear error messages

### 11.10 Fallback Not Tested

**Problem:** Traditional PSTN fallback broken in production.

**Solution:**
- Test fallback regularly (scenarios E, F, G and an unreachable CP)
- Monitor fallback rate
- Have runbook for manual fallback

---

## Appendix: Configuration Examples

### TypeScript

```typescript
import { PSTN2Client, PSTN2Config } from '@pstn2/core';

const config: PSTN2Config = {
  cpId: 'CP1-UK-0001',
  cpName: 'Your CP',
  numberingListUrl: 'https://numbering.example.org/pstn2/numbering-list.json',
  listRefreshSeconds: 86400,
  verifySignatures: true,
  hopLimit: 5,
  defaultTtl: 86400,
  privateKey: process.env.PSTN2_PRIVATE_KEY_PEM,   // Ed25519 PEM
  timeout: 2000,
  retries: 3,
  fallbackToTraditional: true,
  logLevel: 'info',
};
const client = new PSTN2Client(config);
```

### Python

```python
from pstn2 import PSTN2Client

client = PSTN2Client(
    "CP1-UK-0001",
    numbering_list_url="https://numbering.example.org/pstn2/numbering-list.json",
    list_refresh_seconds=86400,
    verify_signatures=True,
    hop_limit=5,
    default_ttl=86400,
    private_key=os.environ["PSTN2_PRIVATE_KEY"],   # PEM or base64
    timeout=2.0,
    retries=3,
    log_level="INFO",
)
```

### Go

```go
config := pstn2.Config{
	CPID:             "CP1-UK-0001",
	CPName:           "Your CP",
	NumberingListURL: "https://numbering.example.org/pstn2/numbering-list.json",
	ListRefresh:      24 * time.Hour,
	VerifySignatures: true,
	HopLimit:         5,
	DefaultTTL:       86400,
	PrivateKey:       privateKey, // ed25519.PrivateKey
	Timeout:          2 * time.Second,
	Retries:          3,
}
client, err := pstn2.NewClient(config)
```

### Environment Variables

`PSTN2Client.fromEnv()` (TypeScript), `PSTN2Client.from_env()` (Python) and
`pstn2.LoadEnv()` (Go) read the same variables, which the examples use:

| Variable | Default | Meaning |
|---|---|---|
| `PSTN2_NETWORK` | `local` | `local` = mock network, `live` = dummy test CP on pstn2.org |
| `PSTN2_MOCK_PORT` | `47901` | Local list: `http://127.0.0.1:$PSTN2_MOCK_PORT/numbering-list.json` |
| `PSTN2_NUMBERING_LIST_URL` | per network | Overrides the numbering list URL (live: `https://pstn2.org/testcp/numbering-list.json`) |
| `PSTN2_CP_ID` | `CP1-UK-0101` (local), `CP1-UK-TEST-CLIENT` (live) | Acting CP; some examples default to another CP |
| `PSTN2_VERIFY_SIGNATURES` | on for live, off for local | `1` / `0` |
| `PSTN2_LOG_LEVEL` | SDK default | TypeScript: `silent`/`error`/`warn`/`info`/`debug`; Python examples: logging level |
| `PSTN2_PRIVATE_KEY` | ephemeral key | Python only: Ed25519 private key (PEM or base64) |

---

**Document Status:** Living Guide
**Contributions:** https://github.com/njjholland-dot/pstn2/pulls
**Questions:** https://github.com/njjholland-dot/pstn2/discussions
