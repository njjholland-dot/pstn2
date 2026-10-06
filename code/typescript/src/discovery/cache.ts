/**
 * Number → holder cache (SPECIFICATION.md §9.4).
 *
 * Entries are per NUMBER — never per block: porting is per number, so a
 * port never applies to a whole block. Entries are hints, not authority;
 * a stale entry costs one extra query (the CP answers not_held + invalidate).
 */

import { CpRef, DiscoveryCacheEntry } from '../types';
import { toE164 } from '../utils/numbering';

export const DEFAULT_TTL_SECONDS = 86400;

export class DiscoveryCache {
  private readonly map = new Map<string, DiscoveryCacheEntry>();
  private readonly now: () => number;

  constructor(options: { now?: () => number } = {}) {
    this.now = options.now || Date.now;
  }

  /** Unexpired entry for `number` (expired entries are removed). */
  get(number: string): DiscoveryCacheEntry | undefined {
    const n = toE164(number);
    const e = this.map.get(n);
    if (!e) return undefined;
    if (e.expiresAt <= this.now()) {
      this.map.delete(n);
      return undefined;
    }
    return e;
  }

  /** Store `number → holder` for `ttlSeconds` (default 86400). */
  set(number: string, holder: CpRef, ported: boolean, ttlSeconds: number = DEFAULT_TTL_SECONDS): DiscoveryCacheEntry {
    const entry: DiscoveryCacheEntry = { holder, ported, expiresAt: this.now() + ttlSeconds * 1000 };
    this.map.set(toE164(number), entry);
    return entry;
  }

  /** Remove the entry for `number`. Returns true if one existed. */
  purge(number: string): boolean {
    return this.map.delete(toE164(number));
  }

  clear(): void {
    this.map.clear();
  }

  /** All entries (including any not yet swept as expired). */
  entries(): Array<DiscoveryCacheEntry & { number: string }> {
    return [...this.map.entries()].map(([number, e]) => ({ number, ...e }));
  }

  get size(): number {
    return this.map.size;
  }
}
