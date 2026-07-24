/**
 * Authentication Option 1: Direct CP Query
 * Recipient CP queries originating CP directly to verify call
 */

import { MessagingClient } from '../messaging';
import {
  CallVerificationRequest,
  CallVerificationResponse,
  PhoneNumber,
  CallReference,
  RCPID,
} from '../types';
import { getLogger } from '../utils/logger';

const logger = getLogger();

export class DirectQueryAuth {
  private messagingClient: MessagingClient;
  private directoryLookup: (phoneNumber: PhoneNumber) => Promise<{ cpId: RCPID; apiEndpoint: string }>;

  constructor(
    messagingClient: MessagingClient,
    directoryLookup: (phoneNumber: PhoneNumber) => Promise<{ cpId: RCPID; apiEndpoint: string }>
  ) {
    this.messagingClient = messagingClient;
    this.directoryLookup = directoryLookup;
  }

  /**
   * Verify a call by querying the originating CP
   */
  async verifyCall(
    callerID: PhoneNumber,
    calledID: PhoneNumber,
    callReference: CallReference
  ): Promise<CallVerificationResponse> {
    logger.info('Verifying call via direct query', {
      callerID,
      calledID,
      callReference,
    });

    // Lookup the CP responsible for the caller ID
    const cpInfo = await this.directoryLookup(callerID);

    logger.debug('Found CP for caller ID', {
      callerID,
      cpId: cpInfo.cpId,
      apiEndpoint: cpInfo.apiEndpoint,
    });

    // Build verification request
    const request: CallVerificationRequest = {
      callerID,
      calledID,
      callReference,
      timestamp: this.messagingClient.getCurrentTimestamp(),
      requestingCP: this.messagingClient.getCpId(),
    };

    // Make request to originating CP
    const { response, portingChain } = await this.messagingClient.request<
      CallVerificationRequest,
      CallVerificationResponse
    >('/auth/verify', cpInfo.apiEndpoint, request);

    // Add porting chain to response if any porting occurred
    if (portingChain.length > 0) {
      response.portingChain = portingChain;
      logger.info('Call verified through porting chain', {
        callReference,
        portingChain,
      });
    }

    logger.info('Call verification result', {
      callReference,
      verified: response.verified,
      trustLevel: response.trustLevel,
    });

    return response;
  }

  /**
   * Handle inbound verification request (server-side)
   * Called when another CP asks us to verify a call we're placing
   */
  async handleVerificationRequest(
    request: CallVerificationRequest,
    callDatabase: (callRef: CallReference) => Promise<{
      exists: boolean;
      callerName?: string;
      callerOrg?: string;
      callPurpose?: string;
      branding?: any;
    }>
  ): Promise<CallVerificationResponse> {
    logger.info('Handling verification request', {
      callerID: request.callerID,
      callReference: request.callReference,
      requestingCP: request.requestingCP,
    });

    // Look up the call in our database
    const callInfo = await callDatabase(request.callReference);

    if (!callInfo.exists) {
      logger.warn('Call not found - possible spoofed caller ID', {
        callerID: request.callerID,
        callReference: request.callReference,
        requestingCP: request.requestingCP,
      });

      return {
        verified: false,
        callReference: request.callReference,
        trustLevel: 'low',
      };
    }

    // Call found - return verification with metadata
    return {
      verified: true,
      callReference: request.callReference,
      callerName: callInfo.callerName,
      callerOrg: callInfo.callerOrg,
      callPurpose: callInfo.callPurpose,
      branding: callInfo.branding,
      trustLevel: 'high',
    };
  }
}
