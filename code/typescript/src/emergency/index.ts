/**
 * Emergency services module
 * Handles live location for emergency calls (POST /emergency/location)
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

export interface GetLocationParams {
  callerID: PhoneNumber;
  callReference: CallReference;
  psapID: string;
}

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
   * Get live location for emergency call (PSAP use).
   *
   * Errors are logged and RETHROWN: a PSAP caller must be able to see that
   * the location query failed so it can fall back to other location sources
   * (e.g. billing address). This method never silently returns null.
   */
  async getLocation(params: GetLocationParams): Promise<EmergencyLocationResponse> {
    const { callerID, callReference, psapID } = params;

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
        requestingPSAP: psapID,
        timestamp: this.messagingClient.getCurrentTimestamp(),
      };

      // Make request to CP
      const { response } = await this.messagingClient.request<
        EmergencyLocationRequest,
        EmergencyLocationResponse
      >('/emergency/location', cpInfo.apiEndpoint, request);

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
      // Rethrow: PSAP callers must see failures and apply their own fallback
      throw error;
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
      requestingPSAP: request.requestingPSAP,
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
