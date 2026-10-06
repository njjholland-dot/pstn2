/**
 * Canonical JSON (SPECIFICATION.md §9.6).
 *
 * Object keys sorted lexicographically at every level, no insignificant
 * whitespace, `/` not escaped, non-ASCII characters left unescaped.
 * Identical to tools/testcp/build.mjs and to Python's
 * `json.dumps(obj, sort_keys=True, separators=(',', ':'), ensure_ascii=False)`
 * for the JSON values used by PSTN2.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) {
    return '[' + value.map((v) => (v === undefined ? 'null' : canonicalJson(v))).join(',') + ']';
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj)
      .filter((k) => obj[k] !== undefined && typeof obj[k] !== 'function')
      .sort();
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalJson(obj[k])).join(',') + '}';
  }
  // Strings: JSON.stringify escapes only `"`, `\` and control characters —
  // it never escapes `/` or non-ASCII. Numbers/booleans: standard JSON.
  const s = JSON.stringify(value);
  return s === undefined ? 'null' : s;
}
