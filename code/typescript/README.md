# @pstn2/core - TypeScript/Node.js Library

Official TypeScript implementation of the PSTN2 protocol **v1.1** — caller ID
verification, direct routing and emergency location, with **Number Discovery**
to find which CP holds any number. No central database: the regulator's
numbering list names each block's Range Holder, the Range Holder knows where its
ported numbers went, and every CP answers for the numbers it serves
(SPECIFICATION.md §9).

- Node.js 18+ (uses the built-in `fetch` and `node:crypto` Ed25519)
- **Zero runtime dependencies**
- Every request identifies itself as `User-Agent: pstn2-typescript-sdk/1.1.0`
  with `X-PSTN2-Version: 1.1`

## Installation

Not yet published to npm. To use the library today, clone the repository and
build it locally:

```bash
git clone https://github.com/njjholland-dot/pstn2.git
cd pstn2/code/typescript
npm ci && npm run build
```

Once published, installation will be `npm install @pstn2/core`.

## Quick Start

```typescript
import { PSTN2Client } from '@pstn2/core';

const client = new PSTN2Client({
  cpId: 'CP1-UK-0103',                                     // your RCPID
  numberingListUrl: 'https://pstn2.org/testcp/numbering-list.json',
  verifySignatures: true,                                  // check Ed25519 signatures on discovery answers
});

// Who holds this number right now?
const found = await client.discover('+447700900003');
// { result: 'held', holder: { cpId: 'CP1-UK-9002', cpName: 'PSTN2 Test CP B', url: '…/testcp/b' },
//   ported: true, hops: ['CP1-UK-9001', 'CP1-UK-9002'], fromCache: false, invalidated: false }

if (found.result !== 'held') {
  // unallocated / unknown / not_participating / error → traditional PSTN
}

// Verify an inbound caller ID — discovery finds the holder, then asks it
const v = await client.verifyCall({ callerID: '+442079460100', calledID: '+441134960789' });
if (v.verified) console.log(`Verified by ${v.holder?.cpName}`);
else if (v.fallbackToTraditional) console.log(`No PSTN2 holder (${v.reason}) — traditional PSTN handling`);
else console.log('Holder did not confirm the call — flag as possible spoofing');

// Ask the destination's holder for a direct media path
const routing = await client.requestRouting({
  destinationNumber: '+441614960123',
  callerID: '+442079460100',
  mediaCapabilities: { codecs: ['opus', 'g722'], encryption: ['srtp-aes256'] },
});
if (routing.accepted) {
  console.log('Connect to', routing.connectionDetails.fqdn, routing.connectionDetails.port);
} else {
  console.log('Traditional PSTN:', routing.reason);
}

await client.close();
```

The numbering list is downloaded on first use (or call `await client.start()`),
kept in memory and revalidated daily with `ETag` / `If-None-Match`.

## Features

- ✅ **Number Discovery**: numbering list → Range Holder → redirect for ported numbers, cached per number
- ✅ **Authentication**: verify caller IDs in real time by Direct Query to the caller ID's holder
- ✅ **Direct Routing**: connection details and codec/SRTP negotiation for peer-to-peer calls
- ✅ **Emergency Services**: live location for 999/112 calls from the caller's current CP
- ✅ **Signed answers**: Ed25519 over canonical JSON, keys from `{url}/pstn2/v1/keys`
- ✅ **Stale caches heal themselves**: a `not_held` answer purges the entry, rediscovers and retries once
- ✅ **Automatic Fallback**: no PSTN2 holder, timeout or bad signature → traditional PSTN, never a blocked call
- ✅ **Server side**: `RangeHolderResponder` builds your CP's own discovery answers

## How Number Discovery works

```
discover(number):
  1. CACHE   unexpired entry for the number → query that holder directly (4)
  2. LIST    longest-prefix block in the numbering list
               no block           → "unallocated"        (traditional PSTN)
               no rangeHolderUrl  → "not_participating"  (traditional PSTN)
  3. RANGE HOLDER  query block.rangeHolderUrl
  4. QUERY   GET {url}/pstn2/v1/numbers/{digits}
               held      → cache number → holder for cache.ttl; done
               redirect  → query portedTo (4 again)
               not_held  → purge the cache entry; restart at 2
               404       → "unknown"
  Max 5 queries; reaching the same CP twice = loop → "error".
```

Results and hops are identical to the reference engine
(`animations/src/test-harness/harness-engine.js`) — the test suite checks this.

| `result` | Meaning | What to do |
|---|---|---|
| `held` | `holder` serves the number (`ported: true` if it was ported in) | Call `{holder.url}/pstn2/v1/...` |
| `unknown` | The holder answered 404 (not in service / no record) | Treat caller ID as unverified; PSTN |
| `unallocated` | No numbering-list block matches | Traditional PSTN |
| `not_participating` | The Range Holder has no PSTN2 URL | Traditional PSTN |
| `error` | `hop_limit_exceeded`, `loop_detected`, `timeout`, `invalid_response`, `invalid_signature`, `numbering_list_unavailable` | Traditional PSTN |

The cache is **per number**, never per block — porting is per number. Entries
are hints: a stale one costs one extra query, because the CP that no longer
holds the number answers `not_held` with `cache.invalidate`.

## Architecture

### Modules

- **discovery/**: `NumberingList`, `DiscoveryCache`, `DiscoveryClient`, `RangeHolderResponder`, `canonicalJson`, signatures
- **auth/**: Authentication (Direct Query)
- **routing/**: Direct routing request and negotiation
- **emergency/**: Emergency services location
- **encryption/**: Per-call Ed25519 identity keys (media keys come from DTLS-SRTP)
- **branding/**: Call branding (extension endpoint)
- **messaging/**: `fetch`-based HTTP client (timeouts, §10.3 retries) and holder calls with not_held retry

Every module finds the subject number's holder with `discover()` and calls
`{holder.url}/pstn2/v1/...`. If that CP answers `200 {"result": "not_held",
"cache": {"invalidate": true}}`, the SDK purges the cache entry, rediscovers
from the Range Holder and retries **once** at the new holder (`retried: true`
on the result).

### Authentication: Direct Query

Direct Query is the only authentication method. The terminating CP finds the
caller ID's holder with Number Discovery and asks it whether the call is
genuine:

```typescript
const v = await client.verifyCall({ callerID, calledID, callReference });
// POST {holder of callerID}/pstn2/v1/auth/verify
```

## Configuration

```typescript
interface PSTN2Config {
  cpId: string;                       // your RCPID
  cpName?: string;

  // Numbering list (one of)
  numberingListUrl?: string;          // downloaded, cached, ETag-revalidated
  numberingList?: NumberingList | NumberingListDocument;
  listRefreshSeconds?: number;        // default 86400

  // Number Discovery
  verifySignatures?: boolean;         // default false
  hopLimit?: number;                  // default 5
  defaultTtl?: number;                // cache TTL when an answer has none (default 86400 s)
  cache?: DiscoveryCache;             // share a cache between clients
  onDiscoveryEvent?: (e: DiscoveryEvent) => void;

  // Security
  privateKey?: string | KeyObject;    // Ed25519 PEM; a per-process key is generated if omitted

  // Network
  timeout?: number;                   // per request, ms (default 2000)
  retries?: number;                   // 503/504/network errors only (default 3; 100/200/400 ms)
  fetch?: typeof fetch;               // inject a fetch implementation

  logLevel?: 'silent' | 'error' | 'warn' | 'info' | 'debug';   // default warn
}
```

`PSTN2Client.fromEnv()` reads the same environment variables as the examples:

| Variable | Default | |
|---|---|---|
| `PSTN2_NETWORK` | `local` | `local` = mock network, `live` = dummy test CP on pstn2.org |
| `PSTN2_MOCK_PORT` | `47901` | local list: `http://127.0.0.1:$PSTN2_MOCK_PORT/numbering-list.json` |
| `PSTN2_NUMBERING_LIST_URL` | | overrides both |
| `PSTN2_CP_ID` | per example / `CP1-UK-TEST-CLIENT` (live) | acting CP |
| `PSTN2_VERIFY_SIGNATURES` | on for live, off for local | `1` / `0` |
| `PSTN2_LOG_LEVEL` | `warn` (examples: silent) | SDK log level |

## API Reference

### `PSTN2Client`

| Member | Returns | |
|---|---|---|
| `discover(number, { onEvent? })` | `DiscoveryResult` | Who holds this number? |
| `verifyCall({ callerID, calledID, callReference? })` | `VerificationResult` | Response + `holder`, `discovery`, `retried`, `fallbackToTraditional`, `reason` |
| `requestRouting({ destinationNumber, callerID, mediaCapabilities, … })` | `RoutingResult` | `accepted: true` with `connectionDetails`, or `accepted: false` with `reason`, `fallbackToTraditional` (never throws for rejections) |
| `getEmergencyLocation({ callerID, psapID, callReference? })` | `EmergencyLocationResult` | Throws `DiscoveryError` / `PSTN2Error` so the PSAP can use other sources |
| `start()` | `this` | Load the numbering list now |
| `numberingList`, `cache`, `discovery` | | The discovery building blocks |
| `publicKey` | `string` | Raw Ed25519 identity key (base64), sent in routing requests |
| `close()` | | Clear caches and key material |

### Number Discovery building blocks

```typescript
import { NumberingList, DiscoveryCache, DiscoveryClient } from '@pstn2/core';

const list = await NumberingList.load('https://pstn2.org/testcp/numbering-list.json'); // or NumberingList.fromObject(doc)
list.findBlock('+447700900003');   // longest prefix, numberLength must match → block | null
await list.refresh();              // revalidate if older than refreshSeconds (If-None-Match → 304)

const cache = new DiscoveryCache();          // number → { holder, ported, expiresAt }
const discovery = new DiscoveryClient({ cpId: 'CP1-UK-TEST-CLIENT', numberingList: list, cache, verifySignatures: true });
const r = await discovery.discover('+447700900004', {
  onEvent: (e) => console.log(e.type),       // cache-hit | cache-miss | list-lookup | query | response |
});                                          // redirect | cache-purge | cache-store | result
cache.purge('+447700900004');
```

A custom `transport: (cp, number) => Promise<{ status, body }>` can replace HTTP
(the tests use one to run in memory).

### Server side: `RangeHolderResponder`

Build your CP's answer to `GET /pstn2/v1/numbers/{digits}` from your own number
database (matches the reference engine's `Network.respond()`):

```typescript
import { RangeHolderResponder, NumberingList } from '@pstn2/core';

const responder = new RangeHolderResponder(
  {
    cpId: 'CP1-UK-0103', cpName: 'Charlie Comms', url: 'https://pstn2.charlie-comms.example',
    ranges: ['441134960'],                                        // blocks you are Range Holder for
    inService: ['+441134960789'],
    portedIn: [{ number: '+442079460321', fromCpId: 'CP1-UK-0101' }],
    portedOut: [{ number: '+441134960456', toCpId: 'CP1-UK-0102' }],
    previouslyHeld: [],
  },
  {
    resolve: (cpId) => knownCps.get(cpId),          // cpId → { cpId, cpName, url }
    numberingList,                                  // so non-held numbers in others' blocks get not_held
    signer: { privateKey: pem, kid: 'charlie-2026-10' }, // optional Ed25519 signing
  }
);

const { status, body } = responder.respond('+441134960456');   // 200 redirect → Bravo
responder.handle('/pstn2/v1/keys');                              // your published key set
```

`DirectQueryAuth.handleVerificationRequest`, `RoutingModule.handleRoutingRequest`
and `EmergencyModule.handleLocationRequest` return a `not_held` answer when you
don't hold the number.

### Signatures

```typescript
import { canonicalJson, signBody, verifyBody, rawPublicKey } from '@pstn2/core';

canonicalJson({ b: 1, a: 'x/y' });         // '{"a":"x/y","b":1}' — sorted keys, no whitespace, / unescaped
const signed = signBody(body, privateKey, 'my-kid');   // adds kid + signature
verifyBody(signed, rawPublicKeyBase64);    // true / false (never throws)
```

With `verifySignatures: true`, every `200` discovery answer must carry a
`kid` + `signature` that verifies against the answering CP's key set
(`{url}/pstn2/v1/keys`, cached per CP); otherwise the result is
`error` / `invalid_signature`. 404s need no signature.

### Errors

Discovery outcomes are **results**, not exceptions. Exceptions are
`PSTN2Error` (`code`, `status`, `toJSON()` → spec `ErrorResponse`
`{ error: { code, message, timestamp } }`) and its subclasses:

| Class | When |
|---|---|
| `DiscoveryError` | A module needs a holder and discovery found none (`.discovery` has the result) |
| `NotHeldError` | The rediscovered holder also answered `not_held` |
| `TimeoutError`, `NetworkError` | After retries |
| `RateLimitError` | 429 (`retryAfter`) |
| `ValidationError` | Bad input |

```typescript
import { DiscoveryError, PSTN2Error } from '@pstn2/core';

try {
  const loc = await psap.getEmergencyLocation({ callerID, psapID: 'UK-999-LONDON-01' });
} catch (err) {
  if (err instanceof DiscoveryError) console.log('No PSTN2 holder:', err.discovery.result);
  else if (err instanceof PSTN2Error) console.log('PSTN2 error:', err.code);
  // either way: use the PSAP's other location sources
}
```

## Examples

Start the local mock network (3 CPs: Alpha, Bravo, Charlie; Delta not
participating) from the repository root, then run the examples from
`code/typescript`:

```bash
node test-environment/mock-network/server.mjs     # serves http://127.0.0.1:47901
npm run example:01
```

| Script | File | Storyline |
|---|---|---|
| `example:01` | `examples/01-basic-authentication.ts` | Charlie (terminating) verifies Alpha, Bravo, a not-in-service caller ID (flag + PSTN fallback) and a ported caller ID (redirect → Bravo verifies) |
| `example:02` | `examples/02-direct-routing.ts` | Alpha routes to +441614960123 at Bravo with codec/SRTP negotiation |
| `example:03` | `examples/03-emergency-services.ts` | PSAP gets live location for a Bravo number, a ported number, and falls back for a not-in-service one |
| `example:04` | `examples/04-complete-call-flow.ts` | Discovery with redirect → authentication → routing → summary, then a cache hit on the second call |
| `example:05` | `examples/05-number-discovery.ts` | "Who has this number?" hop by hop: scenarios A–G locally, or the dummy test CPs live with signatures |

Type-check everything with `npm run typecheck:examples`. Set
`PSTN2_LOG_LEVEL=info` to see the SDK's own request log.

### Live dummy test CP

The dummy test CPs at `https://pstn2.org/testcp/` are static files with signed
answers: Test CP A is Range Holder for 07700 900 0xx, Test CP B for
07700 900 1xx.

```bash
PSTN2_NETWORK=live npm run example:05
```

| Number | Expect |
|---|---|
| +447700900001, +447700900002 | held by Test CP A |
| +447700900003 | Test CP A redirects → held by Test CP B (ported) |
| +447700900004 | held by Test CP A; a stale cache entry for Test CP B gets `not_held` + invalidate |
| +447700900101 | held by Test CP B |
| +447700900099 | 404 from Test CP A → unknown |

To run the same thing against a local copy (static-host emulator):

```bash
node tools/testcp/build.mjs --base http://127.0.0.1:47902/testcp --out /tmp/testcp
node test-environment/mock-network/static-server.mjs --dir /tmp/testcp --port 47902
PSTN2_NUMBERING_LIST_URL=http://127.0.0.1:47902/testcp/numbering-list.json npm run example:05
```

Examples 01–04 need the auth/routing/emergency endpoints of the mock network;
the dummy test CP only answers Number Discovery.

## Testing

```bash
npm test                   # everything (offline)
npm run test:unit
npm run test:integration
npm run test:coverage
```

- **Unit**: numbering list (longest prefix, length check, ETag/304, refresh),
  cache TTL/purge, canonical JSON and Ed25519 (including every signed file
  produced by `tools/testcp/build.mjs`), `RangeHolderResponder` parity with the
  reference `Network.respond()` for every CP × number in both fixtures, and
  `DiscoveryClient` parity (results and event sequences) with the reference
  engine for scenarios A–G, plus hop limit, loops, timeouts and signatures.
- **Integration**: spawns `test-environment/mock-network/server.mjs` on a free
  port and runs scenarios A–G in order with one client; auth (Direct Query),
  routing and emergency including not_held → rediscover → retry; builds the
  dummy test CP into a temp dir, serves it with the static-host emulator and
  checks all six test numbers with signatures on, the stale-cache invalidation,
  tamper detection and the WAF's 403 for generic user agents.

## Development

```bash
npm ci
npm run build              # → dist/
npm run watch
npm run typecheck:examples
```

## API Documentation

Full API documentation generated with TypeDoc:

```bash
npm run docs
# Open docs/index.html
```

## License

Public domain: the PSTN2 project is released under CC0 1.0 Universal (commercial
use, modification and distribution allowed; no warranty). The Comms Council UK
logo and branding are excluded. See the project
[LICENSE](https://github.com/njjholland-dot/pstn2/blob/main/LICENSE).

## Support

- Documentation: https://pstn2.org/docs
- Specification: [SPECIFICATION.md](../../docs/SPECIFICATION.md) (§9 Number Discovery), [API-SPECIFICATION.yaml](../../docs/API-SPECIFICATION.yaml)
- Examples guide: [EXAMPLES.md](../EXAMPLES.md) · Implementation guide: [IMPLEMENTATION-GUIDE.md](../../docs/IMPLEMENTATION-GUIDE.md) · Testing: [TESTING-SPECIFICATION.md](../../docs/TESTING-SPECIFICATION.md)
- GitHub: https://github.com/njjholland-dot/pstn2
- Email: nick.holland@8x8.com
