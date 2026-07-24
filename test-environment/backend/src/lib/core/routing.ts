/**
 * PSTN2 Routing Service
 *
 * Handles direct routing negotiation and media capability matching
 */

import { DatabaseConnection } from '../database/connection';
import { MessagingService } from './messaging';
import { DirectoryService } from './directory';
import {
  RoutingRequest,
  RoutingResponse,
  MessageType,
  MediaCapabilities,
  ConnectionDetails,
  PSTN2Error,
  ErrorCode
} from './types';
import {
  normalizePhoneNumber,
  generateToken
} from './utils';

export class RoutingService {
  constructor(
    private cpId: string,
    private db: DatabaseConnection,
    private messaging: MessagingService,
    private directory: DirectoryService,
    private apiEndpoint: string,
    private publicKey: string,
    private enableDirectRouting: boolean = true,
    private enableEncryption: boolean = true
  ) {}

  // ==========================================================================
  // Outbound Routing (Originating CP)
  // ==========================================================================

  /**
   * Request direct routing to a destination number
   */
  async requestRouting(
    request: RoutingRequest
  ): Promise<RoutingResponse> {
    if (!this.enableDirectRouting) {
      return {
        accepted: false,
        rejectionReason: 'Direct routing not enabled'
      };
    }

    try {
      // Step 1: Normalize destination number
      const destinationNumber = normalizePhoneNumber(request.destinationNumber);

      // Step 2: Look up destination CP
      const destinationEntry = await this.directory.lookupNumber(destinationNumber);

      if (!destinationEntry) {
        throw new PSTN2Error(
          ErrorCode.NUMBER_NOT_FOUND,
          `No CP found for number: ${destinationNumber}`,
          404
        );
      }

      // Step 3: Send routing request to destination CP
      const response = await this.messaging.sendMessage(
        destinationEntry.cpId,
        `${destinationEntry.apiEndpoint}/pstn2/v1/routing/request`,
        MessageType.ROUTING_REQUEST,
        {
          destinationNumber,
          callerID: normalizePhoneNumber(request.callerID),
          callReference: request.callReference,
          mediaCapabilities: request.mediaCapabilities,
          publicKey: this.publicKey,
          branding: request.branding
        },
        request.callReference
      );

      return response as RoutingResponse;
    } catch (error) {
      if (error instanceof PSTN2Error) {
        return {
          accepted: false,
          rejectionReason: error.message
        };
      }

      return {
        accepted: false,
        rejectionReason: (error as Error).message
      };
    }
  }

  // ==========================================================================
  // Inbound Routing (Terminating CP)
  // ==========================================================================

  /**
   * Accept or reject an inbound routing request
   */
  async acceptRouting(
    request: RoutingRequest
  ): Promise<RoutingResponse> {
    if (!this.enableDirectRouting) {
      return {
        accepted: false,
        rejectionReason: 'Direct routing not enabled'
      };
    }

    try {
      // Step 1: Verify destination number belongs to us
      const destinationNumber = normalizePhoneNumber(request.destinationNumber);
      const isOurs = await this.isOurNumber(destinationNumber);

      if (!isOurs) {
        return {
          accepted: false,
          rejectionReason: `Number ${destinationNumber} not found in our system`
        };
      }

      // Step 2: Check media capabilities
      const capabilitiesMatch = this.checkMediaCapabilities(request.mediaCapabilities);

      if (!capabilitiesMatch) {
        return {
          accepted: false,
          rejectionReason: 'Media capabilities not compatible'
        };
      }

      // Step 3: Generate connection details
      const connectionDetails = this.generateConnectionDetails();

      // Step 4: Store routing information
      await this.storeRoutingInfo(request, connectionDetails);

      return {
        accepted: true,
        connectionDetails
      };
    } catch (error) {
      return {
        accepted: false,
        rejectionReason: (error as Error).message
      };
    }
  }

  // ==========================================================================
  // Media Capability Negotiation
  // ==========================================================================

  /**
   * Check if media capabilities are compatible
   */
  private checkMediaCapabilities(capabilities: MediaCapabilities): boolean {
    // List of codecs we support
    const supportedCodecs = ['opus', 'g722', 'g711', 'pcmu', 'pcma'];

    // Check if at least one codec matches
    const hasCompatibleCodec = capabilities.codecs.some(codec =>
      supportedCodecs.includes(codec.toLowerCase())
    );

    if (!hasCompatibleCodec) {
      return false;
    }

    // Check encryption if required
    if (this.enableEncryption) {
      const supportedEncryption = ['srtp-aes256', 'srtp-aes128', 'dtls'];
      const hasCompatibleEncryption = capabilities.encryption.some(enc =>
        supportedEncryption.includes(enc.toLowerCase())
      );

      if (!hasCompatibleEncryption) {
        return false;
      }
    }

    // Check video support if needed
    // For now, we'll accept any video setting

    return true;
  }

  /**
   * Select best matching codec
   */
  private selectCodec(capabilities: MediaCapabilities): string {
    const supportedCodecs = ['opus', 'g722', 'g711', 'pcmu', 'pcma'];

    for (const codec of capabilities.codecs) {
      if (supportedCodecs.includes(codec.toLowerCase())) {
        return codec;
      }
    }

    return 'opus'; // Default
  }

  /**
   * Select best matching encryption
   */
  private selectEncryption(capabilities: MediaCapabilities): string {
    const supportedEncryption = ['srtp-aes256', 'srtp-aes128', 'dtls'];

    for (const enc of capabilities.encryption) {
      if (supportedEncryption.includes(enc.toLowerCase())) {
        return enc;
      }
    }

    return 'srtp-aes256'; // Default
  }

  // ==========================================================================
  // Connection Details Generation
  // ==========================================================================

  /**
   * Generate connection details for direct routing
   */
  private generateConnectionDetails(): ConnectionDetails {
    // In a real system, this would:
    // 1. Allocate RTP/SRTP ports
    // 2. Configure firewall rules
    // 3. Set up media relay if needed

    // For simulation, generate dummy details
    const port = 10000 + Math.floor(Math.random() * 50000);

    return {
      fqdn: `media-${this.cpId.toLowerCase()}.pstn2.local`,
      port,
      publicKey: this.publicKey
    };
  }

  // ==========================================================================
  // Database Operations
  // ==========================================================================

  /**
   * Store routing information in database
   */
  private async storeRoutingInfo(
    request: RoutingRequest,
    connectionDetails: ConnectionDetails
  ): Promise<void> {
    const sql = `
      UPDATE call_records
      SET
        routing_accepted = TRUE,
        direct_routing_fqdn = ?,
        direct_routing_port = ?,
        encryption_key = ?
      WHERE call_reference = ?
    `;

    await this.db.update(sql, [
      connectionDetails.fqdn,
      connectionDetails.port,
      connectionDetails.publicKey,
      request.callReference
    ]);
  }

  /**
   * Get routing information for a call
   */
  async getRoutingInfo(callReference: string): Promise<{
    accepted: boolean;
    fqdn?: string;
    port?: number;
    encryptionKey?: string;
  } | null> {
    const sql = `
      SELECT
        routing_accepted,
        direct_routing_fqdn,
        direct_routing_port,
        encryption_key
      FROM call_records
      WHERE call_reference = ?
    `;

    const result = await this.db.queryOne<any>(sql, [callReference]);

    if (!result) {
      return null;
    }

    return {
      accepted: result.routing_accepted,
      fqdn: result.direct_routing_fqdn,
      port: result.direct_routing_port,
      encryptionKey: result.encryption_key
    };
  }

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

  // ==========================================================================
  // Statistics
  // ==========================================================================

  /**
   * Get routing statistics
   */
  async getRoutingStats(): Promise<{
    totalRequests: number;
    accepted: number;
    rejected: number;
    acceptanceRate: number;
  }> {
    const sql = `
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN routing_accepted = TRUE THEN 1 ELSE 0 END) as accepted,
        SUM(CASE WHEN routing_accepted = FALSE THEN 1 ELSE 0 END) as rejected
      FROM call_records
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
    `;

    const result = await this.db.queryOne<any>(sql);

    if (!result || result.total === 0) {
      return {
        totalRequests: 0,
        accepted: 0,
        rejected: 0,
        acceptanceRate: 0
      };
    }

    return {
      totalRequests: result.total,
      accepted: result.accepted || 0,
      rejected: result.rejected || 0,
      acceptanceRate: ((result.accepted || 0) / result.total) * 100
    };
  }

  /**
   * Get recent routing requests
   */
  async getRecentRequests(limit: number = 10): Promise<any[]> {
    const sql = `
      SELECT
        call_reference,
        caller_id,
        called_id,
        routing_accepted,
        direct_routing_fqdn,
        direct_routing_port,
        created_at
      FROM call_records
      WHERE direction = 'inbound'
      ORDER BY created_at DESC
      LIMIT ?
    `;

    return await this.db.query(sql, [limit]);
  }
}
