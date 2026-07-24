/**
 * Number-range utilities for PSTN2.
 *
 * NOTE: This reference implementation assumes UK (+44) E.164 numbering,
 * where a number range is identified by the country code plus the first
 * six subscriber digits (e.g. +441234567890 -> +44123456). Production
 * implementations should apply per-country numbering plans.
 */

/**
 * Extract the number range key from an E.164 phone number or a directory
 * range pattern (trailing 'X' wildcards are stripped first).
 *
 * @param phoneNumber - E.164 number (e.g. +441234567890) or range pattern
 *                      (e.g. +4412345678XX)
 * @param prefixDigits - Number of digits (including country code) that
 *                       identify the range. Default 8 = UK country code
 *                       (44) + 6 range digits.
 * @returns Range key, e.g. '+44123456'
 */
export function extractNumberRange(phoneNumber: string, prefixDigits: number = 8): string {
  const normalized = phoneNumber.replace(/X+$/i, '');
  // +1 accounts for the leading '+' sign
  return normalized.substring(0, prefixDigits + 1);
}
