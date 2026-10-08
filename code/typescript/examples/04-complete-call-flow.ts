/**
 * Example 4: Complete Call Flow
 *
 * Alice (+442079460100, Alpha Telecom) calls Bob (+441134960456). Bob's number
 * is in Charlie Comms' range but was ported to Bravo Networks.
 *
 *   Phase 1  Number Discovery — Alpha asks the Range Holder (Charlie), which
 *            redirects to Bravo; Bravo answers "held". Cached per number.
 *   Phase 2  Authentication   — Bravo verifies Alice's caller ID with Alpha.
 *   Phase 3  Direct routing   — Alpha asks Bravo for a direct media path.
 *   Phase 4  Summary          — then a second call shows the cache hit:
 *            one query, straight to Bravo.
 *
 * Run:  node test-environment/mock-network/server.mjs   (repo root)
 *       npm run example:04
 */

// In your application: import { PSTN2Client, DiscoveryEvent } from '@pstn2/core';
import { PSTN2Client, DiscoveryEvent } from '../src';
import { banner, cpName, describeDiscovery, fmt, startOrExit, rule } from './shared';

const alice = { number: '+442079460100', name: 'Alice' };
const bob = { number: '+441134960456', name: 'Bob' };

function hopPrinter(client: PSTN2Client) {
  return (e: DiscoveryEvent) => {
    if (e.type === 'cache-hit') console.log(`     · cache hit: ${e.number} → ${e.entry!.holder.cpName}`);
    if (e.type === 'cache-miss') console.log(`     · cache miss for ${e.number}`);
    if (e.type === 'list-lookup' && e.block) console.log(`     · numbering list: block ${e.block.display || e.block.prefix} → Range Holder ${e.block.cpName}`);
    if (e.type === 'query') console.log(`     · GET ${e.url}`);
    if (e.type === 'response') {
      const b = e.body as { result?: string } | null;
      console.log(`       ← ${e.status} ${b?.result || (e.status === 404 ? 'unknown' : '')} from ${cpName(client, e.from!.cpId)}`);
    }
    if (e.type === 'redirect') console.log(`     · redirect: ported to ${e.to!.cpName}`);
    if (e.type === 'cache-store') console.log(`     · cached ${e.number} → ${e.entry!.holder.cpName}`);
  };
}

async function main() {
  banner('PSTN2 Example 4 — Complete Call Flow', `${alice.name} (Alpha Telecom) → ${bob.name} (ported: Charlie → Bravo)`);
  const alpha = PSTN2Client.fromEnv({ cpId: 'CP1-UK-0101', cpName: 'Alpha Telecom' });
  const bravo = new PSTN2Client({ cpId: 'CP1-UK-0102', cpName: 'Bravo Networks', numberingListUrl: alpha.numberingList.url, verifySignatures: alpha.discovery.verifySignatures });
  await startOrExit(alpha);
  const callReference = alpha.generateCallReference();
  const t0 = Date.now();

  try {
    // ── Phase 1: Number Discovery ─────────────────────────────────────
    console.log(`📱 ${alice.name} ${fmt(alice.number)} dials ${bob.name} ${fmt(bob.number)}`);
    console.log('');
    console.log('🔍 Phase 1 — Number Discovery: who holds the destination?');
    let t = Date.now();
    const found = await alpha.discover(bob.number, { onEvent: hopPrinter(alpha) });
    const tDiscovery = Date.now() - t;
    console.log(`   ${found.result === 'held' ? '✓' : '✗'} ${describeDiscovery(alpha, found)} [${tDiscovery}ms]`);
    if (found.result !== 'held') {
      console.log('   → No PSTN2 holder: route the call via traditional PSTN');
      return;
    }
    console.log('');

    // ── Phase 2: Authentication (terminating CP verifies the caller ID) ──
    console.log(`🔐 Phase 2 — Authentication: ${bravo.config.cpId} verifies ${alice.name}'s caller ID`);
    t = Date.now();
    const v = await bravo.verifyCall({ callerID: alice.number, calledID: bob.number, callReference });
    const tAuth = Date.now() - t;
    console.log(`   Discovery (caller ID): ${describeDiscovery(bravo, v.discovery)}`);
    console.log(`   ${v.verified ? '✓ verified by ' + (v.holder?.cpName || v.holder?.cpId) : '✗ not verified (' + v.reason + ')'} — trust ${v.trustLevel} [${tAuth}ms]`);
    console.log('');

    // ── Phase 3: Direct routing ─────────────────────────────────────────
    console.log(`🔄 Phase 3 — Direct routing: ${alpha.config.cpId} asks the holder for a media path`);
    t = Date.now();
    const r = await alpha.requestRouting({
      destinationNumber: bob.number,
      callerID: alice.number,
      callReference,
      mediaCapabilities: { codecs: ['opus', 'g722'], encryption: ['srtp-aes256'], video: false },
      branding: { displayName: alice.name, callPurpose: 'Personal call' },
    });
    const tRouting = Date.now() - t;
    console.log(`   Discovery: ${describeDiscovery(alpha, r.discovery)}`);
    if (r.accepted) {
      console.log(`   ✓ accepted by ${r.holder?.cpName}: ${r.connectionDetails.fqdn}:${r.connectionDetails.port}/${r.connectionDetails.protocol}, ${r.agreedCapabilities.codecs[0]} + ${r.agreedCapabilities.encryption[0]} [${tRouting}ms]`);
    } else {
      console.log(`   ✗ rejected (${r.reason}) — call continues over traditional PSTN [${tRouting}ms]`);
    }
    console.log('');

    // ── Phase 4: Summary ────────────────────────────────────────────────
    const total = Date.now() - t0;
    console.log('📋 Phase 4 — Summary');
    console.log(rule());
    console.log(`   Number Discovery: ${String(tDiscovery).padStart(4)}ms  ${found.hops.length} hops (${found.hops.join(' → ')})`);
    console.log(`   Authentication:   ${String(tAuth).padStart(4)}ms  ${v.verified ? 'verified' : 'NOT verified'}`);
    console.log(`   Direct routing:   ${String(tRouting).padStart(4)}ms  ${r.accepted ? 'accepted' : 'PSTN fallback'}`);
    console.log(`   Total setup:      ${String(total).padStart(4)}ms`);
    console.log(rule());
    console.log('');

    // ── Second call: cache hit ──────────────────────────────────────────
    console.log(`📱 Second call to ${bob.name}: the number → holder answer is cached`);
    t = Date.now();
    const again = await alpha.discover(bob.number, { onEvent: hopPrinter(alpha) });
    console.log(`   ✓ ${describeDiscovery(alpha, again)} [${Date.now() - t}ms]`);
    console.log(`   ${again.fromCache ? 'Cache hit: one query straight to the holder, no Range Holder redirect.' : 'Expected a cache hit!'}`);
  } catch (err) {
    console.log(`❌ ${(err as Error).message}`);
    console.log('   Fallback: route via traditional PSTN — the call still connects.');
  } finally {
    await alpha.close();
    await bravo.close();
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
