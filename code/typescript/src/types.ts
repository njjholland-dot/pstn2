/**
 * Core type definitions for PSTN2
 * Aligned with docs/API-SPECIFICATION.yaml (OpenAPI 3.0.3, version 1.0)
 */

/**
 * E.164 formatted phone number (e.g., +441234567890)
 */
export type PhoneNumber = string;

/**
 * Range-CP-ID: Globally unique identifier for a Communication Provider
 */
export type RCPID = string;

/**
 * UUID v4 for unique call references
 */
export type CallReference = string;

/**
 * ISO 8601 timestamp
 */
export type Timestamp = string;

/**
 * Base64 encoded string
 */
export type Base64String = string;

/**
 * Authentication mode
 */
export enum AuthenticationMode {
  DirectQuery = 'direct_query',
  TokenPool = 'token_pool',
}

/**
 * Common message envelope fields (SPECIFICATION.md section 4.1).
 * All inter-CP messages carry these; the `signature` field in the JSON
 * body is the canonical location for the Ed25519 signature.
 */
export interface MessageEnvelope {
  messageId?: string;
  version?: string;
  timestamp?: Timestamp;
  signature?: Base64String;
}

/**
 * Call verification request (POST /auth/verify)
 */
export interface CallVerificationRequest extends MessageEnvelope {
  callerID: PhoneNumber;
  calledID: PhoneNumber;
  callReference: CallReference;
  requestingCP: RCPID;
}

/**
 * Call verification response
 */
export interface CallVerificationResponse {
  verified: boolean;
  callReference: CallReference;
  callerName?: string;
  callerOrg?: string;
  callPurpose?: string;
  branding?: BrandingInfo;
  trustLevel?: 'low' | 'medium' | 'high' | 'verified';
  timestamp?: Timestamp;
  signature?: Base64String;
  portingChain?: RCPID[]; // Added by client during resolution
}

/**
 * Branding information
 */
export interface BrandingInfo {
  logo?: string;
  backgroundColor?: string;
  textColor?: string;
  displayName?: string;
  callPurpose?: string;
}

/**
 * Media capabilities
 */
export interface MediaCapabilities {
  codecs: string[];
  encryption: string[];
  video?: boolean;
  maxBandwidth?: number;
}

/**
 * Connection details for media
 */
export interface ConnectionDetails {
  fqdn: string;
  port: number;
  ipv4?: string;
  ipv6?: string;
  publicKey?: Base64String;
  protocol?: 'udp' | 'tcp' | 'tls';
}

/**
 * Routing request (POST /routing/request)
 */
export interface RoutingRequest extends MessageEnvelope {
  destinationNumber: PhoneNumber;
  callerID: PhoneNumber;
  callReference: CallReference;
  requestingCP: RCPID;
  mediaCapabilities: MediaCapabilities;
  publicKey?: Base64String;
  connectionDetails?: ConnectionDetails;
  branding?: BrandingInfo;
}

/**
 * Routing response - accepted.
 * Discriminated on `accepted` so callers can narrow with `if (routing.accepted)`.
 */
export interface RoutingResponseAccepted {
  accepted: true;
  callReference: CallReference;
  connectionDetails: ConnectionDetails;
  agreedCapabilities: MediaCapabilities;
  destinationCP?: RCPID;
  timestamp?: Timestamp;
  signature?: Base64String;
}

/**
 * Routing response - rejected.
 * The SDK does NOT throw on rejection; callers inspect `accepted`/`rejectReason`.
 */
export interface RoutingResponseRejected {
  accepted: false;
  callReference: CallReference;
  rejectReason?: string;
  fallbackToTraditional?: boolean;
  retryAfter?: number;
  timestamp?: Timestamp;
  signature?: Base64String;
}

/**
 * Routing response
 */
export type RoutingResponse = RoutingResponseAccepted | RoutingResponseRejected;

/**
 * Number porting information
 */
export interface PortingResponse {
  numberStatus: 'ported' | 'returned';
  portedTo: {
    cpID: RCPID;
    apiEndpoint: string;
    portDate?: string;
  };
  cacheUntil?: Timestamp;
}

/**
 * Emergency location request (POST /emergency/location)
 */
export interface EmergencyLocationRequest extends MessageEnvelope {
  callerID: PhoneNumber;
  callReference: CallReference;
  requestingPSAP: string;
}

/**
 * Location data
 */
export interface LocationData {
  latitude: number;
  longitude: number;
  accuracy: number;
  altitude?: number;
  altitudeAccuracy?: number;
  source?: 'gps' | 'cell' | 'wifi' | 'user' | 'billing';
  timestamp?: Timestamp;
}

/**
 * Address data
 */
export interface AddressData {
  street?: string;
  city?: string;
  postcode?: string;
  country?: string;
}

/**
 * Additional emergency location context
 */
export interface EmergencyAdditionalInfo {
  cellTowerId?: string;
  wifiAccessPoints?: string[];
  lastUpdated?: Timestamp;
}

/**
 * Emergency location response
 */
export interface EmergencyLocationResponse {
  callReference: CallReference;
  location: LocationData;
  address?: AddressData;
  additionalInfo?: EmergencyAdditionalInfo;
  timestamp?: Timestamp;
  signature?: Base64String;
}

/**
 * A number range held by a CP
 */
export interface NumberRange {
  numberRange: string;
  status: 'active' | 'ported' | 'reserved' | 'deactivated';
  portedTo?: RCPID;
  portedAt?: Timestamp;
}

/**
 * Per-service API endpoints published by a CP
 */
export interface DirectoryEndpoints {
  auth?: string;
  routing?: string;
  emergency?: string;
}

/**
 * Directory entry (one per CP, GET /directory/all)
 */
export interface DirectoryEntry {
  cpId: RCPID;
  ranges: NumberRange[];
  endpoints: DirectoryEndpoints;
  publicKey?: Base64String;
  lastUpdated?: Timestamp;
  version?: number;
}

/**
 * Directory response (GET /directory/all)
 */
export interface DirectoryResponse {
  entries: DirectoryEntry[];
  lastModified?: Timestamp;
  version?: number;
}

/**
 * Token create request (POST /auth/tokens)
 */
export interface TokenCreateRequest extends MessageEnvelope {
  callerID: PhoneNumber;
  calledID: PhoneNumber;
  originatingCP: RCPID;
  callReference?: CallReference;
  ttl?: number;
  branding?: BrandingInfo;
}

/**
 * Token create response
 */
export interface TokenCreateResponse {
  tokenId: string;
  expiresAt: Timestamp;
  callReference: CallReference;
}

/**
 * Token data (GET /auth/tokens/{tokenId})
 */
export interface TokenData {
  tokenId?: string;
  callerID: PhoneNumber;
  calledID: PhoneNumber;
  originatingCP: RCPID;
  callReference?: CallReference;
  verified?: boolean;
  branding?: BrandingInfo;
  expiresAt?: Timestamp;
}

/**
 * Error codes
 */
export enum ErrorCode {
  // Network errors
  Timeout = 'timeout',
  NetworkError = 'network_error',
  ConnectionRefused = 'connection_refused',

  // Authentication errors
  CallNotFound = 'call_not_found',
  VerificationFailed = 'verification_failed',
  InvalidSignature = 'invalid_signature',

  // Routing errors
  NumberPorted = 'number_ported',
  NumberNotFound = 'number_not_found',
  CallRejected = 'call_rejected',

  // Token pool errors
  TokenExpired = 'token_expired',
  TokenNotFound = 'token_not_found',
  TokenPoolUnavailable = 'token_pool_unavailable',

  // General errors
  InvalidRequest = 'invalid_request',
  RateLimitExceeded = 'rate_limit_exceeded',
  InternalError = 'internal_error',
  ServiceUnavailable = 'service_unavailable',
}

/**
 * Error response
 */
export interface ErrorResponse {
  error: string;
  message: string;
  details?: Record<string, unknown>;
  timestamp?: Timestamp;
}

/**
 * PSTN2 configuration
 */
export interface PSTN2Config {
  // CP identification
  cpId: RCPID;
  apiEndpoint: string;

  // Security
  privateKey: string;
  publicKey?: string;

  // Authentication
  authMode: AuthenticationMode;
  tokenPoolEndpoint?: string;
  tokenPoolAuth?: string;

  // Caching
  cacheDirectory?: boolean;
  cacheTTL?: number; // seconds (default: 86400 for directory, 3600 for branding)

  // Network
  timeout?: number; // milliseconds
  retries?: number;

  // Fallback
  fallbackToTraditional?: boolean; // default: true

  // Logging
  logLevel?: 'error' | 'warn' | 'info' | 'debug';
}

/**
 * HTTP method types
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

/**
 * HTTP request options
 */
export interface HttpRequestOptions {
  method: HttpMethod;
  url: string;
  data?: unknown;
  headers?: Record<string, string>;
  timeout?: number;
  retries?: number;
}

/**
 * HTTP response
 */
export interface HttpResponse<T = unknown> {
  status: number;
  data: T;
  headers: Record<string, string>;
}
