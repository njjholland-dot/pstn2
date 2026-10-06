/**
 * Example 2: Direct Routing
 *
 * Alpha Telecom (CP1-UK-0101) places a call from +442079460100 to
 * +441614960123. It discovers the destination's holder (Bravo Networks) and
 * asks it for direct connection details, negotiating codecs and SRTP.
 * If there is no PSTN2 path, the call goes via traditional PSTN.
 *
 * Run:  node test-environment/mock-network/server.mjs   (repo root)
 *       npm run example:02
 */

// In your application: import { PSTN2Client } from '@pstn2/core';
import { PSTN2Client } from '../src';
import { banner, describeDiscovery, fmt, startOrExit, rule } from './shared';

const CALLER = '+442079460100';
const DESTINATION = '+441614960123';

async function main() {
  banner('PSTN2 Example 2 — Direct Routing', 'Originating CP asks the destination holder for a direct media path');
  const client = PSTN2Client.fromEnv({ cpId: 'CP1-UK-0101', cpName: 'Alpha Telecom' });
  await startOrExit(client);

  try {
    console.log(`Outbound call ${fmt(CALLER)} → ${fmt(DESTINATION)}`);
    const offered = { codecs: ['opus', 'g722', 'pcmu'], encryption: ['srtp-aes256', 'srtp-aes128'], video: false, maxBandwidth: 128000 };
    console.log(`  Offering codecs ${offered.codecs.join(', ')}; encryption ${offered.encryption.join(', ')}`);

    const routing = await client.requestRouting({
      destinationNumber: DESTINATION,
      callerID: CALLER,
      callReference: client.generateCallReference(),
      mediaCapabilities: offered,
      branding: { displayName: 'Alpha Telecom Support', callPurpose: 'Account enquiry' },
    });
    console.log(`  Discovery: ${describeDiscovery(client, routing.discovery)}`);
    console.log(rule());

    if (routing.accepted) {
      const cd = routing.connectionDetails;
      console.log(`✓ Routing accepted by ${routing.holder?.cpName || routing.holder?.cpId}`);
      console.log('  Connection details:');
      console.log(`    FQDN:      ${cd.fqdn}`);
      console.log(`    IPv4/IPv6: ${cd.ipv4 || '-'} / ${cd.ipv6 || '-'}`);
      console.log(`    Port:      ${cd.port}/${cd.protocol}`);
      console.log(`    Peer key:  ${cd.publicKey ? cd.publicKey.slice(0, 24) + '…' : 'n/a'} (Ed25519 identity, authenticates DTLS)`);
      console.log('  Agreed capabilities:');
      console.log(`    Codec:      ${routing.agreedCapabilities.codecs.join(', ')}`);
      console.log(`    Encryption: ${routing.agreedCapabilities.encryption.join(', ')}`);
      console.log(`    Video:      ${routing.agreedCapabilities.video ? 'yes' : 'no'}`);
      console.log('');
      console.log(`Next: send the SIP INVITE directly to ${cd.fqdn}:${cd.port}; media keys come from DTLS-SRTP.`);
    } else {
      console.log(`✗ No direct route (${routing.reason}) — routing via traditional PSTN`);
    }
  } catch (err) {
    console.log(`✗ Routing error: ${(err as Error).message} — routing via traditional PSTN`);
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
