# PSTN2 Python SDK

Python implementation of the PSTN2 protocol **v1.1** (`pstn2-python-sdk/1.1.0`).

PSTN2 answers one question before every call: **"which CP currently holds this
number?"** There is no central database. The regulator's numbering list names each
block's Range Holder and its PSTN2 URL; the Range Holder knows where its ported-out
numbers went; every CP knows the numbers it serves. The SDK's Number Discovery walks
that chain, and caller ID verification, direct routing and emergency location are
then sent to the holder it finds.

- **Number Discovery** (§9): numbering list (longest prefix) → Range Holder → redirect
  for ported numbers → holder, with per-number caching, stale-cache invalidation,
  hop limit and loop detection, and optional Ed25519 signature verification
- **Caller ID verification**: Direct Query (§5.1) and Token Pool (§5.2)
- **Direct routing** with codec and SRTP negotiation (§6)
- **Emergency location** for PSAPs (§8)
- **Range Holder responder**: the server side of discovery, built from your own number database
- Async throughout (`httpx`), Pydantic v2 models, full type hints (`py.typed`)

## Requirements

- Python 3.11 or later (tested on 3.14)
- `httpx`, `pydantic` v2, `cryptography` (installed automatically)
- Node.js 18+ only if you want to run the local mock network for the examples and tests

## Installation

The package is not on PyPI. Install it from the repository:

```bash
# From a clone of the repository
pip install -e code/python

# Or straight from GitHub
pip install "pstn2 @ git+https://github.com/njjholland-dot/pstn2#subdirectory=code/python"
```

For development (tests included):

```bash
cd code/python
python3 -m venv .venv
source .venv/bin/activate
pip install -e '.[dev]'
```

## Quick start

```python
import asyncio
from pstn2 import PSTN2Client

async def main():
    async with PSTN2Client(
        "CP1-UK-0101",                       # the CP you are acting as
        numbering_list_url="http://127.0.0.1:47901/numbering-list.json",
    ) as client:
        # Who holds this number?
        result = await client.discover("+441134960456")
        print(result.result, result.holder, result.hops, result.ported)
        # held  Bravo Networks (CP1-UK-0102)  ['CP1-UK-0103', 'CP1-UK-0102']  True

        if result.fallback_to_pstn:
            ...  # unknown / unallocated / not_participating / error → traditional PSTN

        # Verify an inbound caller ID (discovery happens inside)
        v = await client.verify_call("+442079460100", "+441134960789")
        print(v.verified, v.holder, v.trust_level)

asyncio.run(main())
```

Start the local mock network first (`node test-environment/mock-network/server.mjs`), or
point `numbering_list_url` at the live dummy test CP (see below).

Or configure from the environment:

```python
client = PSTN2Client.from_env()   # PSTN2_NETWORK, PSTN2_NUMBERING_LIST_URL, PSTN2_CP_ID, ...
```

| Variable | Meaning |
|---|---|
| `PSTN2_NETWORK` | `local` (default) or `live` |
| `PSTN2_MOCK_PORT` | Local mock network port (default `47901`) |
| `PSTN2_NUMBERING_LIST_URL` | Overrides the numbering list URL for either network |
| `PSTN2_CP_ID` | Acting CP (local default `CP1-UK-0101` Alpha Telecom; live default `CP1-UK-TEST-CLIENT`) |
| `PSTN2_VERIFY_SIGNATURES` | `1`/`0` (default on for live, off for local) |
| `PSTN2_PRIVATE_KEY` | Ed25519 private key (PEM or base64) for request signatures; an ephemeral key is generated if unset |

`local` uses `http://127.0.0.1:${PSTN2_MOCK_PORT}/numbering-list.json`; `live` uses
`https://pstn2.org/testcp/numbering-list.json`.

## How discovery works

```
discover(number):
  1. CACHE   unexpired entry → query the cached holder directly
  2. LIST    longest-prefix block in the numbering list
               no block           → "unallocated"        (traditional PSTN)
               no rangeHolderUrl  → "not_participating"  (traditional PSTN)
  3. RANGE HOLDER  GET {rangeHolderUrl}/pstn2/v1/numbers/{digits}
  4. answer:  held      → cache {number → holder, ttl}; done
              redirect  → query portedTo (step 4 again)
              not_held  → purge cache entry; restart at step 2
              404       → "unknown"
  At most 5 queries; the same CP twice = loop → "error".
```

The algorithm, hop accounting and event stream are identical to the reference engine
(`animations/src/test-harness/harness-engine.js`); the test suite checks this directly.
A cached entry is only a hint: if the number has moved, the CP you reach answers
`not_held` with `cache.invalidate`, and discovery goes back to the Range Holder. A stale
entry costs one extra query, never a misrouted call.

Service calls apply the same rule (§5.1.2): if a verification, token, routing or
emergency request reaches a CP that answers HTTP 200 `{"result": "not_held", "cache":
{"invalidate": true}}`, the SDK purges the entry, rediscovers and retries **once** at the
new holder (`result.rediscovered` is then `True`).

## API reference

### `PSTN2Client`

```python
PSTN2Client(
    cp_id,                          # acting CP id, sent as X-PSTN2-CP-ID and requestingCP
    *,
    numbering_list_url=None,        # or numbering_list=<dict | NumberingListData | NumberingList>
    verify_signatures=False,        # require Ed25519-signed discovery answers
    timeout=2.0, retries=3,         # per request; retries only for 503/504/network errors (§10.3)
    hop_limit=5, default_ttl=86400, list_refresh_seconds=86400,
    private_key=None,               # Ed25519 key for request signatures (ephemeral if None)
    token_pool_url=None, token_pool_auth=None,   # dedicated token pool, if any
    on_event=None,                  # discovery event hook (sync or async)
    http_client=None,               # bring your own httpx.AsyncClient
)
```

| Member | Purpose |
|---|---|
| `await client.discover(number, on_event=None)` | `DiscoveryResult` |
| `client.discovery` | the `DiscoveryClient` |
| `client.numbering_list` / `client.cache` | the `NumberingList` and `DiscoveryCache` |
| `client.auth.verify_call(caller_id, called_id, call_reference=None, *, token_id=None, holder=None)` | `VerificationResult` |
| `client.auth.create_token(caller_id, called_id, call_reference=None, *, ttl=30, branding=None)` | `TokenCreateResult` |
| `client.auth.verify_token(token_id, caller_id)` | `TokenVerifyResponse` or `None` |
| `client.routing.request_routing(destination, caller_id, media_capabilities=None, call_reference=None, *, branding=None, holder=None)` | `RoutingResult` |
| `client.emergency.get_location(caller_id, psap_id, call_reference=None, *, holder=None)` | `EmergencyLocationResult` |
| `client.public_key` | this client's Ed25519 identity key (base64) |
| `await client.close()` / `async with` | clear the cache, close connections |

`holder=` accepts a `CpRef` or a held `DiscoveryResult` you already have, to skip the
discovery query (example 05 reuses its Phase 1 answer for routing).

Outcomes, not exceptions: `verify_call` and `request_routing` return `verified=False` /
`accepted=False` with `reason` and `fallback_to_pstn=True` when there is no PSTN2 holder
or the holder declines. `get_emergency_location` **raises** `DiscoveryError` instead, so
a PSAP always sees that it must use other location sources. Transport failures raise
`PSTN2TimeoutError` / `NetworkError`.

### `DiscoveryResult`

| Field | |
|---|---|
| `number` | E.164 |
| `result` | `"held"`, `"unknown"`, `"unallocated"`, `"not_participating"` or `"error"` |
| `holder` | `CpRef(cp_id, cp_name, url)` when held; `holder.api_base` = `{url}/pstn2/v1` |
| `ported` | `True` when the holder is not the Range Holder |
| `hops` | cpId of every CP queried, in order |
| `from_cache` | the answer came from querying a cached holder |
| `invalidated` | a response in this discovery purged the cache entry |
| `error` | `"hop_limit_exceeded"`, `"loop_detected"`, `"timeout"`, `"invalid_response"`, `"invalid_signature"` |
| `range_holder` | for `not_participating`: the Range Holder named in the list |

`result.to_wire()` gives the camelCase JSON form (`fromCache`, `rangeHolder`, …).

### Discovery building blocks

```python
from pstn2 import NumberingList, DiscoveryCache, DiscoveryClient

nl = await NumberingList.load("https://pstn2.org/testcp/numbering-list.json")  # ETag / If-None-Match
nl = NumberingList({"listVersion": "...", "blocks": [...]})                    # or from data
block = nl.find_block("+447700900003")          # longest prefix; numberLength must match

cache = DiscoveryCache()                         # number → holder; TTL from cache.ttl
dc = DiscoveryClient(nl, cache=cache, verify_signatures=True,
                     on_event=lambda e: print(e.type, e.data))
result = await dc.discover("+447700900003")
cache.get("+447700900003"); cache.purge("+447700900003"); cache.entries(); cache.clear()
```

Events (`DiscoveryEvent.type`, same names as the reference engine): `cache-hit`,
`cache-miss`, `list-lookup`, `query`, `response`, `redirect`, `cache-purge`,
`cache-store`, `result`. A custom `transport(url, number) -> TransportResponse` can be
passed to `DiscoveryClient` (useful for in-memory tests).

### Answering discovery queries: `RangeHolderResponder`

```python
from pstn2 import RangeHolderResponder, generate_key_pair

db = {
    "cpId": "CP1-UK-0103", "cpName": "Charlie Comms", "url": "https://pstn2.charlie-comms.example",
    "ranges": ["441134960"],
    "inService": ["+441134960789"],
    "portedIn": [{"number": "+442079460321", "fromCpId": "CP1-UK-0101"}],
    "portedOut": [{"number": "+441134960456", "toCpId": "CP1-UK-0102"}],
    "previouslyHeld": [],
}
peers = {"CP1-UK-0102": {"cpId": "CP1-UK-0102", "cpName": "Bravo Networks", "url": "https://pstn2.bravo-networks.example"}}
key = generate_key_pair()
responder = RangeHolderResponder(db, peers, numbering_list=nl, signing_key=key.private_key, kid="charlie-2026-10")

answer = responder.respond("+441134960456")     # → 200 redirect to Bravo, signed
answer.status, answer.body
responder.keys_document()                         # body for GET {url}/pstn2/v1/keys
```

Serve `answer.body` with `answer.status` at `GET {url}/pstn2/v1/numbers/{digits}`. The
answers match `Network.respond()` in the reference engine exactly.

### Signatures (§9.6)

```python
from pstn2 import canonical_json, sign_body, verify_body
canonical_json(obj)                 # keys sorted at every level, no whitespace, '/' and non-ASCII unescaped
signed = sign_body(body, private_key, kid="bravo-2026-10")
verify_body(signed, public_key_b64) # Ed25519 over canonical_json(body without "signature")
```

With `verify_signatures=True`, every 200 discovery answer must be signed by the
answering CP (key from `{url}/pstn2/v1/keys`, chosen by `kid`, cached per CP); an
unsigned or invalid answer gives `result="error"`, `error="invalid_signature"`.

### HTTP behaviour

Every request sends `User-Agent: pstn2-python-sdk/1.1.0` and `X-PSTN2-Version: 1.1`
(pstn2.org's WAF rejects generic library user agents). Discovery `GET`s carry no body
and no `Content-Type`. JSON is accepted whatever the response `Content-Type`; a 404 with
an HTML body (a static host's default page) means `unknown`.

### Errors

`PSTN2Error` (base, with `.code` and `.status`) → `PSTN2TimeoutError`, `NetworkError`,
`InvalidResponseError`, `ApiError` (`CallNotFoundError`, `TokenExpiredError`,
`InvalidTokenError`, `RateLimitError`), `DiscoveryError` (`.discovery`), `NotHeldError`,
`ValidationError`.

## Examples

| # | File | Shows |
|---|---|---|
| 01 | `examples/01_basic_authentication.py` | Charlie Comms verifies four inbound caller IDs, including a spoofed one and a ported one |
| 02 | `examples/02_direct_routing.py` | Alpha routes to Bravo with codec/SRTP negotiation; two PSTN fallbacks |
| 03 | `examples/03_token_pool.py` | Originating CP creates a token, terminating CP verifies it; forged token falls back to Direct Query |
| 04 | `examples/04_emergency_services.py` | PSAP location query for a held number; fallback for an unknown one |
| 05 | `examples/05_complete_call_flow.py` | Discovery (with redirect) → authentication → routing → summary, then a cache hit |
| 06 | `examples/06_number_discovery.py` | "Who has this number?" hop by hop: scenarios A–G locally, or the dummy test CP with signatures |

```bash
# terminal 1 (repository root)
node test-environment/mock-network/server.mjs

# terminal 2
cd code/python
python examples/01_basic_authentication.py
python examples/05_complete_call_flow.py
python examples/06_number_discovery.py

# 06 against the live dummy test CP (signatures verified)
PSTN2_NETWORK=live python examples/06_number_discovery.py
```

Examples 01–05 need the mock network (the dummy test CP only answers discovery).
Every example exits non-zero if something did not go as expected.

## Live dummy test CP

`https://pstn2.org/testcp/` hosts two fictional CPs as static files, with signed answers:

| Number | Expect |
|---|---|
| `+447700900001`, `+447700900002` | held by Test CP A (unported) |
| `+447700900003` | Test CP A redirects → held by Test CP B (ported) |
| `+447700900004` | held by Test CP A; Test CP B answers `not_held` + invalidate (stale-cache test) |
| `+447700900101` | held by Test CP B (unported) |
| `+447700900099` | 404 from Test CP A (not in service) |

To emulate it locally (same files, same static-host behaviour):

```bash
node tools/testcp/build.mjs --base http://127.0.0.1:47902/testcp --out /tmp/testcp-local
node test-environment/mock-network/static-server.mjs --dir /tmp/testcp-local --port 47902
PSTN2_NUMBERING_LIST_URL=http://127.0.0.1:47902/testcp/numbering-list.json python examples/06_number_discovery.py
```

## Running the tests

```bash
cd code/python
.venv/bin/python -m pytest
```

The suite runs offline. It starts the mock network and a freshly built static emulator
of the dummy test CP on free ports (Node.js required; those tests are skipped without
it) and covers: numbering list matching and ETag/304, cache TTL and purge, canonical JSON
and signatures (including answers signed by the Node build), `RangeHolderResponder`
parity with the reference engine, scenarios A–G in memory and over HTTP, the six test
numbers with signature verification, the WAF user-agent check, and verification /
token pool / routing / emergency including the not_held → rediscover → retry path.

## Further reading

- [SPECIFICATION.md](../../docs/SPECIFICATION.md) — protocol v1.1 (§9 Number Discovery)
- [API-SPECIFICATION.yaml](../../docs/API-SPECIFICATION.yaml) — wire formats
- [IMPLEMENTATION-GUIDE.md](../../docs/IMPLEMENTATION-GUIDE.md) — implementation patterns
- [EXAMPLES.md](../EXAMPLES.md) — examples in all three languages
- [TESTING-SPECIFICATION.md](../../docs/TESTING-SPECIFICATION.md) — test environment and conformance

## License

Public domain: the PSTN2 project is released under CC0 1.0 Universal (commercial
use, modification and distribution allowed; no warranty). The Comms Council UK
logo and branding are excluded. See the project
[LICENSE](https://github.com/njjholland-dot/pstn2/blob/main/LICENSE).
