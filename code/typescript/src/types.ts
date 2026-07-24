/**
 * Core type definitions for PSTN2
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
 * Call verification request
 */
export interface CallVerificationRequest {
  callerID: PhoneNumber;
  calledID: PhoneNumber;
  callReference: CallReference;
  timestamp: Timestamp;
  requestingCP: RCPID;
  signature?: Base64String;
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
  publicKey?: Base64String;
  protocol?: 'udp' | 'tcp' | 'tls';
}

/**
 * Routing request
 */
export interface RoutingRequest {
  destinationNumber: PhoneNumber;
  callerID: PhoneNumber;
  callReference: CallReference;
  originCP: RCPID;
  mediaCapabilities: MediaCapabilities;
  connectionDetails: ConnectionDetails;
  timestamp?: Timestamp;
  branding?: BrandingInfo;
}

/**
 * Routing response
 */
export interface RoutingResponse {
  accepted: boolean;
  destinationCP?: RCPID;
  connectionDetails?: ConnectionDetails;
  mediaCapabilities?: MediaCapabilities;
  callReference: CallReference;
  rejectReason?: string;
}

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
 * Emergency location request
 */
export interface EmergencyLocationRequest {
  callerID: PhoneNumber;
  callReference: CallReference;
  psapID: string;
  timestamp?: Timestamp;
  requestType?: 'location' | 'callback';
}

/**
 * Location data
 */
export interface LocationData {
  latitude: number;
  longitude: number;
  accuracy?: number;
  altitude?: number;
  altitudeAccuracy?: number;
  source?: 'gps' | 'cell' | 'wifi' | 'ip';
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
 * Device information
 */
export interface DeviceInfo {
  type?: 'mobile' | 'landline' | 'voip';
  battery?: number;
  networkType?: string;
}

/**
 * Emergency location response
 */
export interface EmergencyLocationResponse {
  location?: LocationData;
  address?: AddressData;
  deviceInfo?: DeviceInfo;
  callReference: CallReference;
}

/**
 * Directory entry
 */
export interface DirectoryEntry {
  numberRange: string;
  status: 'active' | 'ported' | 'reserved' | 'disconnected';
  portedTo?: RCPID;
  portDate?: string;
  apiEndpoint?: string;
  publicKey?: Base64String;
}

/**
 * Directory response
 */
export interface DirectoryResponse {
  cpID: RCPID;
  lastUpdate: Timestamp;
  entries: DirectoryEntry[];
}

/**
 * Token create request
 */
export interface TokenCreateRequest {
  callerID: PhoneNumber;
  calledID: PhoneNumber;
  cpID: RCPID;
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
}

/**
 * Token data
 */
export interface TokenData {
  callerID: PhoneNumber;
  calledID: PhoneNumber;
  cpID: RCPID;
  callReference?: CallReference;
  branding?: BrandingInfo;
  createdAt: Timestamp;
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
  cacheTTL?: number; // seconds

  // Network
  timeout?: number; // milliseconds
  retries?: number;

  // Fallback
  fallbackToTraditional?: boolean;

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
