/**
 * Core type definitions for PSTN2.
 * Aligned with docs/API-SPECIFICATION.yaml (OpenAPI 3.0.3, protocol version 1.1).
 */

/** E.164 formatted phone number (e.g. +441614960123). */
export type PhoneNumber = string;

/** Range-CP-ID: identifier of a Communication Provider (e.g. CP1-UK-0102). */
export type RCPID = string;

/** UUID v4 call reference. */
export type CallReference = string;

/** ISO 8601 timestamp. */
export type Timestamp = string;

/** Base64 encoded binary data. */
export type Base64String = string;

// ---------------------------------------------------------------------------
// Number Discovery (SPECIFICATION.md §9)
// ---------------------------------------------------------------------------

/** Reference to a CP: its id, name and PSTN2 base URL (API base = `{url}/pstn2/v1`). */
export interface CpRef {
  cpId: RCPID;
  cpName?: string;
  url: string;
}

/** Caching instruction carried by any PSTN2 response (§9.4–9.5). */
export interface CacheControl {
  ttl?: number;
  invalidate?: boolean;
  scope?: 'number' | 'block';
}

/** One block of the regulator numbering list (§9.1). */
export interface NumberingBlock {
  prefix: string;
  display?: string;
  numberLength: number;
  status: 'Allocated' | 'Free' | 'Reserved' | 'Protected' | string;
  cpId: RCPID;
  cpName?: string;
  /** Absent or empty = the Range Holder does not participate (traditional PSTN). */
  rangeHolderUrl?: string;
}

/** The numbering list document (GET /numbering-list.json). */
export interface NumberingListDocument {
  listVersion: string;
  publisher?: string;
  source?: string;
  blocks: NumberingBlock[];
}

/** Wire answer of GET {url}/pstn2/v1/numbers/{digits} (§9.2). */
export interface DiscoveryResponse {
  version: string;
  result: 'held' | 'redirect' | 'not_held' | 'unknown';
  number: PhoneNumber;
  holder?: CpRef;
  ported?: boolean;
  portedTo?: CpRef;
  cache?: CacheControl;
  issued?: Timestamp;
  kid?: string;
  signature?: Base64String;
}

/** HTTP 200 from a CP that no longer holds the subject number (§5.1.2, §9.5). */
export interface NotHeldResponse {
  verified?: false;
  result: 'not_held';
  callReference?: CallReference;
  cache: CacheControl;
  timestamp?: Timestamp;
}

/** A CP's public signing keys (GET {url}/pstn2/v1/keys). */
export interface KeySet {
  cpId: RCPID;
  keys: Array<{
    kid: string;
    algorithm: 'ed25519' | string;
    publicKey: Base64String;
    validFrom?: Timestamp;
    validTo?: Timestamp;
  }>;
}

export type DiscoveryOutcome = 'held' | 'unknown' | 'unallocated' | 'not_participating' | 'error';

export type DiscoveryErrorReason =
  | 'hop_limit_exceeded'
  | 'loop_detected'
  | 'timeout'
  | 'invalid_response'
  | 'invalid_signature'
  | 'numbering_list_unavailable';

/** Result of DiscoveryClient.discover() — identical in shape to the reference engine. */
export interface DiscoveryResult {
  /** The number, E.164. */
  number: PhoneNumber;
  result: DiscoveryOutcome;
  /** The CP currently holding the number (result "held"). */
  holder?: CpRef;
  /** True when the holder is not the Range Holder (number ported in). */
  ported: boolean;
  /** CP ids queried, in order. */
  hops: RCPID[];
  /** True when the first query went to a cached holder. */
  fromCache: boolean;
  /** True when a response told us to purge the cache entry (stale cache). */
  invalidated: boolean;
  /** Failure reason (result "error"). */
  error?: DiscoveryErrorReason;
  /** The Range Holder named in the list (result "not_participating"). */
  rangeHolder?: { cpId: RCPID; cpName?: string };
}

export type DiscoveryEventType =
  | 'cache-hit'
  | 'cache-miss'
  | 'list-lookup'
  | 'query'
  | 'response'
  | 'redirect'
  | 'cache-purge'
  | 'cache-store'
  | 'result';

/** Event emitted during discovery (same types as the reference engine). */
export interface DiscoveryEvent {
  type: DiscoveryEventType;
  number: PhoneNumber;
  entry?: DiscoveryCacheEntry & { number: PhoneNumber };
  block?: NumberingBlock | null;
  to?: CpRef;
  from?: CpRef;
  url?: string;
  status?: number;
  body?: unknown;
  error?: string;
  reason?: string;
  result?: DiscoveryResult;
}

export type DiscoveryEventHandler = (event: DiscoveryEvent) => void | Promise<void>;

/** One number → holder cache entry. */
export interface DiscoveryCacheEntry {
  holder: CpRef;
  ported: boolean;
  /** Epoch milliseconds. */
  expiresAt: number;
}

// ---------------------------------------------------------------------------
// Authentication (§5)
// ---------------------------------------------------------------------------

/** Common message envelope fields (§4.1). */
export interface MessageEnvelope {
  messageId?: string;
  version?: string;
  timestamp?: Timestamp;
  signature?: Base64String;
}

/** POST /auth/verify request. */
export interface CallVerificationRequest extends MessageEnvelope {
  requestingCP: RCPID;
  callerID: PhoneNumber;
  calledID: PhoneNumber;
  callReference: CallReference;
}

/** POST /auth/verify response (wire). */
export interface CallVerificationResponse {
  verified: boolean;
  callReference: CallReference;
  callerName?: string;
  callerOrg?: string;
  callPurpose?: string;
  trustLevel?: 'low' | 'medium' | 'high' | 'verified';
  branding?: BrandingInfo;
  timestamp?: Timestamp;
  signature?: Base64String;
  /** Present when the CP no longer holds the caller ID. */
  result?: 'not_held';
  cache?: CacheControl;
}

/** Branding information. */
export interface BrandingInfo {
  logo?: string;
  backgroundColor?: string;
  textColor?: string;
  displayName?: string;
  callPurpose?: string;
}

// ---------------------------------------------------------------------------
// Routing (§6)
// ---------------------------------------------------------------------------

export interface MediaCapabilities {
  codecs: string[];
  encryption: string[];
  video?: boolean;
  maxBandwidth?: number;
}

export interface ConnectionDetails {
  fqdn: string;
  port: number;
  protocol: 'udp' | 'tcp' | 'tls';
  ipv4?: string;
  ipv6?: string;
  publicKey?: Base64String;
}

/** POST /routing/request request. */
export interface RoutingRequest extends MessageEnvelope {
  requestingCP: RCPID;
  callerID: PhoneNumber;
  destinationNumber: PhoneNumber;
  callReference: CallReference;
  mediaCapabilities: MediaCapabilities;
  publicKey?: Base64String;
  branding?: BrandingInfo;
}

/** Routing accepted (200). */
export interface RoutingResponseAccepted {
  accepted: true;
  callReference: CallReference;
  connectionDetails: ConnectionDetails;
  agreedCapabilities: MediaCapabilities;
  timestamp?: Timestamp;
  signature?: Base64String;
}

/** Routing rejected (503 RoutingRejection, or no PSTN2 path to the destination). */
export interface RoutingResponseRejected {
  accepted: false;
  callReference: CallReference;
  reason?: string;
  fallbackToTraditional?: boolean;
  retryAfter?: number;
  timestamp?: Timestamp;
}

export type RoutingResponse = RoutingResponseAccepted | RoutingResponseRejected;

// ---------------------------------------------------------------------------
// Emergency (§8)
// ---------------------------------------------------------------------------

export interface EmergencyLocationRequest extends MessageEnvelope {
  requestingPSAP: string;
  callerID: PhoneNumber;
  callReference: CallReference;
}

export interface LocationData {
  latitude: number;
  longitude: number;
  accuracy: number;
  altitude?: number;
  source?: 'gps' | 'wifi' | 'cell' | 'user' | 'billing';
}

export interface AddressData {
  street?: string;
  city?: string;
  postcode?: string;
  country?: string;
}

export interface EmergencyAdditionalInfo {
  cellTowerId?: string;
  wifiAccessPoints?: string[];
  lastUpdated?: Timestamp;
}

export interface EmergencyLocationResponse {
  callReference: CallReference;
  location: LocationData;
  address?: AddressData;
  additionalInfo?: EmergencyAdditionalInfo;
  timestamp?: Timestamp;
  signature?: Base64String;
}

// ---------------------------------------------------------------------------
// Errors (§10)
// ---------------------------------------------------------------------------

/**
 * Error codes: the spec's ErrorResponse codes (§10.2) plus a few SDK-local
 * transport codes (network_error, service_unavailable, unauthorized,
 * forbidden, not_found, invalid_response, discovery_failed).
 */
export enum ErrorCode {
  // Spec (§10.2)
  CallNotFound = 'call_not_found',
  InvalidSignature = 'invalid_signature',
  CapacityExceeded = 'capacity_exceeded',
  UnsupportedCodec = 'unsupported_codec',
  NumberNotFound = 'number_not_found',
  HopLimitExceeded = 'hop_limit_exceeded',
  LoopDetected = 'loop_detected',
  LocationUnavailable = 'location_unavailable',
  UnauthorizedPsap = 'unauthorized_psap',
  Timeout = 'timeout',
  RateLimitExceeded = 'rate_limit_exceeded',
  InvalidRequest = 'invalid_request',
  InternalError = 'internal_error',

  // SDK-local
  NetworkError = 'network_error',
  ServiceUnavailable = 'service_unavailable',
  Unauthorized = 'unauthorized',
  Forbidden = 'forbidden',
  NotFound = 'not_found',
  InvalidResponse = 'invalid_response',
  /** Number Discovery did not find a PSTN2 holder (unallocated/unknown/not_participating/error). */
  DiscoveryFailed = 'discovery_failed',
}

/** Spec ErrorResponse (§10.1). */
export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    timestamp: Timestamp;
    requestId?: string;
  };
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

export type HttpMethod = 'GET' | 'POST';

export interface HttpResponse<T = unknown> {
  status: number;
  /** Parsed JSON body (any Content-Type), or null when the body is not JSON. */
  data: T;
  /** Raw body text. */
  text: string;
  headers: Record<string, string>;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
