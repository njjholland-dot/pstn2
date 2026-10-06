/**
 * Emergency services (SPECIFICATION.md §8).
 *
 * The PSAP discovers the caller's current holder (§9) and asks it for live
 * location: `POST {holder}/pstn2/v1/emergency/location`. Failures are
 * THROWN (DiscoveryError / PSTN2Error) so the PSAP can see the query failed
 * and use its other location sources; this method never returns null.
 */

import { MessagingClient } from '../messaging';
import {
  CallReference,
  CpRef,
  DiscoveryResult,
  EmergencyLocationRequest,
  EmergencyLocationResponse,
  NotHeldResponse,
  PhoneNumber,
} from '../types';
import { toE164 } from '../utils/numbering';
import { getLogger } from '../utils/logger';

const logger = getLogger();

export interface GetLocationParams {
  callerID: PhoneNumber;
  callReference?: CallReference;
  /** PSAP identifier, e.g. UK-999-LONDON-01. */
  psapID: string;
}

export type EmergencyLocationResult = EmergencyLocationResponse & {
  holder: CpRef;
  discovery: DiscoveryResult;
  retried: boolean;
};

export class EmergencyModule {
  private readonly messaging: MessagingClient;

  constructor(messaging: MessagingClient) {
    this.messaging = messaging;
  }

  async getLocation(params: GetLocationParams): Promise<EmergencyLocationResult> {
    const callerID = toE164(params.callerID);
    const callReference = params.callReference || this.messaging.generateCallReference();
    logger.info('Emergency location request', { callerID, psapID: params.psapID });
    const request: EmergencyLocationRequest = { requestingPSAP: params.psapID, callerID, callReference };
    try {
      const r = await this.messaging.callHolder<EmergencyLocationResponse>(callerID, 'POST', '/emergency/location', request);
      return { ...r.response, holder: r.holder, discovery: r.discovery, retried: r.retried };
    } catch (err) {
      logger.error('Emergency location query failed', { callerID, error: (err as Error).message });
      throw err;
    }
  }

  /** Server side: answer a PSAP's location request (NotHeldResponse if not our number). */
  async handleLocationRequest(
    request: EmergencyLocationRequest,
    options: {
      holdsNumber: (number: PhoneNumber) => Promise<boolean> | boolean;
      getLocation: (callerID: PhoneNumber, callReference: CallReference) => Promise<EmergencyLocationResponse>;
    }
  ): Promise<EmergencyLocationResponse | NotHeldResponse> {
    if (!(await options.holdsNumber(request.callerID))) {
      return { result: 'not_held', callReference: request.callReference, cache: { invalidate: true, scope: 'number' }, timestamp: new Date().toISOString() };
    }
    return options.getLocation(request.callerID, request.callReference);
  }
}
