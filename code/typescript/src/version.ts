/**
 * Version constants for the PSTN2 TypeScript SDK.
 */

/** SDK package version. */
export const SDK_VERSION = '1.1.0';

/** PSTN2 protocol version (sent as X-PSTN2-Version and in message envelopes). */
export const PROTOCOL_VERSION = '1.1';

/**
 * User-Agent sent on every request (SPECIFICATION.md §4.2).
 * Hosting WAFs (including pstn2.org's) reject generic library user agents.
 */
export const USER_AGENT = `pstn2-typescript-sdk/${SDK_VERSION}`;
