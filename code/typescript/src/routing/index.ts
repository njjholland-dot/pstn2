/**
 * Direct routing (SPECIFICATION.md §6).
 *
 * The originating CP discovers the destination number's holder (§9) and asks
 * it for direct connection details: `POST {holder}/pstn2/v1/routing/request`.
 * Rejections are RETURNED (`accepted: false`, `fallbackToTraditional`), not
 * thrown, so callers fall back to traditional PSTN with a simple if/else.
 */

import { MessagingClient } from '../messaging';
import {
  BrandingInfo,
  CallReference,
  ConnectionDetails,
  CpRef,
  DiscoveryResult,
  MediaCapabilities,
  NotHeldResponse,
  PhoneNumber,
  RoutingRequest,
  RoutingResponse,
  RoutingResponseAccepted,
} from '../types';
import { DiscoveryError, PSTN2Error } from '../errors';
import { toE164 } from '../utils/numbering';
import { getLogger } from '../utils/logger';

const logger = getLogger();

/** Routing outcome plus how the destination's holder was reached. */
export type RoutingResult = RoutingResponse & {
  holder?: CpRef;
  discovery: DiscoveryResult;
  retried: boolean;
};

export interface RequestRoutingParams {
  destinationNumber: PhoneNumber;
  callerID: PhoneNumber;
  callReference?: CallReference;
  mediaCapabilities: MediaCapabilities;
  branding?: BrandingInfo;
}

const REJECTION_CODES = new Set(['capacity_exceeded', 'unsupported_codec', 'maintenance']);

export class RoutingModule {
  private readonly messaging: MessagingClient;
  private readonly publicKey?: string;

  /** @param publicKey raw Ed25519 identity public key (base64) sent in requests */
  constructor(messaging: MessagingClient, publicKey?: string) {
    this.messaging = messaging;
    this.publicKey = publicKey;
  }

  async requestRouting(params: RequestRoutingParams): Promise<RoutingResult> {
    const callReference = params.callReference || this.messaging.generateCallReference();
    const destination = toE164(params.destinationNumber);
    logger.info('Requesting direct routing', { destination, callReference });

    const request: RoutingRequest = {
      requestingCP: this.messaging.getCpId(),
      callerID: toE164(params.callerID),
      destinationNumber: destination,
      callReference,
      mediaCapabilities: params.mediaCapabilities,
      publicKey: this.publicKey,
      branding: params.branding,
    };

    try {
      const r = await this.messaging.callHolder<RoutingResponse & { reason?: string }>(
        destination,
        'POST',
        '/routing/request',
        request,
        { acceptStatuses: [503] }
      );
      const body = r.response;
      if (r.status === 503 || !body || body.accepted !== true) {
        return {
          accepted: false,
          callReference,
          reason: (body && (body as { reason?: string }).reason) || `http_${r.status}`,
          fallbackToTraditional: true,
          retryAfter: body && (body as { retryAfter?: number }).retryAfter,
          holder: r.holder,
          discovery: r.discovery,
          retried: r.retried,
        };
      }
      return { ...(body as RoutingResponseAccepted), holder: r.holder, discovery: r.discovery, retried: r.retried };
    } catch (err) {
      if (err instanceof DiscoveryError) {
        const d = err.discovery;
        logger.info('No PSTN2 path to destination: traditional PSTN', { destination, result: d.result, error: d.error });
        return { accepted: false, callReference, reason: d.error || d.result, fallbackToTraditional: true, discovery: d, retried: false };
      }
      if (err instanceof PSTN2Error && REJECTION_CODES.has(String(err.code))) {
        const discovery = await this.messaging.discovery.discover(destination);
        return { accepted: false, callReference, reason: String(err.code), fallbackToTraditional: true, holder: discovery.holder, discovery, retried: false };
      }
      throw err;
    }
  }

  /**
   * Server side: answer a routing request from another CP. Returns a
   * NotHeldResponse when this CP does not hold the destination (§10.2 number_not_found).
   */
  async handleRoutingRequest(
    request: RoutingRequest,
    options: {
      holdsNumber: (number: PhoneNumber) => Promise<boolean> | boolean;
      getConnectionDetails: () => Promise<ConnectionDetails> | ConnectionDetails;
      supportedCodecs?: string[];
      supportedEncryption?: string[];
    }
  ): Promise<RoutingResponse | NotHeldResponse> {
    const timestamp = new Date().toISOString();
    if (!(await options.holdsNumber(request.destinationNumber))) {
      return { verified: false, result: 'not_held', callReference: request.callReference, cache: { invalidate: true, scope: 'number' }, timestamp };
    }
    const codecs = this.negotiate(request.mediaCapabilities.codecs, options.supportedCodecs || ['opus', 'g722', 'pcmu', 'pcma']);
    const encryption = this.negotiate(request.mediaCapabilities.encryption, options.supportedEncryption || ['srtp-aes256', 'srtp-aes128']);
    if (!codecs.length) {
      return { accepted: false, callReference: request.callReference, reason: 'unsupported_codec', fallbackToTraditional: true, timestamp };
    }
    return {
      accepted: true,
      callReference: request.callReference,
      connectionDetails: await options.getConnectionDetails(),
      agreedCapabilities: { codecs: codecs.slice(0, 1), encryption: encryption.slice(0, 1), video: false },
      timestamp,
    };
  }

  /** Requested items supported locally, in the requester's preference order. */
  negotiate(requested: string[], supported: string[]): string[] {
    return requested.filter((x) => supported.includes(x));
  }
}
