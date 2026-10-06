/**
 * Error classes for PSTN2.
 *
 * Number Discovery outcomes (unallocated, unknown, not_participating, …) are
 * RESULTS, not errors (SPECIFICATION.md §9.3, §10.2). Modules that cannot
 * continue without a holder raise DiscoveryError, which carries the full
 * DiscoveryResult so callers can fall back to traditional PSTN.
 */

import { DiscoveryResult, ErrorCode, ErrorResponse } from './types';

export { ErrorCode } from './types';

/** Base PSTN2 error. */
export class PSTN2Error extends Error {
  public readonly code: ErrorCode | string;
  public readonly status?: number;
  public readonly details?: Record<string, unknown>;
  public readonly timestamp: Date;

  constructor(code: ErrorCode | string, message: string, details?: Record<string, unknown>, status?: number) {
    super(message);
    this.name = 'PSTN2Error';
    this.code = code;
    this.details = details;
    this.status = status;
    this.timestamp = new Date();
    if (Error.captureStackTrace) Error.captureStackTrace(this, new.target);
  }

  /** Spec-shaped ErrorResponse (§10.1). */
  toJSON(): ErrorResponse {
    return {
      error: {
        code: String(this.code),
        message: this.message,
        timestamp: this.timestamp.toISOString(),
      },
    };
  }
}

/** Request timed out (after retries). */
export class TimeoutError extends PSTN2Error {
  constructor(message = 'Request timed out', details?: Record<string, unknown>) {
    super(ErrorCode.Timeout, message, details);
    this.name = 'TimeoutError';
  }
}

/** Connection failed (after retries). */
export class NetworkError extends PSTN2Error {
  constructor(message = 'Network error occurred', details?: Record<string, unknown>) {
    super(ErrorCode.NetworkError, message, details);
    this.name = 'NetworkError';
  }
}

/** Rate limit exceeded (429). */
export class RateLimitError extends PSTN2Error {
  public readonly retryAfter?: number;

  constructor(retryAfter?: number, details?: Record<string, unknown>) {
    super(ErrorCode.RateLimitExceeded, 'Rate limit exceeded', details, 429);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

/** Invalid input supplied to the SDK. */
export class ValidationError extends PSTN2Error {
  constructor(message: string, details?: Record<string, unknown>) {
    super(ErrorCode.InvalidRequest, message, details);
    this.name = 'ValidationError';
  }
}

/**
 * Number Discovery did not yield a PSTN2 holder for the number.
 * The caller MUST fall back to traditional PSTN handling (§9.3).
 */
export class DiscoveryError extends PSTN2Error {
  public readonly discovery: DiscoveryResult;

  constructor(discovery: DiscoveryResult) {
    const code =
      discovery.error === 'hop_limit_exceeded'
        ? ErrorCode.HopLimitExceeded
        : discovery.error === 'loop_detected'
        ? ErrorCode.LoopDetected
        : discovery.error === 'invalid_signature'
        ? ErrorCode.InvalidSignature
        : discovery.error === 'timeout'
        ? ErrorCode.Timeout
        : ErrorCode.DiscoveryFailed;
    super(
      code,
      `Number Discovery for ${discovery.number}: ${discovery.result}${discovery.error ? ` (${discovery.error})` : ''}`,
      { discovery }
    );
    this.name = 'DiscoveryError';
    this.discovery = discovery;
  }
}

/** A CP still answered not_held after the cache was purged and the holder rediscovered. */
export class NotHeldError extends PSTN2Error {
  constructor(number: string, cpId: string) {
    super(ErrorCode.NumberNotFound, `${cpId} does not hold ${number} (after rediscovery)`, { number, cpId });
    this.name = 'NotHeldError';
  }
}
