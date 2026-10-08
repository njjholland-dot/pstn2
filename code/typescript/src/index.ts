/**
 * PSTN2 — TypeScript SDK (protocol v1.1)
 * @packageDocumentation
 */

// Main client
export { PSTN2Client } from './client';
export type { PSTN2Config } from './client';

// Version
export { SDK_VERSION, PROTOCOL_VERSION, USER_AGENT } from './version';

// Environment config (used by the examples)
export {
  networkConfigFromEnv,
  LIVE_NUMBERING_LIST_URL,
  DEFAULT_MOCK_PORT,
  LOCAL_DEFAULT_CP_ID,
  LIVE_DEFAULT_CP_ID,
} from './config';
export type { EnvNetworkConfig } from './config';

// Types and errors
export * from './types';
export * from './errors';

// Number Discovery
export * from './discovery';

// Modules (for advanced usage)
export { AuthenticationModule, DirectQueryAuth } from './auth';
export type { VerifyCallParams, VerificationResult } from './auth';
export { RoutingModule } from './routing';
export type { RoutingResult, RequestRoutingParams } from './routing';
export { EmergencyModule } from './emergency';
export type { GetLocationParams, EmergencyLocationResult } from './emergency';
export { EncryptionModule } from './encryption';
export { BrandingModule } from './branding';
export { MessagingClient, HttpClient, errorFromResponse, apiBase, isNotHeld } from './messaging';
export type { HolderCallResult, HttpClientOptions } from './messaging';

// Utilities
export { getLogger, setLogSink } from './utils/logger';
export type { LogLevel, LogSink } from './utils/logger';
export { digitsOf, toE164, isE164, displayNumber } from './utils/numbering';
export * as crypto from './utils/crypto';
