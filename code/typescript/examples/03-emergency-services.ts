/**
 * Example 3: Emergency Services
 *
 * A PSAP answers a 999 call from +441614960123. It discovers the CP that
 * holds the caller's number (Bravo Networks) and asks it for live location.
 * A second caller, +441134960456, was ported from Charlie to Bravo: the
 * Range Holder's redirect sends the PSAP to the right CP. If PSTN2 cannot
 * provide location, the PSAP uses its other sources (cell, billing address).
 *
 * Run:  node test-environment/mock-network/server.mjs   (repo root)
 *       npm run example:03
 */

// In your application: import { PSTN2Client, DiscoveryError } from '@pstn2/core';
import { PSTN2Client, DiscoveryError } from '../src';
import { banner, describeDiscovery, fmt, startOrExit, rule } from './shared';

const PSAP_ID = 'UK-999-MANCHESTER-01';
const callers = ['+441614960123', '+441134960456', '+441614960999'];

async function main() {
  banner('PSTN2 Example 3 — Emergency Services', `PSAP ${PSAP_ID} queries live caller location`);
  const psap = PSTN2Client.fromEnv({ cpId: 'PSAP-UK-999-01' });
  await startOrExit(psap);

  try {
    for (const callerID of callers) {
      console.log(rule());
      console.log(`999 call from ${fmt(callerID)}`);
      const start = Date.now();
      try {
        const loc = await psap.getEmergencyLocation({ callerID, psapID: PSAP_ID, callReference: psap.generateCallReference() });
        console.log(`  Discovery: ${describeDiscovery(psap, loc.discovery)}`);
        console.log(`  ✓ Location from ${loc.holder.cpName || loc.holder.cpId} in ${Date.now() - start}ms`);
        console.log(`    Lat/long:  ${loc.location.latitude}, ${loc.location.longitude} (±${loc.location.accuracy}m, ${loc.location.source || 'unknown source'})`);
        if (loc.address) console.log(`    Address:   ${[loc.address.street, loc.address.city, loc.address.postcode, loc.address.country].filter(Boolean).join(', ')}`);
        console.log('    → Dispatch to the location above');
      } catch (err) {
        if (err instanceof DiscoveryError) console.log(`  Discovery: ${describeDiscovery(psap, err.discovery)}`);
        console.log(`  ✗ No PSTN2 location (${(err as Error).message})`);
        console.log('    → Fall back to cell-tower / billing-address location');
      }
    }
    console.log(rule());
  } finally {
    await psap.close();
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
