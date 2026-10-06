# PSTN2 test environment

Everything needed to prove that PSTN2 Number Discovery works: who has this number?
Three Communication Providers are Range Holders with ported numbers, and Ofcom publishes
the numbering list. Implementations must agree on every answer.

There is no Docker and no database. Node, Python and Go are all it needs.

```
test-environment/
  fixtures/                 single source of truth for all tests and demos
    harness-network.json      Ofcom list + three CPs (Alpha, Bravo, Charlie) with ranges,
                              numbers in service, ported-in and ported-out numbers
    scenarios.json            scenarios A–G (unported, ported, cached, invalidated, 404,
                              non-participating, unallocated)
    testcp-network.json       the live dummy test CP at https://pstn2.org/testcp/
  mock-network/
    server.mjs                the three CPs + Ofcom over real HTTP on localhost:
                              discovery, auth, token pool, routing, emergency
    static-server.mjs         emulates the pstn2.org static host (403 for curl/Go user
                              agents, HTML 404s), for testing the dummy test CP locally
  conformance/
    engine.test.mjs           tests for the reference engine
    run.sh                    engine + all three SDK suites + all 18 examples
```

All numbers are from Ofcom's reserved TV/drama ranges, and all CPs are fictional.

## Watch it

The narrated, interactive test harness runs in a browser: **https://pstn2.org/src/test-harness/**.
It uses the same reference engine (`animations/src/test-harness/harness-engine.js`) and the
same fixtures as the tests.

## Run it

```bash
test-environment/conformance/run.sh           # everything (about 2 minutes)
test-environment/conformance/run.sh --quick   # engine + SDK test suites
test-environment/conformance/run.sh --live    # also exercise the live dummy test CP
```

Start the mock network yourself, then run any SDK example against it:

```bash
node test-environment/mock-network/server.mjs            # http://127.0.0.1:47901
cd code/typescript && npm run example:06                  # or examples 01–05
cd code/python && .venv/bin/python examples/06_number_discovery.py
cd code/go && go run ./examples/06-number-discovery
```

Mock network endpoints (CP keys: `alpha`, `bravo`, `charlie`):

| Endpoint | Purpose |
|---|---|
| `GET /numbering-list.json` | Ofcom S1–S9 list + Range Holder URL (ETag/304) |
| `GET /cp/{key}/pstn2/v1/numbers/{digits}` | Number Discovery: `held` / `redirect` / `not_held` / 404 |
| `POST /cp/{key}/pstn2/v1/auth/verify`, `/auth/tokens`, `/routing/request`, `/emergency/location` | Services. A CP that no longer holds the number answers `not_held` + `cache.invalidate` |
| `POST /admin/port {number, fromCpId, toCpId}` · `POST /admin/reset` · `GET /admin/log` | Test control |

## Test your own implementation

Point your client at the live dummy test CP. The test numbers and expected answers are
on https://pstn2.org/testcp/. Send a descriptive `User-Agent`: the host rejects
`curl/*` and `Go-http-client/*`.

To test a Range Holder you have built, serve its answers for the numbers in `harness-network.json`.
Then point a copy of the numbering list at it and run scenarios A–G with any of the SDKs.
