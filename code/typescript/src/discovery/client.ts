/**
 * Number Discovery client (SPECIFICATION.md §9.3).
 *
 *   discover(number):
 *     1. CACHE        unexpired entry → query entry.holder.url directly (4)
 *     2. LIST         longest-prefix block; none → "unallocated";
 *                     no rangeHolderUrl → "not_participating"
 *     3. RANGE HOLDER query block.rangeHolderUrl
 *     4. QUERY        GET {url}/pstn2/v1/numbers/{digits}
 *                       held      → cache number → holder (ttl); done
 *                       redirect  → query portedTo (4 again)
 *                       not_held  → purge; restart at 2 (visited cleared)
 *                       404       → "unknown"
 *     Hop limit 5 queries in total; the same CP twice in one pass = loop.
 *
 * Behaviour (results, hops, events) matches the reference engine
 * animations/src/test-harness/harness-engine.js `DiscoveryClient.discover`.
 */

import {
  CpRef,
  DiscoveryEvent,
  DiscoveryEventHandler,
  DiscoveryResponse,
  DiscoveryResult,
  NumberingListDocument,
} from '../types';
import { HttpClient } from '../messaging/http-client';
import { NumberingList } from './numbering-list';
import { DiscoveryCache, DEFAULT_TTL_SECONDS } from './cache';
import { KeyStore } from './signatures';
import { digitsOf, toE164 } from '../utils/numbering';
import { getLogger } from '../utils/logger';

const logger = getLogger();

/** One discovery query: resolves to the HTTP status and parsed JSON body (null if none). */
export type DiscoveryTransport = (cp: CpRef, number: string) => Promise<{ status: number; body: unknown }>;

export interface DiscoveryClientOptions {
  /** The acting CP's id. */
  cpId: string;
  /** The numbering list (instance, or a raw document). */
  numberingList: NumberingList | NumberingListDocument;
  /** Shared cache (one is created if omitted). */
  cache?: DiscoveryCache;
  /** HTTP client for the default transport and key fetches. */
  http?: HttpClient;
  /** Custom transport (default: HTTP GET {url}/pstn2/v1/numbers/{digits}). */
  transport?: DiscoveryTransport;
  /** Max queries per discovery (default 5). */
  hopLimit?: number;
  /** Cache TTL when a response has none (default 86400 s). */
  defaultTtl?: number;
  /** Verify Ed25519 signatures on 200 answers (default false). */
  verifySignatures?: boolean;
  /** Key store for signature verification (created from `http` if omitted). */
  keyStore?: KeyStore;
  /** Default event hook for every discovery. */
  onEvent?: DiscoveryEventHandler;
  /** Clock (epoch ms). */
  now?: () => number;
}

export interface DiscoverOptions {
  /** Per-call event hook (in addition to the client's onEvent). */
  onEvent?: DiscoveryEventHandler;
}

/** URL of the discovery query for `number` at `cp`. */
export function discoveryUrl(cp: CpRef, number: string): string {
  return `${cp.url.replace(/\/$/, '')}/pstn2/v1/numbers/${digitsOf(number)}`;
}

export class DiscoveryClient {
  readonly cpId: string;
  readonly numberingList: NumberingList;
  readonly cache: DiscoveryCache;
  readonly hopLimit: number;
  readonly defaultTtl: number;
  verifySignatures: boolean;
  readonly keyStore: KeyStore;
  private readonly transport: DiscoveryTransport;
  private readonly onEvent?: DiscoveryEventHandler;

  constructor(options: DiscoveryClientOptions) {
    const http = options.http || new HttpClient({ cpId: options.cpId });
    const now = options.now || Date.now;
    this.cpId = options.cpId;
    this.numberingList =
      options.numberingList instanceof NumberingList
        ? options.numberingList
        : NumberingList.fromObject(options.numberingList, { now });
    this.cache = options.cache || new DiscoveryCache({ now });
    this.hopLimit = options.hopLimit ?? 5;
    this.defaultTtl = options.defaultTtl ?? DEFAULT_TTL_SECONDS;
    this.verifySignatures = !!options.verifySignatures;
    this.keyStore = options.keyStore || new KeyStore(http, { now });
    this.onEvent = options.onEvent;
    this.transport =
      options.transport ||
      (async (cp, number) => {
        const res = await http.get(discoveryUrl(cp, number));
        return { status: res.status, body: res.data };
      });
  }

  /** Purge the cached entry for `number`. */
  purge(number: string): boolean {
    return this.cache.purge(number);
  }

  /** Snapshot of the cache. */
  cacheEntries() {
    return this.cache.entries();
  }

  /** Who holds `number` right now? */
  async discover(number: string, options: DiscoverOptions = {}): Promise<DiscoveryResult> {
    const n = toE164(number);
    const hops: string[] = [];
    const visited = new Set<string>();
    let invalidated = false;
    let fromCache = false;

    const emit = async (type: DiscoveryEvent['type'], data: Partial<DiscoveryEvent> = {}) => {
      const event: DiscoveryEvent = { type, number: n, ...data };
      if (this.onEvent) await this.onEvent(event);
      if (options.onEvent) await options.onEvent(event);
    };
    const finish = async (r: Partial<DiscoveryResult> & Pick<DiscoveryResult, 'result'>): Promise<DiscoveryResult> => {
      const out: DiscoveryResult = { number: n, hops, invalidated, fromCache, ported: false, ...r };
      logger.info('Discovery result', {
        number: n,
        result: out.result,
        holder: out.holder?.cpId,
        hops: out.hops,
        fromCache: out.fromCache,
        invalidated: out.invalidated,
        error: out.error,
      });
      await emit('result', { result: out });
      return out;
    };

    let target: CpRef | null = null;
    const cached = this.cache.get(n);
    if (cached) {
      await emit('cache-hit', { entry: { number: n, ...cached } });
      target = cached.holder;
      fromCache = true;
    } else {
      await emit('cache-miss');
    }

    for (;;) {
      if (!target) {
        try {
          await this.numberingList.ensureLoaded();
        } catch (err) {
          logger.warn('Numbering list unavailable', { error: (err as Error).message });
          return finish({ result: 'error', error: 'numbering_list_unavailable' });
        }
        const block = this.numberingList.findBlock(n);
        await emit('list-lookup', { block });
        if (!block) return finish({ result: 'unallocated' });
        if (!block.rangeHolderUrl) {
          return finish({ result: 'not_participating', rangeHolder: { cpId: block.cpId, cpName: block.cpName } });
        }
        target = { cpId: block.cpId, cpName: block.cpName, url: block.rangeHolderUrl };
        fromCache = false;
      }

      if (hops.length >= this.hopLimit) return finish({ result: 'error', error: 'hop_limit_exceeded' });
      if (visited.has(target.cpId)) return finish({ result: 'error', error: 'loop_detected' });
      visited.add(target.cpId);
      hops.push(target.cpId);

      await emit('query', { to: target, url: discoveryUrl(target, n) });
      let res: { status: number; body: unknown };
      try {
        res = await this.transport(target, n);
      } catch (err) {
        await emit('response', { from: target, status: 0, body: null, error: String((err as Error).message || err) });
        return finish({ result: 'error', error: 'timeout' });
      }
      await emit('response', { from: target, status: res.status, body: res.body });

      if (res.status === 404) return finish({ result: 'unknown' });
      const body = (res.body && typeof res.body === 'object' ? res.body : {}) as Partial<DiscoveryResponse>;

      if (this.verifySignatures && res.status === 200 && body.result) {
        const ok = await this.keyStore.verify(target, body);
        if (!ok) {
          logger.warn('Discovery answer failed signature verification', { from: target.cpId, number: n });
          return finish({ result: 'error', error: 'invalid_signature' });
        }
      }

      if (body.cache && body.cache.invalidate) {
        this.cache.purge(n);
        invalidated = true;
        await emit('cache-purge', { reason: body.result, from: target });
        if (body.cache.scope === 'block') {
          // The block moved Range Holder: re-download the numbering list (§9.5).
          try {
            await this.numberingList.refresh(true);
          } catch (err) {
            logger.warn('Numbering list refresh after block invalidation failed', { error: (err as Error).message });
          }
        }
      }

      if (body.result === 'held' && body.holder && body.holder.url) {
        const ttl = (body.cache && body.cache.ttl) || this.defaultTtl;
        const entry = this.cache.set(n, body.holder, !!body.ported, ttl);
        await emit('cache-store', { entry: { number: n, ...entry } });
        return finish({ result: 'held', holder: body.holder, ported: !!body.ported });
      }
      if (body.result === 'redirect' && body.portedTo && body.portedTo.url) {
        await emit('redirect', { from: target, to: body.portedTo });
        target = body.portedTo;
        continue;
      }
      if (body.result === 'not_held') {
        target = null; // restart from the numbering list: the Range Holder is the authority
        visited.clear();
        continue;
      }
      return finish({ result: 'error', error: 'invalid_response' });
    }
  }
}
