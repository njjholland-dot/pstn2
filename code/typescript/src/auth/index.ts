/**
 * Authentication module
 * Supports both Option 1 (Direct Query) and Option 2 (Token Pool)
 */

import { DirectQueryAuth } from './direct-query';
import { TokenPoolAuth } from './token-pool';
import { MessagingClient } from '../messaging';
import {
  AuthenticationMode,
  PSTN2Config,
  CallVerificationResponse,
  TokenCreateResponse,
  TokenData,
  PhoneNumber,
  CallReference,
  BrandingInfo,
} from '../types';
import { getLogger } from '../utils/logger';
import { PSTN2Error, ErrorCode } from '../errors';

const logger = getLogger();

export interface VerifyCallParams {
  callerID: PhoneNumber;
  calledID: PhoneNumber;
  callReference: CallReference;
  tokenId?: string;
}

export interface CreateTokenParams {
  callerID: PhoneNumber;
  calledID: PhoneNumber;
  callReference?: CallReference;
  ttl?: number;
  branding?: BrandingInfo;
}

export class AuthenticationModule {
  private directQueryAuth?: DirectQueryAuth;
  private tokenPoolAuth?: TokenPoolAuth;
  private mode: AuthenticationMode;
  private fallbackMode?: AuthenticationMode;

  constructor(
    messagingClient: MessagingClient,
    config: PSTN2Config,
    directoryLookup: (phoneNumber: PhoneNumber) => Promise<{ cpId: string; apiEndpoint: string }>
  ) {
    this.mode = config.authMode;

    // fallbackToTraditional defaults to true (safer for learners; matches README)
    const fallbackEnabled = config.fallbackToTraditional !== false;

    // Initialize Direct Query (Option 1)
    if (config.authMode === AuthenticationMode.DirectQuery || fallbackEnabled) {
      this.directQueryAuth = new DirectQueryAuth(messagingClient, directoryLookup);
    }

    // Initialize Token Pool (Option 2)
    if (config.authMode === AuthenticationMode.TokenPool) {
      if (!config.tokenPoolEndpoint || !config.tokenPoolAuth) {
        throw new PSTN2Error(
          ErrorCode.InvalidRequest,
          'Token pool endpoint and auth token required for TokenPool mode'
        );
      }

      this.tokenPoolAuth = new TokenPoolAuth(
        config.tokenPoolEndpoint,
        config.tokenPoolAuth,
        config.cpId
      );

      // Set fallback to direct query if configured
      if (fallbackEnabled && this.directQueryAuth) {
        this.fallbackMode = AuthenticationMode.DirectQuery;
        logger.info('Token pool mode with direct query fallback enabled');
      }
    }
  }

  /**
   * Verify an inbound call
   * Uses configured authentication mode with optional fallback
   */
  async verifyCall(params: VerifyCallParams): Promise<CallVerificationResponse> {
    const { callerID, calledID, callReference, tokenId } = params;

    // If token ID provided and we have token pool, verify via token
    if (tokenId && this.tokenPoolAuth) {
      try {
        const tokenData = await this.tokenPoolAuth.verifyToken(tokenId);

        if (tokenData) {
          // Token found - convert to verification response
          return {
            verified: true,
            callReference,
            callerName: tokenData.branding?.displayName,
            callPurpose: tokenData.branding?.callPurpose,
            branding: tokenData.branding,
            trustLevel: 'high',
          };
        }

        // Token not found/expired
        logger.warn('Token verification failed', { tokenId, callReference });

        // Fall back to direct query if enabled
        if (this.fallbackMode === AuthenticationMode.DirectQuery && this.directQueryAuth) {
          logger.info('Falling back to direct query authentication');
          return await this.directQueryAuth.verifyCall(callerID, calledID, callReference);
        }

        // No fallback - return unverified
        return {
          verified: false,
          callReference,
          trustLevel: 'low',
        };
      } catch (error) {
        logger.error('Token pool verification error', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        // Fall back to direct query on error if enabled
        if (this.fallbackMode === AuthenticationMode.DirectQuery && this.directQueryAuth) {
          logger.info('Token pool error - falling back to direct query');
          return await this.directQueryAuth.verifyCall(callerID, calledID, callReference);
        }

        throw error;
      }
    }

    // No token supplied: use direct query whenever it is available,
    // regardless of the configured mode
    if (this.directQueryAuth) {
      return await this.directQueryAuth.verifyCall(callerID, calledID, callReference);
    }

    throw new PSTN2Error(
      ErrorCode.InvalidRequest,
      'No authentication method available'
    );
  }

  /**
   * Create token before placing outbound call (Token Pool mode)
   */
  async createToken(params: CreateTokenParams): Promise<TokenCreateResponse> {
    if (!this.tokenPoolAuth) {
      throw new PSTN2Error(
        ErrorCode.InvalidRequest,
        'Token pool not configured - cannot create token'
      );
    }

    return await this.tokenPoolAuth.createToken(params);
  }

  /**
   * Verify a token directly against the token pool
   * (GET /auth/tokens/{tokenId})
   */
  async verifyToken(tokenId: string): Promise<TokenData | null> {
    if (!this.tokenPoolAuth) {
      throw new PSTN2Error(
        ErrorCode.InvalidRequest,
        'Token pool not configured - cannot verify token'
      );
    }

    return await this.tokenPoolAuth.verifyToken(tokenId);
  }

  /**
   * Check authentication system health
   */
  async checkHealth(): Promise<{
    directQuery: boolean;
    tokenPool: boolean;
  }> {
    const health = {
      directQuery: !!this.directQueryAuth,
      tokenPool: false,
    };

    if (this.tokenPoolAuth) {
      health.tokenPool = await this.tokenPoolAuth.checkHealth();
    }

    return health;
  }

  /**
   * Get authentication mode
   */
  getMode(): AuthenticationMode {
    return this.mode;
  }
}

export { DirectQueryAuth } from './direct-query';
export { TokenPoolAuth } from './token-pool';
