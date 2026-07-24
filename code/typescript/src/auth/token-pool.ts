/**
 * Authentication Option 2: Token Pool
 * CPs create short-lived tokens in shared pool, recipients verify from pool
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
import { getLogger } from '../utils/logger';
import { TokenExpiredError, PSTN2Error, ErrorCode } from '../errors';

const logger = getLogger();

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
  async createToken(
    callerID: PhoneNumber,
    calledID: PhoneNumber,
    callReference?: CallReference,
    branding?: BrandingInfo,
    ttl: number = 30
  ): Promise<TokenCreateResponse> {
    logger.info('Creating token in pool', {
      callerID,
      calledID,
      callReference,
      ttl,
    });

    const request: TokenCreateRequest = {
      callerID,
      calledID,
      cpID: this.cpId,
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
        `${this.tokenPoolEndpoint}/tokens`,
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
        `${this.tokenPoolEndpoint}/tokens/${tokenId}`,
        headers
      );

      logger.info('Token verified successfully', {
        tokenId,
        cpID: response.data.cpID,
        callerID: response.data.callerID,
      });

      return response.data;
    } catch (error) {
      if (error instanceof PSTN2Error) {
        if (error.code === ErrorCode.TokenExpired || error.code === ErrorCode.TokenNotFound) {
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
