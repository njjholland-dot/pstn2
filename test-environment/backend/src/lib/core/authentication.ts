/**
 * PSTN2 Authentication Service
 *
 * Handles Direct Query and Token Pool authentication
 */

import { DatabaseConnection } from '../database/connection';
import { MessagingService } from './messaging';
import {
  AuthenticationRequest,
  AuthenticationResponse,
  TokenCreateRequest,
  TokenCreateResponse,
  TokenVerifyRequest,
  TokenVerifyResponse,
  MessageType,
  PSTN2Error,
  ErrorCode,
  NumberStatus
} from './types';
import {
  generateTokenId,
  generateMessageId,
  getCurrentTimestamp,
  addSeconds,
  isExpired,
  normalizePhoneNumber
} from './utils';

export class AuthenticationService {
  constructor(
    private cpId: string,
    private db: DatabaseConnection,
    private messaging: MessagingService,
    private authMode: 'direct_query' | 'token_pool'
  ) {}

  // ==========================================================================
  // Direct Query Authentication
  // ==========================================================================

  /**
   * Verify an inbound call using Direct Query
   * This is called by the terminating CP to verify the originating CP
   */
  async verifyCall(
    request: AuthenticationRequest
  ): Promise<AuthenticationResponse> {
    const startTime = new Date();

    try {
      // Step 1: Normalize phone numbers
      const callerID = normalizePhoneNumber(request.callerID);
      const calledID = normalizePhoneNumber(request.calledID);

      // Step 2: Look up the owner of the caller ID
      const originatingCP = await this.lookupNumberOwner(callerID);

      if (!originatingCP) {
        return {
          verified: false,
          errorCode: ErrorCode.NUMBER_NOT_FOUND,
          errorMessage: `No CP found for caller ID: ${callerID}`
        };
      }

      // Step 3: Check if number was ported - follow the chain
      const portingChain = await this.resolvePortingChain(callerID);

      // Step 4: Query the actual current owner
      const actualOwner = portingChain[portingChain.length - 1];
      const ownerEndpoint = await this.getCPEndpoint(actualOwner);

      // Step 5: Send authentication request to originating CP
      const authResponse = await this.messaging.sendMessage(
        actualOwner,
        `${ownerEndpoint}/pstn2/v1/auth/verify`,
        MessageType.AUTH_REQUEST,
        {
          callerID,
          calledID,
          callReference: request.callReference,
          timestamp: getCurrentTimestamp()
        },
        request.callReference
      );

      const duration = new Date().getTime() - startTime.getTime();

      // Step 6: Return response
      return {
        verified: authResponse.verified === true,
        callerName: authResponse.callerName,
        callPurpose: authResponse.callPurpose,
        portingChain: portingChain.length > 1 ? portingChain : undefined,
        duration
      };
    } catch (error) {
      if (error instanceof PSTN2Error) {
        return {
          verified: false,
          errorCode: error.code,
          errorMessage: error.message
        };
      }

      return {
        verified: false,
        errorCode: ErrorCode.AUTHENTICATION_FAILED,
        errorMessage: (error as Error).message
      };
    }
  }

  /**
   * Respond to an authentication query (originating CP side)
   * This is called when another CP asks "did you originate this call?"
   */
  async respondToAuthQuery(
    request: AuthenticationRequest
  ): Promise<AuthenticationResponse> {
    try {
      // Check if this number belongs to us and is active
      const number = await this.getNumberRecord(request.callerID);

      if (!number) {
        return {
          verified: false,
          errorCode: ErrorCode.CALL_NOT_FOUND,
          errorMessage: `Number ${request.callerID} not found in our system`
        };
      }

      if (number.status === NumberStatus.PORTED_OUT) {
        return {
          verified: false,
          errorCode: ErrorCode.NUMBER_PORTED,
          errorMessage: `Number has been ported to ${number.portedToCP}`,
          portingChain: number.portedToCP ? [number.portedToCP] : undefined
        };
      }

      // TODO: In a real system, check if we actually initiated this call
      // For simulation, we'll verify if the number exists and is active

      return {
        verified: true,
        callerName: number.subscriberName || undefined,
        callPurpose: 'General call'
      };
    } catch (error) {
      return {
        verified: false,
        errorCode: ErrorCode.AUTHENTICATION_FAILED,
        errorMessage: (error as Error).message
      };
    }
  }

  // ==========================================================================
  // Token Pool Authentication
  // ==========================================================================

  /**
   * Create a token before placing a call (Token Pool mode)
   */
  async createToken(
    request: TokenCreateRequest
  ): Promise<TokenCreateResponse> {
    const tokenId = generateTokenId();
    const ttl = request.ttl || 30; // Default 30 seconds
    const expiresAt = addSeconds(new Date(), ttl);

    const sql = `
      INSERT INTO auth_tokens (
        token_id, caller_id, called_id, call_reference,
        originating_cp, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `;

    await this.db.insert(sql, [
      tokenId,
      normalizePhoneNumber(request.callerID),
      normalizePhoneNumber(request.calledID),
      request.callReference,
      this.cpId,
      expiresAt
    ]);

    // Log token creation
    await this.messaging.logMessage({
      messageId: tokenId,
      callReference: request.callReference,
      messageType: MessageType.TOKEN_CREATE,
      direction: 'sent',
      fromCP: this.cpId,
      toCP: 'token_pool',
      requestPayload: request,
      responsePayload: { tokenId, expiresAt },
      timestamp: new Date()
    });

    return {
      tokenId,
      expiresAt: expiresAt.toISOString()
    };
  }

  /**
   * Verify a token (Token Pool mode)
   */
  async verifyToken(
    request: TokenVerifyRequest
  ): Promise<TokenVerifyResponse> {
    const sql = `
      SELECT
        token_id, caller_id, called_id, call_reference,
        originating_cp, expires_at, used, used_at
      FROM auth_tokens
      WHERE token_id = ?
    `;

    const token = await this.db.queryOne<any>(sql, [request.tokenId]);

    if (!token) {
      return {
        valid: false,
        errorMessage: 'Token not found'
      };
    }

    // Check if expired
    if (isExpired(token.expires_at)) {
      return {
        valid: false,
        errorMessage: 'Token has expired'
      };
    }

    // Check if already used
    if (token.used) {
      return {
        valid: false,
        errorMessage: 'Token has already been used'
      };
    }

    // Mark token as used
    const updateSql = `
      UPDATE auth_tokens
      SET used = TRUE, used_at = NOW(), used_by_cp = ?
      WHERE token_id = ?
    `;
    await this.db.update(updateSql, [this.cpId, request.tokenId]);

    // Log token verification
    await this.messaging.logMessage({
      messageId: generateMessageId(),
      callReference: token.call_reference,
      messageType: MessageType.TOKEN_VERIFY,
      direction: 'received',
      fromCP: this.cpId,
      toCP: token.originating_cp,
      requestPayload: request,
      responsePayload: { valid: true },
      timestamp: new Date()
    });

    return {
      valid: true,
      cpId: token.originating_cp,
      callerID: token.caller_id,
      calledID: token.called_id,
      callReference: token.call_reference
    };
  }

  // ==========================================================================
  // Porting Chain Resolution
  // ==========================================================================

  /**
   * Resolve the porting chain for a number
   * Returns array of CP IDs from original to current owner
   */
  async resolvePortingChain(number: string): Promise<string[]> {
    const normalized = normalizePhoneNumber(number);
    const chain: string[] = [];
    let currentCP = await this.lookupNumberOwner(normalized);

    if (!currentCP) {
      return chain;
    }

    chain.push(currentCP);
    const maxHops = 5; // Prevent infinite loops

    for (let hop = 0; hop < maxHops; hop++) {
      // Query the current CP to check if number is ported
      const portingStatus = await this.queryPortingStatus(currentCP, normalized);

      if (portingStatus.status === NumberStatus.PORTED_OUT && portingStatus.portedToCP) {
        chain.push(portingStatus.portedToCP);
        currentCP = portingStatus.portedToCP;
      } else {
        // Number is active at this CP, end of chain
        break;
      }
    }

    return chain;
  }

  /**
   * Query porting status from a specific CP
   */
  private async queryPortingStatus(
    cpId: string,
    number: string
  ): Promise<{ status: NumberStatus; portedToCP?: string }> {
    try {
      const endpoint = await this.getCPEndpoint(cpId);

      const response = await this.messaging.sendMessage(
        cpId,
        `${endpoint}/pstn2/v1/porting/query`,
        MessageType.PORTING_QUERY,
        { number }
      );

      return {
        status: response.status,
        portedToCP: response.portedToCP
      };
    } catch (error) {
      // If we can't query, assume it's active
      return { status: NumberStatus.ACTIVE };
    }
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  /**
   * Look up which CP owns a number
   */
  private async lookupNumberOwner(number: string): Promise<string | null> {
    // First check our own numbers
    const ourNumber = await this.getNumberRecord(number);
    if (ourNumber && ourNumber.status === NumberStatus.ACTIVE) {
      return this.cpId;
    }

    // Check directory cache
    const sql = `
      SELECT cp_id, api_endpoint
      FROM directory_cache
      WHERE ? REGEXP REPLACE(number_range, 'X', '[0-9]')
      AND (expires_at IS NULL OR expires_at > NOW())
      LIMIT 1
    `;

    const entry = await this.db.queryOne<any>(sql, [number]);
    return entry ? entry.cp_id : null;
  }

  /**
   * Get number record from database
   */
  private async getNumberRecord(number: string): Promise<any | null> {
    const sql = `
      SELECT number, number_range, status, ported_to_cp, ported_from_cp, subscriber_name
      FROM numbers
      WHERE number = ?
    `;

    return await this.db.queryOne(sql, [normalizePhoneNumber(number)]);
  }

  /**
   * Get CP endpoint from directory cache
   */
  private async getCPEndpoint(cpId: string): Promise<string> {
    const sql = `
      SELECT api_endpoint
      FROM directory_cache
      WHERE cp_id = ?
      LIMIT 1
    `;

    const entry = await this.db.queryOne<any>(sql, [cpId]);

    if (!entry) {
      throw new PSTN2Error(
        ErrorCode.NUMBER_NOT_FOUND,
        `No endpoint found for CP: ${cpId}`,
        404
      );
    }

    return entry.api_endpoint;
  }
}
