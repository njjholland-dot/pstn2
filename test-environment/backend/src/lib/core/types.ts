/**
 * PSTN2 Core Type Definitions
 *
 * Defines all data structures used in the PSTN2 protocol
 */

// ============================================================================
// Configuration Types
// ============================================================================

export interface PSTN2Config {
  cpId: string;
  apiEndpoint: string;
  apiPort: number;
  publicKey: string;
  privateKey: string;
  authMode: 'direct_query' | 'token_pool';
  tokenPoolEndpoint?: string;
  enableDirectRouting: boolean;
  enableEncryption: boolean;
  enableBranding: boolean;
  cacheTTLSeconds: number;
  requestTimeoutMs: number;
  maxRetries: number;
}

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

// ============================================================================
// Authentication Types
// ============================================================================

export interface AuthenticationRequest {
  callerID: string;
  calledID: string;
  callReference: string;
  timestamp: string;
  signature?: string;
}

export interface AuthenticationResponse {
  verified: boolean;
  callerName?: string;
  callPurpose?: string;
  portingChain?: string[];
  errorCode?: string;
  errorMessage?: string;
  duration?: number;
}

export interface TokenCreateRequest {
  callerID: string;
  calledID: string;
  callReference: string;
  ttl?: number;  // Time to live in seconds
}

export interface TokenCreateResponse {
  tokenId: string;
  expiresAt: string;
}

export interface TokenVerifyRequest {
  tokenId: string;
}

export interface TokenVerifyResponse {
  valid: boolean;
  cpId?: string;
  callerID?: string;
  calledID?: string;
  callReference?: string;
  errorMessage?: string;
}

// ============================================================================
// Routing Types
// ============================================================================

export interface MediaCapabilities {
  codecs: string[];
  encryption: string[];
  video: boolean;
  maxBitrate?: number;
}

export interface CallBranding {
  displayName: string;
  logo?: string;
  backgroundColor?: string;
  textColor?: string;
  callPurpose?: string;
}

export interface RoutingRequest {
  destinationNumber: string;
  callerID: string;
  callReference: string;
  mediaCapabilities: MediaCapabilities;
  publicKey: string;
  branding?: CallBranding;
}

export interface ConnectionDetails {
  fqdn: string;
  port: number;
  publicKey: string;
}

export interface RoutingResponse {
  accepted: boolean;
  connectionDetails?: ConnectionDetails;
  rejectionReason?: string;
}

// ============================================================================
// Directory Service Types
// ============================================================================

export interface DirectoryEntry {
  cpId: string;
  numberRange: string;
  apiEndpoint: string;
  publicKey?: string;
  cachedAt?: Date;
  expiresAt?: Date;
}

export interface DirectoryQueryRequest {
  number: string;
}

export interface DirectoryQueryResponse {
  found: boolean;
  entry?: DirectoryEntry;
}

// ============================================================================
// Porting Types
// ============================================================================

export interface PortingQueryRequest {
  number: string;
}

export interface PortingQueryResponse {
  status: 'active' | 'ported_out' | 'ported_in' | 'reserved';
  portedToCP?: string;
  portedFromCP?: string;
  portingChain?: string[];
}

// ============================================================================
// Emergency Services Types
// ============================================================================

export interface Location {
  latitude: number;
  longitude: number;
  accuracy: number;  // meters
  altitude?: number;
  timestamp: string;
}

export interface Address {
  street?: string;
  city?: string;
  postcode?: string;
  country: string;
}

export interface EmergencyLocationRequest {
  callerID: string;
  callReference: string;
  psapID: string;
}

export interface EmergencyLocationResponse {
  location: Location;
  address?: Address;
  additionalInfo?: string;
}

// ============================================================================
// Message Logging Types
// ============================================================================

export enum MessageType {
  AUTH_REQUEST = 'auth_request',
  AUTH_RESPONSE = 'auth_response',
  ROUTING_REQUEST = 'routing_request',
  ROUTING_RESPONSE = 'routing_response',
  TOKEN_CREATE = 'token_create',
  TOKEN_VERIFY = 'token_verify',
  DIRECTORY_QUERY = 'directory_query',
  DIRECTORY_RESPONSE = 'directory_response',
  PORTING_QUERY = 'porting_query',
  PORTING_RESPONSE = 'porting_response'
}

export interface MessageLogEntry {
  messageId: string;
  callReference?: string;
  messageType: MessageType;
  direction: 'sent' | 'received';
  fromCP: string;
  toCP: string;
  requestPayload: any;
  responsePayload?: any;
  httpStatusCode?: number;
  errorMessage?: string;
  durationMs?: number;
  timestamp: Date;
}

// ============================================================================
// Call Record Types
// ============================================================================

export enum CallDirection {
  INBOUND = 'inbound',
  OUTBOUND = 'outbound'
}

export enum AuthMethod {
  DIRECT_QUERY = 'direct_query',
  TOKEN_POOL = 'token_pool',
  NONE = 'none'
}

export enum AuthResult {
  VERIFIED = 'verified',
  FAILED = 'failed',
  TIMEOUT = 'timeout',
  PENDING = 'pending'
}

export interface CallRecord {
  id?: number;
  callReference: string;
  callerID: string;
  calledID: string;
  direction: CallDirection;
  authMethod?: AuthMethod;
  authResult?: AuthResult;
  authDurationMs?: number;
  routingAccepted: boolean;
  directRoutingFqdn?: string;
  directRoutingPort?: number;
  encryptionKey?: string;
  portingChain?: string[];
  callPurpose?: string;
  branding?: CallBranding;
  createdAt?: Date;
  completedAt?: Date;
}

// ============================================================================
// Number Types
// ============================================================================

export enum NumberStatus {
  ACTIVE = 'active',
  PORTED_OUT = 'ported_out',
  PORTED_IN = 'ported_in',
  RESERVED = 'reserved'
}

export interface NumberRecord {
  id?: number;
  number: string;
  numberRange: string;
  status: NumberStatus;
  portedToCP?: string;
  portedFromCP?: string;
  subscriberName?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

// ============================================================================
// Statistics Types
// ============================================================================

export interface DailyStatistics {
  date: string;
  totalCalls: number;
  inboundCalls: number;
  outboundCalls: number;
  authSuccessful: number;
  authFailed: number;
  authTimeout: number;
  routingSuccessful: number;
  routingRejected: number;
  avgAuthDurationMs: number;
}

// ============================================================================
// API Response Types
// ============================================================================

export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  timestamp: string;
}

export interface SimulateCallRequest {
  fromCP: string;
  fromNumber: string;
  toNumber: string;
  authMode?: 'direct_query' | 'token_pool';
  requestRouting?: boolean;
  branding?: CallBranding;
}

export interface SimulateCallResponse {
  callReference: string;
  authResult: AuthResult;
  routingAccepted?: boolean;
  portingChain?: string[];
  messages: MessageLogEntry[];
}

// ============================================================================
// Error Types
// ============================================================================

export class PSTN2Error extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 500,
    public details?: any
  ) {
    super(message);
    this.name = 'PSTN2Error';
  }
}

export enum ErrorCode {
  TIMEOUT = 'TIMEOUT',
  CALL_NOT_FOUND = 'CALL_NOT_FOUND',
  NUMBER_NOT_FOUND = 'NUMBER_NOT_FOUND',
  NUMBER_PORTED = 'NUMBER_PORTED',
  AUTHENTICATION_FAILED = 'AUTHENTICATION_FAILED',
  INVALID_SIGNATURE = 'INVALID_SIGNATURE',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  TOKEN_INVALID = 'TOKEN_INVALID',
  ROUTING_REJECTED = 'ROUTING_REJECTED',
  DATABASE_ERROR = 'DATABASE_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  INVALID_REQUEST = 'INVALID_REQUEST'
}
