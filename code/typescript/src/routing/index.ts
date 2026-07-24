/**
 * Routing module
 * Handles direct routing discovery between CPs
 */

import { MessagingClient } from '../messaging';
import {
  RoutingRequest,
  RoutingResponse,
  PhoneNumber,
  CallReference,
  MediaCapabilities,
  ConnectionDetails,
  BrandingInfo,
  PSTN2Config,
} from '../types';
import { getLogger } from '../utils/logger';
import { CallRejectedError } from '../errors';

const logger = getLogger();

export class RoutingModule {
  private messagingClient: MessagingClient;
  private config: PSTN2Config;
  private directoryLookup: (phoneNumber: PhoneNumber) => Promise<{ cpId: string; apiEndpoint: string }>;

  constructor(
    messagingClient: MessagingClient,
    config: PSTN2Config,
    directoryLookup: (phoneNumber: PhoneNumber) => Promise<{ cpId: string; apiEndpoint: string }>
  ) {
    this.messagingClient = messagingClient;
    this.config = config;
    this.directoryLookup = directoryLookup;
  }

  /**
   * Request direct routing to destination number
   */
  async requestRouting(params: {
    destinationNumber: PhoneNumber;
    callerID: PhoneNumber;
    callReference?: CallReference;
    mediaCapabilities: MediaCapabilities;
    connectionDetails: ConnectionDetails;
    branding?: BrandingInfo;
  }): Promise<RoutingResponse & { portingChain?: string[] }> {
    const callReference = params.callReference || this.messagingClient.generateCallReference();

    logger.info('Requesting direct routing', {
      destinationNumber: params.destinationNumber,
      callerID: params.callerID,
      callReference,
    });

    // Lookup destination CP
    const cpInfo = await this.directoryLookup(params.destinationNumber);

    logger.debug('Found CP for destination', {
      destinationNumber: params.destinationNumber,
      cpId: cpInfo.cpId,
      apiEndpoint: cpInfo.apiEndpoint,
    });

    // Build routing request
    const request: RoutingRequest = {
      destinationNumber: params.destinationNumber,
      callerID: params.callerID,
      callReference,
      originCP: this.config.cpId,
      mediaCapabilities: params.mediaCapabilities,
      connectionDetails: params.connectionDetails,
      branding: params.branding,
      timestamp: this.messagingClient.getCurrentTimestamp(),
    };

    // Make request to destination CP
    const { response, portingChain } = await this.messagingClient.request<
      RoutingRequest,
      RoutingResponse
    >('/request-routing', cpInfo.apiEndpoint, request);

    // Check if call was accepted
    if (!response.accepted) {
      throw new CallRejectedError(response.rejectReason, {
        callReference,
        destinationNumber: params.destinationNumber,
      });
    }

    logger.info('Routing request accepted', {
      callReference,
      destinationCP: response.destinationCP,
      fqdn: response.connectionDetails?.fqdn,
      port: response.connectionDetails?.port,
    });

    // Return response with porting chain if any
    return {
      ...response,
      portingChain: portingChain.length > 0 ? portingChain : undefined,
    };
  }

  /**
   * Handle inbound routing request (server-side)
   * Called when another CP wants to route a call to us
   */
  async handleRoutingRequest(
    request: RoutingRequest,
    options: {
      checkNumber: (number: PhoneNumber) => Promise<boolean>;
      checkBlocked: (callerID: PhoneNumber) => Promise<boolean>;
      getConnectionDetails: () => Promise<ConnectionDetails>;
      selectMediaCapabilities: (requested: MediaCapabilities) => MediaCapabilities;
    }
  ): Promise<RoutingResponse> {
    logger.info('Handling routing request', {
      destinationNumber: request.destinationNumber,
      callerID: request.callerID,
      callReference: request.callReference,
      originCP: request.originCP,
    });

    // Check if we host this number
    const weHostNumber = await options.checkNumber(request.destinationNumber);
    if (!weHostNumber) {
      logger.warn('Number not hosted by us', {
        destinationNumber: request.destinationNumber,
      });

      return {
        accepted: false,
        callReference: request.callReference,
        rejectReason: 'Number not found',
      };
    }

    // Check if caller is blocked
    const isBlocked = await options.checkBlocked(request.callerID);
    if (isBlocked) {
      logger.info('Caller is blocked', {
        callerID: request.callerID,
        destinationNumber: request.destinationNumber,
      });

      return {
        accepted: false,
        callReference: request.callReference,
        rejectReason: 'Caller blocked',
      };
    }

    // Get our connection details for direct media
    const connectionDetails = await options.getConnectionDetails();

    // Negotiate media capabilities
    const mediaCapabilities = options.selectMediaCapabilities(request.mediaCapabilities);

    logger.info('Routing request accepted', {
      callReference: request.callReference,
      fqdn: connectionDetails.fqdn,
      port: connectionDetails.port,
    });

    return {
      accepted: true,
      destinationCP: this.config.cpId,
      connectionDetails,
      mediaCapabilities,
      callReference: request.callReference,
    };
  }

  /**
   * Negotiate codec selection
   * Returns best matching codec from requested list
   */
  negotiateCodecs(
    requestedCodecs: string[],
    supportedCodecs: string[]
  ): string[] {
    const matchingCodecs = requestedCodecs.filter((codec) =>
      supportedCodecs.includes(codec)
    );

    if (matchingCodecs.length === 0) {
      logger.warn('No matching codecs found', {
        requested: requestedCodecs,
        supported: supportedCodecs,
      });
    }

    return matchingCodecs;
  }

  /**
   * Negotiate encryption
   * Returns best matching encryption method
   */
  negotiateEncryption(
    requestedEncryption: string[],
    supportedEncryption: string[]
  ): string[] {
    const matchingEncryption = requestedEncryption.filter((enc) =>
      supportedEncryption.includes(enc)
    );

    if (matchingEncryption.length === 0) {
      logger.warn('No matching encryption found', {
        requested: requestedEncryption,
        supported: supportedEncryption,
      });
    }

    return matchingEncryption;
  }
}
