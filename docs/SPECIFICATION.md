# PSTN2 Protocol Specification v1.0

**Status:** Draft
**Last Updated:** 2025-11-30
**Authors:** Nick Holland, Comms Council UK

## Table of Contents

1. [Introduction](#introduction)
2. [Architecture Overview](#architecture-overview)
3. [Core Concepts](#core-concepts)
4. [Protocol Messages](#protocol-messages)
5. [Authentication](#authentication)
6. [Routing](#routing)
7. [Encryption](#encryption)
8. [Emergency Services](#emergency-services)
9. [Directory Service](#directory-service)
10. [Error Handling](#error-handling)
11. [Security Considerations](#security-considerations)
12. [Implementation Requirements](#implementation-requirements)

---

## 1. Introduction

### 1.1 Purpose

PSTN2 is a distributed telecommunications protocol designed to provide:
- **Authentication**: Cryptographic verification of caller identity
- **Direct Routing**: Peer-to-peer call connections eliminating transit providers
- **Encryption**: End-to-end encrypted media
- **Enhanced Emergency Services**: Real-time location data for emergency calls
- **Fraud Prevention**: Real-time caller ID verification
- **Interoperability**: Seamless integration with traditional PSTN

### 1.2 Design Principles

1. **Distributed Architecture**: No central authority or single point of failure
2. **Backward Compatible**: Falls back to traditional PSTN when needed
3. **Privacy First**: Minimal data sharing, maximum encryption
4. **Real-time Performance**: Sub-100ms authentication, sub-1s call setup
5. **Simplicity**: Easy to implement and deploy
6. **Eventual Consistency**: Directory data propagates over time

### 1.3 Terminology

- **CP (Communication Provider)**: Any entity providing telephony services
- **RCPID (Range-CP-ID)**: Globally unique identifier for a CP (format: `CP{N}-{CC}-{ID}`)
- **Range Holder**: CP currently assigned a number range by regulator
- **MAP (Managed Access Provider)**: CP providing PSTN2 services to smaller CPs
- **PSAP (Public Safety Answering Point)**: Emergency services dispatch center

---

## 2. Architecture Overview

### 2.1 System Components

```
┌──────────────┐         ┌──────────────┐         ┌──────────────┐
│   CP1 (UK)   │◄───────►│   CP2 (UK)   │◄───────►│   CP3 (US)   │
│              │         │              │         │              │
│ • Auth API   │         │ • Auth API   │         │ • Auth API   │
│ • Routing    │         │ • Routing    │         │ • Routing    │
│ • Directory  │         │ • Directory  │         │ • Directory  │
│ • Emergency  │         │ • Emergency  │         │ • Emergency  │
└──────┬───────┘         └──────┬───────┘         └──────┬───────┘
       │                        │                        │
       └────────────────────────┼────────────────────────┘
                                │
                    ┌───────────▼───────────┐
                    │   Directory Service   │
                    │  (Eventual Consistency)│
                    └───────────────────────┘
```

### 2.2 Communication Flow

1. **Directory Lookup**: Find CP hosting destination number
2. **Authentication**: Verify caller identity with originating CP
3. **Routing**: Discover connection details for direct media
4. **Encryption**: Exchange keys for secure media
5. **Media**: Establish direct peer-to-peer connection
6. **Emergency**: Query real-time location if emergency call

### 2.3 Network Requirements

- **TLS 1.3**: All HTTP communications MUST use TLS 1.3+
- **HTTPS**: RESTful API over HTTPS
- **Timeouts**: 2 seconds default, configurable per CP
- **Retry Logic**: Exponential backoff (100ms, 200ms, 400ms)
- **Rate Limiting**: Minimum 100 requests/second per CP per endpoint (see §11.2)

---

## 3. Core Concepts

### 3.1 Identifiers

#### 3.1.1 Phone Numbers
- **Format**: E.164 (e.g., `+441234567890`)
- **Validation**: Must match regex `^\+[1-9]\d{1,14}$`

#### 3.1.2 RCPID (Range-CP-ID)
- **Format**: `CP{N}-{COUNTRY}-{ID}`
- **Example**: `CP1-UK-0001`
- **Components**:
  - `{N}`: Tier (1=Direct CP, 2=MAP)
  - `{COUNTRY}`: ISO 3166-1 alpha-2 country code
  - `{ID}`: 4-digit unique identifier within country

#### 3.1.3 Call Reference
- **Format**: UUID v4
- **Example**: `550e8400-e29b-41d4-a716-446655440000`
- **Uniqueness**: MUST be globally unique
- **Lifetime**: Valid for duration of call + 24 hours (for logging)

### 3.2 Timestamps

- **Format**: ISO 8601 with timezone
- **Example**: `2025-11-30T21:30:00.000Z`
- **Clock Sync**: CPs MUST synchronize clocks (NTP recommended)
- **Tolerance**: Accept timestamps ±30 seconds

### 3.3 Cryptographic Requirements

#### 3.3.1 Key Pairs
- **Algorithm**: Ed25519 (preferred) or RSA-4096
- **Format**: Base64-encoded
- **Storage**: Private keys MUST be stored in secure key management system
- **Rotation**: Recommended every 90 days

#### 3.3.2 Signatures
- **Algorithm**: Ed25519 signature
- **Format**: Base64-encoded
- **Scope**: Sign entire message body + timestamp
- **Verification**: Verify using public key from Directory

---

## 4. Protocol Messages

### 4.1 Message Format

All messages are JSON with UTF-8 encoding.

**Common Fields:**
```json
{
  "messageId": "uuid-v4",
  "timestamp": "ISO-8601",
  "version": "1.0",
  "requestingCP": "RCPID",
  "signature": "base64-encoded-signature"
}
```

### 4.2 HTTP Headers

**Required Headers:**
```
Content-Type: application/json; charset=utf-8
User-Agent: PSTN2-Client/{version} ({implementation})
X-PSTN2-Version: 1.0
X-PSTN2-CP-ID: {RCPID}
Authorization: Bearer {JWT-token}  (optional, for token pool)
```

### 4.3 Response Codes

**Success:**
- `200 OK`: Request successful
- `202 Accepted`: Request accepted, processing asynchronously

**Client Errors:**
- `400 Bad Request`: Invalid message format
- `401 Unauthorized`: Invalid credentials/signature
- `404 Not Found`: Call/number not found
- `408 Request Timeout`: Request took too long
- `429 Too Many Requests`: Rate limit exceeded

**Server Errors:**
- `500 Internal Server Error`: CP system error
- `503 Service Unavailable`: CP temporarily unavailable
- `504 Gateway Timeout`: Downstream dependency timeout

---

## 5. Authentication

### 5.1 Option 1: Direct Query

Direct real-time query to originating CP.

#### 5.1.1 Verification Request

**Endpoint:** `POST /pstn2/v1/auth/verify`

**Request:**
```json
{
  "messageId": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2025-11-30T21:30:00.000Z",
  "version": "1.0",
  "requestingCP": "CP1-UK-0002",
  "callerID": "+441234567890",
  "calledID": "+447700900123",
  "callReference": "0d1f2a3b-4c5d-4e6f-8a7b-9c0d1e2f3a4b",
  "signature": "base64-signature"
}
```

**Response (200 OK):**
```json
{
  "verified": true,
  "callReference": "0d1f2a3b-4c5d-4e6f-8a7b-9c0d1e2f3a4b",
  "callerName": "John Smith",
  "callerOrg": "ACME Corp",
  "callPurpose": "Account verification",
  "trustLevel": "verified",
  "branding": {
    "displayName": "ACME Support",
    "logo": "https://cdn.acme.com/logo.png",
    "backgroundColor": "#0066cc",
    "textColor": "#ffffff"
  },
  "timestamp": "2025-11-30T21:30:00.050Z",
  "signature": "base64-signature"
}
```

**Response (404 Not Found):**
```json
{
  "verified": false,
  "callReference": "0d1f2a3b-4c5d-4e6f-8a7b-9c0d1e2f3a4b",
  "error": "call_not_found",
  "message": "No matching call found",
  "timestamp": "2025-11-30T21:30:00.050Z"
}
```

#### 5.1.2 Porting Chain Resolution

If number is ported, originating CP MUST return porting information:

**Response (200 OK):**
```json
{
  "verified": false,
  "ported": true,
  "newRcpid": "CP1-UK-0003",
  "portedAt": "2025-10-15T10:00:00.000Z",
  "callReference": "0d1f2a3b-4c5d-4e6f-8a7b-9c0d1e2f3a4b"
}
```

A ported response is a successful (HTTP 200) response, not an error. On receiving
`"ported": true`, the client MUST re-query the directory for the new range holder
identified by `newRcpid` and retry the verification against that CP. Maximum 5 hops.

### 5.2 Option 2: Token Pool

Shared token repository for reduced query load.

#### 5.2.1 Create Token

**Endpoint:** `POST /pstn2/v1/auth/tokens`

**Request:**
```json
{
  "messageId": "uuid",
  "timestamp": "ISO-8601",
  "originatingCP": "CP1-UK-0001",
  "callerID": "+441234567890",
  "calledID": "+447700900123",
  "callReference": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "ttl": 30,
  "signature": "base64"
}
```

**Response (201 Created):**
```json
{
  "tokenId": "TK-abc123XYZ789defG",
  "expiresAt": "2025-11-30T21:30:30.000Z",
  "callReference": "7c9e6679-7425-40de-944b-e07fc1f90ae7"
}
```

#### 5.2.2 Verify Token

**Endpoint:** `GET /pstn2/v1/auth/tokens/{tokenId}`

**Response (200 OK):**
```json
{
  "tokenId": "TK-abc123XYZ789defG",
  "originatingCP": "CP1-UK-0001",
  "callerID": "+441234567890",
  "calledID": "+447700900123",
  "callReference": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "verified": true,
  "branding": {...},
  "expiresAt": "2025-11-30T21:30:30.000Z"
}
```

#### 5.2.3 Token Format

- **Prefix**: `TK-`
- **Length**: Exactly 16 characters (after prefix)
- **Charset**: Alphanumeric `[A-Za-z0-9]`
- **Pattern**: `^TK-[A-Za-z0-9]{16}$`
- **Example**: `TK-abc123XYZ789defG`

---

## 6. Routing

Direct peer-to-peer routing discovery.

### 6.1 Routing Request

**Endpoint:** `POST /pstn2/v1/routing/request`

**Request:**
```json
{
  "messageId": "uuid",
  "timestamp": "ISO-8601",
  "requestingCP": "CP1-UK-0001",
  "callerID": "+441234567890",
  "destinationNumber": "+447700900123",
  "callReference": "9b2f8c44-1d3e-4f6a-8b5c-2e7d9a0f4c11",
  "mediaCapabilities": {
    "codecs": ["opus", "g722", "pcmu"],
    "encryption": ["srtp-aes256", "srtp-aes128"],
    "video": false,
    "maxBandwidth": 128000
  },
  "publicKey": "base64-ed25519-public-key",
  "signature": "base64"
}
```

**Response (200 OK):**
```json
{
  "accepted": true,
  "callReference": "9b2f8c44-1d3e-4f6a-8b5c-2e7d9a0f4c11",
  "connectionDetails": {
    "fqdn": "media.cp2.example.com",
    "ipv4": "203.0.113.42",
    "ipv6": "2001:db8::42",
    "port": 5060,
    "protocol": "udp",
    "publicKey": "base64-ed25519-public-key"
  },
  "agreedCapabilities": {
    "codecs": ["opus"],
    "encryption": ["srtp-aes256"],
    "video": false
  },
  "timestamp": "ISO-8601",
  "signature": "base64"
}
```

**Response (503 Service Unavailable):**
```json
{
  "accepted": false,
  "reason": "capacity_exceeded",
  "fallbackToTraditional": true,
  "timestamp": "ISO-8601"
}
```

### 6.2 Media Codecs

**Required Support:**
- `opus`: Opus codec (preferred for quality)
- `g722`: G.722 wideband
- `pcmu`: G.711 μ-law (fallback)
- `pcma`: G.711 A-law (fallback)

**Optional Support:**
- `g729`: G.729
- `vp8`: VP8 video codec
- `h264`: H.264 video codec

### 6.3 Encryption

**Required Support:**
- `srtp-aes256`: SRTP with AES-256-GCM
- `srtp-aes128`: SRTP with AES-128-GCM

**Key Exchange:**
- DTLS-SRTP (RFC 5764), as extended to DTLS 1.3 (RFC 9147)
- Media encryption keys are derived from the DTLS handshake (X25519 ECDHE within DTLS)
- Ed25519 identity keys exchanged in the routing request/response authenticate the
  peer's DTLS certificate fingerprint (Ed25519 is signature-only and is never used
  for key agreement)

---

## 7. Encryption

### 7.1 Key Exchange

Ed25519 is a signature-only algorithm and cannot perform key agreement. Media
encryption keys are therefore NOT derived from the Ed25519 identity keys.
Instead, session keys are established by the DTLS-SRTP handshake (RFC 5764)
using X25519 ECDHE inside DTLS. The Ed25519 identity key exchanged during
routing negotiation is used to authenticate the peer's DTLS certificate
fingerprint, binding the media channel to the signaling identity.

**Identity Public Key Format:**
```json
{
  "algorithm": "ed25519",
  "publicKey": "base64-encoded-32-bytes",
  "fingerprint": "sha256:hexadecimal"
}
```

### 7.2 Media Encryption

**Required:**
- SRTP (RFC 3711)
- DTLS 1.3 (RFC 9147)
- DTLS-SRTP (RFC 5764), applied as extended to DTLS 1.3
- Perfect Forward Secrecy (via X25519 ECDHE in the DTLS handshake)

**Key Derivation:**
- Use HKDF-SHA256
- Session keys rotated every 10 minutes
- Master key never transmitted

### 7.3 Signaling Encryption

**Required:**
- TLS 1.3 for all HTTP/HTTPS
- Certificate pinning (optional but recommended)
- HSTS headers

---

## 8. Emergency Services

### 8.1 Location Query

**Endpoint:** `POST /pstn2/v1/emergency/location`

**Request:**
```json
{
  "messageId": "uuid",
  "timestamp": "ISO-8601",
  "requestingPSAP": "UK-999-LONDON-01",
  "callerID": "+441234567890",
  "callReference": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "signature": "base64"
}
```

**Response (200 OK):**
```json
{
  "callReference": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "location": {
    "latitude": 51.5074,
    "longitude": -0.1278,
    "accuracy": 15,
    "altitude": 42.5,
    "source": "gps"
  },
  "address": {
    "street": "10 Downing Street",
    "city": "London",
    "postcode": "SW1A 2AA",
    "country": "GB"
  },
  "additionalInfo": {
    "cellTowerId": "234-10-12345-67890",
    "wifiAccessPoints": ["AA:BB:CC:DD:EE:FF"],
    "lastUpdated": "2025-11-30T21:30:00.000Z"
  },
  "timestamp": "ISO-8601",
  "signature": "base64"
}
```

### 8.2 Location Sources

**Priority (highest to lowest):**
1. **GPS**: Most accurate (±5-15m)
2. **WiFi Triangulation**: Good accuracy (±20-50m)
3. **Cell Tower**: Moderate accuracy (±100-1000m)
4. **User-Provided**: Entered by user
5. **Billing Address**: Fallback only

### 8.3 PSAP Authentication

PSAPs MUST be authenticated using:
- Pre-registered PSAP IDs in Directory
- TLS client certificates
- Rate limiting: 10 requests/second per PSAP

---

## 9. Directory Service

### 9.1 Directory Entry

**Format:**
```json
{
  "cpId": "CP1-UK-0001",
  "ranges": [
    {
      "numberRange": "+4471234567XX",
      "status": "active",
      "portedTo": null,
      "portedAt": null
    },
    {
      "numberRange": "+4471234568XX",
      "status": "ported",
      "portedTo": "CP1-UK-0002",
      "portedAt": "2025-10-15T10:00:00.000Z"
    }
  ],
  "endpoints": {
    "auth": "https://api.cp1.example.com/pstn2/v1/auth",
    "routing": "https://api.cp1.example.com/pstn2/v1/routing",
    "emergency": "https://api.cp1.example.com/pstn2/v1/emergency"
  },
  "publicKey": "base64-ed25519-public-key",
  "certificates": [
    {
      "fingerprint": "sha256:hexadecimal",
      "validFrom": "2025-01-01T00:00:00.000Z",
      "validTo": "2026-01-01T00:00:00.000Z"
    }
  ],
  "lastUpdated": "2025-11-30T21:00:00.000Z",
  "version": 42
}
```

### 9.2 Directory Synchronization

**Pull Directory:**
- **Endpoint:** `GET /pstn2/v1/directory/all`
- **Response:** Array of directory entries
- **Frequency:** Every 1 hour
- **Compression:** GZIP required for large responses

**Push Updates:**
- **Endpoint:** `POST /pstn2/v1/directory/publish`
- **When:** Number range changes, porting events
- **Propagation:** Best-effort, eventual consistency

### 9.3 Number Range Format

- **Wildcards:** Use `X` for wildcards
- **Examples:**
  - `+4471234567XX` = 100 numbers (00-99)
  - `+447123456XXX` = 1000 numbers (000-999)
  - `+44712345XXXX` = 10000 numbers (0000-9999)

### 9.4 Eventual Consistency

- **Propagation Time:** Target 15 minutes, tolerate up to 1 hour
- **Version Numbers:** Monotonically increasing
- **Conflict Resolution:** Highest version wins
- **Cache Invalidation:** Check version before using cached data

---

## 10. Error Handling

### 10.1 Error Response Format

```json
{
  "error": {
    "code": "call_not_found",
    "message": "No matching call record found",
    "timestamp": "ISO-8601",
    "requestId": "uuid"
  }
}
```

### 10.2 Error Codes

**Authentication:**
- `call_not_found`: No matching call record
- `invalid_signature`: Signature verification failed
- `expired_token`: Token has expired
- `invalid_token`: Token not found or invalid

**Routing:**
- `capacity_exceeded`: CP at capacity
- `unsupported_codec`: No common codec
- `number_not_found`: Destination number not in CP range

**Emergency:**
- `location_unavailable`: Cannot determine location
- `unauthorized_psap`: PSAP not authorized

**General:**
- `timeout`: Request timeout
- `rate_limit_exceeded`: Too many requests
- `invalid_request`: Malformed request
- `internal_error`: Server error

### 10.3 Retry Logic

**Exponential Backoff:**
1. First retry: 100ms
2. Second retry: 200ms
3. Third retry: 400ms
4. Max retries: 3
5. Fallback: Use traditional PSTN

**Retry Conditions:**
- `503 Service Unavailable`
- `504 Gateway Timeout`
- Network timeout (no response)

**Do NOT Retry:**
- `400 Bad Request`
- `401 Unauthorized`
- `404 Not Found`

**Ported Numbers:**
A `200 OK` response with `"ported": true` is not an error and is not a retry of
the same request. The client MUST re-query the directory and send a new request
to the range holder identified by `newRcpid` (see §5.1.2). Maximum 5 hops.

---

## 11. Security Considerations

### 11.1 Authentication

**Message Signing:**
```
signature = Ed25519.sign(privateKey, payload)
payload = JSON.stringify(messageBody) + timestamp
```

**Verification:**
```
valid = Ed25519.verify(publicKey, signature, payload)
```

### 11.2 Rate Limiting

**Per CP:**
- Auth verification: 100 req/sec minimum
- Routing requests: 50 req/sec minimum
- Directory sync: 1 req/hour per CP
- Emergency location: 10 req/sec

**Implementation:**
- Token bucket algorithm
- Sliding window for burst protection
- Return 429 with `Retry-After` header

### 11.3 Replay Protection

Timestamp validation alone (±30 seconds, see §3.2) does not prevent replay of a
captured message within the acceptance window. Receivers MUST keep a cache of
seen `messageId` values covering at least the timestamp-acceptance window
(±30 seconds) and MUST reject any request whose `messageId` has already been
seen with `401 Unauthorized` and error code `REPLAY_DETECTED`.

### 11.4 DDoS Protection

**Required:**
- Request size limits (max 100KB)
- Connection limits (max 1000 concurrent)
- IP-based rate limiting
- Geographic filtering (optional)

**Recommended:**
- CDN/WAF integration
- Anycast DNS
- Health checks and failover

### 11.5 Privacy

**Minimize Data Sharing:**
- Only share data necessary for call setup
- Do not log call content
- Encrypt all location data in transit
- Retain logs for 24 hours only (except legal requirement)

**GDPR Compliance:**
- Support right to erasure
- Data minimization principle
- Lawful basis for processing
- Privacy by design

---

## 12. Implementation Requirements

### 12.1 Mandatory Features

**All implementations MUST support:**
- ✅ Authentication Option 1 (Direct Query)
- ✅ Routing discovery and setup
- ✅ Directory lookup and caching
- ✅ TLS 1.3
- ✅ Message signing and verification
- ✅ Error handling with fallback
- ✅ Porting chain resolution
- ✅ Basic encryption (SRTP)

### 12.2 Optional Features

**Implementations MAY support:**
- Authentication Option 2 (Token Pool)
- Emergency location services
- Call branding
- Video calling
- Advanced codecs (Opus HD)

### 12.3 Performance Targets

**Latency:**
- Authentication: < 100ms (95th percentile)
- Routing request: < 200ms (95th percentile)
- Directory lookup: < 50ms (cache hit)
- Total call setup: < 1 second

**Throughput:**
- Auth requests: 100/sec minimum per CP
- Concurrent calls: 1000 minimum per CP
- Directory entries: 100,000 ranges cached

**Reliability:**
- Uptime: 99.9% (8.76 hours downtime/year)
- Fallback success: 99.99%
- Message delivery: 99.9%

### 12.4 Testing Requirements

**Unit Tests:**
- Code coverage: > 80%
- All error conditions tested
- Edge cases covered

**Integration Tests:**
- Multi-CP scenarios
- Porting chain resolution
- Fallback to traditional PSTN
- Network failure scenarios

**Load Tests:**
- Sustained load at target throughput
- Spike handling (10x normal load)
- Resource limits (memory, CPU, connections)

### 12.5 Logging Requirements

**Required Logs:**
- All authentication requests (success/failure)
- All routing requests
- All errors with stack traces
- Performance metrics (latency, throughput)

**Log Format:**
- Structured JSON
- ISO 8601 timestamps
- Request IDs for tracing
- No PII in logs (except required for debugging)

**Retention:**
- Standard logs: 24 hours
- Error logs: 7 days
- Audit logs: As required by regulation

---

## Appendix A: Example Call Flow

### Complete Call: Alice → Bob

1. **Alice dials Bob's number** (`+447700900123`)
2. **CP1 (Alice's CP) looks up Bob's CP** in cached directory
3. **CP1 requests routing** from CP2 (Bob's CP)
   ```json
   POST https://api.cp2.example.com/pstn2/v1/routing/request
   ```
4. **CP2 accepts and returns connection details**
5. **CP1 establishes encrypted media** with CP2
6. **Bob's phone rings** with caller ID and branding
7. **Bob answers**, encrypted conversation begins
8. **Call completes**, logs retained for 24 hours

Total time: ~800ms (vs 5-8 seconds traditional PSTN)

---

## Appendix B: Security Audit Checklist

- [ ] TLS 1.3 enforced on all endpoints
- [ ] Ed25519 keys properly generated and stored
- [ ] Message signatures verified on all requests
- [ ] Rate limiting implemented per specification
- [ ] Porting chain limits enforced (max 5 hops)
- [ ] Request size limits enforced (max 100KB)
- [ ] Timeouts configured (2s default)
- [ ] Error messages do not leak sensitive information
- [ ] Logs do not contain private keys or passwords
- [ ] PSAP authentication implemented for emergency queries

---

## Appendix C: Version History

- **v1.0** (2025-11-30): Initial specification
  - Core authentication (Option 1 & 2)
  - Direct routing
  - Directory service
  - Emergency services
  - Encryption

---

## Appendix D: References

- RFC 3711: SRTP (Secure Real-time Transport Protocol)
- RFC 5764: DTLS-SRTP
- RFC 8032: Ed25519 Signatures
- RFC 9147: DTLS 1.3
- E.164: International telephone numbering plan
- ISO 8601: Date and time format

---

**Document Status:** Living Specification
**Feedback:** https://github.com/njjholland-dot/pstn2/issues
**Website:** https://pstn2.org
