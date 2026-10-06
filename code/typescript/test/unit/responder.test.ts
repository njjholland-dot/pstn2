import { generateKeyPairSync } from 'node:crypto';
import { RangeHolderResponder, NumberingList, verifyBody } from '../../src';
import { HARNESS_FIXTURE, TESTCP_FIXTURE, MemoryNetwork, loadFixture, runReference } from '../helpers/env';

type RefAnswer = { cpId: string; number: string; status: number; body: Record<string, unknown> };

describe.each([
  ['harness network', HARNESS_FIXTURE],
  ['dummy test CP network', TESTCP_FIXTURE],
])('RangeHolderResponder parity with reference Network.respond() — %s', (_name, file) => {
  const issued = '2026-10-06T09:00:00Z';
  const reference = runReference<RefAnswer[]>('respond', file, issued);
  const net = new MemoryNetwork(loadFixture(file));

  it('covers every CP × number', () => {
    expect(reference.length).toBeGreaterThan(20);
  });

  it.each(reference.map((r) => [r.cpId, r.number, r] as const))('%s answers %s identically', (cpId, number, ref) => {
    const mine = net.responders.get(cpId)!.respond(number, issued);
    expect(mine.status).toBe(ref.status);
    expect(mine.body).toEqual(ref.body);
  });
});

describe('RangeHolderResponder', () => {
  const fx = loadFixture(HARNESS_FIXTURE);
  const list = NumberingList.fromObject(fx.numberingList as never);
  const resolve = (cpId: string) => {
    const cp = fx.cps.find((c) => c.cpId === cpId);
    return cp && { cpId: cp.cpId, cpName: cp.cpName, url: cp.url };
  };
  const charlieDb = fx.cps.find((c) => c.cpId === 'CP1-UK-0103')!;

  it('signs 200 answers and publishes a key set', () => {
    const { privateKey } = generateKeyPairSync('ed25519');
    const r = new RangeHolderResponder(charlieDb, { resolve, numberingList: list, signer: { privateKey, kid: 'charlie-test' } });
    const a = r.respond('+441134960456');
    expect(a.status).toBe(200);
    expect(a.body.result).toBe('redirect');
    expect(a.body.kid).toBe('charlie-test');
    const ks = r.keySet();
    expect(ks.keys[0].kid).toBe('charlie-test');
    expect(verifyBody(a.body, ks.keys[0].publicKey)).toBe(true);
    // 404s are unsigned
    expect(r.respond('+441134960111')).toEqual({ status: 404, body: { result: 'unknown', number: '+441134960111' } });
  });

  it('routes request paths', () => {
    const r = new RangeHolderResponder(charlieDb, { resolve, numberingList: list });
    expect(r.handle('/cp/charlie/pstn2/v1/numbers/441134960789')!.body.result).toBe('held');
    expect(r.handle('/pstn2/v1/keys')!.body).toEqual({ cpId: 'CP1-UK-0103', keys: [] });
    expect(r.handle('/pstn2/v1/other')).toBeNull();
  });

  it('without a numbering list only previouslyHeld numbers get not_held', () => {
    const r = new RangeHolderResponder({ ...charlieDb, previouslyHeld: ['+441614960500'] }, { resolve });
    expect(r.respond('+441614960500').body.result).toBe('not_held');
    expect(r.respond('+441614960123').status).toBe(404);
  });
});
