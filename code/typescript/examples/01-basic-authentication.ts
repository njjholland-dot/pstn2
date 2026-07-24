/**
 * Example 1: Basic Authentication
 *
 * This example demonstrates how to verify an inbound call using
 * PSTN2 authentication (Option 1: Direct Query).
 */

// In your application, import from the published package instead:
//   import { PSTN2Client, AuthenticationMode } from '@pstn2/core';
import { PSTN2Client, AuthenticationMode } from '../src';

async function main() {
  // Initialize PSTN2 client
  const client = new PSTN2Client({
    cpId: 'CP1-UK-0001',
    apiEndpoint: 'https://api.yourcp.com/pstn2/v1',
    privateKey: process.env.PSTN2_PRIVATE_KEY!,
    authMode: AuthenticationMode.DirectQuery,
    timeout: 2000,
    retries: 3,
    logLevel: 'info',
  });

  console.log('PSTN2 Client initialized');
  console.log('CP ID:', client.config.cpId);
  console.log('Auth Mode:', client.config.authMode);
  console.log('---');

  // Scenario: Verify an inbound call
  console.log('Verifying inbound call...');

  try {
    const verification = await client.auth.verifyCall({
      callerID: '+441234567890',
      calledID: '+447700900123',
      callReference: 'abc-123-def-456',
    });

    if (verification.verified) {
      console.log('✓ Call verified successfully!');
      console.log('  Caller Name:', verification.callerName || 'Unknown');
      console.log('  Organization:', verification.callerOrg || 'N/A');
      console.log('  Call Purpose:', verification.callPurpose || 'General');
      console.log('  Trust Level:', verification.trustLevel);

      if (verification.branding) {
        console.log('  Branding:');
        console.log('    Display Name:', verification.branding.displayName);
        console.log('    Logo:', verification.branding.logo);
        console.log('    Colors:', verification.branding.backgroundColor);
      }

      if (verification.portingChain && verification.portingChain.length > 1) {
        console.log('  Porting Chain:', verification.portingChain.join(' → '));
      }
    } else {
      console.log('✗ Call NOT verified');
      console.log('  This may indicate caller ID spoofing');
      console.log('  Recommended: Block or warn user');
    }
  } catch (error) {
    console.error('Error during verification:', error);

    // Fallback: proceed with traditional PSTN
    console.log('Falling back to traditional PSTN routing');
  }

  // Cleanup
  await client.close();
}

// Run the example
main().catch(console.error);
