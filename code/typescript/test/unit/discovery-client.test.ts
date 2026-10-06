import { generateKeyPairSync } from 'node:crypto';
import { DiscoveryClient, DiscoveryResult, DiscoveryEvent, CpRef, HttpClient, KeyStore, NumberingList, signBody, rawPublicKey } from '../../src';
import { HARNESS_FIXTURE, SCENARIOS, MemoryNetwork, loadFixture, loadScenarios, runReference } from '../helpers/env';

type RefRun = { id: string; result: Omit<DiscoveryResult, 'ported'> & { ported?: boolean }; events: string[] };

describe('DiscoveryClient parity with the reference engine (scenarios A–G, in memory)', () => {
  const reference = runReference<RefRun[]>('scenarios', HARNESS_FIXTURE, SCENARIOS);
  const scenarios = loadScenarios();
  const net = new MemoryNetwork(loadFixture(HARNESS_FIXTURE));
  const clients = new Map<string, DiscoveryClient>();
  const mine: Array<{ id: string; result: DiscoveryResult; events: string[] }> = [];

  beforeAll(async () => {
    for (const sc of scenarios) {
      if (sc.before?.port) net.port(sc.before.port.number, sc.before.port.fromCpId, sc.before.port.toCpId);
      if (!clients.has(sc.callerCp)) {
        clients.set(sc.callerCp, new DiscoveryClient({ cpId: sc.callerCp, numberingList: net.list, transport: net.transport }));
      }
      const events: string[] = [];
      const result = await clients.get(sc.callerCp)!.discover(sc.number, { onEvent: (e) => void events.push(e.type) });
      mine.push({ id: sc.id, result, events });
    }
  });

  it.each(scenarios.map((s, i) => [s.id, s.title, i] as const))('scenario %s (%s) matches the reference result and events', (_id, _t, i) => {
    const ref = reference[i];
    expect(mine[i].result).toEqual({ ported: false, ...ref.result });
    expect(mine[i].events).toEqual(ref.events);
  });

  it.each(scenarios.map((s, i) => [s.id, i] as const))('scenario %s matches fixtures/scenarios.json', (_id, i) => {
    const e = scenarios[i].expect;
    const r = mine[i].result;
    expect(r.result).toBe(e.result);
    expect(r.hops).toEqual(e.hops);
    if (e.holderCpId) expect(r.holder!.cpId).toBe(e.holderCpId);
    if (e.ported !== undefined) expect(r.ported).toBe(e.ported);
    if (e.fromCache !== undefined) expect(r.fromCache).toBe(e.fromCache);
    if (e.invalidated !== undefined) expect(r.invalidated).toBe(e.invalidated);
  });
});

describe('DiscoveryClient failure handling', () => {
  const list = NumberingList.fromObject({
    listVersion: 't',
    blocks: [{ prefix: '441614960', numberLength: 12, status: 'Allocated', cpId: 'CP-A', cpName: 'A', rangeHolderUrl: 'https://a.example' }],
  });
  const ref = (id: string): CpRef => ({ cpId: id, url: `https://${id.toLowerCase()}.example` });
  const N = '+441614960123';

  it('enforces the 5-hop limit', async () => {
    let i = 0;
    const c = new DiscoveryClient({
      cpId: 'X',
      numberingList: list,
      transport: async () => ({ status: 200, body: { result: 'redirect', portedTo: ref(`CP-${++i}`) } }),
    });
    const r = await c.discover(N);
    expect(r).toMatchObject({ result: 'error', error: 'hop_limit_exceeded' });
    expect(r.hops).toHaveLength(5);
  });

  it('detects loops', async () => {
    const c = new DiscoveryClient({
      cpId: 'X',
      numberingList: list,
      transport: async (cp) => ({ status: 200, body: { result: 'redirect', portedTo: cp.cpId === 'CP-A' ? ref('CP-B') : { cpId: 'CP-A', url: 'https://a.example' } } }),
    });
    const r = await c.discover(N);
    expect(r).toMatchObject({ result: 'error', error: 'loop_detected', hops: ['CP-A', 'CP-B'] });
  });

  it('maps transport failure to timeout and garbage to invalid_response', async () => {
    const t = new DiscoveryClient({ cpId: 'X', numberingList: list, transport: async () => Promise.reject(new Error('boom')) });
    expect(await t.discover(N)).toMatchObject({ result: 'error', error: 'timeout', hops: ['CP-A'] });
    const g = new DiscoveryClient({ cpId: 'X', numberingList: list, transport: async () => ({ status: 200, body: null }) });
    expect(await g.discover(N)).toMatchObject({ result: 'error', error: 'invalid_response' });
    const s = new DiscoveryClient({ cpId: 'X', numberingList: list, transport: async () => ({ status: 500, body: { error: { code: 'internal_error' } } }) });
    expect(await s.discover(N)).toMatchObject({ result: 'error', error: 'invalid_response' });
  });

  it('expires cache entries after cache.ttl', async () => {
    let now = 0;
    const c = new DiscoveryClient({
      cpId: 'X',
      numberingList: list,
      now: () => now,
      transport: async () => ({ status: 200, body: { result: 'held', holder: ref('CP-A'), ported: false, cache: { ttl: 10 } } }),
    });
    expect((await c.discover(N)).fromCache).toBe(false);
    expect((await c.discover(N)).fromCache).toBe(true);
    now = 10_000;
    expect((await c.discover(N)).fromCache).toBe(false);
  });

  it('reports a missing numbering list as an error result, never throws', async () => {
    const c = new DiscoveryClient({ cpId: 'X', numberingList: NumberingList.fromUrl('http://127.0.0.1:1/x.json', { http: new HttpClient({ retries: 0, timeout: 300 }) }) });
    expect(await c.discover(N)).toMatchObject({ result: 'error', error: 'numbering_list_unavailable', hops: [] });
  });

  describe('verifySignatures', () => {
    const { privateKey } = generateKeyPairSync('ed25519');
    const keySet = { cpId: 'CP-A', keys: [{ kid: 'a1', algorithm: 'ed25519', publicKey: rawPublicKey(privateKey) }] };
    const held = { version: '1.1', result: 'held', number: N, holder: ref('CP-A'), ported: false, cache: { ttl: 60 } };
    const keyFetch = (async () => new Response(JSON.stringify(keySet), { status: 200 })) as typeof fetch;
    const keyStore = new KeyStore(new HttpClient({ fetch: keyFetch }));

    it('accepts correctly signed answers', async () => {
      const c = new DiscoveryClient({ cpId: 'X', numberingList: list, verifySignatures: true, keyStore, transport: async () => ({ status: 200, body: signBody(held, privateKey, 'a1') }) });
      expect(await c.discover(N)).toMatchObject({ result: 'held' });
    });

    it('rejects unsigned, tampered and unknown-kid answers', async () => {
      for (const body of [held, { ...signBody(held, privateKey, 'a1'), ported: true }, signBody(held, privateKey, 'zz')]) {
        const c = new DiscoveryClient({ cpId: 'X', numberingList: list, verifySignatures: true, keyStore, transport: async () => ({ status: 200, body }) });
        expect(await c.discover(N)).toMatchObject({ result: 'error', error: 'invalid_signature' });
      }
    });

    it('does not require signatures on 404', async () => {
      const c = new DiscoveryClient({ cpId: 'X', numberingList: list, verifySignatures: true, keyStore, transport: async () => ({ status: 404, body: null }) });
      expect(await c.discover(N)).toMatchObject({ result: 'unknown' });
    });
  });

  it('emits events with query URLs and the result', async () => {
    const events: DiscoveryEvent[] = [];
    const c = new DiscoveryClient({
      cpId: 'X',
      numberingList: list,
      onEvent: (e) => void events.push(e),
      transport: async () => ({ status: 404, body: null }),
    });
    await c.discover('441614960123');
    expect(events.map((e) => e.type)).toEqual(['cache-miss', 'list-lookup', 'query', 'response', 'result']);
    expect(events[2].url).toBe('https://a.example/pstn2/v1/numbers/441614960123');
    expect(events[4].result!.number).toBe('+441614960123');
  });
});
