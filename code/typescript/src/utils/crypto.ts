/**
 * Cryptographic utilities for PSTN2
 *
 * The PSTN2 specification (SPECIFICATION.md section 3.3) requires Ed25519
 * signatures for all inter-CP messages. Media encryption keys are NOT
 * exchanged at this layer: they are derived via the DTLS-SRTP handshake
 * during media setup, so no RSA key wrapping is needed here.
 */

import crypto from 'crypto';
import { Base64String } from '../types';
import { canonicalJson } from '../discovery/canonical-json';

/**
 * Generate an Ed25519 signature for message authentication.
 *
 * Objects are signed over their canonical JSON (keys sorted, no whitespace,
 * any `signature` field removed) — the same encoding as Number Discovery
 * signatures (SPECIFICATION.md §9.6).
 *
 * @param data - The payload to sign
 * @param privateKey - PEM-encoded Ed25519 private key (PKCS#8) or KeyObject
 * @returns Base64-encoded signature
 */
export function generateSignature(data: string | object, privateKey: string | crypto.KeyObject): Base64String {
  const payload = typeof data === 'string' ? data : canonicalJson(stripSignature(data));
  const signature = crypto.sign(null, Buffer.from(payload, 'utf8'), privateKey);
  return signature.toString('base64');
}

/**
 * Verify an Ed25519 signature.
 *
 * Never throws: malformed keys, signatures of the wrong length, or any
 * other verification failure return false.
 *
 * @param data - The payload that was signed
 * @param signature - Base64-encoded Ed25519 signature (64 bytes decoded)
 * @param publicKey - PEM-encoded Ed25519 public key (SPKI) or KeyObject
 */
export function verifySignature(
  data: string | object,
  signature: Base64String,
  publicKey: string | crypto.KeyObject
): boolean {
  try {
    const payload = typeof data === 'string' ? data : canonicalJson(stripSignature(data));
    const signatureBuffer = Buffer.from(signature, 'base64');

    // Ed25519 signatures are always 64 bytes; reject anything else early
    if (signatureBuffer.length !== 64) {
      return false;
    }

    return crypto.verify(null, Buffer.from(payload, 'utf8'), publicKey, signatureBuffer);
  } catch {
    return false;
  }
}

function stripSignature(data: object): object {
  const { signature: _omit, ...rest } = data as Record<string, unknown>;
  void _omit;
  return rest;
}

/**
 * Generate an Ed25519 key pair for message signing.
 */
export function generateKeyPair(): { publicKey: string; privateKey: string } {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem',
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem',
    },
  });

  return { publicKey, privateKey };
}

/**
 * Derive public key from private key (for convenience)
 */
export function derivePublicKey(privateKey: string): string {
  const keyObject = crypto.createPrivateKey(privateKey);
  const publicKey = crypto.createPublicKey(keyObject);

  return publicKey.export({
    type: 'spki',
    format: 'pem',
  }) as string;
}

/**
 * Generate random UUID v4
 */
export function generateUUID(): string {
  return crypto.randomUUID();
}

/**
 * Generate cryptographically secure random token
 */
export function generateToken(length: number = 32): string {
  return crypto.randomBytes(length).toString('base64url');
}

/**
 * Hash data using SHA-256
 */
export function sha256(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}
