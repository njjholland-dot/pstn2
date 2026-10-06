/**
 * Example 1: Basic Authentication (Direct Query)
 *
 * Charlie Comms (CP1-UK-0103) is the TERMINATING CP. For each inbound call it
 * finds the CP that currently holds the caller ID with Number Discovery and
 * asks that CP to verify the call:
 *
 *   1. +442079460100  Alpha Telecom, unported          → verified
 *   2. +441614960123  Bravo Networks                   → verified
 *   3. +441614960999  not in service (spoofed)         → discovery "unknown"
 *                                                        → NOT verified: flag + PSTN fallback
 *   4. +441134960456  Charlie's own range, ported to Bravo
 *                                                        → Range Holder redirect → Bravo verifies
 *
 * Run (local mock network):
 *   node test-environment/mock-network/server.mjs      # repo root, separate terminal
 *   npm run example:01
 */

// In your application, import from the published package instead:
//   import { PSTN2Client } from '@pstn2/core';
import { PSTN2Client } from '../src';
import { banner, describeDiscovery, fmt, startOrExit, rule } from './shared';

const CALLED = '+441134960789'; // a Charlie Comms customer

const inbound = [
  { callerID: '+442079460100', story: 'Alpha Telecom customer (unported)' },
  { callerID: '+441614960123', story: 'Bravo Networks customer' },
  { callerID: '+441614960999', story: 'spoofed caller ID — number not in service' },
  { callerID: '+441134960456', story: "Charlie's own range, ported to Bravo Networks" },
];

async function main() {
  banner('PSTN2 Example 1 — Basic Authentication (Direct Query)', 'Terminating CP verifies inbound caller IDs via Number Discovery');
  const client = PSTN2Client.fromEnv({ cpId: 'CP1-UK-0103', cpName: 'Charlie Comms' });
  await startOrExit(client);

  let verified = 0;
  let flagged = 0;
  try {
    for (const [i, call] of inbound.entries()) {
      console.log(rule());
      console.log(`Call ${i + 1}: ${fmt(call.callerID)} → ${fmt(CALLED)}`);
      console.log(`  (${call.story})`);
      try {
        const v = await client.verifyCall({ callerID: call.callerID, calledID: CALLED, callReference: client.generateCallReference() });
        console.log(`  Discovery:   ${describeDiscovery(client, v.discovery)}`);
        if (v.verified) {
          verified++;
          console.log(`  ✓ VERIFIED by ${v.holder?.cpName || v.holder?.cpId}`);
          console.log(`    Caller:      ${v.callerName || 'n/a'}${v.callerOrg ? ` (${v.callerOrg})` : ''}`);
          console.log(`    Trust level: ${v.trustLevel}`);
          if (v.discovery.ported) console.log('    Ported number: verification went to the CP that holds it now');
          if (v.retried) console.log('    (stale holder answered not_held — rediscovered and retried once)');
        } else {
          flagged++;
          console.log(`  ✗ NOT VERIFIED (${v.reason})`);
          console.log('    → Flag the call as unverified (possible spoofed caller ID)');
          if (v.fallbackToTraditional) console.log('    → Handle the call with traditional PSTN treatment');
        }
      } catch (err) {
        flagged++;
        console.log(`  ✗ Verification error: ${(err as Error).message}`);
        console.log('    → Falling back to traditional PSTN handling');
      }
    }
    console.log(rule());
    console.log(`Summary: ${verified} verified, ${flagged} flagged / PSTN fallback`);
    console.log(`Number cache now holds ${client.cache.size} entries (per number, never per block).`);
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
