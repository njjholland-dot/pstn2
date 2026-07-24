/**
 * Basic PSTN2 usage examples
 */

import { PSTN2Client, AuthenticationMode } from '../src';

// Example configuration
const config = {
  cpId: 'CP1-UK-0001',
  apiEndpoint: 'https://api.example-cp.com/pstn2/v1',
  privateKey: process.env.PSTN2_PRIVATE_KEY || 'your-private-key',
  authMode: AuthenticationMode.DirectQuery,
  timeout: 2000,
  retries: 3,
  logLevel: 'info' as const,
};

async function basicExamples() {
  // Initialize client
  const client = new PSTN2Client(config);

  console.log('=== PSTN2 Client Initialized ===\n');

  // Example 1: Verify inbound call
  console.log('Example 1: Verifying inbound call...');
  try {
    const verification = await client.verifyCall({
      callerID: '+441234567890',
      calledID: '+447700900123',
      callReference: client.generateCallReference(),
    });

    console.log('Verification result:', {
      verified: verification.verified,
      callerName: verification.callerName,
      trustLevel: verification.trustLevel,
      portingChain: verification.portingChain,
    });
  } catch (error) {
    console.error('Verification failed:', error);
  }
  console.log('');

  // Example 2: Request direct routing
  console.log('Example 2: Requesting direct routing...');
  try {
    const routing = await client.requestRouting({
      destinationNumber: '+447700900123',
      callerID: '+441234567890',
      mediaCapabilities: {
        codecs: ['opus', 'g722'],
        encryption: ['srtp-aes256'],
        video: false,
      },
      connectionDetails: {
        fqdn: 'media.example-cp.com',
        port: 50000,
      },
      branding: {
        displayName: 'Customer Support',
        callPurpose: 'Account verification',
      },
    });

    if (routing.accepted) {
      console.log('Routing result:', {
        accepted: routing.accepted,
        destinationCP: routing.destinationCP,
        fqdn: routing.connectionDetails.fqdn,
        port: routing.connectionDetails.port,
        codecs: routing.agreedCapabilities.codecs,
      });
    } else {
      console.log('Routing rejected:', {
        accepted: routing.accepted,
        rejectReason: routing.rejectReason,
      });
      console.log('Falling back to traditional PSTN');
    }
  } catch (error) {
    console.error('Routing failed:', error);
  }
  console.log('');

  // Example 3: Get client health
  console.log('Example 3: Checking client health...');
  const health = await client.getHealth();
  console.log('Health status:', JSON.stringify(health, null, 2));
  console.log('');
}

// Run examples
if (require.main === module) {
  basicExamples()
    .then(() => {
      console.log('Examples completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Examples failed:', error);
      process.exit(1);
    });
}

export { basicExamples };
