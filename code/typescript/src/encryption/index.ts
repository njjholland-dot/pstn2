/**
 * Encryption module
 * Handles per-call signing key management.
 *
 * PSTN2 uses Ed25519 key pairs for message and call-setup signing
 * (SPECIFICATION.md section 3.3). Media encryption keys are NOT wrapped or
 * exchanged by this module: they are derived by the DTLS-SRTP handshake
 * during media setup. This module only generates local SRTP key material
 * for implementations that need it outside DTLS-SRTP.
 */

import { generateKeyPair, generateToken } from '../utils/crypto';
import { getLogger } from '../utils/logger';

const logger = getLogger();

export interface KeyPair {
  publicKey: string;
  privateKey: string;
}

export interface MediaEncryptionKeys {
  masterKey: string;
  salt: string;
}

export class EncryptionModule {
  private ephemeralKeys: Map<string, KeyPair> = new Map();

  /**
   * Generate ephemeral Ed25519 key pair for a call
   * Keys should be generated fresh for each call
   */
  generateEphemeralKeyPair(callReference: string): KeyPair {
    logger.debug('Generating ephemeral key pair', { callReference });

    const keyPair = generateKeyPair();

    // Store temporarily (will be cleared after call setup)
    this.ephemeralKeys.set(callReference, keyPair);

    // Auto-cleanup after 5 minutes; unref so the timer never keeps the
    // process alive
    const timer = setTimeout(() => {
      this.ephemeralKeys.delete(callReference);
      logger.debug('Ephemeral keys auto-cleaned', { callReference });
    }, 5 * 60 * 1000);
    timer.unref();

    return keyPair;
  }

  /**
   * Get ephemeral keys for a call
   */
  getEphemeralKeys(callReference: string): KeyPair | undefined {
    return this.ephemeralKeys.get(callReference);
  }

  /**
   * Clear ephemeral keys after call setup complete
   */
  clearEphemeralKeys(callReference: string): void {
    logger.debug('Clearing ephemeral keys', { callReference });
    this.ephemeralKeys.delete(callReference);
  }

  /**
   * Clear all ephemeral keys (used by PSTN2Client.close())
   */
  clearAllEphemeralKeys(): void {
    logger.debug('Clearing all ephemeral keys');
    this.ephemeralKeys.clear();
  }

  /**
   * Generate local SRTP media key material.
   *
   * In normal operation media keys are derived via DTLS-SRTP and this is
   * not needed; it is provided for implementations using out-of-band SRTP
   * keying.
   */
  generateMediaKeys(): MediaEncryptionKeys {
    const masterKey = generateToken(30); // 30 bytes for AES-256
    const salt = generateToken(14); // 14 bytes for SRTP salt

    logger.debug('Generated media encryption keys');

    return { masterKey, salt };
  }

  /**
   * Prepare encryption parameters for call setup
   * Returns Ed25519 public key to share with recipient
   */
  prepareCallEncryption(callReference: string): {
    publicKey: string;
    privateKey: string;
  } {
    const keyPair = this.generateEphemeralKeyPair(callReference);

    logger.info('Prepared call encryption', {
      callReference,
      publicKeyLength: keyPair.publicKey.length,
    });

    return keyPair;
  }

  /**
   * Rotate keys during call (optional, for enhanced security)
   */
  rotateKeys(callReference: string): KeyPair {
    logger.info('Rotating encryption keys', { callReference });

    // Clear old keys
    this.clearEphemeralKeys(callReference);

    // Generate new keys
    return this.generateEphemeralKeyPair(callReference);
  }

  /**
   * Get encryption strength info
   */
  getEncryptionInfo(): {
    keySize: number;
    algorithm: string;
    keyExchange: string;
  } {
    return {
      keySize: 256,
      algorithm: 'Ed25519',
      keyExchange: 'DTLS-SRTP (media), ephemeral per-call signing keys',
    };
  }
}
