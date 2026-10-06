/**
 * The regulator numbering list (SPECIFICATION.md §9.1).
 *
 * Loaded from a URL (HTTP GET with ETag / If-None-Match; a 304 means the
 * local copy is current) or from an in-memory document. Kept in memory and
 * refreshed after `refreshSeconds` (default 86400). Never queried per call.
 */

import { NumberingBlock, NumberingListDocument, ErrorCode } from '../types';
import { HttpClient, errorFromResponse } from '../messaging/http-client';
import { PSTN2Error, ValidationError } from '../errors';
import { digitsOf } from '../utils/numbering';
import { getLogger } from '../utils/logger';

const logger = getLogger();

export interface NumberingListOptions {
  /** Refresh interval in seconds (default 86400). */
  refreshSeconds?: number;
  /** HTTP client (one is created if omitted). */
  http?: HttpClient;
  /** Clock (epoch ms), for tests. */
  now?: () => number;
}

/** Longest-prefix match of `number` against `blocks`; `numberLength` must equal the digit count. */
export function findBlock(blocks: NumberingBlock[], number: string): NumberingBlock | null {
  const digits = digitsOf(number);
  let best: NumberingBlock | null = null;
  for (const block of blocks) {
    if (block.numberLength && block.numberLength !== digits.length) continue;
    if (!digits.startsWith(block.prefix)) continue;
    if (!best || block.prefix.length > best.prefix.length) best = block;
  }
  return best;
}

export class NumberingList {
  readonly url?: string;
  readonly refreshSeconds: number;
  private doc?: NumberingListDocument;
  private etagValue?: string;
  private loadedAtMs?: number;
  private readonly http?: HttpClient;
  private readonly now: () => number;
  private inflight?: Promise<void>;

  private constructor(url: string | undefined, doc: NumberingListDocument | undefined, options: NumberingListOptions) {
    this.url = url;
    this.refreshSeconds = options.refreshSeconds ?? 86400;
    this.now = options.now || Date.now;
    this.http = url ? options.http || new HttpClient() : options.http;
    if (doc) this.setDocument(doc);
  }

  /** A list served from `url` (call load() or let discovery load it lazily). */
  static fromUrl(url: string, options: NumberingListOptions = {}): NumberingList {
    return new NumberingList(url, undefined, options);
  }

  /** A fixed in-memory list (e.g. a fixture, or a list you downloaded yourself). */
  static fromObject(doc: NumberingListDocument, options: NumberingListOptions = {}): NumberingList {
    return new NumberingList(undefined, doc, options);
  }

  /** Create from `url` and load it now. */
  static async load(url: string, options: NumberingListOptions = {}): Promise<NumberingList> {
    const list = NumberingList.fromUrl(url, options);
    await list.load();
    return list;
  }

  private setDocument(doc: NumberingListDocument): void {
    if (!doc || !Array.isArray(doc.blocks)) throw new ValidationError('numbering list has no blocks array');
    this.doc = doc;
    this.loadedAtMs = this.now();
  }

  get isLoaded(): boolean {
    return !!this.doc;
  }

  /** True when a URL-backed list is older than refreshSeconds. */
  get isStale(): boolean {
    if (!this.doc) return true;
    if (!this.url) return false;
    return this.now() - (this.loadedAtMs || 0) >= this.refreshSeconds * 1000;
  }

  get document(): NumberingListDocument | undefined {
    return this.doc;
  }

  get blocks(): NumberingBlock[] {
    return this.doc ? this.doc.blocks : [];
  }

  get listVersion(): string | undefined {
    return this.doc?.listVersion;
  }

  get etag(): string | undefined {
    return this.etagValue;
  }

  get loadedAt(): Date | undefined {
    return this.loadedAtMs === undefined ? undefined : new Date(this.loadedAtMs);
  }

  /**
   * Download (or revalidate) the list. Sends If-None-Match when an ETag is
   * held; a 304 keeps the local copy and resets the refresh timer.
   * Returns 'updated' | 'not-modified' | 'static'.
   */
  async load(): Promise<'updated' | 'not-modified' | 'static'> {
    if (!this.url || !this.http) return 'static';
    const headers: Record<string, string> = {};
    if (this.etagValue && this.doc) headers['If-None-Match'] = this.etagValue;
    const res = await this.http.get<NumberingListDocument>(this.url, headers);
    if (res.status === 304 && this.doc) {
      this.loadedAtMs = this.now();
      logger.debug('Numbering list not modified', { url: this.url, etag: this.etagValue });
      return 'not-modified';
    }
    if (res.status !== 200) throw errorFromResponse(res, this.url);
    if (!res.data || !Array.isArray(res.data.blocks)) {
      throw new PSTN2Error(ErrorCode.InvalidResponse, `numbering list at ${this.url} is not valid JSON with blocks[]`);
    }
    this.setDocument(res.data);
    this.etagValue = res.headers['etag'];
    logger.info('Numbering list loaded', { url: this.url, listVersion: res.data.listVersion, blocks: res.data.blocks.length });
    return 'updated';
  }

  /** Revalidate now if stale (or always with force). Concurrent calls share one request. */
  async refresh(force = false): Promise<void> {
    if (!this.url) return;
    if (!force && !this.isStale) return;
    if (!this.inflight) {
      this.inflight = this.load()
        .then(() => undefined)
        .finally(() => {
          this.inflight = undefined;
        });
    }
    await this.inflight;
  }

  /**
   * Make sure a list is available: loads it if never loaded; if stale,
   * revalidates but keeps the old copy when the refresh fails.
   */
  async ensureLoaded(): Promise<void> {
    if (!this.doc) return this.refresh(true);
    if (this.isStale) {
      try {
        await this.refresh(true);
      } catch (err) {
        logger.warn('Numbering list refresh failed; using cached copy', { url: this.url, error: (err as Error).message });
      }
    }
  }

  /** Longest-prefix block for `number` whose numberLength matches, or null (not allocated). */
  findBlock(number: string): NumberingBlock | null {
    return findBlock(this.blocks, number);
  }

  /** Blocks allocated to `cpId`. */
  blocksFor(cpId: string): NumberingBlock[] {
    return this.blocks.filter((b) => b.cpId === cpId);
  }
}
