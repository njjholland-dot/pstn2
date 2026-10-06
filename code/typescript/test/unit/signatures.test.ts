import { generateKeyPairSync } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalJson, signBody, verifyBody, publicKeyFromRaw, rawPublicKey, KeySet, crypto as sdkCrypto } from '../../src';
import { buildTestCp, loadFixture, TESTCP_FIXTURE } from '../helpers/env';

describe('canonicalJson', () => {
  it('sorts keys at every level with no whitespace', () => {
    expect(canonicalJson({ b: 1, a: { d: [3, { z: 1, y: 2 }], c: null } })).toBe('{"a":{"c":null,"d":[3,{"y":2,"z":1}]},"b":1}');
  });

  it('does not escape / and leaves non-ASCII unescaped', () => {
    expect(canonicalJson({ url: 'https://pstn2.org/testcp/a', name: 'Café Ünïcødé €' })).toBe(
      '{"name":"Café Ünïcødé €","url":"https://pstn2.org/testcp/a"}'
    );
  });

  it('escapes quotes, backslashes and control characters like JSON', () => {
    expect(canonicalJson({ s: 'a"b\\c\n\u0001' })).toBe('{"s":"a\\"b\\\\c\\n\\u0001"}');
  });

  it('omits undefined members and keeps array order', () => {
    expect(canonicalJson({ a: undefined, b: [2, 1], c: true, d: 1.5 })).toBe('{"b":[2,1],"c":true,"d":1.5}');
  });
});

describe('Ed25519 discovery signatures', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const body = { version: '1.1', result: 'held', number: '+447700900001', holder: { cpId: 'CP1-UK-9001', url: 'https://x/a' }, ported: false, cache: { ttl: 86400 } };

  it('signs canonical JSON including kid and verifies', () => {
    const signed = signBody(body, privateKey, 'k1');
    expect(signed.kid).toBe('k1');
    expect(Buffer.from(signed.signature, 'base64')).toHaveLength(64);
    expect(verifyBody(signed, publicKey)).toBe(true);
    expect(verifyBody(signed, rawPublicKey(publicKey))).toBe(true);
    // key order on the wire does not matter
    const reordered = JSON.parse(JSON.stringify({ signature: signed.signature, kid: 'k1', ...body }));
    expect(verifyBody(reordered, publicKey)).toBe(true);
  });

  it('rejects tampered, unsigned or wrong-key bodies', () => {
    const signed = signBody(body, privateKey, 'k1');
    expect(verifyBody({ ...signed, ported: true }, publicKey)).toBe(false);
    expect(verifyBody({ ...signed, kid: 'k2' }, publicKey)).toBe(false);
    expect(verifyBody(body, publicKey)).toBe(false);
    expect(verifyBody({ ...signed, signature: 'AAAA' }, publicKey)).toBe(false);
    expect(verifyBody(signed, generateKeyPairSync('ed25519').publicKey)).toBe(false);
    expect(verifyBody(null, publicKey)).toBe(false);
  });

  it('round-trips raw 32-byte public keys', () => {
    const raw = rawPublicKey(privateKey);
    expect(Buffer.from(raw, 'base64')).toHaveLength(32);
    expect(rawPublicKey(publicKeyFromRaw(raw))).toBe(raw);
    expect(() => publicKeyFromRaw('AAAA')).toThrow();
  });

  it('signs request envelopes over canonical JSON', () => {
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
    const sig = sdkCrypto.generateSignature({ b: 1, a: 2 }, pem);
    expect(sdkCrypto.verifySignature({ a: 2, b: 1, signature: sig }, sig, publicKey)).toBe(true);
  });
});

describe('verifies tools/testcp/build.mjs output', () => {
  const built = buildTestCp();
  afterAll(() => built.cleanup());

  it('every signed answer of the dummy test CP verifies against its published key', () => {
    const fx = loadFixture(TESTCP_FIXTURE);
    let checked = 0;
    for (const cp of fx.cps) {
      const keys = JSON.parse(readFileSync(join(built.dir, cp.key, 'pstn2', 'v1', 'keys'), 'utf8')) as KeySet;
      expect(keys.cpId).toBe(cp.cpId);
      const numbersDir = join(built.dir, cp.key, 'pstn2', 'v1', 'numbers');
      for (const f of readdirSync(numbersDir).filter((n) => /^\d+$/.test(n))) {
        const answer = JSON.parse(readFileSync(join(numbersDir, f), 'utf8'));
        const key = keys.keys.find((k) => k.kid === answer.kid)!;
        expect(key).toBeDefined();
        expect(verifyBody(answer, key.publicKey)).toBe(true);
        expect(verifyBody({ ...answer, number: '+447700900999' }, key.publicKey)).toBe(false);
        checked++;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(6);
  });
});
