# PSTN2 Code Examples

This guide documents the working code examples in /code/ demonstrating how to use the PSTN2 protocol in TypeScript, Python, and Go.

## Overview

All examples demonstrate the same functionality across three languages:

1. **Basic Authentication** - Verify inbound calls using Direct Query authentication
2. **Direct Routing** - Request peer-to-peer routing with media capability negotiation
3. **Token Pool** - Use Token Pool authentication for high-volume scenarios
4. **Emergency Services** - Query real-time location data for emergency calls (PSAP perspective)
5. **Complete Call Flow** - End-to-end scenario showing all PSTN2 features working together

## Directory Structure

```
code/
├── typescript/
│   └── examples/
│       ├── 01-basic-authentication.ts
│       ├── 02-direct-routing.ts
│       ├── 03-token-pool.ts
│       ├── 04-emergency-services.ts
│       └── 05-complete-call-flow.ts
├── python/
│   └── examples/
│       ├── 01_basic_authentication.py
│       ├── 02_direct_routing.py
│       ├── 03_token_pool.py
│       ├── 04_emergency_services.py
│       └── 05_complete_call_flow.py
└── go/
    └── examples/
        ├── 01-basic-authentication.go
        ├── 02-direct-routing.go
        ├── 03-token-pool.go
        ├── 04-emergency-services.go
        └── 05-complete-call-flow.go
```

## Prerequisites

### All Languages

Before running any examples, you need:

1. **PSTN2 Account**: Register as a Communications Provider (CP) and obtain:
   - CP ID (e.g., `CP1-UK-0001`)
   - API endpoint URL
   - Private key for Ed25519 signing

2. **Environment Variables**: Set up the following:
   ```bash
   export PSTN2_PRIVATE_KEY="your-private-key-here"
   export CP1_PRIVATE_KEY="your-private-key-here"  # For complete call flow
   export PSAP_PRIVATE_KEY="your-psap-key-here"     # For emergency services
   export TOKEN_POOL_JWT="your-jwt-token-here"      # For token pool example
   ```

### Language-Specific Setup

See the README.md file in each language directory for setup instructions:
- [TypeScript README](../code/typescript/README.md)
- [Python README](../code/python/README.md)
- [Go README](../code/go/README.md)

## Example Descriptions

### Example 1: Basic Authentication

**Purpose**: Demonstrates how to verify an inbound call's authenticity using PSTN2 Direct Query authentication.

**What it shows**:
- Client initialization with configuration
- Verifying caller ID authenticity
- Accessing caller information (name, organization)
- Viewing call branding details
- Handling porting chains (number portability)
- Error handling and PSTN fallback

**Use case**: When you receive an incoming call and want to verify the caller ID is legitimate before presenting it to your end user.

**Expected output**:
```
PSTN2 Client initialized
CP ID: CP1-UK-0001
Auth Mode: DirectQuery
---
Verifying inbound call...
✓ Call verified successfully!
  Caller Name: John Smith
  Organization: ACME Corp
  Call Purpose: Customer Service
  Trust Level: verified
  Branding:
    Display Name: ACME Support
    Logo: https://cdn.acme.com/logo.png
    Colors: #0066cc
```

### Example 2: Direct Routing

**Purpose**: Shows how to request direct peer-to-peer routing for an outbound call, eliminating transit providers.

**What it shows**:
- Requesting routing with media capabilities
- Codec negotiation (Opus, G.722, PCMU)
- Encryption preferences (SRTP-AES256)
- Call branding configuration
- Connection details for media setup
- Public key exchange for encryption

**Use case**: When placing an outbound call and you want to establish a direct connection to the destination CP for better quality and lower costs.

**Expected output**:
```
Requesting direct routing for outbound call...
---
✓ Routing accepted!

Connection Details:
  FQDN: media1.cp2.example.com
  IPv4: 203.0.113.42
  IPv6: 2001:db8::1
  Port: 5060
  Transport: TLS

Agreed Capabilities:
  Codecs: opus, g722
  Encryption: srtp-aes256
  Video: No

Ready to establish encrypted media connection!
```

### Example 3: Token Pool

**Purpose**: Demonstrates Token Pool authentication, an alternative to Direct Query that reduces query load.

**What it shows**:
- Creating authentication tokens before placing calls
- Including tokens in SIP headers
- Verifying tokens on the recipient side
- Token expiration (TTL)
- Benefits of centralized token pool

**Use case**: High-volume call centers that want to reduce the authentication query load on their infrastructure.

**Expected output**:
```
Token Pool Authentication Example
---
Step 1: Creating authentication token...
✓ Token created successfully
  Token ID: TK-1234567890abcdef
  Expires: 2025-11-30T12:30:45Z
  Call Reference: token-call-123

Step 2: Placing call with token...
  SIP INVITE Header:
    X-PSTN2-Token: TK-1234567890abcdef

Step 3: Recipient CP verifying token...
✓ Token verified successfully
  Originating CP: CP1-UK-0001
  Caller ID: +441234567890
  Verified: true
```

### Example 4: Emergency Services

**Purpose**: Shows how PSAPs (Public Safety Answering Points) query real-time location data for emergency calls.

**What it shows**:
- PSAP client initialization
- Emergency location query
- GPS coordinates and accuracy
- Address information
- Additional context (cell towers, WiFi APs)
- Dispatch recommendations based on accuracy
- Comparison with traditional PSTN location

**Use case**: When a 999/112/911 call is received and the PSAP needs to determine the caller's exact location.

**Expected output**:
```
Emergency Services Location Query
PSAP: London Central 999
---
Emergency call received:
  From: +441234567890
  Time: 2025-11-30T12:15:30Z

Querying real-time location...
✓ Location retrieved successfully

GPS Coordinates:
  Latitude: 51.507351
  Longitude: -0.127758
  Accuracy: 8.5 meters
  Source: gps

Address:
  Street: 10 Downing Street
  City: London
  Postcode: SW1A 2AA
  Country: United Kingdom

Dispatch Recommendations:
  ✓ Excellent accuracy - dispatch to exact location
  ✓ GPS lock strong
```

### Example 5: Complete Call Flow

**Purpose**: End-to-end demonstration of a complete PSTN2 call from Alice to Bob, showing all features working together.

**What it shows**:
- All 7 phases of PSTN2 call setup:
  1. Directory lookup (finding recipient's CP)
  2. Authentication (verifying caller identity)
  3. Direct routing (negotiating peer-to-peer connection)
  4. Key exchange (DTLS/SRTP setup)
  5. Media setup (RTP session establishment)
  6. Call branding (caller display on recipient phone)
  7. Call connected (encrypted conversation)
- Timing breakdown for each phase
- Visual representation of caller display
- Comparison with traditional PSTN
- Complete feature and security summary

**Use case**: Understanding the complete PSTN2 call flow and seeing how all components work together in a real-world scenario.

**Expected output**:
```
============================================================
COMPLETE PSTN2 CALL FLOW
Alice (CP1) → Bob (CP2)
============================================================

📱 Phase 1: Alice dials Bob's number
   Alice: +441234567890
   Bob:   +447700900123

🔍 Looking up Bob's CP in directory...
   ✓ Found: CP1-UK-0002
   ✓ Endpoint: https://api.cp2.example.com/pstn2/v1
   ⏱  Time: 45ms

🔐 Phase 2: Authenticating call with Bob's CP...
   ✓ Call authenticated
   ✓ Trust Level: verified
   ⏱  Time: 78ms

🔄 Phase 3: Requesting direct routing...
   ✓ Routing accepted
   ✓ Media Server: media1.cp2.example.com
   ✓ Codec: opus
   ✓ Encryption: srtp-aes256
   ⏱  Time: 92ms

[... remaining phases ...]

============================================================
CALL SUMMARY
============================================================

Timing Breakdown:
  Directory Lookup:     45ms
  Authentication:       78ms
  Routing Request:      92ms
  Key Exchange:         35ms
  Media Setup:          50ms
  -----------------------------------
  Total Setup Time:     300ms

Traditional PSTN Comparison:
  PSTN2:        ~300ms setup time
  Traditional:  5,000-8,000ms setup time
  Improvement:  16x faster! 🚀

Features Enabled:
  ✓ Caller ID verification (fraud prevention)
  ✓ Direct routing (cost reduction)
  ✓ End-to-end encryption (privacy)
  ✓ Call branding (trust)
  ✓ HD audio quality (Opus codec)

💚 Call in progress - Alice and Bob are talking!
```

## Running the Examples

### Quick Start

1. Choose your preferred language
2. Navigate to that directory:
   ```bash
   cd typescript  # or python, or go
   ```
3. Follow the setup instructions in the language-specific README
4. Set environment variables
5. Run an example:
   ```bash
   # TypeScript
   npm run example:01

   # Python
   python examples/01_basic_authentication.py

   # Go
   go run examples/01-basic-authentication.go
   ```

## Common Patterns

### Error Handling

All examples include proper error handling with fallback to traditional PSTN:

**TypeScript**:
```typescript
try {
  const verification = await client.auth.verifyCall({...});
  // Handle success
} catch (error) {
  console.error('Error:', error);
  console.log('Falling back to traditional PSTN');
}
```

**Python**:
```python
try:
    verification = await client.auth.verify_call(...)
    # Handle success
except Exception as error:
    print(f'Error: {error}')
    print('Falling back to traditional PSTN')
```

**Go**:
```go
verification, err := client.Auth().VerifyCall(ctx, &types.VerifyCallRequest{...})
if err != nil {
    fmt.Printf("Error: %v\n", err)
    fmt.Println("Falling back to traditional PSTN")
    return
}
```

### Configuration

All examples use environment variables for sensitive configuration:

```typescript
// TypeScript
privateKey: process.env.PSTN2_PRIVATE_KEY!

# Python
private_key=os.environ['PSTN2_PRIVATE_KEY']

// Go
PrivateKey: os.Getenv("PSTN2_PRIVATE_KEY")
```

### Client Cleanup

Always close clients when done:

```typescript
// TypeScript - use finally or defer-like pattern
await client.close();

# Python - use finally
await client.close()

// Go - use defer
defer client.Close()
```

## Testing

For testing examples without a real PSTN2 account, you can:

1. **Use Mock Responses**: Modify examples to use mock data
2. **Run a Local Test Server**: Set up a local PSTN2-compatible API server
3. **Use Test Credentials**: Some PSTN2 providers offer sandbox environments

See [TESTING-SPECIFICATION.md](TESTING-SPECIFICATION.md) for more details.

## Integration Patterns

### SIP Integration

PSTN2 is designed to work alongside existing SIP infrastructure:

1. **Inbound Calls**: When receiving a SIP INVITE:
   - Extract caller ID and call reference from SIP headers
   - Call `verifyCall()` to authenticate
   - Add verification results to SIP headers
   - Route call to destination

2. **Outbound Calls**: When placing a SIP INVITE:
   - Call `requestRouting()` to find direct path
   - If accepted, establish media connection to returned endpoint
   - If rejected, route via traditional PSTN

3. **Emergency Calls**: When receiving 999/112/911:
   - Route to appropriate PSAP
   - PSAP calls `getLocation()` immediately
   - Display location to operator
   - Dispatch emergency services

### Backward Compatibility

All examples demonstrate graceful fallback to traditional PSTN when PSTN2 features are unavailable:

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

Based on the examples:

- **Directory Lookup**: 20-50ms typical
- **Authentication**: 50-100ms typical
- **Routing Request**: 80-120ms typical
- **Total Call Setup**: 200-500ms typical (vs. 5-8 seconds traditional PSTN)

Performance tips:
1. Cache directory results (with TTL)
2. Use Token Pool for high-volume scenarios
3. Implement connection pooling for HTTP clients
4. Use exponential backoff for retries

## Security Best Practices

All examples demonstrate:

1. **Private Key Protection**: Never hardcode keys, use environment variables
2. **TLS Everywhere**: All API calls use HTTPS/TLS 1.3
3. **Signature Verification**: All messages are cryptographically signed
4. **Short TTLs**: Token Pool tokens expire in 30 seconds
5. **Error Information**: Never expose sensitive data in error messages

## Troubleshooting

Common issues and solutions:

### "Authentication failed"
- Check your private key is correct
- Verify your CP ID matches your account
- Ensure your API endpoint URL is correct
- Check network connectivity to PSTN2 API

### "Directory lookup failed"
- Number may not be in PSTN2 directory yet
- Try with a known PSTN2-enabled number
- Check directory endpoint is accessible

### "Routing rejected"
- Destination CP may not support direct routing
- Media capabilities may not match
- Fallback to traditional PSTN is normal

### "Token expired"
- Default TTL is 30 seconds
- Increase TTL if needed for longer call setup times
- Ensure clocks are synchronized (use NTP)

## Further Reading

- [SPECIFICATION.md](SPECIFICATION.md) - Complete PSTN2 protocol specification
- [API-SPECIFICATION.yaml](API-SPECIFICATION.yaml) - REST API documentation
- [IMPLEMENTATION-GUIDE.md](IMPLEMENTATION-GUIDE.md) - Implementation patterns and best practices
- [TESTING-SPECIFICATION.md](TESTING-SPECIFICATION.md) - Testing strategies and certification

## Support

For issues with the examples:
1. Check the language-specific README
2. Review the troubleshooting section above
3. Consult the main specification documents
4. Contact your PSTN2 provider for API support

## License

These examples are provided as reference implementations for the PSTN2 protocol. See the main project LICENSE file for details.
