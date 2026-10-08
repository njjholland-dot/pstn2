# PSTN2 Testing Specification

**Version:** 1.1 (protocol v1.1)
**Last Updated:** 2026-10-06
**Status:** Normative

---

## Table of Contents

1. [Testing Philosophy](#testing-philosophy)
2. [Test Levels](#test-levels)
3. [Test Scenarios](#test-scenarios)
4. [Number Discovery Conformance](#number-discovery-conformance)
5. [Performance Testing](#performance-testing)
6. [Security Testing](#security-testing)
7. [Interoperability Testing](#interoperability-testing)
8. [Test Environment](#test-environment)
9. [Certification Process](#certification-process)

---

## 1. Testing Philosophy

### 1.1 Goals

- **Reliability**: 99.9% uptime, < 0.1% packet loss
- **Performance**: < 100ms authentication, < 1s call setup
- **Correct discovery**: every number resolves to the CP that holds it now, or to traditional PSTN, with no central database
- **Interoperability**: Works with all compliant implementations
- **Security**: No vulnerabilities in OWASP Top 10
- **Fallback**: Graceful degradation to traditional PSTN

### 1.2 Test Coverage Requirements

**Minimum Coverage:**
- Unit tests: > 80% code coverage
- Integration tests: All API endpoints, including `GET /pstn2/v1/numbers/{digits}` and `GET /pstn2/v1/keys`
- Number Discovery: scenarios A–G (§3.1) and every requirement in §4
- End-to-end tests: All major user journeys
- Load tests: 100% of expected peak load
- Security tests: All OWASP Top 10

### 1.3 Test Automation

- **CI/CD Integration**: All tests run on every commit (offline: no external network, no Docker)
- **Nightly Builds**: Full test suite + extended scenarios + the live dummy test CP
- **Weekly Load Tests**: Sustained load testing
- **Monthly Security Scans**: Automated vulnerability scanning

### 1.4 Reference Behaviour

The reference Number Discovery engine is
`animations/src/test-harness/harness-engine.js` (the same code drives the
browser test harness and the local mock network). An implementation conforms
when its results, hops and cache behaviour match the engine for every scenario
in `test-environment/fixtures/scenarios.json` and every test number in
`test-environment/fixtures/testcp-network.json`. All three reference SDKs check
this in their test suites.

---

## 2. Test Levels

### 2.1 Unit Tests

Test individual functions/methods in isolation.

**Example Test Cases:**

```typescript
import { NumberingList, canonicalJson, signBody, verifyBody, isE164 } from '@pstn2/core';

// Phone number validation
describe('isE164', () => {
  it('accepts valid E.164 numbers', () => {
    expect(isE164('+441234567890')).toBe(true);
    expect(isE164('+12025551234')).toBe(true);
  });

  it('rejects invalid numbers', () => {
    expect(isE164('441234567890')).toBe(false);  // No +
    expect(isE164('+0123456789')).toBe(false);   // Starts with 0
    expect(isE164('+4')).toBe(false);            // Too short
  });
});

// Numbering list: longest prefix, numberLength must match
describe('NumberingList.findBlock', () => {
  const list = NumberingList.fromObject(fixture.numberingList);
  it('picks the Range Holder block', () => {
    expect(list.findBlock('+441614960123')?.cpId).toBe('CP1-UK-0102');
  });
  it('returns null for an unallocated number', () => {
    expect(list.findBlock('+441154960555')).toBeNull();
  });
});

// Canonical JSON + Ed25519 (SPECIFICATION.md §9.6)
describe('signatures', () => {
  it('canonicalises keys and leaves / unescaped', () => {
    expect(canonicalJson({ b: 1, a: 'x/y' })).toBe('{"a":"x/y","b":1}');
  });

  it('verifies a signed answer and rejects a tampered one', () => {
    const signed = signBody({ result: 'held', number: '+447700900001' }, privateKey, 'test-kid');
    expect(verifyBody(signed, publicKeyBase64)).toBe(true);
    expect(verifyBody({ ...signed, number: '+447700900002' }, publicKeyBase64)).toBe(false);
  });
});
```

### 2.2 Integration Tests

Test interactions between modules, over real HTTP, against the local mock
network (§8.1).

**Test Matrix:**

| Module | Dependency | Test Scenario |
|--------|-----------|---------------|
| Discovery | Numbering list | Longest-prefix block → Range Holder URL |
| Discovery | Range Holder | held, redirect, not_held, 404 |
| Auth | Discovery | Verify at the caller ID's current holder |
| Auth | Messaging | `not_held` → purge → rediscover → retry once |
| Routing | Discovery | Find the destination's holder |
| Routing | Encryption | Exchange identity keys |
| Emergency | Discovery | Location from the caller ID's holder; fallback when none |

**Example:**

```typescript
describe('Authentication follows a ported caller ID', () => {
  let charlie: PSTN2Client;

  beforeEach(() => {
    charlie = new PSTN2Client({ cpId: 'CP1-UK-0103', numberingListUrl: `${mock}/numbering-list.json` });
  });

  afterEach(async () => {
    await charlie.close();
  });

  it('verifies at the holder found by the Range Holder redirect', async () => {
    // +441134960456 is in Charlie's block, ported to Bravo
    const v = await charlie.verifyCall({ callerID: '+441134960456', calledID: '+441134960789' });

    expect(v.discovery.hops).toEqual(['CP1-UK-0103', 'CP1-UK-0102']);
    expect(v.discovery.ported).toBe(true);
    expect(v.holder?.cpId).toBe('CP1-UK-0102');
    expect(v.verified).toBe(true);
  });

  it('retries once at the new holder after not_held', async () => {
    await charlie.verifyCall({ callerID: '+441134960456', calledID: '+441134960789' }); // caches Bravo
    await post(`${mock}/admin/port`, { number: '+441134960456', fromCpId: 'CP1-UK-0102', toCpId: 'CP1-UK-0103' });

    const v = await charlie.verifyCall({ callerID: '+441134960456', calledID: '+441134960789' });
    expect(v.retried).toBe(true);
    expect(v.holder?.cpId).toBe('CP1-UK-0103');
  });
});
```

### 2.3 End-to-End Tests

Test complete user journeys across multiple CPs.

**Journey Map:**

```
Alice (Alpha) calls Bob (+441134960456: Charlie's range, ported to Bravo):
  1. Alice dials Bob
  2. Alpha discovers Bob's CP: cache miss → numbering list → Range Holder Charlie
     → redirect → Bravo → held. Alpha caches +441134960456 → Bravo
  3. Bravo discovers Alice's CP (Alpha) and verifies the caller ID there
  4. Alpha requests routing from Bravo (discovery now from cache)
  5. Bravo provides connection details
  6. Media connection established (DTLS-SRTP)
  7. Bob's phone rings
  8. Bob answers
  9. Encrypted conversation
  10. Call ends
  11. Second call: cache hit, one query straight to Bravo
```

Example 04 in each SDK (`04-complete-call-flow`) is this journey; see
[EXAMPLES.md](https://pstn2.org/docs/EXAMPLES.md).

**Test Code:**

```typescript
describe('End-to-End Call Flow', () => {
  let alpha: PSTN2Client;
  let bravo: PSTN2Client;

  beforeAll(() => {
    const numberingListUrl = `${mock}/numbering-list.json`;
    alpha = new PSTN2Client({ cpId: 'CP1-UK-0101', numberingListUrl });
    bravo = new PSTN2Client({ cpId: 'CP1-UK-0102', numberingListUrl });
  });

  afterAll(async () => {
    await alpha.close();
    await bravo.close();
  });

  it('completes the call', async () => {
    const callReference = alpha.generateCallReference();

    const found = await alpha.discover('+441134960456');
    expect(found.result).toBe('held');
    expect(found.hops).toEqual(['CP1-UK-0103', 'CP1-UK-0102']);

    const verification = await bravo.verifyCall({
      callerID: '+442079460100',
      calledID: '+441134960456',
      callReference,
    });
    expect(verification.verified).toBe(true);

    const routing = await alpha.requestRouting({
      destinationNumber: '+441134960456',
      callerID: '+442079460100',
      callReference,
      mediaCapabilities: { codecs: ['opus'], encryption: ['srtp-aes256'] },
    });
    expect(routing.accepted).toBe(true);
    expect(routing.discovery.fromCache).toBe(true);
    if (routing.accepted) expect(routing.connectionDetails.publicKey).toBeDefined();
  });
});
```

---

## 3. Test Scenarios

### 3.1 Number Discovery Scenarios A–G

Defined in `test-environment/fixtures/scenarios.json` and run **in order, with
one client whose cache persists between steps**, by the browser test harness,
the reference engine tests, the mock-network integration tests of every SDK,
and example 05 in every SDK. The acting CP is Alpha Telecom (`CP1-UK-0101`).

| | Scenario | Number | Expected result | Expected hops | Flags |
|---|---|---|---|---|---|
| A | Unported number | +441614960123 | `held` by Bravo `CP1-UK-0102`, `ported: false` | `[CP1-UK-0102]` | `fromCache: false` |
| B | Ported number (Range Holder redirects) | +441134960456 | `held` by Bravo, `ported: true` | `[CP1-UK-0103, CP1-UK-0102]` | `fromCache: false` |
| C | Repeat call goes direct from cache | +441134960456 | `held` by Bravo, `ported: true` | `[CP1-UK-0102]` | `fromCache: true` |
| D | Number ports back: stale cache is invalidated (first port Bravo → Charlie) | +441134960456 | `held` by Charlie `CP1-UK-0103`, `ported: false` | `[CP1-UK-0102, CP1-UK-0103]` | `fromCache: false`, `invalidated: true` |
| E | Number not in service | +441614960999 | `unknown` (404) | `[CP1-UK-0102]` | |
| F | Range Holder not participating (Delta Voice, no URL) | +441174960555 | `not_participating` | `[]` | |
| G | Number not allocated | +441154960555 | `unallocated` | `[]` | |

For scenario D the test first ports the number: `network.port()` in the
engine, or `POST /admin/port {"number":"+441134960456","fromCpId":"CP1-UK-0102","toCpId":"CP1-UK-0103"}`
on the mock network.

### 3.2 Happy Path Scenarios

#### 3.2.1 Simple Call (No Porting)

```
Given: Alice (+442079460100 at Alpha) calls +441614960123 (Bravo's range, unported)
When: Call is placed
Then:
  - Discovery: held by Bravo in 1 query
  - Authentication succeeds in < 100ms
  - Routing succeeds in < 200ms
  - Total call setup < 1s
  - Media connection established
```

#### 3.2.2 Call to a Ported Number

```
Given: +441134960456 is in Charlie's block and has been ported to Bravo
When: Alpha places a call to it
Then:
  - Charlie (Range Holder) answers 200 redirect → Bravo
  - Bravo answers 200 held, ported: true
  - Alpha caches the answer for that one number only
  - Routing request goes to Bravo
  - The next call goes straight to Bravo (1 query)
```

#### 3.2.3 Call with Branding

```
Given: ACME Support (+441234567890) calls customer (+447700900123)
And: ACME has branding configured
When: Call is placed
Then:
  - Branding information included in verification response
  - Customer sees "ACME Support" with logo
  - Call purpose: "Account Security Alert"
```

#### 3.2.4 Emergency Call

```
Given: User (+441614960123) dials 999
When: PSAP queries location
Then:
  - Discovery finds the caller ID's current holder (Bravo)
  - GPS location returned with ±15m accuracy
  - Response time < 100ms
```

### 3.3 Error Scenarios

#### 3.3.1 Call Not Found (Fraud)

```
Given: Scammer spoofs caller ID +441614960123
When: Recipient CP verifies the call with Bravo (the holder)
Then:
  - Verification returns 404 call_not_found
  - verified: false
  - Recipient can block/warn user
```

#### 3.3.2 Spoofed Caller ID Not in Service

```
Given: Inbound call presents +441614960999 (not in service)
When: Recipient CP discovers the caller ID
Then:
  - Bravo (Range Holder) answers 404 → result unknown
  - verified: false, call flagged as possible spoofing
  - Handled with traditional PSTN treatment
```

#### 3.3.3 Stale Cache (Number Ported Again)

```
Given: Alpha cached +441134960456 → Bravo
And: The number has since ported back to Charlie
When: Alpha sends a request for that number to Bravo
Then:
  - Bravo answers 200 {"result":"not_held","cache":{"invalidate":true,"scope":"number"}}
  - Alpha purges the cache entry and rediscovers from the Range Holder (Charlie)
  - Charlie answers held; Alpha retries the request at Charlie once
  - The call succeeds; the stale entry cost one extra query
```

#### 3.3.4 CP Unavailable

```
Given: Bravo is down for maintenance
When: Alpha tries to verify a call with Bravo
Then:
  - Request times out after 2s
  - Client retries 3 times with backoff (100/200/400 ms)
  - Falls back to traditional PSTN
  - User call still connects (via PSTN)
```

#### 3.3.5 Invalid Signature

```
Given: An attacker returns a discovery answer with an invalid signature
       (or a request arrives with an invalid signature)
When: The client (or CP) verifies it
Then:
  - Discovery result: error / invalid_signature → traditional PSTN
  - A request with a bad signature gets 401 Unauthorized
  - Logged as potential attack
  - No further processing
```

### 3.4 Edge Cases

#### 3.4.1 Redirect Loop

```
Given: Misconfiguration: Charlie redirects to Bravo, Bravo redirects to Charlie
When: Client discovers the number
Then:
  - The second visit to Charlie is detected
  - Result: error / loop_detected
  - Falls back to traditional PSTN
```

#### 3.4.2 Hop Limit

```
Given: A chain of redirects, each to a new CP
When: Client discovers the number
Then:
  - Stops after 5 queries
  - Result: error / hop_limit_exceeded (exactly 5 hops recorded)
  - Falls back to traditional PSTN
```

#### 3.4.3 Clock Skew

```
Given: CP1 clock is 45 seconds ahead
When: CP2 receives an auth/routing request with a future timestamp
Then:
  - Timestamp validation fails
  - Returns 400 Bad Request
  - Error: "timestamp_out_of_range"
  - CP1 should sync clock (NTP)
  (Discovery GETs carry no timestamp and are not affected)
```

#### 3.4.4 Concurrent Calls

```
Given: 1000 concurrent calls between CP1 and CP2
When: All calls authenticate simultaneously
Then:
  - All verifications complete successfully
  - 95th percentile latency < 150ms
  - No rate limit errors
  - No connection pool exhaustion
  - Concurrent discoveries of the same number leave one consistent cache entry
```

---

## 4. Number Discovery Conformance

These requirements are normative (SPECIFICATION.md §9, §5.1.2, §10.3).

### 4.1 Discovery Client

| ID | Requirement | Verified by |
|---|---|---|
| ND-C01 | Match the numbering list by **longest prefix** whose `numberLength` equals the number's digit count; no match → `unallocated`, no query sent | Scenario G |
| ND-C02 | Block with empty/absent `rangeHolderUrl` → `not_participating`, no query sent | Scenario F |
| ND-C03 | `held` → cache `number → holder` for `cache.ttl` (default 86400 s); hops `[holder]` | Scenario A |
| ND-C04 | `redirect` (from the Range Holder) → query `portedTo.url`; result `ported: true`; hops `[Range Holder, holder]` | Scenario B, test number 003 |
| ND-C05 | Unexpired cache entry → query the cached holder first; `fromCache: true` | Scenario C |
| ND-C06 | `not_held` → purge the entry, restart from the numbering list (Range Holder); `invalidated: true` | Scenario D, test number 004 |
| ND-C07 | `404`, with a JSON body, an HTML body or none → `unknown` | Scenario E, test number 099 |
| ND-C08 | At most **5** queries per discovery → `error` / `hop_limit_exceeded` | Engine and SDK unit tests |
| ND-C09 | The same CP reached twice in one discovery → `error` / `loop_detected` | Engine and SDK unit tests |
| ND-C10 | Expired cache entries are never used | Engine and SDK unit tests |
| ND-C11 | Cache **per number only**; never apply a port to a block | Scenario C/D, cache inspection |
| ND-C12 | With signature verification on, every `200` answer must carry `kid` + `signature` valid for the answering CP's key from `{url}/pstn2/v1/keys`; unsigned, unknown-`kid` or tampered → `error` / `invalid_signature`. `404` needs no signature | Dummy test CP (signed), tamper tests |
| ND-C13 | Canonical JSON: keys sorted at every level, no insignificant whitespace, `/` and non-ASCII unescaped | Verify every file built by `tools/testcp/build.mjs` |
| ND-C14 | Every request sends a descriptive `User-Agent` (never `curl/*`, `Go-http-client/*` or empty) and `X-PSTN2-Version: 1.1`; discovery `GET`s carry no body and no `Content-Type` | Static emulator returns 403 for generic agents |
| ND-C15 | Responses are parsed as JSON whatever their `Content-Type` (static hosts may send `application/octet-stream`) | Static emulator |
| ND-C16 | The numbering list is refreshed with `If-None-Match`; `304` keeps the local copy; a `cache.scope: "block"` invalidation triggers a refresh | Unit tests, mock network ETag |
| ND-C17 | A `not_held` answer on **any** service endpoint (auth/verify, routing, emergency) → purge, rediscover, retry **once** at the new holder | Mock network after `POST /admin/port` |
| ND-C18 | A redirect or `not_held` is a `200` result, never retried against the same CP; only `503`/`504`/network errors are retried (100/200/400 ms, max 3) | Unit tests |
| ND-C19 | Every non-`held` outcome and every failure leads to traditional PSTN handling; discovery never blocks a call | Scenarios E–G, unreachable CP |

### 4.2 Discovery Responder (Range Holder / Holder)

| ID | Requirement |
|---|---|
| ND-S01 | Serve `GET {url}/pstn2/v1/numbers/{e164digits}` (digits without `+`) |
| ND-S02 | Range Holder, number ported out → `200` `{"result":"redirect","portedTo":{cpId,cpName,url}}` |
| ND-S03 | Number served (in service from own range) → `200` `held`, `ported: false`; ported in → `held`, `ported: true` |
| ND-S04 | Number not served but previously held, or in another participating Range Holder's block → `200` `not_held` + `"cache":{"invalidate":true,"scope":"number"}` |
| ND-S05 | No record → `404` (body optional, `{"result":"unknown"}` recommended) |
| ND-S06 | `200` answers carry `version: "1.1"`, `number`, `cache.ttl` (held/redirect), `issued`, and SHOULD carry `kid` + `signature` |
| ND-S07 | Publish keys at `GET {url}/pstn2/v1/keys` (`kid`, `algorithm: ed25519`, raw 32-byte `publicKey` base64, `validFrom`, `validTo`) |
| ND-S08 | Every service endpoint answers `not_held` + `cache.invalidate` for numbers this CP does not hold |
| ND-S09 | Answers match the reference engine's `Network.respond()` for every CP × number in `harness-network.json` and `testcp-network.json` |
| ND-S10 | Answers reveal nothing beyond holder identity and URL (§9.7) |
| ND-S11 | Sustain ≥ 200 discovery requests/second (§11.2) |

### 4.3 Checking an Implementation

1. Run scenarios A–G (§3.1) against the local mock network with one client.
2. Run the six test numbers (§8.4) against the dummy test CP (or its local
   emulator) with signature verification **on**, including the stale-cache
   case for 004 (pre-seed the cache with Test CP B).
3. Run the hop-limit, loop, expiry and tamper tests with an in-memory
   transport.
4. For a responder, compare its answers with `Network.respond()` for every CP ×
   number in both fixtures.

---

## 5. Performance Testing

### 5.1 Load Test Scenarios

#### 5.1.1 Sustained Load

**Target:** 100 requests/second for 10 minutes

```
Scenario: Authentication Load
  Ramp up: 0 → 100 RPS over 1 minute
  Sustain: 100 RPS for 10 minutes
  Ramp down: 100 → 0 RPS over 1 minute

Success Criteria:
  ✓ 0% error rate
  ✓ p95 latency < 100ms
  ✓ p99 latency < 200ms
  ✓ CPU < 70%
  ✓ Memory < 512MB
```

#### 5.1.2 Discovery Load

**Target:** 200 discovery requests/second against your numbers endpoint

```
Scenario: Number Discovery Load
  Mix: 70% held, 10% redirect, 5% not_held, 15% 404
  Sustain: 200 RPS for 10 minutes

Success Criteria:
  ✓ p95 latency < 50ms per request
  ✓ Answers unchanged under load (signatures still verify)
```

#### 5.1.3 Spike Test

**Target:** Sudden traffic spike (10x normal)

```
Scenario: Traffic Spike
  Normal: 10 RPS for 2 minutes
  Spike: 100 RPS for 1 minute
  Normal: 10 RPS for 2 minutes

Success Criteria:
  ✓ No requests dropped
  ✓ p95 latency < 150ms during spike
  ✓ Recovery time < 10s
  ✓ No memory leaks
```

#### 5.1.4 Soak Test

**Target:** 24-hour sustained load

```
Scenario: 24-Hour Soak
  Load: 20 RPS for 24 hours
  Total requests: ~1.7M

Success Criteria:
  ✓ 0% error rate
  ✓ No memory leaks (number cache bounded, steady memory usage)
  ✓ No connection leaks
  ✓ Consistent latency (no degradation)
  ✓ Numbering list refreshed (304) at least once
```

### 5.2 Latency Requirements

| Operation | Target | Maximum |
|-----------|--------|---------|
| Number Discovery cache / numbering-list lookup (local) | < 1ms | 5ms |
| Number Discovery (per network hop) | 20ms | 50ms |
| Authentication (holder cached) | 50ms | 100ms |
| Authentication (discovery needed) | 80ms | 150ms |
| Routing request | 100ms | 200ms |
| Emergency location | 80ms | 150ms |
| **Total call setup** | **400ms** | **1000ms** |

### 5.3 Throughput Requirements

| Metric | Minimum | Target |
|--------|---------|--------|
| Auth requests/sec | 100 | 500 |
| Routing requests/sec | 50 | 200 |
| Discovery requests/sec | 200 | 1000 |
| Concurrent calls | 1000 | 5000 |
| Numbering list held locally | full national list (≈ 1M blocks) | full national list |

---

## 6. Security Testing

### 6.1 OWASP Top 10

#### 6.1.1 Injection

**Test Cases:**
```
SQL Injection:
  Input: callerID = "'+DROP TABLE users--"
  Expected: Rejected with 400 Bad Request

Path Injection (discovery):
  Input: GET /pstn2/v1/numbers/..%2F..%2Fetc%2Fpasswd
  Expected: 404 (only digits are accepted in the path segment)

Command Injection:
  Input: callReference = "123; rm -rf /"
  Expected: Rejected with 400 Bad Request

NoSQL Injection:
  Input: { callerID: { "$ne": null } }
  Expected: Rejected with 400 Bad Request
```

#### 6.1.2 Broken Authentication

**Test Cases:**
```
Missing Signature:
  Request without signature field
  Expected: 401 Unauthorized

Invalid Signature:
  Request with random signature
  Expected: 401 Unauthorized

Replay Attack:
  Same signed request sent twice
  Expected: First succeeds, second rejected (duplicate messageId, REPLAY_DETECTED)

Signature Tampering:
  Valid signature, modified payload
  Expected: 401 Unauthorized

Tampered Discovery Answer (client side):
  A signed "held" answer with holder.url changed
  Expected: error / invalid_signature, traditional PSTN

Unsigned Discovery Answer (verification on):
  Expected: error / invalid_signature

Unknown kid:
  Answer signed with a key not in {url}/pstn2/v1/keys
  Expected: error / invalid_signature
```

#### 6.1.3 Sensitive Data Exposure

**Test Cases:**
```
TLS Enforcement:
  HTTP request to API
  Expected: Redirect to HTTPS or connection refused

Discovery Data Minimisation:
  GET /pstn2/v1/numbers/{digits} for every answer type
  Expected: only result, number, holder/portedTo identity and URL, cache, issued, kid, signature

Log Inspection:
  Check logs for private keys, passwords
  Expected: No sensitive data in logs

Error Messages:
  Invalid request
  Expected: Generic error, no stack traces in production
```

### 6.2 Penetration Testing

**Annual External Audit:**
- OWASP ZAP automated scan
- Manual penetration test by security firm
- Social engineering test (phishing simulation)
- Physical security audit (if applicable)

**Quarterly Internal Scans:**
- Nessus vulnerability scan
- Dependency security check (Snyk, npm audit, pip-audit, govulncheck)
- Secret scanning (GitGuardian, TruffleHog)

### 6.3 Fuzzing

**Tools:** AFL, LibFuzzer, Go native fuzzing (`go test -fuzz`)

**Targets:**
- Phone number parser
- RCPID validator
- JSON parser
- Discovery answer parser (all result types, malformed `portedTo`, missing fields)
- Canonical JSON and signature verification
- Numbering list loader (JSON and CSV)
- Timestamp parser

**Duration:** 24-hour continuous fuzzing

**Success Criteria:**
- No crashes
- No infinite loops (hop limit always enforced)
- No memory leaks
- All invalid inputs rejected gracefully

---

## 7. Interoperability Testing

### 7.1 Multi-Vendor Testing

**Setup:**
- Implementation A (TypeScript)
- Implementation B (Python)
- Implementation C (Go)

Each SDK's `RangeHolderResponder` can play a CP's server side, so any SDK's
client can be pointed at any SDK's responder.

**Test Matrix:**

| Caller | Recipient | Test | Status |
|--------|-----------|------|--------|
| A → B | Auth + Routing | Direct holder | ✓ Pass |
| B → C | Auth + Routing | Direct holder | ✓ Pass |
| C → A | Auth + Routing | Direct holder | ✓ Pass |
| A → B (Range Holder) → C (holder) | Discovery | Redirect for a ported number | ✓ Pass |
| A (stale cache: B) → C | Discovery | `not_held` + invalidate | ✓ Pass |
| Any client → signed responder of another SDK | Signatures | Canonical JSON identical | ✓ Pass |

### 7.2 Version Compatibility

**Test Scenarios:**
```
Client (v1.1) → Server (v1.1):
  Expected: All features work

Client (v1.1) → CP without PSTN2 (no Range Holder URL in the list):
  Expected: not_participating → traditional PSTN

v1.0 implementations (central lookup endpoints):
  Not interoperable with v1.1 Number Discovery; upgrade required.
  v1.1 clients discover holders only through /pstn2/v1/numbers/{digits}.
```

### 7.3 Conformance Testing

**Certification Suite:**
1. Run the conformance requirements in §4 and scenarios A–G
2. Run the six dummy test CP numbers with signatures verified
3. Submit results to the PSTN2 certification authority
4. Receive compliance certificate if all mandatory tests pass

**Test Categories:**
- Message format compliance
- Number Discovery client (ND-C01 to ND-C19)
- Number Discovery responder (ND-S01 to ND-S11)
- Signature verification
- Error handling and fallback
- Performance
- Security

---

## 8. Test Environment

Everything below runs offline on a laptop with Node.js 20+ (no npm packages,
no Docker), except §8.4, which is the live dummy test CP on pstn2.org.

### 8.1 Local Mock Network

[`test-environment/mock-network/server.mjs`](https://github.com/njjholland-dot/pstn2/blob/main/test-environment/mock-network/server.mjs)
serves a fixture network over real HTTP on localhost, using the reference
discovery engine:

```bash
node test-environment/mock-network/server.mjs                     # http://127.0.0.1:47901
node test-environment/mock-network/server.mjs --port 47931        # or PSTN2_MOCK_PORT=47931
node test-environment/mock-network/server.mjs --fixture testcp    # the dummy test CP numbers, unsigned
```

The default fixture (`test-environment/fixtures/harness-network.json`) is a
simulated Ofcom numbering list with four blocks and three participating CPs:

| CP | cpId | Range Holder for | In service | Ported |
|---|---|---|---|---|
| Alpha Telecom | `CP1-UK-0101` | 020 7946 0xxx (`442079460`) | +442079460100, +442079460101, +442079460222 | +442079460321 out → Charlie |
| Bravo Networks | `CP1-UK-0102` | 0161 496 0xxx (`441614960`) | +441614960123, +441614960500 | +441134960456 in ← Charlie |
| Charlie Comms | `CP1-UK-0103` | 0113 496 0xxx (`441134960`) | +441134960789, +441134960900 | +441134960456 out → Bravo; +442079460321 in ← Alpha |
| Delta Voice | `CP1-UK-0104` | 0117 496 0xxx (`441174960`) | (not participating: no Range Holder URL) | |

Each CP's URL in the served list is rewritten to
`http://127.0.0.1:{port}/cp/{key}` (`alpha`, `bravo`, `charlie`).

**Endpoints:**

| Endpoint | Behaviour |
|---|---|
| `GET /numbering-list.json` | The list, with `ETag`; `304` on `If-None-Match` |
| `GET /cp/{key}/pstn2/v1/numbers/{digits}` | held / redirect / not_held / 404, from the engine |
| `GET /cp/{key}/pstn2/v1/keys` | Empty key set (mock answers are unsigned) |
| `POST /cp/{key}/pstn2/v1/auth/verify` | Verified for any number the CP holds; otherwise `200 not_held` + invalidate |
| `POST /cp/{key}/pstn2/v1/routing/request` | Accepted with `media.{key}.example:5061/tls`; `400 unsupported_codec` if no common codec; `not_held` for numbers not held |
| `POST /cp/{key}/pstn2/v1/emergency/location` | Fixed mock location (Manchester); `not_held` for numbers not held |
| `POST /admin/port` `{number, fromCpId, toCpId}` | Port a number (scenario D, invalidation tests) |
| `POST /admin/reset` | Reload the fixture, clear the log, change the list ETag |
| `GET /admin/log` | Every query received, in order, with the caller's `User-Agent` |
| `GET /health` | `{ok: true, fixture}` |

### 8.2 Static Test-CP Emulator

[`test-environment/mock-network/static-server.mjs`](https://github.com/njjholland-dot/pstn2/blob/main/test-environment/mock-network/static-server.mjs)
serves a directory the way the pstn2.org static host does, so the dummy test
CP can be tested before (or without) deploying it:

- extensionless files (discovery answers, keys) → `application/json`
- missing files → `404` with an HTML body (a static host's default page)
- no `User-Agent`, `curl/*` or `Go-http-client/*` → `403` (the host's WAF)

```bash
# Build the signed test CP site for a local base URL (keys from $PSTN2_TESTCP_KEYS,
# else tools/testcp/.keys.json, generated if missing; never commit them)
node tools/testcp/build.mjs --base http://127.0.0.1:47902/testcp --out /tmp/testcp-local

# Serve it
node test-environment/mock-network/static-server.mjs --dir /tmp/testcp-local --port 47902

# Point an SDK example at it
PSTN2_NUMBERING_LIST_URL=http://127.0.0.1:47902/testcp/numbering-list.json npm run example:05
```

### 8.3 Browser Test Harness

https://pstn2.org/src/test-harness/ runs the reference engine in the browser
(`animations/src/test-harness/`). A narrated tour shows Ofcom's list, the three
CPs' number databases and caches, and plays scenarios A–F; the final "Your
turn" scene lets you choose the calling CP, discover any number, port a number
and reset the network, showing every request and answer. Its
`harness-network.json` and `scenarios.json` must be identical to the copies in
`test-environment/fixtures/` (checked by the conformance tests).

### 8.4 Live Dummy Test CP

https://pstn2.org/testcp/ hosts two fictional CPs as static files with
**signed** answers, for testing any implementation against a real web host.
Numbers are from Ofcom's reserved drama range 07700 900xxx; the list is a test
list, not Ofcom data.

| | Value |
|---|---|
| Numbering list | `https://pstn2.org/testcp/numbering-list.json` (also `.csv`) |
| Test CP A | `CP1-UK-9001`, Range Holder for 07700 900 0xx (`4477009000`), `https://pstn2.org/testcp/a`, kid `a-test-2026-10` |
| Test CP B | `CP1-UK-9002`, Range Holder for 07700 900 1xx (`4477009001`), `https://pstn2.org/testcp/b`, kid `b-test-2026-10` |
| Keys | `{url}/pstn2/v1/keys` |

**Test numbers** (from `test-environment/fixtures/testcp-network.json`):

| Number | Expected result | Expected hops |
|---|---|---|
| +447700900001 | held by Test CP A (unported) | `[CP1-UK-9001]` |
| +447700900002 | held by Test CP A (unported) | `[CP1-UK-9001]` |
| +447700900003 | Test CP A redirects → held by Test CP B (ported) | `[CP1-UK-9001, CP1-UK-9002]` |
| +447700900004 | held by Test CP A; querying Test CP B directly returns `not_held` + invalidate (stale-cache test: pre-seed the cache with Test CP B) | `[CP1-UK-9002, CP1-UK-9001]`, `invalidated: true` |
| +447700900101 | held by Test CP B (unported) | `[CP1-UK-9002]` |
| +447700900099 | 404 from Test CP A (not in service) → `unknown` | `[CP1-UK-9001]` |

```bash
# By hand (always send a descriptive User-Agent: the WAF rejects curl's default)
curl -A "pstn2-curl/1.1" https://pstn2.org/testcp/a/pstn2/v1/numbers/447700900003   # redirect → B
curl -A "pstn2-curl/1.1" https://pstn2.org/testcp/b/pstn2/v1/numbers/447700900003   # held

# With the SDKs (signatures verified by default in live mode)
cd code/typescript && PSTN2_NETWORK=live npm run example:05
cd code/python && PSTN2_NETWORK=live .venv/bin/python examples/05_number_discovery.py
cd code/go && PSTN2_NETWORK=live go run ./examples/05-number-discovery
```

The host is static, so only Number Discovery is available there;
authentication, routing and emergency are tested against the mock network.
If `numbering-list.json` itself returns 404, the test CP has not been
deployed: use the emulator (§8.2), which serves the same files.

### 8.5 Fixtures

| File | Contents |
|---|---|
| `test-environment/fixtures/harness-network.json` | The 3-CP network + Delta, used by the mock network, the harness and the SDK tests |
| `test-environment/fixtures/scenarios.json` | Scenarios A–G with expected result, holder, ported, fromCache, invalidated and hops |
| `test-environment/fixtures/testcp-network.json` | The dummy test CP network, its numbering list and the six test numbers |

### 8.6 Test Suites and How to Run Them

| Suite | Command | Covers |
|---|---|---|
| Reference engine | `node --test test-environment/conformance/engine.test.mjs` | Scenarios A–G, event sequence, responder answers, hop limit, loops, cache expiry, longest prefix, test CP numbers, fixture drift between harness and `fixtures/` |
| TypeScript SDK | `cd code/typescript && npm ci && npm test` (`npm run test:unit`, `npm run test:integration`, `npm run test:coverage`) | Numbering list (ETag/304, refresh), cache, canonical JSON + Ed25519 (every file from `build.mjs`), responder parity with `Network.respond()`, discovery parity with the engine (A–G, events), hop limit, loops, timeouts, signatures; mock network A–G; auth/routing/emergency incl. not_held retry; static emulator: six test numbers signed, stale cache, tamper, WAF 403 |
| Python SDK | `cd code/python && python3 -m venv .venv && .venv/bin/pip install -e '.[dev]' && .venv/bin/pytest` | Same coverage; tests needing Node.js are skipped without it |
| Go SDK | `cd code/go && go test ./...` (also `go vet ./...`, `go test -race ./pkg/pstn2`) | Same coverage plus concurrency; integration tests skipped without `node` on `PATH` |

The SDK suites start the mock network and a freshly built static emulator on
free ports themselves (temporary keys), so they need no running services.

### 8.7 CI/CD Pipeline

```yaml
# .github/workflows/test.yml
name: Test Suite

on: [push, pull_request]

jobs:
  conformance:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: node --test test-environment/conformance/engine.test.mjs

  typescript:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node: [20, 22]
    defaults:
      run:
        working-directory: code/typescript
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
      - run: npm ci
      - run: npm run build
      - run: npm test
      - run: npm run typecheck:examples

  python:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        python: ['3.11', '3.12', '3.13']
    defaults:
      run:
        working-directory: code/python
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4      # mock network for the integration tests
        with:
          node-version: 20
      - uses: actions/setup-python@v5
        with:
          python-version: ${{ matrix.python }}
      - run: python -m venv .venv && .venv/bin/pip install -e '.[dev]'
      - run: .venv/bin/pytest

  go:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        go: ['1.21', 'stable']
    defaults:
      run:
        working-directory: code/go
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4      # mock network for the integration tests
        with:
          node-version: 20
      - uses: actions/setup-go@v5
        with:
          go-version: ${{ matrix.go }}
      - run: go vet ./...
      - run: go test -race ./...

  live-testcp:                           # nightly: the deployed dummy test CP
    if: github.event_name == 'schedule'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci && PSTN2_NETWORK=live npm run example:05
        working-directory: code/typescript
```

---

## 9. Certification Process

### 9.1 Self-Certification

**Steps:**
1. Run the conformance suite locally (§4, §8.6)
2. Generate test report
3. Submit report to certification portal
4. Receive preliminary certification

**Timeline:** 1-2 days

### 9.2 Independent Verification

**Steps:**
1. Deploy to test environment, with your numbers endpoint reachable
2. Certification authority runs tests remotely (discovery against your responder, your client against the dummy test CP)
3. Manual inspection of results
4. Issue official certificate

**Timeline:** 1-2 weeks

**Cost:** Free for open-source implementations

### 9.3 Certification Levels

**Level 1 - Basic:**
- Caller authentication (direct query)
- Routing
- Number Discovery: client (ND-C01 to ND-C19) and responder (ND-S01 to ND-S11)
- Fallback to PSTN

**Level 2 - Advanced:**
- Level 1 requirements
- Emergency services
- Call branding
- Signed discovery answers

**Level 3 - Production:**
- Level 2 requirements
- Performance benchmarks met
- Security audit passed
- 99.9% uptime demonstrated

### 9.4 Recertification

**Frequency:** Annually

**Triggers:**
- Major version upgrade
- Security incident
- Compliance issues
- Regulatory changes (including changes to the numbering list format)

---

## Appendix A: Test Report Template

```markdown
# PSTN2 Test Report

**Implementation:** {Name}
**Version:** {Version}
**Protocol:** 1.1
**Date:** {YYYY-MM-DD}
**Tester:** {Name}

## Summary

- Total Tests: 247
- Passed: 245 (99.2%)
- Failed: 2 (0.8%)
- Skipped: 0

## Test Results by Category

### Unit Tests (80/80 passed)
- Phone number validation: ✓ Pass
- Numbering list longest-prefix match: ✓ Pass
- Canonical JSON and signatures: ✓ Pass
- Timestamp validation: ✓ Pass
...

### Number Discovery (37/37 passed)
- Scenarios A–G (mock network): ✓ Pass
- Dummy test CP, six numbers, signatures verified: ✓ Pass
- Hop limit / loop detection: ✓ Pass
- not_held retry on auth, routing, emergency: ✓ Pass
...

### Integration Tests (65/65 passed)
- Auth + Discovery: ✓ Pass
- Routing + Encryption: ✓ Pass
...

### Performance Tests (45/47 passed)
- Authentication latency: ✓ Pass (p95: 87ms)
- Sustained load: ✓ Pass (100 RPS for 10 min)
- Spike test: ✗ Fail (p99: 250ms, target: 200ms)
...

### Security Tests (20/20 passed)
- SQL injection: ✓ Pass
- Signature verification: ✓ Pass
...

## Failed Tests

### 1. Spike Test - p99 Latency
**Expected:** < 200ms
**Actual:** 250ms
**Root Cause:** Connection pool exhaustion
**Remediation:** Increase pool size to 100

### 2. [Test Name]
...

## Certification Recommendation

☐ Not Ready
☑ Ready for Level 1 Certification
☐ Ready for Level 2 Certification
☐ Ready for Level 3 Certification

**Comments:**
Implementation is solid with minor performance tuning needed.
Recommend addressing spike test failure before production deployment.
```

---

## Appendix B: Load Test Script (k6)

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';
import { uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

const errorRate = new Rate('errors');

export let options = {
  stages: [
    { duration: '1m', target: 10 },   // Warm up
    { duration: '1m', target: 100 },  // Ramp to target
    { duration: '10m', target: 100 }, // Sustain
    { duration: '1m', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<100', 'p(99)<200'],
    errors: ['rate<0.01'], // < 1% errors
  },
};

const BASE_URL = __ENV.BASE_URL || 'https://api.test.example.com';
const UA = 'pstn2-k6-loadtest/1.1';

export default function () {
  // Number Discovery: bodyless GET, descriptive User-Agent
  const digits = `4477009000${String(__VU % 10).padStart(2, '0')}`;
  const d = http.get(`${BASE_URL}/pstn2/v1/numbers/${digits}`, {
    headers: { 'User-Agent': UA, 'X-PSTN2-Version': '1.1' },
  });
  const discoveryOk = check(d, {
    'discovery 200 or 404': (r) => r.status === 200 || r.status === 404,
    'discovery result present': (r) => r.status === 404 || JSON.parse(r.body).result !== undefined,
  });

  // Authentication
  const payload = JSON.stringify({
    messageId: uuidv4(),
    timestamp: new Date().toISOString(),
    version: '1.1',
    requestingCP: 'CP1-UK-0001',
    callerID: `+4412345678${String(__VU % 100).padStart(2, '0')}`,
    calledID: '+447700900123',
    callReference: uuidv4(),
    signature: 'mock-signature-for-load-test',
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': UA,
      'X-PSTN2-Version': '1.1',
      'X-PSTN2-CP-ID': 'CP1-UK-0001',
    },
  };

  const response = http.post(`${BASE_URL}/pstn2/v1/auth/verify`, payload, params);

  const authOk = check(response, {
    'status is 200': (r) => r.status === 200,
    'response time OK': (r) => r.timings.duration < 200,
    'verified field present': (r) => JSON.parse(r.body).verified !== undefined,
  });

  errorRate.add(!(discoveryOk && authOk));

  sleep(1); // 1 second between iterations per VU
}
```

---

**Document Status:** Normative Specification
**Compliance Required:** Yes for certification
**Feedback:** https://github.com/njjholland-dot/pstn2/issues
