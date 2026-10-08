/**
 * PSTN2 messaging client.
 *
 * Every CP-to-CP call goes to the CP that currently HOLDS the subject number,
 * found with Number Discovery (SPECIFICATION.md §9). If that CP answers
 * `200 {result: "not_held", cache: {invalidate: true}}` (§5.1.2, §9.5) —
 * typically because our cached holder is stale — the cache entry is purged,
 * the holder is rediscovered from the Range Holder, and the request is
 * retried ONCE at the new holder.
 */

import { KeyObject } from 'node:crypto';
import { HttpClient, errorFromResponse } from './http-client';
import { generateSignature, generateUUID } from '../utils/crypto';
import { CpRef, DiscoveryResult, HttpMethod, HttpResponse, CacheControl } from '../types';
import { DiscoveryClient } from '../discovery/client';
import { DiscoveryError, NotHeldError } from '../errors';
import { PROTOCOL_VERSION } from '../version';
import { getLogger } from '../utils/logger';

const logger = getLogger();

export interface MessagingClientOptions {
  cpId: string;
  http: HttpClient;
  discovery: DiscoveryClient;
  /** Ed25519 private key used to sign request bodies (§4.1). */
  privateKey?: KeyObject | string;
}

export interface HolderCallOptions {
  /** Non-2xx statuses to return instead of throwing (e.g. [503] for RoutingRejection). */
  acceptStatuses?: number[];
  /** Extra request headers. */
  headers?: Record<string, string>;
  /** Skip the message envelope + signature (raw body). */
  raw?: boolean;
}

export interface HolderCallResult<T> {
  /** Final response body. */
  response: T;
  /** Final HTTP status. */
  status: number;
  /** The CP that answered. */
  holder: CpRef;
  /** The discovery that found `holder`. */
  discovery: DiscoveryResult;
  /** Every discovery made (2 when a not_held forced a rediscovery). */
  discoveries: DiscoveryResult[];
  /** True when the first holder answered not_held and the call was retried. */
  retried: boolean;
}

/** `{url}/pstn2/v1` for a CP. */
export function apiBase(cp: CpRef): string {
  return `${cp.url.replace(/\/$/, '')}/pstn2/v1`;
}

/** True for a NotHeldResponse (`result: not_held` with `cache.invalidate`). */
export function isNotHeld(body: unknown): boolean {
  if (!body || typeof body !== 'object') return false;
  const b = body as { result?: unknown; cache?: CacheControl };
  return b.result === 'not_held' && !!b.cache && !!b.cache.invalidate;
}

export class MessagingClient {
  readonly cpId: string;
  readonly http: HttpClient;
  readonly discovery: DiscoveryClient;
  private readonly privateKey?: KeyObject | string;

  constructor(options: MessagingClientOptions) {
    this.cpId = options.cpId;
    this.http = options.http;
    this.discovery = options.discovery;
    this.privateKey = options.privateKey;
  }

  getCpId(): string {
    return this.cpId;
  }

  generateCallReference(): string {
    return generateUUID();
  }

  getCurrentTimestamp(): string {
    return new Date().toISOString();
  }

  /** Wrap a payload in the §4.1 envelope (messageId, timestamp, version) and sign it. */
  envelope<T extends object>(data: T): T & { messageId: string; timestamp: string; version: string; signature?: string } {
    const env = {
      ...data,
      messageId: (data as { messageId?: string }).messageId || generateUUID(),
      timestamp: (data as { timestamp?: string }).timestamp || this.getCurrentTimestamp(),
      version: (data as { version?: string }).version || PROTOCOL_VERSION,
    };
    if (!this.privateKey) return env;
    return { ...env, signature: generateSignature(env, this.privateKey) };
  }

  /** Send to a specific CP (`{url}/pstn2/v1{path}`). Returns non-2xx responses unchanged. */
  async sendTo<T>(cp: CpRef, method: HttpMethod, path: string, body?: object, options: HolderCallOptions = {}): Promise<HttpResponse<T>> {
    const url = apiBase(cp) + path;
    const payload = body === undefined ? undefined : options.raw ? body : this.envelope(body);
    logger.info(`${method} ${url}`, { to: cp.cpId });
    const res = await this.http.send<T>(method, url, { body: payload, headers: options.headers });
    logger.info(`HTTP ${res.status} from ${cp.cpId}`, { path });
    return res;
  }

  /**
   * Discover the holder of `number` and send the request there, handling
   * not_held → purge → rediscover → retry once.
   *
   * @throws DiscoveryError when there is no PSTN2 holder (fall back to PSTN)
   * @throws NotHeldError when the rediscovered holder also answers not_held
   * @throws PSTN2Error for non-2xx responses not listed in acceptStatuses
   */
  async callHolder<T>(
    number: string,
    method: HttpMethod,
    path: string,
    body?: object,
    options: HolderCallOptions = {}
  ): Promise<HolderCallResult<T>> {
    let discovery = await this.discovery.discover(number);
    const discoveries = [discovery];
    if (discovery.result !== 'held' || !discovery.holder) throw new DiscoveryError(discovery);

    let holder = discovery.holder;
    let res = await this.sendTo<T>(holder, method, path, body, options);
    let retried = false;

    if (res.status === 200 && isNotHeld(res.data)) {
      logger.info('Holder answered not_held: purging cache and rediscovering', { number, from: holder.cpId });
      this.applyInvalidation(number, res.data);
      discovery = await this.discovery.discover(number);
      discoveries.push(discovery);
      if (discovery.result !== 'held' || !discovery.holder) throw new DiscoveryError(discovery);
      holder = discovery.holder;
      res = await this.sendTo<T>(holder, method, path, body, options);
      retried = true;
      if (res.status === 200 && isNotHeld(res.data)) throw new NotHeldError(number, holder.cpId);
    } else if (res.data && typeof res.data === 'object' && (res.data as { cache?: CacheControl }).cache?.invalidate) {
      // Any PSTN2 response may carry an invalidation (§9.5).
      this.applyInvalidation(number, res.data);
    }

    const ok = (res.status >= 200 && res.status < 300) || (options.acceptStatuses || []).includes(res.status);
    if (!ok) throw errorFromResponse(res, apiBase(holder) + path);
    return { response: res.data, status: res.status, holder, discovery, discoveries, retried };
  }

  private applyInvalidation(number: string, body: unknown): void {
    this.discovery.purge(number);
    const scope = (body as { cache?: CacheControl }).cache?.scope;
    if (scope === 'block') {
      this.discovery.numberingList.refresh(true).catch((err) => {
        logger.warn('Numbering list refresh after block invalidation failed', { error: (err as Error).message });
      });
    }
  }
}
