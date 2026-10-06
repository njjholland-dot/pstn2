/**
 * Authentication Option 1: Direct Query (SPECIFICATION.md §5.1).
 *
 * The terminating CP finds the CP that currently holds the caller ID with
 * Number Discovery (following the Range Holder's redirect for a ported
 * number) and asks it, `POST {holder}/pstn2/v1/auth/verify`, whether it has
 * this call in progress. A `not_held` answer (stale cache) triggers purge →
 * rediscover → retry once.
 */

import { MessagingClient } from '../messaging';
import {
  CallVerificationRequest,
  CallVerificationResponse,
  CallReference,
  CpRef,
  DiscoveryResult,
  NotHeldResponse,
  PhoneNumber,
  BrandingInfo,
} from '../types';
import { DiscoveryError } from '../errors';
import { toE164 } from '../utils/numbering';
import { getLogger } from '../utils/logger';

const logger = getLogger();

/** Verification outcome: the holder's answer plus how it was reached. */
export interface VerificationResult extends CallVerificationResponse {
  /** The CP that answered (the caller ID's current holder). */
  holder?: CpRef;
  /** Number Discovery for the caller ID (the one that found `holder`). */
  discovery: DiscoveryResult;
  /** True when a stale holder answered not_held and the request was retried. */
  retried: boolean;
  /**
   * True when PSTN2 could not reach a holder for the caller ID (unallocated,
   * unknown, not participating, discovery error): treat the call with
   * traditional PSTN handling. False when the holder gave a definite answer.
   */
  fallbackToTraditional: boolean;
  /** Why the call is not verified (discovery result/error, or call_not_found). */
  reason?: string;
}

export class DirectQueryAuth {
  private readonly messaging: MessagingClient;

  constructor(messaging: MessagingClient) {
    this.messaging = messaging;
  }

  /** Verify an inbound call's caller ID with the CP that holds it. */
  async verifyCall(callerID: PhoneNumber, calledID: PhoneNumber, callReference: CallReference): Promise<VerificationResult> {
    const caller = toE164(callerID);
    logger.info('Verifying caller ID (direct query)', { callerID: caller, calledID, callReference });

    const request: CallVerificationRequest = {
      requestingCP: this.messaging.getCpId(),
      callerID: caller,
      calledID: toE164(calledID),
      callReference,
    };

    try {
      const r = await this.messaging.callHolder<CallVerificationResponse & { error?: unknown }>(
        caller,
        'POST',
        '/auth/verify',
        request,
        { acceptStatuses: [404] }
      );
      if (r.status === 404) {
        return {
          verified: false,
          callReference,
          trustLevel: 'low',
          holder: r.holder,
          discovery: r.discovery,
          retried: r.retried,
          fallbackToTraditional: false,
          reason: 'call_not_found',
        };
      }
      const { error: _e, ...body } = r.response;
      void _e;
      return {
        ...body,
        verified: !!body.verified,
        callReference: body.callReference || callReference,
        holder: r.holder,
        discovery: r.discovery,
        retried: r.retried,
        fallbackToTraditional: false,
        reason: body.verified ? undefined : 'not_verified',
      };
    } catch (err) {
      if (err instanceof DiscoveryError) {
        const d = err.discovery;
        logger.warn('Caller ID has no PSTN2 holder: traditional PSTN handling', { callerID: caller, result: d.result, error: d.error });
        return {
          verified: false,
          callReference,
          trustLevel: 'low',
          discovery: d,
          retried: false,
          fallbackToTraditional: true,
          reason: d.error || d.result,
        };
      }
      throw err;
    }
  }

  /**
   * Server side: answer a verification request from another CP.
   * Returns a NotHeldResponse when this CP does not hold the caller ID.
   */
  async handleVerificationRequest(
    request: CallVerificationRequest,
    options: {
      holdsNumber: (number: PhoneNumber) => Promise<boolean> | boolean;
      findCall: (callerID: PhoneNumber, callReference: CallReference) => Promise<
        { exists: boolean; callerName?: string; callerOrg?: string; callPurpose?: string; branding?: BrandingInfo } | undefined
      >;
    }
  ): Promise<CallVerificationResponse | NotHeldResponse> {
    const timestamp = new Date().toISOString();
    if (!(await options.holdsNumber(request.callerID))) {
      return { verified: false, result: 'not_held', callReference: request.callReference, cache: { invalidate: true, scope: 'number' }, timestamp };
    }
    const call = await options.findCall(request.callerID, request.callReference);
    if (!call || !call.exists) {
      logger.warn('Call not found - possible spoofed caller ID', { callerID: request.callerID, requestingCP: request.requestingCP });
      return { verified: false, callReference: request.callReference, trustLevel: 'low', timestamp };
    }
    return {
      verified: true,
      callReference: request.callReference,
      callerName: call.callerName,
      callerOrg: call.callerOrg,
      callPurpose: call.callPurpose,
      branding: call.branding,
      trustLevel: 'verified',
      timestamp,
    };
  }
}

