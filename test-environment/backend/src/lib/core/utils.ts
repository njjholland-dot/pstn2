/**
 * PSTN2 Utility Functions
 *
 * Crypto, signatures, validation, and helper functions
 */

import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// Cryptographic Functions
// ============================================================================

/**
 * Generate a cryptographic signature for a payload
 */
export function generateSignature(payload: any, privateKey: string): string {
  const data = JSON.stringify(payload);
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(data);
  sign.end();
  return sign.sign(privateKey, 'base64');
}

/**
 * Verify a cryptographic signature
 */
export function verifySignature(
  payload: any,
  signature: string,
  publicKey: string
): boolean {
  try {
    const data = JSON.stringify(payload);
    const verify = crypto.createVerify('RSA-SHA256');
    verify.update(data);
    verify.end();
    return verify.verify(publicKey, signature, 'base64');
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
}

/**
 * Generate RSA key pair for testing
 */
export function generateKeyPair(): { publicKey: string; privateKey: string } {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem'
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem'
    }
  });

  return { publicKey, privateKey };
}

/**
 * Generate a secure random token
 */
export function generateToken(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Hash a string using SHA256
 */
export function sha256(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

// ============================================================================
// UUID/ID Generation
// ============================================================================

/**
 * Generate a unique message ID
 */
export function generateMessageId(): string {
  return `msg_${uuidv4()}`;
}

/**
 * Generate a unique call reference
 */
export function generateCallReference(): string {
  return `call_${uuidv4()}`;
}

/**
 * Generate a unique token ID
 */
export function generateTokenId(): string {
  return `token_${generateToken(24)}`; // 24 bytes = 48 hex chars + "token_" = 54 chars total
}

// ============================================================================
// Phone Number Utilities
// ============================================================================

/**
 * Normalize a phone number to E.164 format
 */
export function normalizePhoneNumber(number: string): string {
  // Remove all non-digit characters except leading +
  let normalized = number.replace(/[^\d+]/g, '');

  // Ensure it starts with +
  if (!normalized.startsWith('+')) {
    normalized = '+' + normalized;
  }

  return normalized;
}

/**
 * Check if a number matches a range pattern
 * Pattern: +44712345XX where X is a wildcard
 */
export function numberMatchesRange(number: string, range: string): boolean {
  const normalized = normalizePhoneNumber(number);

  // Convert range pattern to regex
  // Replace X with \d and escape special characters
  const pattern = range
    .replace(/X/g, '\\d')
    .replace(/\+/g, '\\+');

  const regex = new RegExp(`^${pattern}$`);
  return regex.test(normalized);
}

/**
 * Extract the range from a number (replace last 2 digits with XX)
 */
export function extractRange(number: string): string {
  const normalized = normalizePhoneNumber(number);
  return normalized.slice(0, -2) + 'XX';
}

// ============================================================================
// Time Utilities
// ============================================================================

/**
 * Get current timestamp in ISO format
 */
export function getCurrentTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Check if a timestamp is expired
 */
export function isExpired(expiresAt: Date | string): boolean {
  const expiry = typeof expiresAt === 'string' ? new Date(expiresAt) : expiresAt;
  return expiry < new Date();
}

/**
 * Add seconds to a date
 */
export function addSeconds(date: Date, seconds: number): Date {
  return new Date(date.getTime() + seconds * 1000);
}

/**
 * Get milliseconds between two dates
 */
export function getMillisecondsBetween(start: Date, end: Date): number {
  return end.getTime() - start.getTime();
}

// ============================================================================
// Validation Utilities
// ============================================================================

/**
 * Validate E.164 phone number format
 */
export function isValidPhoneNumber(number: string): boolean {
  // E.164: +[country code][number] (max 15 digits)
  const regex = /^\+\d{1,15}$/;
  return regex.test(number);
}

/**
 * Validate CP ID format
 */
export function isValidCPId(cpId: string): boolean {
  // Format: CP[N]-[COUNTRY]-[NUMBER]
  const regex = /^CP\d+-[A-Z]{2}-\d+$/;
  return regex.test(cpId);
}

/**
 * Validate URL format
 */
export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate UUID format
 */
export function isValidUUID(uuid: string): boolean {
  const regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return regex.test(uuid);
}

// ============================================================================
// Error Handling Utilities
// ============================================================================

/**
 * Sleep for a specified number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelay: number = 1000
): Promise<T> {
  let lastError: Error;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt < maxRetries - 1) {
        const delay = initialDelay * Math.pow(2, attempt);
        console.log(`Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms`);
        await sleep(delay);
      }
    }
  }

  throw lastError!;
}

// ============================================================================
// Data Formatting Utilities
// ============================================================================

/**
 * Safely stringify JSON with error handling
 */
export function safeStringify(obj: any): string {
  try {
    return JSON.stringify(obj);
  } catch (error) {
    console.error('JSON stringify error:', error);
    return '{}';
  }
}

/**
 * Safely parse JSON with error handling
 */
export function safeParse<T = any>(json: string): T | null {
  try {
    return JSON.parse(json);
  } catch (error) {
    console.error('JSON parse error:', error);
    return null;
  }
}

/**
 * Truncate a string to a maximum length
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) {
    return str;
  }
  return str.substring(0, maxLength - 3) + '...';
}

/**
 * Format duration in milliseconds to human readable
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(2)}s`;
  }
  return `${(ms / 60000).toFixed(2)}m`;
}

// ============================================================================
// Random Data Generation (for testing)
// ============================================================================

/**
 * Generate a random phone number in a range
 */
export function generateRandomNumber(range: string): string {
  // Replace XX with random digits
  return range.replace(/X/g, () => Math.floor(Math.random() * 10).toString());
}

/**
 * Generate random subscriber name
 */
export function generateRandomName(): string {
  const firstNames = ['Alice', 'Bob', 'Charlie', 'David', 'Emma', 'Frank', 'Grace', 'Henry'];
  const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis'];

  const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
  const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];

  return `${firstName} ${lastName}`;
}

// ============================================================================
// CP ID Utilities
// ============================================================================

/**
 * Extract CP number from CP ID
 */
export function extractCPNumber(cpId: string): number {
  const match = cpId.match(/^CP(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * Get CP API endpoint from environment
 */
export function getCPEndpoint(cpId: string): string {
  const cpNumber = extractCPNumber(cpId);
  const port = 3000 + cpNumber;
  return `http://localhost:${port}`;
}

/**
 * Get database config for a CP from environment
 */
export function getCPDatabaseConfig(_cpId: string): any {
  // All CPs use the same PSTN2 database
  return {
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    database: process.env.DB_NAME || 'PSTN2',
    user: process.env.DB_USER || 'PSTN2_User',
    password: process.env.DB_PASSWORD || 'PSTN2_Pass_2024!'
  };
}
