/**
 * Authentication Option 2: Token Pool (SPECIFICATION.md §5.2).
 *
 * The originating CP creates a short-lived token before placing a call
 * (`POST /pstn2/v1/auth/tokens`) and signals the token id in the SIP INVITE;
 * the terminating CP verifies it (`GET /pstn2/v1/auth/tokens/{tokenId}`).
 *
 * By default the token is held by the CP that holds the caller ID, found with
 * Number Discovery (so both sides reach it the same way). Set
 * `tokenPoolUrl` to use a shared pool instead (its PSTN2 base URL; endpoints
 * are `{tokenPoolUrl}/pstn2/v1/auth/tokens…`).
 */

import { MessagingClient } from '../messaging';
import { errorFromResponse, apiBase } from '../messaging';
import {
  BrandingInfo,
  CallReference,
  CpRef,
  DiscoveryResult,
  PhoneNumber,
  TokenCreateRequest,
  TokenCreateResponse,
  TokenData,
} from '../types';
import { ValidationError } from '../errors';
import { toE164 } from '../utils/numbering';
import { getLogger } from '../utils/logger';

const logger = getLogger();

export const TOKEN_PATTERN = /^TK-[A-Za-z0-9]{16}$/;

export interface TokenPoolCreateParams {
  callerID: PhoneNumber;
  calledID: PhoneNumber;
  callReference?: CallReference;
  /** Seconds (10–60, default 30). */
  ttl?: number;
  branding?: BrandingInfo;
}

export interface TokenPoolOptions {
  cpId: string;
  tokenPoolUrl?: string;
  /** Bearer JWT for a shared pool. */
  tokenPoolAuth?: string;
}

export interface CreatedToken extends TokenCreateResponse {
  /** Where the token is held. */
  pool: CpRef;
  /** Discovery of the caller ID (absent with a shared tokenPoolUrl). */
  discovery?: DiscoveryResult;
}

export class TokenPoolAuth {
  private readonly messaging: MessagingClient;
  private readonly options: TokenPoolOptions;

  constructor(messaging: MessagingClient, options: TokenPoolOptions) {
    this.messaging = messaging;
    this.options = options;
  }

  private get sharedPool(): CpRef | undefined {
    return this.options.tokenPoolUrl ? { cpId: 'token-pool', cpName: 'Token pool', url: this.options.tokenPoolUrl } : undefined;
  }

  private get headers(): Record<string, string> | undefined {
    return this.options.tokenPoolAuth ? { Authorization: `Bearer ${this.options.tokenPoolAuth}` } : undefined;
  }

  /** Originating CP: create a token before placing the call. */
  async createToken(params: TokenPoolCreateParams): Promise<CreatedToken> {
    const ttl = Math.min(Math.max(params.ttl ?? 30, 10), 60);
    const request: TokenCreateRequest = {
      originatingCP: this.options.cpId,
      callerID: toE164(params.callerID),
      calledID: toE164(params.calledID),
      callReference: params.callReference || this.messaging.generateCallReference(),
      ttl,
      branding: params.branding,
    };
    logger.info('Creating token', { callerID: request.callerID, calledID: request.calledID, ttl });

    const pool = this.sharedPool;
    if (pool) {
      const res = await this.messaging.sendTo<TokenCreateResponse>(pool, 'POST', '/auth/tokens', request, { headers: this.headers });
      if (res.status < 200 || res.status >= 300) throw errorFromResponse(res, apiBase(pool) + '/auth/tokens');
      return { ...res.data, pool };
    }
    const r = await this.messaging.callHolder<TokenCreateResponse>(request.callerID, 'POST', '/auth/tokens', request, {
      headers: this.headers,
    });
    return { ...r.response, pool: r.holder, discovery: r.discovery };
  }

  /**
   * Terminating CP: verify a token. Returns null when the token is unknown,
   * expired or malformed. `callerID` is needed to find the token's holder
   * unless a shared tokenPoolUrl is configured.
   */
  async verifyToken(tokenId: string, callerID?: PhoneNumber): Promise<TokenData | null> {
    if (!TOKEN_PATTERN.test(tokenId)) {
      logger.warn('Malformed token id', { tokenId });
      return null;
    }
    const path = `/auth/tokens/${tokenId}`;
    const pool = this.sharedPool;
    let status: number;
    let data: TokenData;
    if (pool) {
      const res = await this.messaging.sendTo<TokenData>(pool, 'GET', path, undefined, { headers: this.headers });
      status = res.status;
      data = res.data;
      if (status !== 200 && status !== 404 && status !== 410) throw errorFromResponse(res, apiBase(pool) + path);
    } else {
      if (!callerID) throw new ValidationError('callerID is required to locate the token (or configure tokenPoolUrl)');
      const r = await this.messaging.callHolder<TokenData>(toE164(callerID), 'GET', path, undefined, {
        headers: this.headers,
        acceptStatuses: [404, 410],
      });
      status = r.status;
      data = r.response;
    }
    if (status === 404 || status === 410) {
      logger.warn('Token not found or expired', { tokenId, status });
      return null;
    }
    return data;
  }
}
