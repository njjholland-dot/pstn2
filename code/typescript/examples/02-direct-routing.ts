/**
 * Example 2: Direct Routing
 *
 * This example demonstrates how to request direct peer-to-peer routing
 * for an outbound call, including media capability negotiation.
 */

// In your application, import from the published package instead:
//   import { PSTN2Client, AuthenticationMode, ConnectionDetails } from '@pstn2/core';
import { PSTN2Client, AuthenticationMode, ConnectionDetails } from '../src';

async function main() {
  const client = new PSTN2Client({
    cpId: 'CP1-UK-0001',
    apiEndpoint: 'https://api.yourcp.com/pstn2/v1',
    privateKey: process.env.PSTN2_PRIVATE_KEY!,
    authMode: AuthenticationMode.DirectQuery,
  });

  console.log('Requesting direct routing for outbound call...');
  console.log('---');

  try {
    // Request routing with media capabilities
    const routing = await client.routing.requestRouting({
      destinationNumber: '+447700900123',
      callerID: '+441234567890',
      callReference: 'xyz-789-abc-012',
      mediaCapabilities: {
        codecs: ['opus', 'g722', 'pcmu'],
        encryption: ['srtp-aes256', 'srtp-aes128'],
        video: false,
        maxBandwidth: 128000, // 128 kbps
      },
      branding: {
        displayName: 'ACME Support',
        logo: 'https://cdn.acme.com/logo.png',
        backgroundColor: '#0066cc',
        textColor: '#ffffff',
        callPurpose: 'Account Security Alert',
      },
    });

    if (routing.accepted) {
      console.log('✓ Routing accepted!');
      console.log('');
      console.log('Connection Details:');
      console.log('  FQDN:', routing.connectionDetails.fqdn);
      console.log('  IPv4:', routing.connectionDetails.ipv4);
      console.log('  IPv6:', routing.connectionDetails.ipv6 || 'N/A');
      console.log('  Port:', routing.connectionDetails.port);
      console.log('  Protocol:', routing.connectionDetails.protocol);
      console.log('');
      console.log('Agreed Capabilities:');
      console.log('  Codecs:', routing.agreedCapabilities.codecs.join(', '));
      console.log('  Encryption:', routing.agreedCapabilities.encryption.join(', '));
      console.log('  Video:', routing.agreedCapabilities.video ? 'Yes' : 'No');
      console.log('');
      console.log('Encryption:');
      console.log('  Public Key:', routing.connectionDetails.publicKey?.substring(0, 32) + '...');
      console.log('  Algorithm: Ed25519');
      console.log('');

      // Now you can establish the media connection
      console.log('Ready to establish encrypted media connection!');
      console.log(`Connect to: ${routing.connectionDetails.fqdn}:${routing.connectionDetails.port}`);

      // Simulate media connection
      await simulateMediaConnection(routing.connectionDetails);

    } else {
      console.log('✗ Routing rejected');
      console.log('Reason:', routing.rejectReason);
      console.log('Falling back to traditional PSTN');
    }
  } catch (error) {
    console.error('Error requesting routing:', error);
    console.log('Falling back to traditional PSTN');
  }

  await client.close();
}

async function simulateMediaConnection(details: ConnectionDetails) {
  console.log('');
  console.log(`Establishing media connection to ${details.fqdn}:${details.port}...`);
  console.log('  1. Performing DTLS handshake');
  console.log('  2. Exchanging SRTP keys');
  console.log('  3. Setting up Opus codec');
  console.log('  4. Media connection established!');
  console.log('');
  console.log('✓ Call connected - encrypted HD audio ready');
}

main().catch(console.error);
