/**
 * Directory module
 * Handles distributed number directory (eventual consistency)
 */

import { HttpClient } from '../messaging';
import {
  DirectoryEntry,
  DirectoryResponse,
  PhoneNumber,
  RCPID,
} from '../types';
import { getLogger } from '../utils/logger';

const logger = getLogger();

export interface CachedCPInfo {
  cpId: RCPID;
  apiEndpoint: string;
  lastUpdate: Date;
}

export class DirectoryModule {
  private httpClient: HttpClient;
  private directory: Map<string, CachedCPInfo> = new Map(); // numberRange -> CP info
  private cpEndpoints: Map<RCPID, string> = new Map(); // cpId -> endpoint
  private cacheTTL: number;

  constructor(cacheTTL: number = 86400000) {
    // Default 24 hours
    this.httpClient = new HttpClient();
    this.cacheTTL = cacheTTL;
  }

  /**
   * Lookup CP responsible for a phone number
   */
  async lookup(phoneNumber: PhoneNumber): Promise<CachedCPInfo> {
    // Extract number range for lookup
    const range = this.extractRange(phoneNumber);

    // Check cache first
    const cached = this.directory.get(range);
    if (cached && this.isCacheValid(cached.lastUpdate)) {
      logger.debug('Using cached directory entry', {
        phoneNumber,
        cpId: cached.cpId,
      });
      return cached;
    }

    // Cache miss - need to load from Ofcom data or other CPs
    logger.debug('Directory cache miss', { phoneNumber, range });

    // In production, this would query Ofcom data or pull from other CPs
    // For now, throw error indicating directory needs to be populated
    throw new Error(
      `Directory entry not found for ${phoneNumber}. Directory needs to be populated.`
    );
  }

  /**
   * Pull directory from another CP
   */
  async pullFromCP(cpEndpoint: string): Promise<DirectoryResponse> {
    logger.info('Pulling directory from CP', { cpEndpoint });

    try {
      const response = await this.httpClient.get<DirectoryResponse>(cpEndpoint, '/directory');

      // Cache the entries
      this.cacheDirectory(response.data);

      logger.info('Directory pulled successfully', {
        cpId: response.data.cpID,
        entries: response.data.entries.length,
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to pull directory', {
        cpEndpoint,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Pull directories from multiple CPs
   */
  async pullFromAllCPs(cpEndpoints: string[]): Promise<void> {
    logger.info('Pulling directories from all CPs', {
      count: cpEndpoints.length,
    });

    const promises = cpEndpoints.map((endpoint) =>
      this.pullFromCP(endpoint).catch((error) => {
        logger.warn('Failed to pull from CP', {
          endpoint,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        return null;
      })
    );

    await Promise.all(promises);

    logger.info('Directory sync complete', {
      totalEntries: this.directory.size,
    });
  }

  /**
   * Cache directory entries
   */
  private cacheDirectory(directoryData: DirectoryResponse): void {
    // Store CP endpoint
    this.cpEndpoints.set(directoryData.cpID, directoryData.cpID);

    // Cache each entry
    for (const entry of directoryData.entries) {
      if (entry.status === 'active' && entry.apiEndpoint) {
        this.directory.set(entry.numberRange, {
          cpId: directoryData.cpID,
          apiEndpoint: entry.apiEndpoint,
          lastUpdate: new Date(directoryData.lastUpdate),
        });
      } else if (entry.status === 'ported' && entry.portedTo) {
        // Entry is ported - cache the new CP
        const portedEndpoint = this.cpEndpoints.get(entry.portedTo);
        if (portedEndpoint) {
          this.directory.set(entry.numberRange, {
            cpId: entry.portedTo,
            apiEndpoint: portedEndpoint,
            lastUpdate: new Date(directoryData.lastUpdate),
          });
        }
      }
    }
  }

  /**
   * Manual cache update (from porting responses)
   */
  updateCache(phoneNumber: PhoneNumber, cpId: RCPID, apiEndpoint: string): void {
    const range = this.extractRange(phoneNumber);

    logger.debug('Updating directory cache', {
      phoneNumber,
      range,
      cpId,
    });

    this.directory.set(range, {
      cpId,
      apiEndpoint,
      lastUpdate: new Date(),
    });
  }

  /**
   * Check if cache entry is still valid
   */
  private isCacheValid(lastUpdate: Date): boolean {
    return Date.now() - lastUpdate.getTime() < this.cacheTTL;
  }

  /**
   * Extract number range from phone number
   * Takes first 6 digits after country code
   */
  private extractRange(phoneNumber: PhoneNumber): string {
    // Remove + and take first 6 digits
    // E.g., +441234567890 -> +44123456
    return phoneNumber.substring(0, 9); // +XX + 6 digits
  }

  /**
   * Get all cached CPs
   */
  getCachedCPs(): RCPID[] {
    return Array.from(this.cpEndpoints.keys());
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    totalRanges: number;
    totalCPs: number;
    oldestEntry: Date | null;
  } {
    let oldestEntry: Date | null = null;

    for (const entry of this.directory.values()) {
      if (!oldestEntry || entry.lastUpdate < oldestEntry) {
        oldestEntry = entry.lastUpdate;
      }
    }

    return {
      totalRanges: this.directory.size,
      totalCPs: this.cpEndpoints.size,
      oldestEntry,
    };
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    logger.info('Clearing directory cache');
    this.directory.clear();
    this.cpEndpoints.clear();
  }
}
