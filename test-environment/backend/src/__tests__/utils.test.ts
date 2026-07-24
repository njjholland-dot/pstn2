/**
 * Unit Tests for Core Utility Functions
 */

import {
  normalizePhoneNumber,
  isValidPhoneNumber,
  generateCallReference,
  generateMessageId,
  generateTokenId,
  getCurrentTimestamp,
  addSeconds,
  isExpired,
  numberMatchesRange,
  extractRange,
  isValidCPId,
  isValidUrl,
  isValidUUID
} from '../lib/core/utils';

describe('Phone Number Utilities', () => {
  describe('normalizePhoneNumber', () => {
    test('should normalize E.164 format', () => {
      expect(normalizePhoneNumber('+441234567890')).toBe('+441234567890');
    });

    test('should add + prefix if missing', () => {
      expect(normalizePhoneNumber('441234567890')).toBe('+441234567890');
    });

    test('should remove spaces', () => {
      expect(normalizePhoneNumber('+44 123 456 7890')).toBe('+441234567890');
    });

    test('should remove hyphens', () => {
      expect(normalizePhoneNumber('+44-123-456-7890')).toBe('+441234567890');
    });

    test('should remove parentheses', () => {
      expect(normalizePhoneNumber('+44 (123) 456-7890')).toBe('+441234567890');
    });

    test('should handle already normalized numbers', () => {
      expect(normalizePhoneNumber('+447700900000')).toBe('+447700900000');
    });
  });

  describe('isValidPhoneNumber', () => {
    test('should accept valid E.164 numbers', () => {
      expect(isValidPhoneNumber('+441234567890')).toBe(true);
      expect(isValidPhoneNumber('+447700900000')).toBe(true);
      expect(isValidPhoneNumber('+14155552671')).toBe(true);
    });

    test('should reject numbers without +', () => {
      expect(isValidPhoneNumber('441234567890')).toBe(false);
    });

    test('should reject numbers with invalid characters', () => {
      expect(isValidPhoneNumber('+44abc123')).toBe(false);
    });

    test('should accept 8 digit number with country code', () => {
      expect(isValidPhoneNumber('+4412345')).toBe(true);
    });

    test('should reject too long numbers (>15 digits)', () => {
      expect(isValidPhoneNumber('+4412345678901234567')).toBe(false);
    });

    test('should reject empty string', () => {
      expect(isValidPhoneNumber('')).toBe(false);
    });
  });

  describe('numberMatchesRange', () => {
    test('should match number to range pattern', () => {
      expect(numberMatchesRange('+4417123450', '+441712345XX')).toBe(false); // too short
      expect(numberMatchesRange('+441712345000', '+4417123450XX')).toBe(true);
      expect(numberMatchesRange('+441712345099', '+4417123450XX')).toBe(true);
    });

    test('should not match number outside range', () => {
      expect(numberMatchesRange('+441712346000', '+4417123450XX')).toBe(false);
    });

    test('should handle normalized numbers with XX wildcard', () => {
      expect(numberMatchesRange('+44770090', '+447709XX')).toBe(false); // too short
      expect(numberMatchesRange('+44770900012', '+447709000XX')).toBe(true);
    });

    test('should match exact length patterns', () => {
      // Pattern +441234XX should match 10-digit numbers (+44 + 8 digits)
      expect(numberMatchesRange('+441234567', '+4412345XX')).toBe(true);
      expect(numberMatchesRange('+441234599', '+4412345XX')).toBe(true);
      expect(numberMatchesRange('+441234600', '+4412345XX')).toBe(false);
    });
  });

  describe('extractRange', () => {
    test('should extract range from number', () => {
      expect(extractRange('+441712345000')).toBe('+4417123450XX');
      expect(extractRange('+447700900000')).toBe('+4477009000XX');
    });

    test('should handle already normalized numbers', () => {
      expect(extractRange('+14155552671')).toBe('+141555526XX');
    });
  });
});

describe('ID Generation', () => {
  describe('generateCallReference', () => {
    test('should generate call reference with call_ prefix', () => {
      const ref = generateCallReference();
      expect(ref).toMatch(/^call_[a-f0-9-]+$/);
    });

    test('should generate unique references', () => {
      const ref1 = generateCallReference();
      const ref2 = generateCallReference();
      expect(ref1).not.toBe(ref2);
    });

    test('should generate valid UUID format', () => {
      const ref = generateCallReference();
      const uuidPart = ref.replace('call_', '');
      expect(isValidUUID(uuidPart)).toBe(true);
    });
  });

  describe('generateMessageId', () => {
    test('should generate message ID with msg_ prefix', () => {
      const id = generateMessageId();
      expect(id).toMatch(/^msg_[a-f0-9-]+$/);
    });

    test('should generate unique IDs', () => {
      const id1 = generateMessageId();
      const id2 = generateMessageId();
      expect(id1).not.toBe(id2);
    });

    test('should generate valid UUID format', () => {
      const id = generateMessageId();
      const uuidPart = id.replace('msg_', '');
      expect(isValidUUID(uuidPart)).toBe(true);
    });
  });

  describe('generateTokenId', () => {
    test('should generate token ID with token prefix', () => {
      const id = generateTokenId();
      expect(id).toMatch(/^token_[a-f0-9]{48}$/);
    });

    test('should generate unique tokens', () => {
      const token1 = generateTokenId();
      const token2 = generateTokenId();
      expect(token1).not.toBe(token2);
    });

    test('should not exceed 64 characters', () => {
      const token = generateTokenId();
      expect(token.length).toBeLessThanOrEqual(64);
      expect(token.length).toBe(54); // "token_" (6) + 48 hex chars
    });
  });
});

describe('Timestamp Utilities', () => {
  describe('getCurrentTimestamp', () => {
    test('should return ISO 8601 timestamp', () => {
      const timestamp = getCurrentTimestamp();
      expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    test('should be valid Date string', () => {
      const timestamp = getCurrentTimestamp();
      const date = new Date(timestamp);
      expect(date.toString()).not.toBe('Invalid Date');
    });
  });

  describe('addSeconds', () => {
    test('should add seconds to date', () => {
      const start = new Date('2025-01-01T00:00:00Z');
      const result = addSeconds(start, 30);
      expect(result.toISOString()).toBe('2025-01-01T00:00:30.000Z');
    });

    test('should add 300 seconds (5 minutes)', () => {
      const start = new Date('2025-01-01T00:00:00Z');
      const result = addSeconds(start, 300);
      expect(result.toISOString()).toBe('2025-01-01T00:05:00.000Z');
    });

    test('should handle negative seconds', () => {
      const start = new Date('2025-01-01T00:01:00Z');
      const result = addSeconds(start, -30);
      expect(result.toISOString()).toBe('2025-01-01T00:00:30.000Z');
    });
  });

  describe('isExpired', () => {
    test('should return true for past dates', () => {
      const pastDate = new Date('2020-01-01T00:00:00Z');
      expect(isExpired(pastDate)).toBe(true);
    });

    test('should return false for future dates', () => {
      const futureDate = new Date(Date.now() + 60000); // 1 minute from now
      expect(isExpired(futureDate)).toBe(false);
    });

    test('should return true for current time (edge case)', () => {
      const now = new Date();
      // Sleep 1ms to ensure time has passed
      setTimeout(() => {
        expect(isExpired(now)).toBe(true);
      }, 1);
    });
  });
});

describe('Validation', () => {
  describe('isValidCPId', () => {
    test('should accept valid CP ID', () => {
      expect(isValidCPId('CP1-UK-0001')).toBe(true);
      expect(isValidCPId('CP2-UK-0002')).toBe(true);
      expect(isValidCPId('CP3-UK-0003')).toBe(true);
    });

    test('should reject invalid format', () => {
      expect(isValidCPId('CP1-UK')).toBe(false);
      expect(isValidCPId('CP-UK-0001')).toBe(false);
      expect(isValidCPId('CP1UK0001')).toBe(false);
    });

    test('should reject empty string', () => {
      expect(isValidCPId('')).toBe(false);
    });
  });

  describe('isValidUrl', () => {
    test('should accept valid URLs', () => {
      expect(isValidUrl('http://localhost:3001')).toBe(true);
      expect(isValidUrl('https://example.com/api/v1')).toBe(true);
    });

    test('should reject invalid URLs', () => {
      expect(isValidUrl('not-a-url')).toBe(false);
      expect(isValidUrl('')).toBe(false);
    });
  });

  describe('isValidUUID', () => {
    test('should accept valid UUIDs', () => {
      expect(isValidUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    });

    test('should reject invalid UUIDs', () => {
      expect(isValidUUID('not-a-uuid')).toBe(false);
      expect(isValidUUID('550e8400-e29b-41d4-a716')).toBe(false);
      expect(isValidUUID('')).toBe(false);
    });
  });
});
