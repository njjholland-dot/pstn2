/**
 * Ed25519 signatures on Number Discovery answers (SPECIFICATION.md §9.6).
 *
 * The signature covers the UTF-8 bytes of canonicalJson(body without
 * `signature`). `kid` names the key; public keys are published at
 * `GET {url}/pstn2/v1/keys` as raw 32-byte Ed25519 keys, base64 encoded.
 */

import { createPrivateKey, createPublicKey, sign, verify, KeyObject } from 'node:crypto';
import { canonicalJson } from './canonical-json';
import { CpRef, KeySet } from '../types';
import { HttpClient } from '../messaging/http-client';
import { getLogger } from '../utils/logger';

const logger = getLogger();

/** A KeyObject from a raw 32-byte Ed25519 public key (base64). */
export function publicKeyFromRaw(rawBase64: string): KeyObject {
  const raw = Buffer.from(rawBase64, 'base64');
  if (raw.length !== 32) throw new Error(`Ed25519 public key must be 32 bytes, got ${raw.length}`);
  return createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: raw.toString('base64url') }, format: 'jwk' });
}

/** Raw 32-byte public key (base64) for a private or public key (PEM string or KeyObject). */
export function rawPublicKey(key: KeyObject | string): string {
  let k: KeyObject = typeof key === 'string' ? createKeyFromPem(key) : key;
  if (k.type === 'private') k = createPublicKey(k);
  const jwk = k.export({ format: 'jwk' }) as { x?: string };
  if (!jwk.x) throw new Error('not an Ed25519 key');
  return Buffer.from(jwk.x, 'base64url').toString('base64');
}

function createKeyFromPem(pem: string): KeyObject {
  return pem.includes('PRIVATE KEY') ? createPrivateKey(pem) : createPublicKey(pem);
}

/** Sign a response body: adds `kid` and `signature` (over canonical JSON incl. kid). */
export function signBody<T extends object>(body: T, privateKey: KeyObject | string, kid: string): T & { kid: string; signature: string } {
  const key = typeof privateKey === 'string' ? createPrivateKey(privateKey) : privateKey;
  const unsigned: Record<string, unknown> = { ...(body as Record<string, unknown>), kid };
  delete unsigned.signature;
  const signature = sign(null, Buffer.from(canonicalJson(unsigned), 'utf8'), key).toString('base64');
  return { ...(unsigned as T & { kid: string }), signature };
}

/** Verify a signed body against a public key. Never throws. */
export function verifyBody(body: unknown, publicKey: KeyObject | string): boolean {
  try {
    if (!body || typeof body !== 'object') return false;
    const { signature, ...rest } = body as Record<string, unknown>;
    if (typeof signature !== 'string') return false;
    const sig = Buffer.from(signature, 'base64');
    if (sig.length !== 64) return false;
    const key = typeof publicKey === 'string' ? publicKeyFromRaw(publicKey) : publicKey;
    return verify(null, Buffer.from(canonicalJson(rest), 'utf8'), key, sig);
  } catch {
    return false;
  }
}

/**
 * Fetches and caches each CP's key set (`{url}/pstn2/v1/keys`).
 * An unknown `kid` triggers one refetch (key rotation).
 */
export class KeyStore {
  private readonly http: HttpClient;
  private readonly now: () => number;
  private readonly ttlMs: number;
  private readonly sets = new Map<string, { keys: KeySet; fetchedAt: number }>();

  constructor(http: HttpClient, options: { ttlSeconds?: number; now?: () => number } = {}) {
    this.http = http;
    this.now = options.now || Date.now;
    this.ttlMs = (options.ttlSeconds ?? 86400) * 1000;
  }

  private static keyUrl(cp: CpRef): string {
    return `${cp.url.replace(/\/$/, '')}/pstn2/v1/keys`;
  }

  private async fetch(cp: CpRef): Promise<KeySet | undefined> {
    const url = KeyStore.keyUrl(cp);
    try {
      const res = await this.http.get<KeySet>(url);
      if (res.status !== 200 || !res.data || !Array.isArray(res.data.keys)) {
        logger.warn('Could not fetch key set', { url, status: res.status });
        return undefined;
      }
      this.sets.set(cp.url, { keys: res.data, fetchedAt: this.now() });
      return res.data;
    } catch (err) {
      logger.warn('Could not fetch key set', { url, error: (err as Error).message });
      return undefined;
    }
  }

  /** The public key `kid` of `cp`, or undefined. */
  async getKey(cp: CpRef, kid: string): Promise<KeyObject | undefined> {
    const pick = (set: KeySet | undefined) => {
      const k = set?.keys.find((x) => x.kid === kid && (!x.algorithm || x.algorithm.toLowerCase() === 'ed25519'));
      if (!k) return undefined;
      const t = this.now();
      if (k.validFrom && Date.parse(k.validFrom) > t) return undefined;
      if (k.validTo && Date.parse(k.validTo) < t) return undefined;
      try {
        return publicKeyFromRaw(k.publicKey);
      } catch {
        return undefined;
      }
    };
    const cached = this.sets.get(cp.url);
    if (cached && this.now() - cached.fetchedAt < this.ttlMs) {
      const k = pick(cached.keys);
      if (k) return k;
    }
    return pick(await this.fetch(cp));
  }

  /** Verify a discovery body signed by `cp`. */
  async verify(cp: CpRef, body: unknown): Promise<boolean> {
    const kid = body && typeof body === 'object' ? (body as { kid?: unknown }).kid : undefined;
    const sig = body && typeof body === 'object' ? (body as { signature?: unknown }).signature : undefined;
    if (typeof kid !== 'string' || typeof sig !== 'string') return false;
    const key = await this.getKey(cp, kid);
    return !!key && verifyBody(body, key);
  }

  clear(): void {
    this.sets.clear();
  }
}
