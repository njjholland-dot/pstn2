/**
 * Branding module
 * Handles call branding and purpose signaling
 *
 * NOTE: The standalone /branding endpoint used here is an EXTENSION beyond
 * the core PSTN2 specification. The spec carries branding inline in
 * verification and routing payloads (BrandingInfo); this module
 * additionally supports fetching branding on demand from CPs that expose it.
 */

import { MessagingClient } from '../messaging';
import { BrandingInfo, PhoneNumber, CallReference } from '../types';
import { getLogger } from '../utils/logger';

const logger = getLogger();

const DEFAULT_CACHE_TTL_SECONDS = 3600; // 1 hour

export class BrandingModule {
  private messagingClient: MessagingClient;
  private brandingCache: Map<string, BrandingInfo & { timestamp: number }> = new Map();
  private cacheTTL: number; // milliseconds (internal)

  /**
   * @param cacheTTLSeconds - Cache TTL in seconds (default 3600 = 1 hour)
   */
  constructor(messagingClient: MessagingClient, cacheTTLSeconds: number = DEFAULT_CACHE_TTL_SECONDS) {
    this.messagingClient = messagingClient;
    this.cacheTTL = cacheTTLSeconds * 1000;
  }

  /**
   * Get branding for a caller ID from the CP that currently holds it
   * (found with Number Discovery). Returns null when unavailable.
   */
  async getBranding(callerID: PhoneNumber, callReference: CallReference): Promise<BrandingInfo | null> {
    const cached = this.getCachedBranding(callerID);
    if (cached) {
      logger.debug('Using cached branding', { callerID });
      return cached;
    }

    try {
      // /branding is an extension endpoint, not part of the core spec
      const r = await this.messagingClient.callHolder<{ branding?: BrandingInfo }>(callerID, 'POST', '/branding', {
        callerID,
        callReference,
      });
      const branding = r.response && r.response.branding;
      if (branding) this.cacheBranding(callerID, branding);
      return branding || null;
    } catch (error) {
      logger.warn('Failed to fetch branding', {
        callerID,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }

  /**
   * Cache branding information
   */
  private cacheBranding(callerID: PhoneNumber, branding: BrandingInfo): void {
    this.brandingCache.set(callerID, {
      ...branding,
      timestamp: Date.now(),
    });

    // Auto-cleanup after TTL; unref so the timer never keeps the process alive
    const timer = setTimeout(() => {
      this.brandingCache.delete(callerID);
    }, this.cacheTTL);
    timer.unref();
  }

  /**
   * Get cached branding if not expired
   */
  private getCachedBranding(callerID: PhoneNumber): BrandingInfo | null {
    const cached = this.brandingCache.get(callerID);
    if (!cached) {
      return null;
    }

    // Check if expired
    if (Date.now() - cached.timestamp > this.cacheTTL) {
      this.brandingCache.delete(callerID);
      return null;
    }

    // Return branding without timestamp
    const { timestamp: _t, ...branding } = cached;
    void _t;
    return branding;
  }

  /**
   * Clear cached branding
   */
  clearCache(callerID?: PhoneNumber): void {
    if (callerID) {
      this.brandingCache.delete(callerID);
      logger.debug('Cleared branding cache', { callerID });
    } else {
      this.brandingCache.clear();
      logger.debug('Cleared all branding cache');
    }
  }
}
