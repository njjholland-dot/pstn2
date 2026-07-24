/**
 * PSTN2 Directory Service
 *
 * Handles number lookup, directory caching, and CP discovery
 */

import { DatabaseConnection } from '../database/connection';
import { MessagingService } from './messaging';
import {
  DirectoryEntry,
  DirectoryQueryRequest,
  DirectoryQueryResponse,
  MessageType,
  PSTN2Error,
  ErrorCode
} from './types';
import {
  normalizePhoneNumber,
  numberMatchesRange,
  extractRange,
  getCurrentTimestamp,
  addSeconds,
  isExpired
} from './utils';

export class DirectoryService {
  constructor(
    private cpId: string,
    private db: DatabaseConnection,
    private messaging: MessagingService,
    private apiEndpoint: string,
    private cacheTTLSeconds: number = 3600
  ) {}

  // ==========================================================================
  // Number Lookup
  // ==========================================================================

  /**
   * Look up which CP owns a phone number
   */
  async lookupNumber(number: string): Promise<DirectoryEntry | null> {
    const normalized = normalizePhoneNumber(number);

    // Step 1: Check if it's one of our numbers
    const ourNumber = await this.isOurNumber(normalized);
    if (ourNumber) {
      return {
        cpId: this.cpId,
        numberRange: await this.getNumberRange(normalized),
        apiEndpoint: this.apiEndpoint
      };
    }

    // Step 2: Check directory cache
    const cachedEntry = await this.lookupInCache(normalized);
    if (cachedEntry && !isExpired(cachedEntry.expiresAt!)) {
      return cachedEntry;
    }

    // Step 3: Query other known CPs
    const allCPs = await this.getAllCPs();
    for (const cp of allCPs) {
      if (cp.cpId === this.cpId) continue;

      try {
        const result = await this.queryCP(cp, normalized);
        if (result.found && result.entry) {
          // Cache the result
          await this.cacheEntry(result.entry);
          return result.entry;
        }
      } catch (error) {
        // Continue to next CP
        console.error(`Error querying ${cp.cpId}:`, error);
      }
    }

    // Not found
    return null;
  }

  /**
   * Query a specific CP for a number
   */
  async queryCP(
    cp: DirectoryEntry,
    number: string
  ): Promise<DirectoryQueryResponse> {
    try {
      const response = await this.messaging.sendMessage(
        cp.cpId,
        `${cp.apiEndpoint}/pstn2/v1/directory/query`,
        MessageType.DIRECTORY_QUERY,
        { number }
      );

      return response as DirectoryQueryResponse;
    } catch (error) {
      return { found: false };
    }
  }

  /**
   * Respond to a directory query from another CP
   */
  async respondToQuery(
    request: DirectoryQueryRequest
  ): Promise<DirectoryQueryResponse> {
    const normalized = normalizePhoneNumber(request.number);

    // Check if this number belongs to us
    const isOurs = await this.isOurNumber(normalized);

    if (!isOurs) {
      return { found: false };
    }

    // Get our number ranges that match
    const range = await this.getNumberRange(normalized);

    return {
      found: true,
      entry: {
        cpId: this.cpId,
        numberRange: range,
        apiEndpoint: this.apiEndpoint
      }
    };
  }

  // ==========================================================================
  // Directory Cache Management
  // ==========================================================================

  /**
   * Look up a number in the directory cache
   */
  private async lookupInCache(number: string): Promise<DirectoryEntry | null> {
    const sql = `
      SELECT cp_id, number_range, api_endpoint, public_key, cached_at, expires_at
      FROM directory_cache
      WHERE ? REGEXP CONCAT('^', REPLACE(REPLACE(number_range, '+', '\\\\+'), 'X', '[0-9]'), '$')
      AND (expires_at IS NULL OR expires_at > NOW())
      ORDER BY cached_at DESC
      LIMIT 1
    `;

    const row = await this.db.queryOne<any>(sql, [number]);

    if (!row) {
      return null;
    }

    return {
      cpId: row.cp_id,
      numberRange: row.number_range,
      apiEndpoint: row.api_endpoint,
      publicKey: row.public_key,
      cachedAt: new Date(row.cached_at),
      expiresAt: row.expires_at ? new Date(row.expires_at) : undefined
    };
  }

  /**
   * Cache a directory entry
   */
  async cacheEntry(entry: DirectoryEntry): Promise<void> {
    const expiresAt = addSeconds(new Date(), this.cacheTTLSeconds);

    const sql = `
      INSERT INTO directory_cache (
        cp_id, number_range, api_endpoint, public_key, expires_at
      ) VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        api_endpoint = VALUES(api_endpoint),
        public_key = VALUES(public_key),
        cached_at = CURRENT_TIMESTAMP,
        expires_at = VALUES(expires_at)
    `;

    await this.db.insert(sql, [
      entry.cpId,
      entry.numberRange,
      entry.apiEndpoint,
      entry.publicKey || null,
      expiresAt
    ]);
  }

  /**
   * Refresh the directory cache by querying all known CPs
   */
  async refreshCache(): Promise<number> {
    let refreshed = 0;

    const allCPs = await this.getAllCPs();

    for (const cp of allCPs) {
      if (cp.cpId === this.cpId) continue;

      try {
        // Get full directory from CP
        const response = await this.messaging.sendMessage(
          cp.cpId,
          `${cp.apiEndpoint}/pstn2/v1/directory/all`,
          MessageType.DIRECTORY_QUERY,
          {}
        );

        if (response.ranges && Array.isArray(response.ranges)) {
          for (const range of response.ranges) {
            await this.cacheEntry({
              cpId: cp.cpId,
              numberRange: range.numberRange,
              apiEndpoint: cp.apiEndpoint,
              publicKey: range.publicKey
            });
            refreshed++;
          }
        }
      } catch (error) {
        console.error(`Failed to refresh cache from ${cp.cpId}:`, error);
      }
    }

    return refreshed;
  }

  /**
   * Clear expired cache entries
   */
  async clearExpiredCache(): Promise<number> {
    const sql = `
      DELETE FROM directory_cache
      WHERE expires_at IS NOT NULL AND expires_at < NOW()
    `;

    return await this.db.update(sql);
  }

  // ==========================================================================
  // Directory Publishing
  // ==========================================================================

  /**
   * Publish our directory (all number ranges we own)
   */
  async publishDirectory(): Promise<{
    ranges: Array<{ numberRange: string; status: string; count: number }>;
  }> {
    const sql = `
      SELECT
        number_range,
        status,
        COUNT(*) as count
      FROM numbers
      WHERE status = 'active'
      GROUP BY number_range, status
      ORDER BY number_range
    `;

    const rows = await this.db.query<any>(sql);

    return {
      ranges: rows.map(row => ({
        numberRange: row.number_range,
        status: row.status,
        count: row.count
      }))
    };
  }

  /**
   * Get all our number ranges
   */
  async getOurRanges(): Promise<string[]> {
    const sql = `
      SELECT DISTINCT number_range
      FROM numbers
      WHERE status = 'active'
      ORDER BY number_range
    `;

    const rows = await this.db.query<any>(sql);
    return rows.map(row => row.number_range);
  }

  // ==========================================================================
  // CP Discovery
  // ==========================================================================

  /**
   * Get all known CPs from directory cache
   */
  async getAllCPs(): Promise<DirectoryEntry[]> {
    const sql = `
      SELECT DISTINCT
        cp_id, api_endpoint, public_key,
        MAX(cached_at) as cached_at,
        MAX(expires_at) as expires_at
      FROM directory_cache
      GROUP BY cp_id, api_endpoint, public_key
      ORDER BY cp_id
    `;

    const rows = await this.db.query<any>(sql);

    return rows.map(row => ({
      cpId: row.cp_id,
      numberRange: '', // Not specific to a range
      apiEndpoint: row.api_endpoint,
      publicKey: row.public_key,
      cachedAt: row.cached_at ? new Date(row.cached_at) : undefined,
      expiresAt: row.expires_at ? new Date(row.expires_at) : undefined
    }));
  }

  /**
   * Get a specific CP's endpoint
   */
  async getCPEndpoint(cpId: string): Promise<string | null> {
    const sql = `
      SELECT api_endpoint
      FROM directory_cache
      WHERE cp_id = ?
      LIMIT 1
    `;

    const row = await this.db.queryOne<any>(sql, [cpId]);
    return row ? row.api_endpoint : null;
  }

  /**
   * Register a CP in our directory cache
   */
  async registerCP(entry: DirectoryEntry): Promise<void> {
    await this.cacheEntry(entry);
  }

  /**
   * Unregister a CP from our directory cache
   */
  async unregisterCP(cpId: string): Promise<number> {
    const sql = `
      DELETE FROM directory_cache
      WHERE cp_id = ?
    `;

    return await this.db.update(sql, [cpId]);
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  /**
   * Check if a number belongs to this CP
   */
  private async isOurNumber(number: string): Promise<boolean> {
    const sql = `
      SELECT COUNT(*) as count
      FROM numbers
      WHERE number = ? AND status IN ('active', 'ported_in')
    `;

    const result = await this.db.queryOne<any>(sql, [number]);
    return result && result.count > 0;
  }

  /**
   * Get the number range for a specific number
   */
  private async getNumberRange(number: string): Promise<string> {
    const sql = `
      SELECT number_range
      FROM numbers
      WHERE number = ?
      LIMIT 1
    `;

    const result = await this.db.queryOne<any>(sql, [number]);

    if (result) {
      return result.number_range;
    }

    // Fallback: extract range from number
    return extractRange(number);
  }

  /**
   * Get directory statistics
   */
  async getDirectoryStats(): Promise<{
    totalCPs: number;
    totalRanges: number;
    cacheEntries: number;
    expiredEntries: number;
  }> {
    const cpsSql = `
      SELECT COUNT(DISTINCT cp_id) as count
      FROM directory_cache
    `;

    const rangesSql = `
      SELECT COUNT(*) as count
      FROM directory_cache
    `;

    const expiredSql = `
      SELECT COUNT(*) as count
      FROM directory_cache
      WHERE expires_at IS NOT NULL AND expires_at < NOW()
    `;

    const [cpsResult, rangesResult, expiredResult] = await Promise.all([
      this.db.queryOne<any>(cpsSql),
      this.db.queryOne<any>(rangesSql),
      this.db.queryOne<any>(expiredSql)
    ]);

    return {
      totalCPs: cpsResult?.count || 0,
      totalRanges: rangesResult?.count || 0,
      cacheEntries: rangesResult?.count || 0,
      expiredEntries: expiredResult?.count || 0
    };
  }
}
