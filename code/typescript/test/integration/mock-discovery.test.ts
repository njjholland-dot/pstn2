/**
 * Conformance: run ALL fixture scenarios A–G, in order, against the real
 * HTTP mock network with ONE persistent client (caches persist between
 * steps), exactly as the reference engine does.
 */
import { PSTN2Client, DiscoveryResult, USER_AGENT } from '../../src';
import { loadScenarios, startMockNetwork } from '../helpers/env';

describe('Number Discovery against the mock network (scenarios A–G)', () => {
  let mock: Awaited<ReturnType<typeof startMockNetwork>>;
  let client: PSTN2Client;
  const scenarios = loadScenarios();
  const results: DiscoveryResult[] = [];

  beforeAll(async () => {
    mock = await startMockNetwork();
    client = new PSTN2Client({ cpId: scenarios[0].callerCp, numberingListUrl: mock.listUrl });
    for (const sc of scenarios) {
      if (sc.before?.port) {
        expect(await mock.admin('/admin/port', sc.before.port)).toEqual({ ok: true });
      }
      results.push(await client.discover(sc.number));
    }
  });
  afterAll(async () => {
    await client?.close();
    await mock?.stop();
  });

  it.each(scenarios.map((s, i) => [s.id, s.title, i] as const))('scenario %s: %s', (_id, _title, i) => {
    const e = scenarios[i].expect;
    const r = results[i];
    expect(r.number).toBe(scenarios[i].number);
    expect(r.result).toBe(e.result);
    expect(r.hops).toEqual(e.hops);
    if (e.holderCpId) expect(r.holder!.cpId).toBe(e.holderCpId);
    else expect(r.holder).toBeUndefined();
    expect(r.ported).toBe(e.ported ?? false);
    expect(r.fromCache).toBe(e.fromCache ?? false);
    expect(r.invalidated).toBe(e.invalidated ?? false);
  });

  it('every query carried the SDK User-Agent', async () => {
    const log = (await mock.admin('/admin/log')) as Array<{ userAgent: string; cpId: string }>;
    expect(log.length).toBe(scenarios.reduce((n, s) => n + s.expect.hops.length, 0));
    for (const entry of log) expect(entry.userAgent).toBe(USER_AGENT);
  });

  it('revalidates the numbering list with ETag (304)', async () => {
    expect(client.numberingList.etag).toBe('"list-1"');
    expect(await client.numberingList.load()).toBe('not-modified');
  });

  it('caches per number: a port of one number does not affect its block', async () => {
    const entries = client.cache.entries().map((e) => e.number).sort();
    expect(entries).toEqual(['+441134960456', '+441614960123']);
    const other = await client.discover('+441134960789');
    expect(other).toMatchObject({ result: 'held', hops: ['CP1-UK-0103'], fromCache: false, ported: false });
  });
});
