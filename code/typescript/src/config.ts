/**
 * Environment configuration shared by the examples (and handy for apps).
 *
 *   PSTN2_NETWORK=local|live        (default local)
 *     local → http://127.0.0.1:${PSTN2_MOCK_PORT:-47901}/numbering-list.json
 *             (start the mock: node test-environment/mock-network/server.mjs)
 *     live  → https://pstn2.org/testcp/numbering-list.json
 *   PSTN2_NUMBERING_LIST_URL        overrides both
 *   PSTN2_CP_ID                     acting CP (local default CP1-UK-0101, live CP1-UK-TEST-CLIENT)
 *   PSTN2_VERIFY_SIGNATURES=1|0     (default on for live, off for local)
 */

export const LIVE_NUMBERING_LIST_URL = 'https://pstn2.org/testcp/numbering-list.json';
export const DEFAULT_MOCK_PORT = 47901;
export const LOCAL_DEFAULT_CP_ID = 'CP1-UK-0101';
export const LIVE_DEFAULT_CP_ID = 'CP1-UK-TEST-CLIENT';

export interface EnvNetworkConfig {
  network: 'local' | 'live';
  numberingListUrl: string;
  /** True when PSTN2_NUMBERING_LIST_URL was set. */
  numberingListUrlOverridden: boolean;
  cpId: string;
  verifySignatures: boolean;
  /** True when PSTN2_VERIFY_SIGNATURES was set explicitly. */
  verifySignaturesExplicit: boolean;
}

function flag(v: string | undefined): boolean | undefined {
  if (v === undefined || v === '') return undefined;
  return /^(1|true|yes|on)$/i.test(v);
}

export function networkConfigFromEnv(
  env: Record<string, string | undefined> = process.env,
  defaults: { cpId?: string } = {}
): EnvNetworkConfig {
  const network = (env.PSTN2_NETWORK || 'local').toLowerCase() === 'live' ? 'live' : 'local';
  const port = Number(env.PSTN2_MOCK_PORT || DEFAULT_MOCK_PORT);
  const listUrl =
    env.PSTN2_NUMBERING_LIST_URL ||
    (network === 'live' ? LIVE_NUMBERING_LIST_URL : `http://127.0.0.1:${port}/numbering-list.json`);
  const explicit = flag(env.PSTN2_VERIFY_SIGNATURES);
  return {
    network,
    numberingListUrl: listUrl,
    numberingListUrlOverridden: !!env.PSTN2_NUMBERING_LIST_URL,
    cpId: env.PSTN2_CP_ID || (network === 'live' ? LIVE_DEFAULT_CP_ID : defaults.cpId || LOCAL_DEFAULT_CP_ID),
    verifySignatures: explicit ?? network === 'live',
    verifySignaturesExplicit: explicit !== undefined,
  };
}
