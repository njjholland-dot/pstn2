/**
 * Cryptographic utilities for PSTN2
 */

import crypto from 'crypto';
import { Base64String } from '../types';

/**
 * Generate HMAC-SHA256 signature for message authentication
 */
export function generateSignature(data: string | object, privateKey: string): Base64String {
  const payload = typeof data === 'string' ? data : JSON.stringify(data);
  const hmac = crypto.createHmac('sha256', privateKey);
  hmac.update(payload);
  return hmac.digest('base64');
}

/**
 * Verify HMAC-SHA256 signature
 */
export function verifySignature(
  data: string | object,
  signature: Base64String,
  publicKey: string
): boolean {
  const expectedSignature = generateSignature(data, publicKey);
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
}

/**
 * Generate RSA key pair for encryption
 */
export function generateKeyPair(): { publicKey: string; privateKey: string } {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
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

/**
 * Encrypt data with public key (for media encryption keys)
 */
export function encryptWithPublicKey(data: string, publicKey: string): Base64String {
  const buffer = Buffer.from(data, 'utf8');
  const encrypted = crypto.publicEncrypt(
    {
      key: publicKey,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    buffer
  );
  return encrypted.toString('base64');
}

/**
 * Decrypt data with private key
 */
export function decryptWithPrivateKey(encryptedData: Base64String, privateKey: string): string {
  const buffer = Buffer.from(encryptedData, 'base64');
  const decrypted = crypto.privateDecrypt(
    {
      key: privateKey,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    buffer
  );
  return decrypted.toString('utf8');
}
