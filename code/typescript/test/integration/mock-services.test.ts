/**
 * Auth (direct query), routing and emergency against the mock
 * network — including not_held → purge → rediscover → retry once.
 */
import { PSTN2Client, DiscoveryError, PSTN2Error, FetchLike } from '../../src';
import { startMockNetwork } from '../helpers/env';

const ALPHA = 'CP1-UK-0101';
const BRAVO = 'CP1-UK-0102';
const CHARLIE = 'CP1-UK-0103';
const PORTED = '+441134960456'; // Charlie's range, ported to Bravo

describe('PSTN2 services over Number Discovery (mock network)', () => {
  let mock: Awaited<ReturnType<typeof startMockNetwork>>;
  const clients: PSTN2Client[] = [];
  const client = (cpId: string, fetchImpl?: FetchLike) => {
    const c = new PSTN2Client({ cpId, numberingListUrl: mock.listUrl, fetch: fetchImpl });
    clients.push(c);
    return c;
  };
  /**
   * A fetch that ports PORTED back to Charlie just before the first request
   * matching `pattern` — i.e. the number ports between discovery and the
   * service request, so the service endpoint (not discovery) answers not_held.
   */
  const portJustBefore = (pattern: RegExp): FetchLike => {
    let done = false;
    return async (url, init) => {
      if (!done && pattern.test(url)) {
        done = true;
        await mock.admin('/admin/port', { number: PORTED, fromCpId: BRAVO, toCpId: CHARLIE });
      }
      return fetch(url, init);
    };
  };

  beforeAll(async () => {
    mock = await startMockNetwork();
  });
  beforeEach(async () => {
    await mock.admin('/admin/reset');
  });
  afterAll(async () => {
    for (const c of clients) await c.close();
    await mock?.stop();
  });

  describe('direct query authentication', () => {
    it('verifies an unported caller ID at its Range Holder', async () => {
      const charlie = client(CHARLIE);
      const v = await charlie.verifyCall({ callerID: '+442079460100', calledID: '+441134960789' });
      expect(v).toMatchObject({ verified: true, retried: false, fallbackToTraditional: false });
      expect(v.holder!.cpId).toBe(ALPHA);
      expect(v.discovery.hops).toEqual([ALPHA]);
    });

    it('follows the redirect for a ported caller ID', async () => {
      const charlie = client(CHARLIE);
      const v = await charlie.verifyCall({ callerID: PORTED, calledID: '+441134960789' });
      expect(v.verified).toBe(true);
      expect(v.holder!.cpId).toBe(BRAVO);
      expect(v.discovery).toMatchObject({ hops: [CHARLIE, BRAVO], ported: true });
    });

    it('does not verify a caller ID that is not in service (PSTN fallback)', async () => {
      const charlie = client(CHARLIE);
      const v = await charlie.verifyCall({ callerID: '+441614960999', calledID: '+441134960789' });
      expect(v).toMatchObject({ verified: false, fallbackToTraditional: true, reason: 'unknown' });
      const np = await charlie.verifyCall({ callerID: '+441174960555', calledID: '+441134960789' });
      expect(np).toMatchObject({ verified: false, fallbackToTraditional: true, reason: 'not_participating' });
    });

    it('a stale cached holder is caught by discovery (not_held + invalidate on the discovery query)', async () => {
      const alpha = client(ALPHA);
      const first = await alpha.verifyCall({ callerID: PORTED, calledID: '+442079460100' });
      expect(first.holder!.cpId).toBe(BRAVO);
      expect(alpha.cache.get(PORTED)!.holder.cpId).toBe(BRAVO);

      // The number ports back to Charlie; Alpha's cache still says Bravo.
      await mock.admin('/admin/port', { number: PORTED, fromCpId: BRAVO, toCpId: CHARLIE });
      const second = await alpha.verifyCall({ callerID: PORTED, calledID: '+442079460100' });
      expect(second).toMatchObject({ verified: true, retried: false });
      expect(second.holder!.cpId).toBe(CHARLIE);
      expect(second.discovery).toMatchObject({ hops: [BRAVO, CHARLIE], invalidated: true, fromCache: false, ported: false });
      expect(alpha.cache.get(PORTED)!.holder.cpId).toBe(CHARLIE);
    });

    it('not_held from /auth/verify → purge → rediscover → retry once', async () => {
      const alpha = client(ALPHA, portJustBefore(/\/cp\/bravo\/pstn2\/v1\/auth\/verify$/));
      const v = await alpha.verifyCall({ callerID: PORTED, calledID: '+442079460100' });
      expect(v).toMatchObject({ verified: true, retried: true, fallbackToTraditional: false });
      expect(v.holder!.cpId).toBe(CHARLIE);
      expect(v.discovery).toMatchObject({ hops: [CHARLIE], fromCache: false, ported: false });
      expect(alpha.cache.get(PORTED)!.holder.cpId).toBe(CHARLIE);

      const log = (await mock.admin('/admin/log')) as Array<{ cpId: string; op?: string; result?: string }>;
      expect(log.filter((l) => l.op === 'auth/verify').map((l) => l.cpId)).toEqual([BRAVO, CHARLIE]);
      expect(log.filter((l) => l.result).map((l) => `${l.cpId}:${l.result}`)).toEqual([
        `${CHARLIE}:redirect`,
        `${BRAVO}:held`,
        `${CHARLIE}:held`,
      ]);
    });
  });

  describe('direct routing', () => {
    it('routes to the destination holder with media negotiation', async () => {
      const alpha = client(ALPHA);
      const r = await alpha.requestRouting({
        destinationNumber: '+441614960123',
        callerID: '+442079460100',
        mediaCapabilities: { codecs: ['g729', 'opus', 'pcmu'], encryption: ['srtp-aes256'], video: false },
      });
      expect(r.accepted).toBe(true);
      if (!r.accepted) return;
      expect(r.holder!.cpId).toBe(BRAVO);
      expect(r.agreedCapabilities.codecs).toEqual(['opus']);
      expect(r.connectionDetails.fqdn).toBe('media.bravo.example');
      const log = (await mock.admin('/admin/log')) as Array<{ op?: string; body?: { publicKey?: string; signature?: string; version?: string } }>;
      const req = log.find((l) => l.op === 'routing/request')!.body!;
      expect(Buffer.from(req.publicKey!, 'base64')).toHaveLength(32);
      expect(req.signature).toBeTruthy();
      expect(req.version).toBe('1.1');
    });

    it('rejects (no throw) with PSTN fallback when there is no PSTN2 path', async () => {
      const alpha = client(ALPHA);
      for (const [n, reason] of [['+441154960555', 'unallocated'], ['+441174960555', 'not_participating'], ['+441614960999', 'unknown']]) {
        const r = await alpha.requestRouting({ destinationNumber: n, callerID: '+442079460100', mediaCapabilities: { codecs: ['opus'], encryption: [] } });
        expect(r).toMatchObject({ accepted: false, fallbackToTraditional: true, reason });
      }
    });

    it('returns unsupported_codec as a rejection', async () => {
      const alpha = client(ALPHA);
      const r = await alpha.requestRouting({ destinationNumber: '+441614960123', callerID: '+442079460100', mediaCapabilities: { codecs: ['g729'], encryption: [] } });
      expect(r).toMatchObject({ accepted: false, reason: 'unsupported_codec', fallbackToTraditional: true });
    });

    it('retries once at the new holder after not_held', async () => {
      const alpha = client(ALPHA, portJustBefore(/\/cp\/bravo\/pstn2\/v1\/routing\/request$/));
      const r = await alpha.requestRouting({ destinationNumber: PORTED, callerID: '+442079460100', mediaCapabilities: { codecs: ['opus'], encryption: ['srtp-aes128'] } });
      expect(r).toMatchObject({ accepted: true, retried: true });
      expect(r.holder!.cpId).toBe(CHARLIE);
    });
  });

  describe('emergency location', () => {
    it('queries the current holder of the caller ID', async () => {
      const psap = client('PSAP-UK-999-01');
      const loc = await psap.getEmergencyLocation({ callerID: '+441614960123', psapID: 'UK-999-MANCHESTER-01' });
      expect(loc.holder.cpId).toBe(BRAVO);
      expect(loc.location).toMatchObject({ latitude: 53.4808, longitude: -2.2426, source: 'gps' });
    });

    it('retries once after not_held', async () => {
      const psap = client('PSAP-UK-999-01', portJustBefore(/\/cp\/bravo\/pstn2\/v1\/emergency\/location$/));
      const loc = await psap.getEmergencyLocation({ callerID: PORTED, psapID: 'UK-999-LEEDS-01' });
      expect(loc).toMatchObject({ retried: true });
      expect(loc.holder.cpId).toBe(CHARLIE);
    });

    it('throws DiscoveryError when the caller has no PSTN2 holder', async () => {
      const psap = client('PSAP-UK-999-01');
      const err = await psap.getEmergencyLocation({ callerID: '+441614960999', psapID: 'UK-999-MANCHESTER-01' }).catch((e) => e);
      expect(err).toBeInstanceOf(DiscoveryError);
      expect(err).toBeInstanceOf(PSTN2Error);
      expect((err as DiscoveryError).discovery.result).toBe('unknown');
      expect((err as DiscoveryError).toJSON().error.code).toBe('discovery_failed');
    });
  });
});
