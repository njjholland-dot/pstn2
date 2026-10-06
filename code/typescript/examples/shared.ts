/**
 * Small printing helpers shared by the numbered examples.
 * (Not part of the SDK — just keeps the examples focused on the API.)
 */

import { PSTN2Client, DiscoveryResult, networkConfigFromEnv, displayNumber, getLogger } from '../src';

// The examples print their own narrative; SDK logging is off unless asked for
// (PSTN2_LOG_LEVEL=info or debug shows every request).
if (!process.env.PSTN2_LOG_LEVEL) getLogger('silent');

export const rule = (ch = '─', n = 64) => ch.repeat(n);

export function banner(title: string, subtitle?: string): void {
  console.log(rule('═'));
  console.log(title);
  if (subtitle) console.log(subtitle);
  console.log(rule('═'));
}

/** cpId → name, from the numbering list. */
export function cpName(client: PSTN2Client, cpId: string): string {
  const b = client.numberingList.blocks.find((x) => x.cpId === cpId);
  return b?.cpName || cpId;
}

/** "Charlie Comms → Bravo Networks" */
export function hopPath(client: PSTN2Client, r: DiscoveryResult): string {
  return r.hops.length ? r.hops.map((h) => cpName(client, h)).join(' → ') : '(no queries)';
}

/** One-line description of a discovery result. */
export function describeDiscovery(client: PSTN2Client, r: DiscoveryResult): string {
  const flags = [r.fromCache ? 'from cache' : '', r.invalidated ? 'stale cache invalidated' : ''].filter(Boolean).join(', ');
  const tail = `${r.hops.length} hop${r.hops.length === 1 ? '' : 's'}: ${hopPath(client, r)}${flags ? ` (${flags})` : ''}`;
  switch (r.result) {
    case 'held':
      return `held by ${r.holder!.cpName || r.holder!.cpId}${r.ported ? ' (ported in)' : ''} — ${tail}`;
    case 'unknown':
      return `unknown — the holder answered 404 (not in service) — ${tail}`;
    case 'unallocated':
      return 'unallocated — no numbering-list block matches';
    case 'not_participating':
      return `not participating — Range Holder ${r.rangeHolder?.cpName || r.rangeHolder?.cpId} has no PSTN2 URL`;
    default:
      return `error: ${r.error} — ${tail}`;
  }
}

export const fmt = (n: string) => `${n} (${displayNumber(n)})`;

/**
 * Load the numbering list; on failure explain how to start the mock network
 * and exit non-zero (without a list every call is traditional PSTN).
 */
export async function startOrExit(client: PSTN2Client): Promise<void> {
  const env = networkConfigFromEnv();
  console.log(`Network:        ${env.network}${env.numberingListUrlOverridden ? ' (PSTN2_NUMBERING_LIST_URL)' : ''}`);
  console.log(`Numbering list: ${client.numberingList.url}`);
  console.log(`Acting CP:      ${client.config.cpId}`);
  console.log(`Signatures:     ${client.discovery.verifySignatures ? 'verified' : 'not verified'}`);
  try {
    await client.start();
    console.log(`List version:   ${client.numberingList.listVersion} (${client.numberingList.blocks.length} blocks)`);
    console.log('');
  } catch (err) {
    console.error(`\n✗ Could not load the numbering list: ${(err as Error).message}`);
    if (env.network === 'local') {
      console.error('  Start the local mock network first (from the repo root):');
      console.error('    node test-environment/mock-network/server.mjs');
    }
    console.error('  Without a numbering list every call is handled as traditional PSTN.');
    await client.close();
    process.exit(1);
  }
}
