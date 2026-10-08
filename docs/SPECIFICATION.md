# PSTN2 Protocol Specification v1.1

**Status:** Draft
**Last Updated:** 2026-10-08
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
9. [Number Discovery](#number-discovery)
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
6. **No Central Database**: Each CP answers only for the numbers it holds; the regulator's numbering lists say which CP to ask first

### 1.3 Terminology

- **CP (Communication Provider)**: Any entity providing telephony services
- **RCPID (Range-CP-ID)**: Globally unique identifier for a CP (format: `CP{N}-{CC}-{ID}`)
- **Range Holder**: CP assigned a number block by the regulator (in the UK, the CP named against the block in Ofcom's S1–S9 numbering lists). The Range Holder always knows where its numbers have been ported to
- **Numbering List**: The regulator's list of number blocks and their Range Holders, augmented with each Range Holder's PSTN2 URL (see §9.1)
- **Holder**: The CP that currently serves a specific number — the Range Holder, or the CP the number has been ported to
- **MAP (Managed Access Provider)**: CP providing PSTN2 services to smaller CPs
- **PSAP (Public Safety Answering Point)**: Emergency services dispatch center

---

## 2. Architecture Overview

### 2.1 System Components

```
                 ┌─────────────────────────────────────────┐
                 │  Regulator numbering lists (Ofcom S1–S9) │
                 │  block → Range Holder → Range Holder URL │
                 │  (downloaded & cached by every CP;       │
                 │   mirrors permitted)                     │
                 └────────────────────┬────────────────────┘
                                      │ periodic download
       ┌──────────────────────────────┼──────────────────────────────┐
       ▼                              ▼                              ▼
┌──────────────┐               ┌──────────────┐               ┌──────────────┐
│     CP A     │◄─────────────►│     CP B     │◄─────────────►│     CP C     │
│              │  PSTN2 HTTPS  │              │  PSTN2 HTTPS  │              │
│ • Numbers    │               │ • Numbers    │               │ • Numbers    │
│ • Auth API   │               │ • Auth API   │               │ • Auth API   │
│ • Routing    │               │ • Routing    │               │ • Routing    │
│ • Emergency  │               │ • Emergency  │               │ • Emergency  │
│ • Cache      │               │ • Cache      │               │ • Cache      │
└──────────────┘               └──────────────┘               └──────────────┘
```

There is no central database. Each CP keeps its own number database (the ranges the
regulator allocated to it, the numbers ported in, and where its ported-out numbers went)
and answers Number Discovery queries about those numbers only.

### 2.2 Communication Flow

1. **Number Discovery**: Find the CP that currently holds the number (§9)
2. **Authentication**: Verify caller identity with the caller ID's holder
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
- **Verification**: Verify using the public key published by the sending CP at `GET {cpUrl}/pstn2/v1/keys` (§9.6); the CP's URL is found through Number Discovery

---

## 4. Protocol Messages

### 4.1 Message Format

All messages are JSON with UTF-8 encoding.

**Common Fields:**
```json
{
  "messageId": "uuid-v4",
  "timestamp": "ISO-8601",
  "version": "1.1",
  "requestingCP": "RCPID",
  "signature": "base64-encoded-signature"
}
```

### 4.2 HTTP Headers

**Required Headers:**
```
Content-Type: application/json; charset=utf-8
User-Agent: pstn2-{language}-sdk/{version}
X-PSTN2-Version: 1.1
X-PSTN2-CP-ID: {RCPID}
```

Clients MUST send a descriptive `User-Agent`. Many hosting WAFs reject generic
library user agents (for example `curl/*` and `Go-http-client/*`). `Content-Type`
is required on requests with a body; Number Discovery `GET` requests have none.

### 4.3 Response Codes

**Success:**
- `200 OK`: Request successful
- `202 Accepted`: Request accepted, processing asynchronously

**Client Errors:**
- `400 Bad Request`: Invalid message format
- `401 Unauthorized`: Invalid credentials/signature
- `404 Not Found`: Call not found, or number not held/not in service (Number Discovery: the body is optional)
- `408 Request Timeout`: Request took too long
- `429 Too Many Requests`: Rate limit exceeded

**Server Errors:**
- `500 Internal Server Error`: CP system error
- `503 Service Unavailable`: CP temporarily unavailable
- `504 Gateway Timeout`: Downstream dependency timeout

---

## 5. Authentication

Caller authentication is a direct, real-time query to the CP that holds the caller ID.
The terminating CP finds that holder with Number Discovery (§9) and sends it a signed
verification request; the holder confirms whether it placed the call.

### 5.1 Caller Authentication (Direct Query)

#### 5.1.1 Verification Request

**Endpoint:** `POST /pstn2/v1/auth/verify`

**Request:**
```json
{
  "messageId": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2025-11-30T21:30:00.000Z",
  "version": "1.1",
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

#### 5.1.2 Ported Caller IDs

The terminating CP finds where to send the verification request with Number Discovery
(§9): it looks up the caller ID, following the Range Holder's redirect if the number has
been ported. Verification therefore always goes to the CP that currently holds the caller ID.

If a verification request reaches a CP that no longer holds the caller ID (for example
because the requester used a stale cache entry), that CP MUST answer with a `not_held`
result and a cache-invalidation instruction:

**Response (200 OK):**
```json
{
  "verified": false,
  "result": "not_held",
  "callReference": "0d1f2a3b-4c5d-4e6f-8a7b-9c0d1e2f3a4b",
  "cache": { "invalidate": true, "scope": "number" },
  "timestamp": "2025-11-30T21:30:00.050Z"
}
```

This is a successful (HTTP 200) response, not an error. The client MUST purge its cached
entry for the caller ID, rediscover the holder starting from the Range Holder (§9.4), and
retry the verification there. Maximum 5 discovery hops in total.

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
- Pre-registered PSAP IDs (published by the emergency authority, distributed like the numbering list)
- TLS client certificates
- Rate limiting: 10 requests/second per PSAP

---

## 9. Number Discovery

Number Discovery answers one question: **"Which CP currently holds this number?"**
It is used before every PSTN2 interaction — to find the destination's CP for routing,
and to find the caller ID's CP for authentication.

There is no central database. All of the information already exists, spread across
parties that each hold their own part:

| Party | Already knows |
|---|---|
| Regulator (Ofcom) | Which CP each number block is allocated to — the **Range Holder** |
| Range Holder | Which of its numbers have been ported out, and to which CP |
| Every CP | The numbers it serves, including numbers ported in |

The only addition PSTN2 needs is **one extra field on the regulator's numbering lists:
the Range Holder's PSTN2 URL**.

### 9.1 Numbering List

In the UK the source is Ofcom's S1–S9 numbering lists. PSTN2 adds a `Range Holder URL`
to each allocated block. CPs download the list periodically and keep a local copy; they
never query the regulator per call. Copies MAY be mirrored by other bodies for
availability, provided the regulator's copy remains the single source of truth.

**JSON form:**
```json
{
  "listVersion": "2026-10-06T06:00:00Z",
  "publisher": "Ofcom",
  "source": "S1-S9 numbering lists with Range Holder URL",
  "blocks": [
    {
      "prefix": "442079460",
      "display": "020 7946 0xxx",
      "numberLength": 12,
      "status": "Allocated",
      "cpId": "CP1-UK-0101",
      "cpName": "Alpha Telecom",
      "rangeHolderUrl": "https://pstn2.alpha-telecom.example"
    }
  ]
}
```

**CSV form** (Ofcom S-file columns plus one): `Number Block,Status,Communications Provider,
Date Allocated,Range Holder URL`.

| Field | Meaning |
|---|---|
| `prefix` | E.164 digits (no `+`) common to every number in the block |
| `numberLength` | Total E.164 digit count of numbers in the block |
| `status` | `Allocated`, `Free`, `Reserved`, `Protected` (Ofcom terms) |
| `rangeHolderUrl` | Base URL of the Range Holder's PSTN2 API. Absent or empty = the Range Holder does not participate; use traditional PSTN |

**Matching:** strip the `+`, then choose the block with the **longest matching prefix**
whose `numberLength` equals the number's length. No match means the number is not
allocated.

**Refresh:** at least daily, using `ETag`/`If-None-Match` (a `304` response means the
local copy is current). A response carrying `cache.scope = "block"` invalidation (§9.5)
also triggers a refresh.

### 9.2 Discovery Query

**Endpoint:** `GET {url}/pstn2/v1/numbers/{e164digits}`

`{e164digits}` is the number without the `+` (for example `441614960123`). The request is a
plain `GET` with no body, so responses are cacheable and can be served by static hosting.

**Response — held (200 OK).** The CP serves this number:
```json
{
  "version": "1.1",
  "result": "held",
  "number": "+441614960123",
  "holder": {
    "cpId": "CP1-UK-0102",
    "cpName": "Bravo Networks",
    "url": "https://pstn2.bravo-networks.example"
  },
  "ported": false,
  "cache": { "ttl": 86400 },
  "issued": "2026-10-06T09:00:00Z",
  "kid": "bravo-2026-10",
  "signature": "base64-ed25519-signature"
}
```
`ported` is `true` when the holder is not the Range Holder (the number was ported in).

**Response — redirect (200 OK).** Only the **Range Holder** sends this, for a number it
has ported out:
```json
{
  "version": "1.1",
  "result": "redirect",
  "number": "+441134960456",
  "portedTo": {
    "cpId": "CP1-UK-0102",
    "cpName": "Bravo Networks",
    "url": "https://pstn2.bravo-networks.example"
  },
  "cache": { "ttl": 86400 },
  "issued": "2026-10-06T09:00:00Z",
  "kid": "charlie-2026-10",
  "signature": "base64-ed25519-signature"
}
```

A redirect is a normal `200 OK` result, not an HTTP 3xx. It keeps the response
signable, cacheable and identical across hosting stacks.

**Response — not held (200 OK).** A CP that is **not** the Range Holder and does not
serve the number (typically because the requester used a stale cache entry) sends:
```json
{
  "version": "1.1",
  "result": "not_held",
  "number": "+441134960456",
  "cache": { "invalidate": true, "scope": "number" },
  "issued": "2026-10-06T09:00:00Z",
  "kid": "bravo-2026-10",
  "signature": "base64-ed25519-signature"
}
```

**Response — unknown (404 Not Found).** The number is in the CP's range but not in
service, or the CP has no record of it. A body is optional (`{"result":"unknown"}`), so a
static host's default 404 page is compliant.

### 9.3 Discovery Algorithm

```
discover(number):
  1. CACHE   — if the local cache holds an unexpired entry for number:
                 query entry.holder.url directly (step 4)
  2. LIST    — find the block in the local numbering list (longest prefix)
                 no block            → result "unallocated"   (traditional PSTN)
                 no rangeHolderUrl   → result "not_participating" (traditional PSTN)
  3. RANGE HOLDER — query block.rangeHolderUrl
  4. QUERY   — GET {url}/pstn2/v1/numbers/{digits}
                 held      → cache {number → holder, ttl}; done
                 redirect  → query portedTo.url (step 4 again)
                 not_held  → purge cache entry for number; restart at step 2
                 404       → result "unknown"
  Hop limit: 5 queries in total. A CP seen twice in one discovery = loop → fail.
```

On failure (timeout, hop limit, loop, invalid signature) the caller MUST fall back to
traditional PSTN handling. Discovery never blocks a call.

### 9.4 Caching Rules

- **Numbering list:** cached locally and refreshed per §9.1.
- **Numbers:** clients SHOULD cache each resolved `number → holder` for `cache.ttl`
  seconds (default 86400), so the next call goes direct.
- Clients MUST NOT apply a port to a whole block. Porting is per number, so
  number-level and block-level knowledge are kept separately.
- Cached entries are hints, not authority. The Range Holder is always the authority for
  its blocks. A stale entry costs one extra query, never a misrouted call, because the
  CP that receives the query answers `not_held` with an invalidation.

### 9.5 Cache Invalidation

**Any** PSTN2 response (discovery, verification, routing, emergency) MAY carry:
```json
"cache": { "invalidate": true, "scope": "number" }
```

| `scope` | Client action |
|---|---|
| `number` (default) | Purge the cached entry for the subject number, then rediscover from the Range Holder |
| `block` | Re-download the numbering list (the block has moved Range Holder), then rediscover |

This is how porting changes reach caches without a broadcast and without a central
database: the first CP to rely on stale data is told, at the moment it matters.

### 9.6 Keys and Signatures

Discovery responses SHOULD be signed:

- **Algorithm:** Ed25519 over the UTF-8 bytes of the **canonical JSON** of the response
  body without the `signature` field.
- **Canonical JSON:** object keys sorted lexicographically at every level, no
  insignificant whitespace, `/` not escaped, and non-ASCII characters left unescaped.
- `kid` names the key used.
- **Public keys:** published at `GET {url}/pstn2/v1/keys`:

```json
{
  "cpId": "CP1-UK-0102",
  "keys": [
    {
      "kid": "bravo-2026-10",
      "algorithm": "ed25519",
      "publicKey": "base64-32-bytes",
      "validFrom": "2026-10-01T00:00:00Z",
      "validTo": "2027-01-01T00:00:00Z"
    }
  ]
}
```

Discovery data is public and idempotent, so the ±30 second timestamp window (§3.2) and
replay cache (§11.3) do not apply to it. `issued` records when the answer was produced.

### 9.7 Data Minimisation

A CP answers only about its own numbers. A Range Holder reveals only the identity and
URL of the CP a ported number moved to — never subscriber data. No party holds, or can
reconstruct, the national map of who holds every number.

### 9.8 Number Format

- **Wire format:** E.164 (`+441614960123`); discovery URLs use the digits without `+`.
- **Blocks:** prefixes of E.164 digits. UK geographic blocks are typically 1,000
  numbers (for example `441614960` = 0161 496 0000–0999).

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

**Routing:**
- `capacity_exceeded`: CP at capacity
- `unsupported_codec`: No common codec
- `number_not_found`: Destination number not held by this CP (send `not_held` + `cache.invalidate`, §9.5)

**Emergency:**
- `location_unavailable`: Cannot determine location
- `unauthorized_psap`: PSAP not authorized

**Number Discovery** (results, not HTTP errors — see §9.3):
- `unallocated`: No numbering-list block matches the number
- `not_participating`: The block's Range Holder has no PSTN2 URL
- `unknown`: Holder answered 404
- `hop_limit_exceeded`: More than 5 discovery queries
- `loop_detected`: The same CP was reached twice

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

**Ported Numbers and Stale Caches:**
A Number Discovery `redirect` or a `not_held` result with `cache.invalidate` is a
successful `200 OK` response, not an error, and is never retried against the same CP.
Follow the redirect, or purge the cache entry and rediscover from the Range Holder
(§9.3). Maximum 5 hops.

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
- Number Discovery: 200 req/sec minimum (responses are cacheable)
- Numbering list download: at most 1 per hour per CP (ETag revalidation)
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
- ✅ Caller authentication (direct query)
- ✅ Routing discovery and setup
- ✅ Number Discovery (numbering list, Range Holder query, redirects, caching, invalidation)
- ✅ TLS 1.3
- ✅ Message signing and verification
- ✅ Error handling with fallback
- ✅ Ported-number handling (redirect + `not_held` invalidation, max 5 hops)
- ✅ Basic encryption (SRTP)

### 12.2 Optional Features

**Implementations MAY support:**
- Emergency location services
- Call branding
- Video calling
- Advanced codecs (Opus HD)

### 12.3 Performance Targets

**Latency:**
- Authentication: < 100ms (95th percentile)
- Routing request: < 200ms (95th percentile)
- Number Discovery: < 1ms (cache hit), < 50ms per network hop
- Total call setup: < 1 second

**Throughput:**
- Auth requests: 100/sec minimum per CP
- Concurrent calls: 1000 minimum per CP
- Numbering list: full national list held locally (≈ 1 million blocks)

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
- Number Discovery: unported, ported (redirect), stale cache (invalidate), unknown (404)
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
2. **CP1 (Alice's CP) discovers Bob's CP**: cache miss → numbering list says CP3 is the Range Holder → `GET` CP3 → CP3 redirects (Bob ported to CP2) → `GET` CP2 → `held`. CP1 caches the answer
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
- [ ] Number Discovery hop limit (max 5) and loop detection enforced
- [ ] Request size limits enforced (max 100KB)
- [ ] Timeouts configured (2s default)
- [ ] Error messages do not leak sensitive information
- [ ] Logs do not contain private keys or passwords
- [ ] PSAP authentication implemented for emergency queries

---

## Appendix C: Version History

- **v1.1** (2026-10-06): Number Discovery replaces the Directory Service
  - Regulator numbering lists (Ofcom S1–S9) + Range Holder URL locate the Range Holder
  - `GET /pstn2/v1/numbers/{e164digits}` with `held` / `redirect` / `not_held` / 404
  - Response-borne cache invalidation (`cache.invalidate`) on every message type
  - Removed `/directory/all`, `/directory/publish`, `/directory/lookup`, hourly sync and
    eventual-consistency replication
  - Keys published per CP at `/pstn2/v1/keys`
  - Token Pool authentication option removed; direct query is the only authentication method
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
