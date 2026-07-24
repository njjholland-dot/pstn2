/**
 * Directory module
 * Handles distributed number directory (eventual consistency)
 */

import { HttpClient } from '../messaging';
import {
  DirectoryEndpoints,
  DirectoryEntry,
  DirectoryResponse,
  PhoneNumber,
  RCPID,
} from '../types';
import { extractNumberRange } from '../utils/numbering';
import { getLogger } from '../utils/logger';

const logger = getLogger();

export interface CachedCPInfo {
  cpId: RCPID;
  apiEndpoint: string;
  endpoints: DirectoryEndpoints;
  lastUpdate: Date;
}

const DEFAULT_CACHE_TTL_SECONDS = 86400; // 24 hours

export class DirectoryModule {
  private httpClient: HttpClient;
  private directory: Map<string, CachedCPInfo> = new Map(); // numberRange -> CP info
  private cpEndpoints: Map<RCPID, string> = new Map(); // cpId -> endpoint
  private cacheTTL: number; // milliseconds (internal)

  /**
   * @param cacheTTLSeconds - Cache TTL in seconds (default 86400 = 24 hours)
   */
  constructor(cacheTTLSeconds: number = DEFAULT_CACHE_TTL_SECONDS) {
    this.httpClient = new HttpClient();
    this.cacheTTL = cacheTTLSeconds * 1000;
  }

  /**
   * Lookup CP responsible for a phone number
   */
  async lookup(phoneNumber: PhoneNumber): Promise<CachedCPInfo> {
    // Extract number range for lookup
    const range = extractNumberRange(phoneNumber);

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
   * Pull directory from another CP (GET /directory/all)
   */
  async pullFromCP(cpEndpoint: string): Promise<DirectoryResponse> {
    logger.info('Pulling directory from CP', { cpEndpoint });

    try {
      const response = await this.httpClient.get<DirectoryResponse>(
        `${cpEndpoint}/directory/all`
      );

      // Cache the entries, remembering which endpoint they came from
      this.cacheDirectory(response.data, cpEndpoint);

      logger.info('Directory pulled successfully', {
        cpEndpoint,
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
   * Cache directory entries.
   *
   * @param directoryData - Directory payload from GET /directory/all
   * @param cpEndpoint - The source endpoint the directory was pulled from
   */
  private cacheDirectory(directoryData: DirectoryResponse, cpEndpoint: string): void {
    const lastUpdate = directoryData.lastModified
      ? new Date(directoryData.lastModified)
      : new Date();

    for (const entry of directoryData.entries) {
      const apiEndpoint = this.resolveApiEndpoint(entry, cpEndpoint);

      // Remember where this CP can be reached
      this.cpEndpoints.set(entry.cpId, apiEndpoint);

      for (const range of entry.ranges) {
        const rangeKey = extractNumberRange(range.numberRange);

        if (range.status === 'active') {
          this.directory.set(rangeKey, {
            cpId: entry.cpId,
            apiEndpoint,
            endpoints: this.fillEndpoints(entry.endpoints, apiEndpoint),
            lastUpdate,
          });
        } else if (range.status === 'ported' && range.portedTo) {
          // Range is ported - cache the new CP if we know its endpoint
          const portedEndpoint = this.cpEndpoints.get(range.portedTo);
          if (portedEndpoint) {
            this.directory.set(rangeKey, {
              cpId: range.portedTo,
              apiEndpoint: portedEndpoint,
              endpoints: this.fillEndpoints({}, portedEndpoint),
              lastUpdate,
            });
          }
        }
      }
    }
  }

  /**
   * Choose a base API endpoint for a directory entry, falling back to the
   * endpoint the directory was pulled from.
   */
  private resolveApiEndpoint(entry: DirectoryEntry, cpEndpoint: string): string {
    return entry.endpoints?.auth || entry.endpoints?.routing || cpEndpoint;
  }

  /**
   * Fill in any missing per-service endpoints from the base API endpoint.
   */
  private fillEndpoints(endpoints: DirectoryEndpoints, apiEndpoint: string): DirectoryEndpoints {
    return {
      auth: endpoints.auth || apiEndpoint,
      routing: endpoints.routing || apiEndpoint,
      emergency: endpoints.emergency || apiEndpoint,
    };
  }

  /**
   * Manual cache update (from porting responses)
   */
  updateCache(phoneNumber: PhoneNumber, cpId: RCPID, apiEndpoint: string): void {
    const range = extractNumberRange(phoneNumber);

    logger.debug('Updating directory cache', {
      phoneNumber,
      range,
      cpId,
    });

    this.cpEndpoints.set(cpId, apiEndpoint);
    this.directory.set(range, {
      cpId,
      apiEndpoint,
      endpoints: this.fillEndpoints({}, apiEndpoint),
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
