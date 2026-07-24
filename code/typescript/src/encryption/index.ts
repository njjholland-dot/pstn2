/**
 * Encryption module
 * Handles end-to-end encryption key management
 */

import {
  generateKeyPair,
  encryptWithPublicKey,
  decryptWithPrivateKey,
  generateToken,
} from '../utils/crypto';
import { Base64String } from '../types';
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
   * Generate ephemeral key pair for a call
   * Keys should be generated fresh for each call
   */
  generateEphemeralKeyPair(callReference: string): KeyPair {
    logger.debug('Generating ephemeral key pair', { callReference });

    const keyPair = generateKeyPair();

    // Store temporarily (will be cleared after call setup)
    this.ephemeralKeys.set(callReference, keyPair);

    // Auto-cleanup after 5 minutes
    setTimeout(() => {
      this.ephemeralKeys.delete(callReference);
      logger.debug('Ephemeral keys auto-cleaned', { callReference });
    }, 5 * 60 * 1000);

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
   * Generate media encryption keys
   * Returns master key and salt for SRTP
   */
  generateMediaKeys(): MediaEncryptionKeys {
    const masterKey = generateToken(30); // 30 bytes for AES-256
    const salt = generateToken(14); // 14 bytes for SRTP salt

    logger.debug('Generated media encryption keys');

    return { masterKey, salt };
  }

  /**
   * Exchange media keys securely
   * Encrypts media keys with recipient's public key
   */
  encryptMediaKeys(
    mediaKeys: MediaEncryptionKeys,
    recipientPublicKey: string
  ): Base64String {
    const keysJson = JSON.stringify(mediaKeys);

    logger.debug('Encrypting media keys with recipient public key');

    return encryptWithPublicKey(keysJson, recipientPublicKey);
  }

  /**
   * Decrypt received media keys
   */
  decryptMediaKeys(
    encryptedKeys: Base64String,
    privateKey: string
  ): MediaEncryptionKeys {
    logger.debug('Decrypting media keys with private key');

    const decryptedJson = decryptWithPrivateKey(encryptedKeys, privateKey);
    return JSON.parse(decryptedJson);
  }

  /**
   * Prepare encryption parameters for call setup
   * Returns public key to share with recipient
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
   * Complete call encryption setup
   * Called after receiving recipient's public key
   */
  completeCallEncryption(
    callReference: string,
    recipientPublicKey: string
  ): {
    encryptedMediaKeys: Base64String;
    mediaKeys: MediaEncryptionKeys;
  } {
    const mediaKeys = this.generateMediaKeys();
    const encryptedMediaKeys = this.encryptMediaKeys(mediaKeys, recipientPublicKey);

    logger.info('Completed call encryption setup', {
      callReference,
      recipientPublicKeyLength: recipientPublicKey.length,
    });

    return {
      encryptedMediaKeys,
      mediaKeys,
    };
  }

  /**
   * Handle incoming encryption setup
   * Called when receiving encryption request from caller
   */
  handleIncomingEncryption(
    callReference: string,
    callerPublicKey: string,
    encryptedMediaKeys?: Base64String
  ): {
    publicKey: string;
    mediaKeys?: MediaEncryptionKeys;
  } {
    // Generate our key pair
    const keyPair = this.generateEphemeralKeyPair(callReference);

    // If caller sent encrypted media keys, decrypt them
    let mediaKeys: MediaEncryptionKeys | undefined;
    if (encryptedMediaKeys) {
      mediaKeys = this.decryptMediaKeys(encryptedMediaKeys, keyPair.privateKey);
      logger.info('Decrypted caller media keys', { callReference });
    }

    logger.info('Handled incoming encryption', {
      callReference,
      callerPublicKeyLength: callerPublicKey.length,
      receivedMediaKeys: !!encryptedMediaKeys,
    });

    return {
      publicKey: keyPair.publicKey,
      mediaKeys,
    };
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
      keySize: 2048,
      algorithm: 'RSA-OAEP',
      keyExchange: 'Ephemeral per-call',
    };
  }
}
