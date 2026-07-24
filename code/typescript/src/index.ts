/**
 * PSTN2 - Distributed Telecommunications Library
 * @packageDocumentation
 */

// Main client
export { PSTN2Client } from './client';

// Types
export * from './types';

// Errors
export * from './errors';

// Modules (for advanced usage)
export { AuthenticationModule, DirectQueryAuth, TokenPoolAuth } from './auth';
export { RoutingModule } from './routing';
export { EncryptionModule } from './encryption';
export { BrandingModule } from './branding';
export { EmergencyModule } from './emergency';
export { DirectoryModule } from './directory';
export { MessagingClient, HttpClient } from './messaging';

// Utilities
export { getLogger } from './utils/logger';
export * as crypto from './utils/crypto';
