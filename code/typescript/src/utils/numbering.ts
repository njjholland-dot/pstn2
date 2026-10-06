/**
 * Number-format helpers (SPECIFICATION.md §9.8).
 *
 * Wire format is E.164 (`+441614960123`); Number Discovery URLs use the
 * digits without the `+`. Porting is per number, so nothing here derives a
 * "range" key from a number — block matching is done only by
 * NumberingList.findBlock() against the regulator's list.
 */

/** E.164 digits without `+` (non-digits removed). */
export function digitsOf(number: string): string {
  return String(number).replace(/^\+/, '').replace(/\D/g, '');
}

/** Normalise to E.164 with a leading `+`. */
export function toE164(number: string): string {
  return '+' + digitsOf(number);
}

/** True for a syntactically valid E.164 number (`+` and 2–15 digits, no leading 0). */
export function isE164(number: string): boolean {
  return /^\+[1-9]\d{1,14}$/.test(number);
}

/** UK national display form for a +44 number, e.g. +441614960123 → 0161 496 0123. */
export function displayNumber(number: string): string {
  const d = digitsOf(number);
  if (!d.startsWith('44')) return '+' + d;
  const n = '0' + d.slice(2);
  if (/^02\d/.test(n)) return `${n.slice(0, 3)} ${n.slice(3, 7)} ${n.slice(7)}`;
  if (/^07/.test(n)) return `${n.slice(0, 5)} ${n.slice(5)}`;
  if (/^01\d1/.test(n) || /^011/.test(n)) return `${n.slice(0, 4)} ${n.slice(4, 7)} ${n.slice(7)}`;
  return `${n.slice(0, 5)} ${n.slice(5)}`;
}
