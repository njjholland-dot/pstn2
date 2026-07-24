/**
 * Authentication Option 2: Token Pool
 * CPs create short-lived tokens in shared pool, recipients verify from pool
 *
 * Endpoints (per API-SPECIFICATION.yaml):
 *   POST /auth/tokens            - create token
 *   GET  /auth/tokens/{tokenId}  - verify token
 */

import { HttpClient } from '../messaging';
import {
  TokenCreateRequest,
  TokenCreateResponse,
  TokenData,
  PhoneNumber,
  CallReference,
  BrandingInfo,
} from '../types';
import { generateUUID } from '../utils/crypto';
import { getLogger } from '../utils/logger';
import { PSTN2Error, ErrorCode } from '../errors';

const logger = getLogger();

export interface TokenPoolCreateParams {
  callerID: PhoneNumber;
  calledID: PhoneNumber;
  callReference?: CallReference;
  ttl?: number;
  branding?: BrandingInfo;
}

export class TokenPoolAuth {
  private httpClient: HttpClient;
  private tokenPoolEndpoint: string;
  private authToken: string;
  private cpId: string;

  constructor(tokenPoolEndpoint: string, authToken: string, cpId: string) {
    this.tokenPoolEndpoint = tokenPoolEndpoint;
    this.authToken = authToken;
    this.cpId = cpId;
    this.httpClient = new HttpClient();
  }

  /**
   * Create token before placing a call
   */
  async createToken(params: TokenPoolCreateParams): Promise<TokenCreateResponse> {
    const { callerID, calledID, callReference, branding, ttl = 30 } = params;

    logger.info('Creating token in pool', {
      callerID,
      calledID,
      callReference,
      ttl,
    });

    const request: TokenCreateRequest = {
      messageId: generateUUID(),
      version: '1.0',
      timestamp: new Date().toISOString(),
      callerID,
      calledID,
      originatingCP: this.cpId,
      callReference,
      ttl,
      branding,
    };

    const headers = {
      Authorization: `Bearer ${this.authToken}`,
      'Content-Type': 'application/json',
    };

    try {
      const response = await this.httpClient.post<TokenCreateResponse>(
        `${this.tokenPoolEndpoint}/auth/tokens`,
        request,
        headers
      );

      logger.info('Token created successfully', {
        tokenId: response.data.tokenId,
        expiresAt: response.data.expiresAt,
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to create token', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Verify token when receiving a call
   */
  async verifyToken(tokenId: string): Promise<TokenData | null> {
    logger.info('Verifying token from pool', { tokenId });

    const headers = {
      Authorization: `Bearer ${this.authToken}`,
    };

    try {
      const response = await this.httpClient.get<TokenData>(
        `${this.tokenPoolEndpoint}/auth/tokens/${tokenId}`,
        headers
      );

      logger.info('Token verified successfully', {
        tokenId,
        originatingCP: response.data.originatingCP,
        callerID: response.data.callerID,
      });

      return response.data;
    } catch (error) {
      if (error instanceof PSTN2Error) {
        if (
          error.code === ErrorCode.TokenExpired ||
          error.code === ErrorCode.TokenNotFound ||
          error.code === ErrorCode.CallNotFound
        ) {
          logger.warn('Token not found or expired', { tokenId });
          return null;
        }
      }

      logger.error('Failed to verify token', {
        tokenId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Check if token pool is available (health check)
   */
  async checkHealth(): Promise<boolean> {
    try {
      await this.httpClient.get(`${this.tokenPoolEndpoint}/health`, {});
      logger.debug('Token pool health check passed');
      return true;
    } catch (error) {
      logger.warn('Token pool health check failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }
}
