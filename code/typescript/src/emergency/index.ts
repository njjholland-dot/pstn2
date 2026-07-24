/**
 * Emergency services module
 * Handles live location for emergency calls
 */

import { MessagingClient } from '../messaging';
import {
  EmergencyLocationRequest,
  EmergencyLocationResponse,
  PhoneNumber,
  CallReference,
} from '../types';
import { getLogger } from '../utils/logger';

const logger = getLogger();

export class EmergencyModule {
  private messagingClient: MessagingClient;
  private directoryLookup: (phoneNumber: PhoneNumber) => Promise<{ cpId: string; apiEndpoint: string }>;

  constructor(
    messagingClient: MessagingClient,
    directoryLookup: (phoneNumber: PhoneNumber) => Promise<{ cpId: string; apiEndpoint: string }>
  ) {
    this.messagingClient = messagingClient;
    this.directoryLookup = directoryLookup;
  }

  /**
   * Get live location for emergency call (PSAP use)
   */
  async getLocation(
    callerID: PhoneNumber,
    callReference: CallReference,
    psapID: string
  ): Promise<EmergencyLocationResponse | null> {
    logger.info('Emergency location request', {
      callerID,
      callReference,
      psapID,
    });

    try {
      // Lookup CP hosting the caller's number
      const cpInfo = await this.directoryLookup(callerID);

      logger.debug('Found CP for emergency caller', {
        callerID,
        cpId: cpInfo.cpId,
      });

      // Build location request
      const request: EmergencyLocationRequest = {
        callerID,
        callReference,
        psapID,
        timestamp: this.messagingClient.getCurrentTimestamp(),
        requestType: 'location',
      };

      // Make request to CP
      const { response } = await this.messagingClient.request<
        EmergencyLocationRequest,
        EmergencyLocationResponse
      >('/emergency-location', cpInfo.apiEndpoint, request);

      logger.info('Emergency location received', {
        callReference,
        hasLocation: !!response.location,
        hasAddress: !!response.address,
      });

      return response;
    } catch (error) {
      logger.error('Failed to get emergency location', {
        callerID,
        callReference,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }

  /**
   * Handle emergency location request (CP server-side)
   * Called when PSAP requests location for our customer
   */
  async handleLocationRequest(
    request: EmergencyLocationRequest,
    getLocationData: (
      callerID: PhoneNumber,
      callReference: CallReference
    ) => Promise<EmergencyLocationResponse>
  ): Promise<EmergencyLocationResponse> {
    logger.info('Handling emergency location request', {
      callerID: request.callerID,
      callReference: request.callReference,
      psapID: request.psapID,
    });

    // Get location from device/database
    const locationData = await getLocationData(request.callerID, request.callReference);

    logger.info('Providing emergency location', {
      callReference: request.callReference,
      accuracy: locationData.location?.accuracy,
      source: locationData.location?.source,
    });

    return locationData;
  }
}
