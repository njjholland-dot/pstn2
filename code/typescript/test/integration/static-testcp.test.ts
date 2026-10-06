/**
 * The dummy test CP (as deployed to https://pstn2.org/testcp/) served by the
 * local static-host emulator, with signature verification ON.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PSTN2Client, HttpClient, USER_AGENT, LIVE_DEFAULT_CP_ID } from '../../src';
import { startStaticTestCp } from '../helpers/env';

const A = 'CP1-UK-9001';
const B = 'CP1-UK-9002';

describe('dummy test CP (static emulator, signatures verified)', () => {
  let site: Awaited<ReturnType<typeof startStaticTestCp>>;
  let client: PSTN2Client;

  beforeAll(async () => {
    site = await startStaticTestCp();
    client = new PSTN2Client({ cpId: LIVE_DEFAULT_CP_ID, numberingListUrl: site.listUrl, verifySignatures: true });
  });
  afterAll(async () => {
    await client?.close();
    await site?.stop();
  });

  it.each([
    ['+447700900001', { result: 'held', holder: A, ported: false, hops: [A] }],
    ['+447700900002', { result: 'held', holder: A, ported: false, hops: [A] }],
    ['+447700900003', { result: 'held', holder: B, ported: true, hops: [A, B] }],
    ['+447700900004', { result: 'held', holder: A, ported: false, hops: [A] }],
    ['+447700900101', { result: 'held', holder: B, ported: false, hops: [B] }],
    ['+447700900099', { result: 'unknown', holder: undefined, ported: false, hops: [A] }],
  ])('%s', async (number, e) => {
    client.cache.purge(number);
    const r = await client.discover(number);
    expect(r.result).toBe(e.result);
    expect(r.hops).toEqual(e.hops);
    expect(r.holder?.cpId).toBe(e.holder);
    expect(r.ported).toBe(e.ported);
    expect(r.fromCache).toBe(false);
    expect(r.invalidated).toBe(false);
    if (r.holder) expect(r.holder.url.startsWith(site.base)).toBe(true);
  });

  it('stale cache for 004: Test CP B answers not_held + invalidate, rediscovery finds Test CP A', async () => {
    const c = new PSTN2Client({ cpId: LIVE_DEFAULT_CP_ID, numberingListUrl: site.listUrl, verifySignatures: true });
    await c.start();
    const block = c.numberingList.blocksFor(B)[0];
    c.cache.set('+447700900004', { cpId: B, cpName: block.cpName, url: block.rangeHolderUrl! }, false);
    const r = await c.discover('+447700900004');
    expect(r).toMatchObject({ result: 'held', hops: [B, A], invalidated: true, fromCache: false, ported: false });
    expect(r.holder!.cpId).toBe(A);
    expect(c.cache.get('+447700900004')!.holder.cpId).toBe(A);
    await c.close();
  });

  it('the static host 403s generic user agents but accepts the SDK UA', async () => {
    const url = site.listUrl;
    for (const ua of ['curl/8.7.1', 'Go-http-client/1.1']) {
      const res = await fetch(url, { headers: { 'User-Agent': ua } });
      expect(res.status).toBe(403);
    }
    const ok = await new HttpClient().get(url);
    expect(ok.status).toBe(200);
    expect(USER_AGENT).toBe('pstn2-typescript-sdk/1.1.0');
  });

  it('a missing number gets the host default HTML 404 page, which the SDK reads as unknown', async () => {
    const res = await new HttpClient().get(`${site.base}/a/pstn2/v1/numbers/447700900099`);
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/html/);
    expect(res.data).toBeNull();
  });

  it('rejects a tampered answer (invalid_signature)', async () => {
    const file = join(site.dir, 'a', 'pstn2', 'v1', 'numbers', '447700900002');
    const original = readFileSync(file, 'utf8');
    try {
      const body = JSON.parse(original);
      body.holder.url = 'https://evil.example';
      writeFileSync(file, JSON.stringify(body));
      client.cache.purge('+447700900002');
      const r = await client.discover('+447700900002');
      expect(r).toMatchObject({ result: 'error', error: 'invalid_signature', hops: [A] });
    } finally {
      writeFileSync(file, original);
    }
  });
});
