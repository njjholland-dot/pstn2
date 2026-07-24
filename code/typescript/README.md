# @pstn2/core - TypeScript/Node.js Library

Official TypeScript implementation of the PSTN2 distributed telecommunications protocol.

## Installation

```bash
npm install @pstn2/core
```

## Quick Start

```typescript
import { PSTN2Client, AuthenticationMode } from '@pstn2/core';

// Initialize client
const client = new PSTN2Client({
  cpId: 'CP1-UK-0001',
  apiEndpoint: 'https://api.yourcp.com/pstn2/v1',
  privateKey: process.env.PSTN2_PRIVATE_KEY,
  authMode: AuthenticationMode.DirectQuery, // or TokenPool
});

// Verify an inbound call
const verification = await client.auth.verifyCall({
  callerID: '+441234567890',
  calledID: '+447700900123',
  callReference: 'unique-call-id',
});

if (verification.verified) {
  console.log(`Call from ${verification.callerName} verified`);
  console.log(`Purpose: ${verification.callPurpose}`);
}

// Request direct routing for outbound call
const routing = await client.routing.requestRouting({
  destinationNumber: '+447700900123',
  callerID: '+441234567890',
  mediaCapabilities: {
    codecs: ['opus', 'g722'],
    encryption: ['srtp-aes256'],
  },
});

if (routing.accepted) {
  // Establish direct media connection
  const media = await client.media.connect({
    fqdn: routing.connectionDetails.fqdn,
    port: routing.connectionDetails.port,
    publicKey: routing.connectionDetails.publicKey,
  });
}
```

## Features

- ✅ **Authentication**: Verify caller IDs in real-time (Option 1 & 2)
- ✅ **Direct Routing**: Discover IP/Port for peer-to-peer calls
- ✅ **End-to-End Encryption**: Per-call key exchange
- ✅ **Call Branding**: Display caller information
- ✅ **Emergency Services**: Live location for 999/112 calls
- ✅ **Directory Service**: Distributed number database
- ✅ **Automatic Fallback**: Falls back to traditional PSTN on timeout

## Architecture

### Modules

- **auth/**: Authentication (Option 1 direct queries, Option 2 token pool)
- **routing/**: Direct routing discovery and setup
- **encryption/**: Key management and media encryption
- **branding/**: Call branding and purpose signaling
- **emergency/**: Emergency services location
- **directory/**: Distributed directory service
- **messaging/**: Core HTTP messaging with retry logic

### Authentication Modes

#### Option 1: Direct Query
```typescript
const client = new PSTN2Client({
  authMode: AuthenticationMode.DirectQuery,
  // ...
});

// Queries originating CP directly to verify call
```

#### Option 2: Token Pool
```typescript
const client = new PSTN2Client({
  authMode: AuthenticationMode.TokenPool,
  tokenPoolEndpoint: 'https://tokenpool.pstn2.org',
  tokenPoolAuth: process.env.TOKEN_POOL_JWT,
  // ...
});

// Creates/verifies tokens in shared pool
```

## Configuration

```typescript
interface PSTN2Config {
  // CP identification
  cpId: string;                    // Your RCPID
  apiEndpoint: string;             // Your API endpoint URL

  // Security
  privateKey: string;              // For signing messages
  publicKey?: string;              // Will be derived if not provided

  // Authentication
  authMode: AuthenticationMode;    // DirectQuery or TokenPool
  tokenPoolEndpoint?: string;      // If using TokenPool
  tokenPoolAuth?: string;          // JWT for token pool

  // Caching
  cacheDirectory?: boolean;        // Cache other CPs' directories
  cacheTTL?: number;               // Cache TTL in seconds (default: 3600)

  // Network
  timeout?: number;                // Request timeout ms (default: 2000)
  retries?: number;                // Number of retries (default: 3)

  // Fallback
  fallbackToTraditional?: boolean; // Fallback to PSTN (default: true)

  // Logging
  logLevel?: 'error' | 'warn' | 'info' | 'debug';
}
```

## Examples

### Verify Inbound Call with Porting Chain

```typescript
// Recipient CP verifies caller
const verification = await client.auth.verifyCall({
  callerID: '+441234567890',
  calledID: '+447700900123',
  callReference: 'abc-123',
});

// If number is ported, library automatically follows chain
// verification.portingChain shows the path taken
console.log('Porting chain:', verification.portingChain);
// ['CP1-UK-0001', 'CP2-UK-0002', 'CP3-UK-0003']
```

### Direct Routing with Encryption

```typescript
// Request routing info
const routing = await client.routing.requestRouting({
  destinationNumber: '+447700900123',
  callerID: '+441234567890',
  callReference: 'xyz-789',
  mediaCapabilities: {
    codecs: ['opus'],
    encryption: ['srtp-aes256'],
    video: false,
  },
  // Client automatically includes your public key
});

if (routing.accepted) {
  // Keys are exchanged, ready for encrypted media
  console.log('Connect to:', routing.connectionDetails.fqdn);
  console.log('Encrypt with:', routing.connectionDetails.publicKey);
}
```

### Call with Branding

```typescript
// Originating CP includes branding
const routing = await client.routing.requestRouting({
  destinationNumber: '+447700900123',
  callerID: '+441234567890',
  branding: {
    displayName: 'ACME Support',
    logo: 'https://cdn.acme.com/logo.png',
    backgroundColor: '#0066cc',
    callPurpose: 'Account Security Alert',
  },
});

// Recipient can display branding before ringing phone
```

### Emergency Call with Live Location

```typescript
// PSAP queries for location
const location = await client.emergency.getLocation({
  callerID: '+441234567890',
  callReference: 'emergency-456',
  psapID: 'UK-999-LONDON-CENTRAL',
});

console.log('Location:', location.location.latitude, location.location.longitude);
console.log('Accuracy:', location.location.accuracy, 'meters');
console.log('Address:', location.address.street, location.address.postcode);
```

### Directory Service (for eventual consistency)

```typescript
// Publish your directory
await client.directory.publish({
  ranges: [
    {
      numberRange: '+4471234567XX',
      status: 'active',
      apiEndpoint: 'https://api.yourcp.com/pstn2/v1',
    },
  ],
});

// Pull other CPs' directories
const allCPs = await client.directory.pullAll();
console.log(`Cached ${allCPs.length} CP directories`);

// Query cached directory
const cp = await client.directory.lookup('+441234567890');
console.log('Number hosted by:', cp.cpId);
console.log('API endpoint:', cp.apiEndpoint);
```

### Token Pool Operations

```typescript
// Create token before placing call
const token = await client.auth.createToken({
  callerID: '+441234567890',
  calledID: '+447700900123',
  callReference: 'token-call-123',
  ttl: 30, // 30 seconds
});

console.log('Include token in INVITE:', token.tokenId);

// Recipient verifies token
const tokenData = await client.auth.verifyToken(token.tokenId);
if (tokenData) {
  console.log('Call from:', tokenData.cpId);
  console.log('Caller ID:', tokenData.callerID);
}
```

## Error Handling

```typescript
import { PSTN2Error, ErrorCode } from '@pstn2/core';

try {
  const verification = await client.auth.verifyCall({...});
} catch (error) {
  if (error instanceof PSTN2Error) {
    switch (error.code) {
      case ErrorCode.Timeout:
        // Fall back to traditional PSTN
        console.log('Verification timeout, using traditional routing');
        break;

      case ErrorCode.CallNotFound:
        // Potential fraud - caller ID not verified
        console.log('WARNING: Unverified caller ID');
        break;

      case ErrorCode.NumberPorted:
        // Library automatically retries with new CP
        console.log('Number ported, retrying...');
        break;

      default:
        console.error('PSTN2 error:', error.message);
    }
  } else {
    throw error;
  }
}
```

## Testing

```bash
# Run tests
npm test

# Run with coverage
npm test:coverage

# Watch mode
npm test:watch
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Watch mode
npm run watch

# Lint
npm run lint

# Format
npm run format
```

## API Documentation

Full API documentation generated with TypeDoc:

```bash
npm run docs
# Open docs/index.html
```

## License

MIT - See LICENSE file

## Contributing

Contributions welcome! Please see [CONTRIBUTING.md](../../CONTRIBUTING.md)

## Support

- Documentation: https://pstn2.org/docs
- GitHub Issues: https://github.com/pstn2/pstn2/issues
- Email: nick.holland@8x8.com

## Related Packages

- [@pstn2/cli](../cli) - Command line tools
- [@pstn2/server](../server) - API server implementation
- [@pstn2/mock](../mock) - Mock CP for testing
