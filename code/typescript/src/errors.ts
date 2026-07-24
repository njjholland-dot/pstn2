/**
 * Custom error classes for PSTN2
 */

import { ErrorCode } from './types';

/**
 * Base PSTN2 error class
 */
export class PSTN2Error extends Error {
  public readonly code: ErrorCode;
  public readonly details?: Record<string, unknown>;
  public readonly timestamp: Date;

  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'PSTN2Error';
    this.code = code;
    this.details = details;
    this.timestamp = new Date();

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, PSTN2Error);
    }
  }

  toJSON(): Record<string, unknown> {
    return {
      error: this.code,
      message: this.message,
      details: this.details,
      timestamp: this.timestamp.toISOString(),
    };
  }
}

/**
 * Network timeout error
 */
export class TimeoutError extends PSTN2Error {
  constructor(message: string = 'Request timed out', details?: Record<string, unknown>) {
    super(ErrorCode.Timeout, message, details);
    this.name = 'TimeoutError';
  }
}

/**
 * Network connection error
 */
export class NetworkError extends PSTN2Error {
  constructor(message: string = 'Network error occurred', details?: Record<string, unknown>) {
    super(ErrorCode.NetworkError, message, details);
    this.name = 'NetworkError';
  }
}

/**
 * Call not found error (potential fraud)
 */
export class CallNotFoundError extends PSTN2Error {
  constructor(
    message: string = 'Call not found - potential spoofed caller ID',
    details?: Record<string, unknown>
  ) {
    super(ErrorCode.CallNotFound, message, details);
    this.name = 'CallNotFoundError';
  }
}

/**
 * Number ported error (need to retry with new CP)
 */
export class NumberPortedError extends PSTN2Error {
  public readonly newCP: string;
  public readonly newEndpoint: string;

  constructor(newCP: string, newEndpoint: string, details?: Record<string, unknown>) {
    super(ErrorCode.NumberPorted, `Number ported to ${newCP}`, details);
    this.name = 'NumberPortedError';
    this.newCP = newCP;
    this.newEndpoint = newEndpoint;
  }
}

/**
 * Call rejected error
 */
export class CallRejectedError extends PSTN2Error {
  public readonly reason?: string;

  constructor(reason?: string, details?: Record<string, unknown>) {
    super(ErrorCode.CallRejected, reason || 'Call rejected by recipient', details);
    this.name = 'CallRejectedError';
    this.reason = reason;
  }
}

/**
 * Token expired error
 */
export class TokenExpiredError extends PSTN2Error {
  constructor(message: string = 'Token has expired', details?: Record<string, unknown>) {
    super(ErrorCode.TokenExpired, message, details);
    this.name = 'TokenExpiredError';
  }
}

/**
 * Rate limit exceeded error
 */
export class RateLimitError extends PSTN2Error {
  public readonly retryAfter?: number;

  constructor(retryAfter?: number, details?: Record<string, unknown>) {
    super(ErrorCode.RateLimitExceeded, 'Rate limit exceeded', details);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

/**
 * Validation error for invalid requests
 */
export class ValidationError extends PSTN2Error {
  constructor(message: string, details?: Record<string, unknown>) {
    super(ErrorCode.InvalidRequest, message, details);
    this.name = 'ValidationError';
  }
}
