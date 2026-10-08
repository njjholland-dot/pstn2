/**
 * Authentication module: Direct Query (the only authentication method).
 * The terminating CP finds the caller ID's holder with Number Discovery and
 * asks it `POST /pstn2/v1/auth/verify`.
 */

import { DirectQueryAuth, VerificationResult } from './direct-query';
import { MessagingClient } from '../messaging';
import { CallReference, PhoneNumber } from '../types';

export interface VerifyCallParams {
  callerID: PhoneNumber;
  calledID: PhoneNumber;
  callReference?: CallReference;
}

export class AuthenticationModule {
  readonly directQuery: DirectQueryAuth;
  private readonly messaging: MessagingClient;

  constructor(messaging: MessagingClient) {
    this.messaging = messaging;
    this.directQuery = new DirectQueryAuth(messaging);
  }

  /** Verify an inbound call's caller ID with the CP that holds it (Direct Query). */
  async verifyCall(params: VerifyCallParams): Promise<VerificationResult> {
    const callReference = params.callReference || this.messaging.generateCallReference();
    return this.directQuery.verifyCall(params.callerID, params.calledID, callReference);
  }
}

export { DirectQueryAuth } from './direct-query';
export type { VerificationResult } from './direct-query';
