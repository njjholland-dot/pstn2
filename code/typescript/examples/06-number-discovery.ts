/**
 * Example 6: Number Discovery — "who has this number?"
 *
 * Walks through Number Discovery hop by hop (SPECIFICATION.md §9).
 *
 * LOCAL (default): against the mock network, scenarios A–G —
 *   A unported · B ported (Range Holder redirect) · C repeat call from cache ·
 *   D number ports back, stale cache invalidated (POST /admin/port) ·
 *   E not in service · F Range Holder not participating · G unallocated
 *     node test-environment/mock-network/server.mjs     (repo root)
 *     npm run example:06
 *
 * LIVE: against the dummy test CPs at https://pstn2.org/testcp, verifying
 * every answer's Ed25519 signature:
 *     PSTN2_NETWORK=live npm run example:06
 *   or a local copy of the dummy CP (static-host emulator):
 *     node tools/testcp/build.mjs --base http://127.0.0.1:47902/testcp --out /tmp/testcp
 *     node test-environment/mock-network/static-server.mjs --dir /tmp/testcp --port 47902
 *     PSTN2_NUMBERING_LIST_URL=http://127.0.0.1:47902/testcp/numbering-list.json npm run example:06
 *
 * The walkthrough is picked from the numbering list's contents: the dummy
 * test CP blocks (07700 900 xxx) → test-CP walkthrough; otherwise A–G.
 */

// In your application: import { PSTN2Client, DiscoveryEvent, DiscoveryResult } from '@pstn2/core';
import { PSTN2Client, DiscoveryEvent, DiscoveryResult, NumberingList, networkConfigFromEnv, LIVE_DEFAULT_CP_ID, USER_AGENT } from '../src';
import { banner, cpName, describeDiscovery, fmt, rule, startOrExit } from './shared';

interface Step {
  id: string;
  title: string;
  number: string;
  /** Run before the lookup. */
  before?: (client: PSTN2Client) => Promise<string | void>;
  expect: { result: string; holder?: string; hops: string[]; ported?: boolean; fromCache?: boolean; invalidated?: boolean };
}

const BRAVO = 'CP1-UK-0102';
const CHARLIE = 'CP1-UK-0103';
const TEST_A = 'CP1-UK-9001';
const TEST_B = 'CP1-UK-9002';

function printer(client: PSTN2Client) {
  return (e: DiscoveryEvent) => {
    switch (e.type) {
      case 'cache-hit':
        console.log(`   1 CACHE   hit → ${e.entry!.holder.cpName || e.entry!.holder.cpId} (expires ${new Date(e.entry!.expiresAt).toISOString()})`);
        break;
      case 'cache-miss':
        console.log('   1 CACHE   miss');
        break;
      case 'list-lookup':
        console.log(
          e.block
            ? `   2 LIST    block ${e.block.display || e.block.prefix} → Range Holder ${e.block.cpName} ${e.block.rangeHolderUrl ? e.block.rangeHolderUrl : '(no PSTN2 URL)'}`
            : '   2 LIST    no matching block'
        );
        break;
      case 'query':
        console.log(`   → QUERY   ${cpName(client, e.to!.cpId)}: GET ${e.url}`);
        break;
      case 'response': {
        const b = (e.body || {}) as { result?: string; signature?: string };
        const sig = client.discovery.verifySignatures && e.status === 200 ? (b.signature ? ' [signed]' : ' [UNSIGNED]') : '';
        console.log(`   ← ${e.status || 'ERR'}     ${e.status === 404 ? 'not found (unknown)' : b.result || e.error || ''}${sig}`);
        break;
      }
      case 'redirect':
        console.log(`   ↪ REDIRECT ported to ${e.to!.cpName || e.to!.cpId}`);
        break;
      case 'cache-purge':
        console.log(`   ✗ PURGE   ${e.from!.cpName || e.from!.cpId} says ${e.reason}: cache entry purged, restart from the Range Holder`);
        break;
      case 'cache-store':
        console.log(`   ✓ STORE   ${e.number} → ${e.entry!.holder.cpName || e.entry!.holder.cpId}`);
        break;
    }
  };
}

function check(r: DiscoveryResult, e: Step['expect']): string[] {
  const problems: string[] = [];
  if (r.result !== e.result) problems.push(`result ${r.result} ≠ ${e.result}`);
  if (JSON.stringify(r.hops) !== JSON.stringify(e.hops)) problems.push(`hops ${r.hops.join(',')} ≠ ${e.hops.join(',')}`);
  if (e.holder && r.holder?.cpId !== e.holder) problems.push(`holder ${r.holder?.cpId} ≠ ${e.holder}`);
  if (r.ported !== (e.ported ?? false)) problems.push(`ported ${r.ported}`);
  if (r.fromCache !== (e.fromCache ?? false)) problems.push(`fromCache ${r.fromCache}`);
  if (r.invalidated !== (e.invalidated ?? false)) problems.push(`invalidated ${r.invalidated}`);
  return problems;
}

async function admin(listUrl: string, path: string, body: unknown): Promise<boolean> {
  try {
    const res = await fetch(new URL(path, listUrl), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': USER_AGENT },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function harnessSteps(listUrl: string): Step[] {
  return [
    { id: 'A', title: 'Unported number', number: '+441614960123', expect: { result: 'held', holder: BRAVO, hops: [BRAVO] } },
    { id: 'B', title: 'Ported number (Range Holder redirects)', number: '+441134960456', expect: { result: 'held', holder: BRAVO, ported: true, hops: [CHARLIE, BRAVO] } },
    { id: 'C', title: 'Repeat call goes direct from cache', number: '+441134960456', expect: { result: 'held', holder: BRAVO, ported: true, fromCache: true, hops: [BRAVO] } },
    {
      id: 'D',
      title: 'Number ports back: stale cache is invalidated',
      number: '+441134960456',
      before: async () => {
        const ok = await admin(listUrl, '/admin/port', { number: '+441134960456', fromCpId: BRAVO, toCpId: CHARLIE });
        return ok ? 'mock network: +441134960456 ported Bravo → Charlie (POST /admin/port); our cache still says Bravo' : 'could not POST /admin/port (not the mock network?)';
      },
      expect: { result: 'held', holder: CHARLIE, invalidated: true, hops: [BRAVO, CHARLIE] },
    },
    { id: 'E', title: 'Number not in service', number: '+441614960999', expect: { result: 'unknown', hops: [BRAVO] } },
    { id: 'F', title: 'Range Holder not participating', number: '+441174960555', expect: { result: 'not_participating', hops: [] } },
    { id: 'G', title: 'Number not allocated by Ofcom', number: '+441154960555', expect: { result: 'unallocated', hops: [] } },
  ];
}

function testCpSteps(): Step[] {
  return [
    { id: '001', title: 'Held by Test CP A (unported)', number: '+447700900001', expect: { result: 'held', holder: TEST_A, hops: [TEST_A] } },
    { id: '002', title: 'Held by Test CP A (unported)', number: '+447700900002', expect: { result: 'held', holder: TEST_A, hops: [TEST_A] } },
    { id: '003', title: 'Ported A → B: Range Holder redirects', number: '+447700900003', expect: { result: 'held', holder: TEST_B, ported: true, hops: [TEST_A, TEST_B] } },
    {
      id: '004',
      title: 'Stale cache: we wrongly think Test CP B holds it',
      number: '+447700900004',
      before: async (client) => {
        const b = client.numberingList.blocksFor(TEST_B)[0];
        client.cache.set('+447700900004', { cpId: TEST_B, cpName: b.cpName, url: b.rangeHolderUrl! }, false);
        return 'pre-seeded cache: +447700900004 → PSTN2 Test CP B (stale)';
      },
      expect: { result: 'held', holder: TEST_A, invalidated: true, hops: [TEST_B, TEST_A] },
    },
    { id: '101', title: 'Held by Test CP B (unported)', number: '+447700900101', expect: { result: 'held', holder: TEST_B, hops: [TEST_B] } },
    { id: '099', title: 'Not in service: 404 from Test CP A', number: '+447700900099', expect: { result: 'unknown', hops: [TEST_A] } },
  ];
}

async function main() {
  banner('PSTN2 Example 6 — Number Discovery', '"Which CP currently holds this number?" — no central database');
  const env = networkConfigFromEnv();
  // Peek at the list to choose the walkthrough (startOrExit reports load failures).
  const list = NumberingList.fromUrl(env.numberingListUrl);
  await list.load().catch(() => undefined);
  const testCp = list.blocks.some((b) => b.cpId === TEST_A);
  const client = new PSTN2Client({
    cpId: testCp ? process.env.PSTN2_CP_ID || LIVE_DEFAULT_CP_ID : env.cpId,
    numberingList: list,
    // The dummy test CP's answers are signed: verify them unless told otherwise.
    verifySignatures: testCp && !env.verifySignaturesExplicit ? true : env.verifySignatures,
  });
  await startOrExit(client);

  const listUrl = client.numberingList.url!;
  let steps: Step[];
  if (testCp) {
    console.log('Walkthrough: dummy test CPs (Test CP A = Range Holder for 07700 900 0xx, Test CP B for 07700 900 1xx)');
    steps = testCpSteps();
  } else {
    console.log('Walkthrough: scenarios A–G on the 3-CP mock network (Alpha, Bravo, Charlie; Delta not participating)');
    if (await admin(listUrl, '/admin/reset', {})) console.log('(mock network reset to the fixture: POST /admin/reset)');
    steps = harnessSteps(listUrl);
  }

  let passed = 0;
  try {
    for (const step of steps) {
      console.log(rule());
      console.log(`${step.id}. ${step.title}: ${fmt(step.number)}`);
      if (step.before) {
        const note = await step.before(client);
        if (note) console.log(`   (${note})`);
      }
      const r = await client.discover(step.number, { onEvent: printer(client) });
      console.log(`   = ${describeDiscovery(client, r)}`);
      if (r.result !== 'held') console.log('     → no PSTN2 holder: traditional PSTN handling');
      const problems = check(r, step.expect);
      if (problems.length) console.log(`   ✗ UNEXPECTED: ${problems.join('; ')}`);
      else passed++;
    }
    console.log(rule());
    console.log(`${passed}/${steps.length} lookups behaved as specified${client.discovery.verifySignatures ? ' (all 200 answers signature-verified)' : ''}.`);
    console.log('Cache (number → holder):');
    for (const e of client.cache.entries()) console.log(`   ${e.number} → ${e.holder.cpName || e.holder.cpId}${e.ported ? ' (ported)' : ''}`);
  } finally {
    if (!testCp) await admin(listUrl, '/admin/reset', {}); // leave the mock as we found it
    await client.close();
  }
  if (passed !== steps.length) process.exit(1);
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
