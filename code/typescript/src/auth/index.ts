/**
 * Authentication module: Option 1 (Direct Query) and Option 2 (Token Pool).
 * Both find the caller ID's holder with Number Discovery.
 */

import { DirectQueryAuth, VerificationResult } from './direct-query';
import { TokenPoolAuth, TokenPoolCreateParams, CreatedToken } from './token-pool';
import { MessagingClient } from '../messaging';
import { AuthenticationMode, CallReference, PhoneNumber, TokenData } from '../types';
import { toE164 } from '../utils/numbering';
import { getLogger } from '../utils/logger';

const logger = getLogger();

export interface VerifyCallParams {
  callerID: PhoneNumber;
  calledID: PhoneNumber;
  callReference?: CallReference;
  /** Token id signalled in the INVITE (Token Pool). */
  tokenId?: string;
}

export type CreateTokenParams = TokenPoolCreateParams;

export interface AuthenticationOptions {
  cpId: string;
  authMode?: AuthenticationMode;
  tokenPoolUrl?: string;
  tokenPoolAuth?: string;
  /** Fall back to Direct Query when a token cannot be verified (default true). */
  fallbackToTraditional?: boolean;
}

export class AuthenticationModule {
  readonly directQuery: DirectQueryAuth;
  readonly tokenPool: TokenPoolAuth;
  private readonly messaging: MessagingClient;
  private readonly mode: AuthenticationMode;
  private readonly fallback: boolean;

  constructor(messaging: MessagingClient, options: AuthenticationOptions) {
    this.messaging = messaging;
    this.mode = options.authMode || AuthenticationMode.DirectQuery;
    this.fallback = options.fallbackToTraditional !== false;
    this.directQuery = new DirectQueryAuth(messaging);
    this.tokenPool = new TokenPoolAuth(messaging, {
      cpId: options.cpId,
      tokenPoolUrl: options.tokenPoolUrl,
      tokenPoolAuth: options.tokenPoolAuth,
    });
  }

  /**
   * Verify an inbound call. With a `tokenId` the token is checked first;
   * if it cannot be verified, Direct Query is used (unless fallback is off).
   */
  async verifyCall(params: VerifyCallParams): Promise<VerificationResult> {
    const callReference = params.callReference || this.messaging.generateCallReference();
    if (params.tokenId) {
      const caller = toE164(params.callerID);
      let token: TokenData | null = null;
      try {
        token = await this.tokenPool.verifyToken(params.tokenId, caller);
      } catch (err) {
        logger.warn('Token verification failed', { tokenId: params.tokenId, error: (err as Error).message });
      }
      if (token && token.verified && token.callerID === caller && token.calledID === toE164(params.calledID)) {
        const discovery = await this.messaging.discovery.discover(caller);
        return {
          verified: true,
          callReference: token.callReference || callReference,
          callerName: token.branding?.displayName,
          callPurpose: token.branding?.callPurpose,
          branding: token.branding,
          trustLevel: 'verified',
          holder: discovery.holder,
          discovery,
          retried: false,
          fallbackToTraditional: false,
        };
      }
      if (!this.fallback) {
        const discovery = await this.messaging.discovery.discover(caller);
        return { verified: false, callReference, trustLevel: 'low', discovery, retried: false, fallbackToTraditional: false, reason: 'invalid_token' };
      }
      logger.info('Token not verified: falling back to direct query', { tokenId: params.tokenId });
    }
    return this.directQuery.verifyCall(params.callerID, params.calledID, callReference);
  }

  /** Originating CP: create a token before placing the call (Token Pool). */
  async createToken(params: CreateTokenParams): Promise<CreatedToken> {
    return this.tokenPool.createToken(params);
  }

  /** Terminating CP: verify a token (null if unknown/expired). */
  async verifyToken(tokenId: string, callerID?: PhoneNumber): Promise<TokenData | null> {
    return this.tokenPool.verifyToken(tokenId, callerID);
  }

  getMode(): AuthenticationMode {
    return this.mode;
  }
}

export { DirectQueryAuth } from './direct-query';
export type { VerificationResult } from './direct-query';
export { TokenPoolAuth, TOKEN_PATTERN } from './token-pool';
export type { TokenPoolCreateParams, TokenPoolOptions, CreatedToken } from './token-pool';
