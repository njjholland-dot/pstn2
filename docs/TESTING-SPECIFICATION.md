# PSTN2 Testing Specification

**Version:** 1.0
**Last Updated:** 2025-11-30
**Status:** Normative

---

## Table of Contents

1. [Testing Philosophy](#testing-philosophy)
2. [Test Levels](#test-levels)
3. [Test Scenarios](#test-scenarios)
4. [Performance Testing](#performance-testing)
5. [Security Testing](#security-testing)
6. [Interoperability Testing](#interoperability-testing)
7. [Test Environment](#test-environment)
8. [Certification Process](#certification-process)

---

## 1. Testing Philosophy

### 1.1 Goals

- **Reliability**: 99.9% uptime, < 0.1% packet loss
- **Performance**: < 100ms authentication, < 1s call setup
- **Interoperability**: Works with all compliant implementations
- **Security**: No vulnerabilities in OWASP Top 10
- **Fallback**: Graceful degradation to traditional PSTN

### 1.2 Test Coverage Requirements

**Minimum Coverage:**
- Unit tests: > 80% code coverage
- Integration tests: All API endpoints
- End-to-end tests: All major user journeys
- Load tests: 100% of expected peak load
- Security tests: All OWASP Top 10

### 1.3 Test Automation

- **CI/CD Integration**: All tests run on every commit
- **Nightly Builds**: Full test suite + extended scenarios
- **Weekly Load Tests**: Sustained load testing
- **Monthly Security Scans**: Automated vulnerability scanning

---

## 2. Test Levels

### 2.1 Unit Tests

Test individual functions/methods in isolation.

**Example Test Cases:**

```typescript
// Phone number validation
describe('PhoneNumber.validate', () => {
  it('should accept valid E.164 numbers', () => {
    expect(validatePhoneNumber('+441234567890')).toBe(true);
    expect(validatePhoneNumber('+12025551234')).toBe(true);
  });

  it('should reject invalid numbers', () => {
    expect(validatePhoneNumber('441234567890')).toBe(false);  // No +
    expect(validatePhoneNumber('+0123456789')).toBe(false);   // Starts with 0
    expect(validatePhoneNumber('+44')).toBe(false);           // Too short
  });
});

// Signature generation
describe('generateSignature', () => {
  const privateKey = '...base64...';
  const payload = { messageId: '123', timestamp: '2025-11-30T21:00:00.000Z' };

  it('should generate valid signature', () => {
    const signature = generateSignature(privateKey, payload);
    expect(signature).toHaveLength(88);  // Base64 Ed25519 signature length
    expect(verifySignature(getPublicKey(privateKey), payload, signature)).toBe(true);
  });

  it('should reject tampered payload', () => {
    const signature = generateSignature(privateKey, payload);
    payload.timestamp = '2025-11-30T22:00:00.000Z';  // Tamper
    expect(verifySignature(getPublicKey(privateKey), payload, signature)).toBe(false);
  });
});
```

### 2.2 Integration Tests

Test interactions between modules.

**Test Matrix:**

| Module | Dependency | Test Scenario |
|--------|-----------|---------------|
| Auth | Directory | Lookup CP for verification |
| Auth | Messaging | Send verification request |
| Routing | Directory | Find destination CP |
| Routing | Encryption | Exchange keys |
| Emergency | Directory | Find PSAP endpoint |

**Example:**

```typescript
describe('Authentication with Directory', () => {
  let auth: AuthModule;
  let directory: DirectoryModule;

  beforeEach(async () => {
    directory = new DirectoryModule(config);
    await directory.loadTestData();
    auth = new AuthModule(config, directory);
  });

  it('should follow porting chain', async () => {
    // Number +441234567890 ported: CP1 → CP2 → CP3
    const result = await auth.verifyCall({
      callerID: '+441234567890',
      calledID: '+447700900123',
      callReference: 'test-123',
    });

    expect(result.portingChain).toEqual(['CP1-UK-0001', 'CP1-UK-0002', 'CP1-UK-0003']);
    expect(result.verified).toBe(true);
  });
});
```

### 2.3 End-to-End Tests

Test complete user journeys across multiple CPs.

**Journey Map:**

```
Alice (CP1) calls Bob (CP2):
  1. Alice dials +447700900123
  2. CP1 looks up Bob's CP in directory
  3. CP1 sends auth verification to CP2
  4. CP2 verifies and responds
  5. CP1 requests routing from CP2
  6. CP2 provides connection details
  7. Media connection established
  8. Bob's phone rings
  9. Bob answers
  10. Encrypted conversation
  11. Call ends
```

**Test Code:**

```typescript
describe('End-to-End Call Flow', () => {
  let cp1: PSTN2Client;
  let cp2: PSTN2Client;

  beforeAll(async () => {
    cp1 = await startMockCP('CP1-UK-0001', 8001);
    cp2 = await startMockCP('CP1-UK-0002', 8002);
  });

  afterAll(async () => {
    await cp1.close();
    await cp2.close();
  });

  it('should complete call successfully', async () => {
    const callRef = generateUUID();

    // CP1: Create call record
    await cp1.createCallRecord({
      callerID: '+441234567890',
      calledID: '+447700900123',
      callReference: callRef,
    });

    // CP1: Verify with CP2
    const verification = await cp1.auth.verifyCall({
      callerID: '+441234567890',
      calledID: '+447700900123',
      callReference: callRef,
    });
    expect(verification.verified).toBe(true);

    // CP1: Request routing from CP2
    const routing = await cp1.routing.requestRouting({
      destinationNumber: '+447700900123',
      callerID: '+441234567890',
      callReference: callRef,
      mediaCapabilities: {
        codecs: ['opus'],
        encryption: ['srtp-aes256'],
      },
    });
    expect(routing.accepted).toBe(true);
    expect(routing.connectionDetails).toBeDefined();
    expect(routing.connectionDetails.fqdn).toBe('media.cp2.test.local');

    // Verify keys exchanged
    expect(routing.connectionDetails.publicKey).toBeDefined();
  });
});
```

---

## 3. Test Scenarios

### 3.1 Happy Path Scenarios

#### 3.1.1 Simple Call (No Porting)

```
Given: Alice (+441234567890 at CP1) calls Bob (+447700900123 at CP2)
When: Call is placed
Then:
  - Directory lookup succeeds
  - Authentication succeeds in < 100ms
  - Routing succeeds in < 200ms
  - Total call setup < 1s
  - Media connection established
```

#### 3.1.2 Call with Branding

```
Given: ACME Support (+441234567890) calls customer (+447700900123)
And: ACME has branding configured
When: Call is placed
Then:
  - Branding information included in verification response
  - Customer sees "ACME Support" with logo
  - Call purpose: "Account Security Alert"
```

#### 3.1.3 Emergency Call

```
Given: User (+441234567890) dials 999
When: PSAP queries location
Then:
  - GPS location returned with ±15m accuracy
  - Address: "10 Downing Street, London, SW1A 2AA"
  - Response time < 100ms
```

### 3.2 Error Scenarios

#### 3.2.1 Call Not Found (Fraud)

```
Given: Scammer spoofs caller ID +441234567890
When: Recipient CP verifies call
Then:
  - Verification returns 404 Not Found
  - verified: false
  - Recipient can block/warn user
```

#### 3.2.2 Number Ported

```
Given: +441234567890 ported from CP1 to CP2
When: CP3 tries to verify with CP1
Then:
  - CP1 returns 200 with ported: true and newRcpid: CP2
  - Client automatically retries with CP2
  - Verification succeeds
  - portingChain: ['CP1-UK-0001', 'CP1-UK-0002']
```

#### 3.2.3 CP Unavailable

```
Given: CP2 is down for maintenance
When: CP1 tries to verify call with CP2
Then:
  - Request times out after 2s
  - Client retries 3 times with backoff
  - Falls back to traditional PSTN
  - User call still connects (via PSTN)
```

#### 3.2.4 Invalid Signature

```
Given: Attacker sends request with invalid signature
When: CP receives request
Then:
  - Signature verification fails
  - Returns 401 Unauthorized
  - Request logged as potential attack
  - No further processing
```

### 3.3 Edge Cases

#### 3.3.1 Porting Chain Loop

```
Given: Misconfiguration causes porting loop
  CP1 → CP2 → CP3 → CP1
When: Client follows chain
Then:
  - Stops after 5 hops (max)
  - Returns error: "porting_chain_too_long"
  - Falls back to traditional PSTN
```

#### 3.3.2 Clock Skew

```
Given: CP1 clock is 45 seconds ahead
When: CP2 receives request with future timestamp
Then:
  - Timestamp validation fails
  - Returns 400 Bad Request
  - Error: "timestamp_out_of_range"
  - CP1 should sync clock (NTP)
```

#### 3.3.3 Concurrent Calls

```
Given: 1000 concurrent calls between CP1 and CP2
When: All calls authenticate simultaneously
Then:
  - All verifications complete successfully
  - 95th percentile latency < 150ms
  - No rate limit errors
  - No connection pool exhaustion
```

---

## 4. Performance Testing

### 4.1 Load Test Scenarios

#### 4.1.1 Sustained Load

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

#### 4.1.2 Spike Test

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

#### 4.1.3 Soak Test

**Target:** 24-hour sustained load

```
Scenario: 24-Hour Soak
  Load: 20 RPS for 24 hours
  Total requests: ~1.7M

Success Criteria:
  ✓ 0% error rate
  ✓ No memory leaks (steady memory usage)
  ✓ No connection leaks
  ✓ Consistent latency (no degradation)
```

### 4.2 Latency Requirements

| Operation | Target | Maximum |
|-----------|--------|---------|
| Authentication (cache hit) | 50ms | 100ms |
| Authentication (cache miss) | 80ms | 150ms |
| Routing request | 100ms | 200ms |
| Directory lookup (cache hit) | 10ms | 50ms |
| Emergency location | 80ms | 150ms |
| **Total call setup** | **400ms** | **1000ms** |

### 4.3 Throughput Requirements

| Metric | Minimum | Target |
|--------|---------|--------|
| Auth requests/sec | 100 | 500 |
| Routing requests/sec | 50 | 200 |
| Concurrent calls | 1000 | 5000 |
| Directory entries | 10K | 100K |

---

## 5. Security Testing

### 5.1 OWASP Top 10

#### 5.1.1 Injection

**Test Cases:**
```
SQL Injection:
  Input: callerID = "'+DROP TABLE users--"
  Expected: Rejected with 400 Bad Request

Command Injection:
  Input: callReference = "123; rm -rf /"
  Expected: Rejected with 400 Bad Request

NoSQL Injection:
  Input: { callerID: { "$ne": null } }
  Expected: Rejected with 400 Bad Request
```

#### 5.1.2 Broken Authentication

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
  Expected: First succeeds, second rejected (duplicate messageId)

Signature Tampering:
  Valid signature, modified payload
  Expected: 401 Unauthorized
```

#### 5.1.3 Sensitive Data Exposure

**Test Cases:**
```
TLS Enforcement:
  HTTP request to API
  Expected: Redirect to HTTPS or connection refused

Log Inspection:
  Check logs for private keys, passwords
  Expected: No sensitive data in logs

Error Messages:
  Invalid request
  Expected: Generic error, no stack traces in production
```

### 5.2 Penetration Testing

**Annual External Audit:**
- OWASP ZAP automated scan
- Manual penetration test by security firm
- Social engineering test (phishing simulation)
- Physical security audit (if applicable)

**Quarterly Internal Scans:**
- Nessus vulnerability scan
- Dependency security check (Snyk, npm audit)
- Secret scanning (GitGuardian, TruffleHog)

### 5.3 Fuzzing

**Tools:** AFL, LibFuzzer, go-fuzz

**Targets:**
- Phone number parser
- RCPID validator
- JSON parser
- Signature verification
- Timestamp parser

**Duration:** 24-hour continuous fuzzing

**Success Criteria:**
- No crashes
- No infinite loops
- No memory leaks
- All invalid inputs rejected gracefully

---

## 6. Interoperability Testing

### 6.1 Multi-Vendor Testing

**Setup:**
- Implementation A (TypeScript)
- Implementation B (Python)
- Implementation C (Go)

**Test Matrix:**

| Caller | Recipient | Status |
|--------|-----------|--------|
| A → B | Auth + Routing | ✓ Pass |
| B → C | Auth + Routing | ✓ Pass |
| C → A | Auth + Routing | ✓ Pass |
| A → B → C | Porting Chain | ✓ Pass |

### 6.2 Version Compatibility

**Test Scenarios:**
```
Old Client (v1.0) → New Server (v1.1):
  Expected: Backwards compatible, all features work

New Client (v1.1) → Old Server (v1.0):
  Expected: Graceful degradation, core features work

Mixed Versions (v1.0, v1.1, v2.0):
  Expected: All communicate successfully
```

### 6.3 Conformance Testing

**Certification Suite:**
1. Run official test suite (100 test cases)
2. Submit results to PSTN2 certification authority
3. Receive compliance certificate if pass rate ≥ 95%

**Test Categories:**
- Message format compliance (20 tests)
- Signature verification (15 tests)
- Error handling (20 tests)
- Performance (15 tests)
- Security (20 tests)
- Porting chain (10 tests)

---

## 7. Test Environment

### 7.1 Mock CP Setup

**Docker Compose:**

```yaml
version: '3.8'

services:
  cp1:
    image: pstn2/mock-cp:latest
    environment:
      CP_ID: CP1-UK-0001
      PORT: 8001
      PEER_CPS: cp2:8002,cp3:8003
    ports:
      - "8001:8001"

  cp2:
    image: pstn2/mock-cp:latest
    environment:
      CP_ID: CP1-UK-0002
      PORT: 8002
      PEER_CPS: cp1:8001,cp3:8003
    ports:
      - "8002:8002"

  cp3:
    image: pstn2/mock-cp:latest
    environment:
      CP_ID: CP1-UK-0003
      PORT: 8003
      PEER_CPS: cp1:8001,cp2:8002
    ports:
      - "8003:8003"

  directory:
    image: pstn2/directory-service:latest
    ports:
      - "9000:9000"
```

### 7.2 Test Data

**Sample Directory:**
```json
{
  "entries": [
    {
      "cpId": "CP1-UK-0001",
      "ranges": ["+4471234567XX"],
      "endpoints": {
        "auth": "http://cp1:8001/pstn2/v1/auth",
        "routing": "http://cp1:8001/pstn2/v1/routing"
      }
    },
    {
      "cpId": "CP1-UK-0002",
      "ranges": ["+4477009001XX"],
      "endpoints": {
        "auth": "http://cp2:8002/pstn2/v1/auth",
        "routing": "http://cp2:8002/pstn2/v1/routing"
      }
    }
  ]
}
```

**Sample Call Records:**
```json
[
  {
    "callReference": "test-123-abc",
    "callerID": "+441234567890",
    "calledID": "+447700900123",
    "timestamp": "2025-11-30T21:00:00.000Z"
  }
]
```

### 7.3 CI/CD Pipeline

```yaml
# .github/workflows/test.yml
name: Test Suite

on: [push, pull_request]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      - run: npm install
      - run: npm test
      - uses: codecov/codecov-action@v3

  integration-tests:
    runs-on: ubuntu-latest
    services:
      redis:
        image: redis:7-alpine
    steps:
      - uses: actions/checkout@v3
      - run: docker-compose up -d
      - run: npm run test:integration
      - run: docker-compose down

  security-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: snyk/actions/node@master
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
```

---

## 8. Certification Process

### 8.1 Self-Certification

**Steps:**
1. Run official test suite locally
2. Generate test report
3. Submit report to certification portal
4. Receive preliminary certification

**Timeline:** 1-2 days

### 8.2 Independent Verification

**Steps:**
1. Deploy to test environment
2. Certification authority runs tests remotely
3. Manual inspection of results
4. Issue official certificate

**Timeline:** 1-2 weeks

**Cost:** Free for open-source implementations

### 8.3 Certification Levels

**Level 1 - Basic:**
- Authentication (Option 1)
- Routing
- Directory
- Fallback to PSTN

**Level 2 - Advanced:**
- Level 1 requirements
- Authentication (Option 2)
- Emergency services
- Call branding

**Level 3 - Production:**
- Level 2 requirements
- Performance benchmarks met
- Security audit passed
- 99.9% uptime demonstrated

### 8.4 Recertification

**Frequency:** Annually

**Triggers:**
- Major version upgrade
- Security incident
- Compliance issues
- Regulatory changes

---

## Appendix A: Test Report Template

```markdown
# PSTN2 Test Report

**Implementation:** {Name}
**Version:** {Version}
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
- Signature generation: ✓ Pass
- Timestamp validation: ✓ Pass
...

### Integration Tests (65/65 passed)
- Auth + Directory: ✓ Pass
- Routing + Encryption: ✓ Pass
...

### Performance Tests (45/47 passed)
- Authentication latency: ✓ Pass (p95: 87ms)
- Sustained load: ✓ Pass (100 RPS for 10 min)
- Spike test: ✗ Fail (p99: 250ms, target: 200ms)
...

### Security Tests (55/55 passed)
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

const BASE_URL = __ENV.BASE_URL || 'https://api.test.pstn2.org';

export default function() {
  const payload = JSON.stringify({
    messageId: `${__VU}-${__ITER}-${Date.now()}`,
    timestamp: new Date().toISOString(),
    version: '1.0',
    requestingCP: 'CP1-UK-0001',
    callerID: `+4412345678${String(__VU).padStart(2, '0')}`,
    calledID: '+447700900123',
    callReference: `test-${__VU}-${__ITER}`,
    signature: 'mock-signature-for-load-test',
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'X-PSTN2-Version': '1.0',
    },
  };

  const response = http.post(
    `${BASE_URL}/pstn2/v1/auth/verify`,
    payload,
    params
  );

  const success = check(response, {
    'status is 200': (r) => r.status === 200,
    'response time OK': (r) => r.timings.duration < 200,
    'verified field present': (r) => JSON.parse(r.body).verified !== undefined,
  });

  errorRate.add(!success);

  sleep(1); // 1 second between requests per VU
}
```

---

**Document Status:** Normative Specification
**Compliance Required:** Yes for certification
**Feedback:** https://github.com/8x8/pstn2/issues (repository access is currently limited while the project incubates; contact nick.holland@8x8.com)
