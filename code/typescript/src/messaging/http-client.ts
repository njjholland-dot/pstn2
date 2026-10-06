/**
 * HTTP client for PSTN2 (Node 18+ global fetch, no dependencies).
 *
 * - Every request sends `User-Agent: pstn2-typescript-sdk/1.1.0` and
 *   `X-PSTN2-Version: 1.1` (SPECIFICATION.md §4.2). `Content-Type` is sent
 *   only on requests with a body, so Number Discovery GETs carry none.
 * - Response bodies are parsed as JSON regardless of Content-Type (static
 *   hosts may serve discovery answers as application/octet-stream); a body
 *   that is not JSON (e.g. a static host's HTML 404 page) gives `data: null`.
 * - Retries (§10.3): only 503, 504 and network errors/timeouts, with
 *   exponential backoff 100ms, 200ms, 400ms (max 3 retries).
 * - HTTP error statuses are RETURNED, not thrown; use `errorFromResponse()`
 *   to turn a non-2xx response into a PSTN2Error.
 */

import { FetchLike, HttpMethod, HttpResponse, ErrorCode } from '../types';
import { PSTN2Error, NetworkError, TimeoutError, RateLimitError } from '../errors';
import { PROTOCOL_VERSION, USER_AGENT } from '../version';
import { getLogger } from '../utils/logger';

const logger = getLogger();

export interface HttpClientOptions {
  /** Per-attempt timeout in ms (default 2000). */
  timeout?: number;
  /** Max retries for 503/504/network errors (default 3). */
  retries?: number;
  /** Base backoff in ms (default 100 → 100, 200, 400). */
  retryBaseDelay?: number;
  /** Sent as X-PSTN2-CP-ID when set. */
  cpId?: string;
  /** Override User-Agent (defaults to the SDK UA; do not use generic library UAs). */
  userAgent?: string;
  /** Inject a fetch implementation (defaults to global fetch). */
  fetch?: FetchLike;
}

export interface SendOptions {
  body?: unknown;
  headers?: Record<string, string>;
  timeout?: number;
  retries?: number;
}

const RETRY_STATUSES = new Set([503, 504]);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class HttpClient {
  private readonly timeout: number;
  private readonly retries: number;
  private readonly retryBaseDelay: number;
  private readonly cpId?: string;
  private readonly userAgent: string;
  private readonly fetchImpl: FetchLike;

  constructor(options: HttpClientOptions = {}) {
    this.timeout = options.timeout ?? 2000;
    this.retries = options.retries ?? 3;
    this.retryBaseDelay = options.retryBaseDelay ?? 100;
    this.cpId = options.cpId;
    this.userAgent = options.userAgent || USER_AGENT;
    const f = options.fetch || (globalThis.fetch as FetchLike | undefined);
    if (!f) throw new PSTN2Error(ErrorCode.InternalError, 'global fetch is not available (Node 18+ required)');
    this.fetchImpl = f;
  }

  /** Headers sent on every request. */
  baseHeaders(): Record<string, string> {
    const h: Record<string, string> = {
      'User-Agent': this.userAgent,
      'X-PSTN2-Version': PROTOCOL_VERSION,
      Accept: 'application/json',
    };
    if (this.cpId) h['X-PSTN2-CP-ID'] = this.cpId;
    return h;
  }

  async send<T = unknown>(method: HttpMethod, url: string, options: SendOptions = {}): Promise<HttpResponse<T>> {
    const headers: Record<string, string> = { ...this.baseHeaders(), ...(options.headers || {}) };
    let payload: string | undefined;
    if (options.body !== undefined) {
      payload = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
      headers['Content-Type'] = headers['Content-Type'] || 'application/json; charset=utf-8';
    }
    const timeout = options.timeout ?? this.timeout;
    const retries = options.retries ?? this.retries;

    let attempt = 0;
    for (;;) {
      try {
        logger.debug(`HTTP ${method} ${url}`, attempt ? { attempt } : undefined);
        const res = await this.fetchImpl(url, {
          method,
          headers,
          body: payload,
          signal: AbortSignal.timeout(timeout),
        });
        const text = await res.text();
        let data: unknown = null;
        if (text) {
          try {
            data = JSON.parse(text);
          } catch {
            data = null;
          }
        }
        const out: HttpResponse<T> = { status: res.status, data: data as T, text, headers: headersToObject(res.headers) };
        logger.debug(`HTTP ${res.status} ${method} ${url}`);
        if (RETRY_STATUSES.has(res.status) && attempt < retries) {
          await this.backoff(attempt++, url, `HTTP ${res.status}`);
          continue;
        }
        return out;
      } catch (err) {
        const timedOut = isTimeout(err);
        if (attempt < retries) {
          await this.backoff(attempt++, url, timedOut ? 'timeout' : describe(err));
          continue;
        }
        if (timedOut) throw new TimeoutError(`Request to ${url} timed out`, { url, timeout });
        throw new NetworkError(`Request to ${url} failed: ${describe(err)}`, { url });
      }
    }
  }

  get<T = unknown>(url: string, headers?: Record<string, string>): Promise<HttpResponse<T>> {
    return this.send<T>('GET', url, { headers });
  }

  post<T = unknown>(url: string, body: unknown, headers?: Record<string, string>): Promise<HttpResponse<T>> {
    return this.send<T>('POST', url, { body, headers });
  }

  private async backoff(attempt: number, url: string, why: string): Promise<void> {
    const delay = this.retryBaseDelay * 2 ** attempt;
    logger.warn(`Retrying ${url} in ${delay}ms (${why})`, { attempt: attempt + 1 });
    await sleep(delay);
  }
}

/**
 * Build a PSTN2Error from a non-2xx response. Understands the spec
 * ErrorResponse `{error: {code, message, timestamp}}`.
 */
export function errorFromResponse(res: HttpResponse<unknown>, url: string): PSTN2Error {
  const body = res.data as { error?: unknown; message?: unknown } | null;
  let code: string | undefined;
  let message: string | undefined;
  if (body && typeof body === 'object' && body.error && typeof body.error === 'object') {
    const e = body.error as { code?: unknown; message?: unknown };
    if (typeof e.code === 'string') code = e.code;
    if (typeof e.message === 'string') message = e.message;
  }
  if (res.status === 429) {
    const ra = res.headers['retry-after'];
    return new RateLimitError(ra ? parseInt(ra, 10) : undefined, { url, response: body });
  }
  if (!code) {
    code =
      res.status === 400
        ? ErrorCode.InvalidRequest
        : res.status === 401
        ? ErrorCode.Unauthorized
        : res.status === 403
        ? ErrorCode.Forbidden
        : res.status === 404
        ? ErrorCode.NotFound
        : res.status === 408
        ? ErrorCode.Timeout
        : res.status === 503
        ? ErrorCode.ServiceUnavailable
        : res.status === 504
        ? ErrorCode.Timeout
        : ErrorCode.InternalError;
  }
  return new PSTN2Error(code, message || `HTTP ${res.status} from ${url}`, { url, response: body }, res.status);
}

function headersToObject(h: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  h.forEach((value, key) => {
    out[key.toLowerCase()] = value;
  });
  return out;
}

function isTimeout(err: unknown): boolean {
  const e = err as { name?: string } | null;
  return !!e && (e.name === 'TimeoutError' || e.name === 'AbortError');
}

function describe(err: unknown): string {
  const e = err as { message?: string; cause?: { code?: string; message?: string } } | null;
  if (e?.cause?.code) return e.cause.code;
  return e?.message || String(err);
}
