/**
 * Token pool authentication example
 */

import { PSTN2Client, AuthenticationMode } from '../src';

const config = {
  cpId: 'CP1-UK-0001',
  apiEndpoint: 'https://api.example-cp.com/pstn2/v1',
  privateKey: process.env.PSTN2_PRIVATE_KEY || 'your-private-key',
  authMode: AuthenticationMode.TokenPool,
  tokenPoolEndpoint: 'https://tokenpool.pstn2.org',
  tokenPoolAuth: process.env.TOKEN_POOL_JWT || 'your-jwt-token',
  fallbackToTraditional: true, // Enable fallback to direct query
  logLevel: 'info' as const,
};

async function tokenPoolExample() {
  const client = new PSTN2Client(config);

  console.log('=== Token Pool Authentication Example ===\n');

  // Originating CP: Create token before placing call
  console.log('Step 1: Creating token...');
  const token = await client.auth.createToken({
    callerID: '+441234567890',
    calledID: '+447700900123',
    callReference: client.generateCallReference(),
    ttl: 30, // TTL in seconds
    branding: {
      displayName: 'ACME Corp',
      callPurpose: 'Account Alert',
      logo: 'https://cdn.acme.com/logo.png',
    },
  });

  console.log('Token created:', {
    tokenId: token.tokenId,
    expiresAt: token.expiresAt,
    callReference: token.callReference,
  });
  console.log('');

  // Simulate sending INVITE with tokenId...
  console.log('Step 2: Sending INVITE with token ID:', token.tokenId);
  console.log('(In real scenario, this would be sent via SIP)');
  console.log('');

  // Recipient CP: Verify token
  console.log('Step 3: Recipient verifying token...');
  const verification = await client.verifyCall({
    callerID: '+441234567890',
    calledID: '+447700900123',
    callReference: client.generateCallReference(),
    tokenId: token.tokenId, // Token from INVITE
  });

  console.log('Token verification result:', {
    verified: verification.verified,
    callerName: verification.callerName,
    callPurpose: verification.callPurpose,
    trustLevel: verification.trustLevel,
  });
  console.log('');

  // Test fallback scenario
  console.log('Step 4: Testing fallback (invalid token)...');
  try {
    const fallbackVerification = await client.verifyCall({
      callerID: '+441234567890',
      calledID: '+447700900123',
      callReference: client.generateCallReference(),
      tokenId: 'invalid-token-12345',
    });

    console.log('Fallback verification result:', {
      verified: fallbackVerification.verified,
      note: 'Fell back to direct query authentication',
    });
  } catch (error) {
    console.error('Fallback verification failed:', error);
  }
}

if (require.main === module) {
  tokenPoolExample()
    .then(() => {
      console.log('\nToken pool example completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\nToken pool example failed:', error);
      process.exit(1);
    });
}

export { tokenPoolExample };
