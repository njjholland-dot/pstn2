/**
 * Branding module
 * Handles call branding and purpose signaling
 */

import { MessagingClient } from '../messaging';
import { BrandingInfo, PhoneNumber, CallReference } from '../types';
import { getLogger } from '../utils/logger';

const logger = getLogger();

export class BrandingModule {
  private messagingClient: MessagingClient;
  private brandingCache: Map<string, BrandingInfo & { timestamp: number }> = new Map();
  private cacheTTL: number;

  constructor(messagingClient: MessagingClient, cacheTTL: number = 3600000) {
    this.messagingClient = messagingClient;
    this.cacheTTL = cacheTTL; // Default 1 hour
  }

  /**
   * Get branding information for a phone number
   */
  async getBranding(
    callerID: PhoneNumber,
    callReference: CallReference,
    cpEndpoint: string
  ): Promise<BrandingInfo | null> {
    // Check cache first
    const cached = this.getCachedBranding(callerID);
    if (cached) {
      logger.debug('Using cached branding', { callerID });
      return cached;
    }

    logger.info('Fetching branding information', {
      callerID,
      callReference,
    });

    try {
      const response = await this.messagingClient.request<
        { callerID: PhoneNumber; callReference: CallReference },
        { branding: BrandingInfo; callReference: CallReference }
      >('/branding', cpEndpoint, {
        callerID,
        callReference,
      });

      // Cache the branding
      if (response.response.branding) {
        this.cacheBranding(callerID, response.response.branding);
      }

      return response.response.branding || null;
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

    // Auto-cleanup after TTL
    setTimeout(() => {
      this.brandingCache.delete(callerID);
    }, this.cacheTTL);
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
    const { timestamp, ...branding } = cached;
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
