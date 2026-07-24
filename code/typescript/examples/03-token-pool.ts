/**
 * Example 3: Token Pool Authentication
 *
 * This example demonstrates Token Pool authentication (Option 2),
 * which creates a shared token before placing the call.
 */

import { PSTN2Client, AuthenticationMode } from '@pstn2/core';

async function main() {
  // Initialize client with Token Pool mode
  const client = new PSTN2Client({
    cpId: 'CP1-UK-0001',
    apiEndpoint: 'https://api.yourcp.com/pstn2/v1',
    privateKey: process.env.PSTN2_PRIVATE_KEY!,
    authMode: AuthenticationMode.TokenPool,
    tokenPoolEndpoint: 'https://tokenpool.pstn2.org',
    tokenPoolAuth: process.env.TOKEN_POOL_JWT,
  });

  console.log('Token Pool Authentication Example');
  console.log('---');

  // STEP 1: Create token before placing call (Originating CP)
  console.log('Step 1: Creating authentication token...');

  try {
    const token = await client.auth.createToken({
      callerID: '+441234567890',
      calledID: '+447700900123',
      callReference: 'token-call-123',
      ttl: 30, // 30 seconds
      branding: {
        displayName: 'ACME Corp',
        callPurpose: 'Customer Service',
      },
    });

    console.log('✓ Token created successfully');
    console.log('  Token ID:', token.tokenId);
    console.log('  Expires:', token.expiresAt);
    console.log('  Call Reference:', token.callReference);
    console.log('');

    // STEP 2: Place call with token in SIP INVITE
    console.log('Step 2: Placing call with token...');
    console.log('  SIP INVITE Header:');
    console.log(`    X-PSTN2-Token: ${token.tokenId}`);
    console.log('');

    // Simulate some time passing
    await new Promise(resolve => setTimeout(resolve, 1000));

    // STEP 3: Recipient CP verifies token (on different CP)
    console.log('Step 3: Recipient CP verifying token...');

    const verification = await client.auth.verifyToken(token.tokenId);

    if (verification) {
      console.log('✓ Token verified successfully');
      console.log('  Originating CP:', verification.originatingCP);
      console.log('  Caller ID:', verification.callerID);
      console.log('  Called ID:', verification.calledID);
      console.log('  Verified:', verification.verified);

      if (verification.branding) {
        console.log('  Display Name:', verification.branding.displayName);
        console.log('  Call Purpose:', verification.branding.callPurpose);
      }
      console.log('');
      console.log('Call can proceed with confidence!');
    } else {
      console.log('✗ Token verification failed');
      console.log('Token may have expired or been tampered with');
    }

    // STEP 4: Show token pool benefits
    console.log('');
    console.log('Token Pool Benefits:');
    console.log('  ✓ Reduced query load (one create, many verifies)');
    console.log('  ✓ Works with any SIP header');
    console.log('  ✓ Short TTL limits fraud window');
    console.log('  ✓ Shared pool enables analytics');

  } catch (error) {
    console.error('Error with token pool:', error);
  }

  await client.close();
}

main().catch(console.error);
