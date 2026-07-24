/**
 * Main PSTN2 Client
 * Unified interface for all PSTN2 functionality
 */

import { MessagingClient } from './messaging';
import { AuthenticationModule } from './auth';
import { RoutingModule } from './routing';
import { EncryptionModule } from './encryption';
import { BrandingModule } from './branding';
import { EmergencyModule } from './emergency';
import { DirectoryModule } from './directory';
import { PSTN2Config, PhoneNumber } from './types';
import { getLogger } from './utils/logger';
import { derivePublicKey } from './utils/crypto';

const logger = getLogger();

export class PSTN2Client {
  public readonly config: PSTN2Config;
  public readonly auth: AuthenticationModule;
  public readonly routing: RoutingModule;
  public readonly encryption: EncryptionModule;
  public readonly branding: BrandingModule;
  public readonly emergency: EmergencyModule;
  public readonly directory: DirectoryModule;

  private messagingClient: MessagingClient;

  constructor(config: PSTN2Config) {
    // Derive public key if not provided
    if (!config.publicKey && config.privateKey) {
      config.publicKey = derivePublicKey(config.privateKey);
    }

    this.config = config;

    // Set log level
    if (config.logLevel) {
      getLogger(config.logLevel);
    }

    logger.info('Initializing PSTN2 Client', {
      cpId: config.cpId,
      authMode: config.authMode,
    });

    // Initialize directory first (needed by other modules)
    this.directory = new DirectoryModule(config.cacheTTL);

    // Initialize messaging client
    this.messagingClient = new MessagingClient(config);

    // Directory lookup function for other modules
    const directoryLookup = async (phoneNumber: PhoneNumber) => {
      return await this.directory.lookup(phoneNumber);
    };

    // Initialize all modules
    this.auth = new AuthenticationModule(this.messagingClient, config, directoryLookup);
    this.routing = new RoutingModule(this.messagingClient, config, directoryLookup);
    this.encryption = new EncryptionModule();
    this.branding = new BrandingModule(this.messagingClient, config.cacheTTL);
    this.emergency = new EmergencyModule(this.messagingClient, directoryLookup);

    logger.info('PSTN2 Client initialized successfully', {
      cpId: config.cpId,
    });
  }

  /**
   * Verify an inbound call
   */
  async verifyCall(params: {
    callerID: PhoneNumber;
    calledID: PhoneNumber;
    callReference: string;
    tokenId?: string;
  }) {
    return await this.auth.verifyCall(
      params.callerID,
      params.calledID,
      params.callReference,
      params.tokenId
    );
  }

  /**
   * Request direct routing for outbound call
   */
  async requestRouting(params: {
    destinationNumber: PhoneNumber;
    callerID: PhoneNumber;
    callReference?: string;
    mediaCapabilities: {
      codecs: string[];
      encryption: string[];
      video?: boolean;
    };
    connectionDetails: {
      fqdn: string;
      port: number;
      publicKey?: string;
    };
    branding?: {
      displayName?: string;
      logo?: string;
      callPurpose?: string;
      backgroundColor?: string;
    };
  }) {
    return await this.routing.requestRouting(params);
  }

  /**
   * Get emergency location
   */
  async getEmergencyLocation(params: {
    callerID: PhoneNumber;
    callReference: string;
    psapID: string;
  }) {
    return await this.emergency.getLocation(
      params.callerID,
      params.callReference,
      params.psapID
    );
  }

  /**
   * Synchronize directory from other CPs
   */
  async syncDirectory(cpEndpoints: string[]) {
    await this.directory.pullFromAllCPs(cpEndpoints);
  }

  /**
   * Generate call reference
   */
  generateCallReference(): string {
    return this.messagingClient.generateCallReference();
  }

  /**
   * Get client health status
   */
  async getHealth() {
    const authHealth = await this.auth.checkHealth();
    const directoryStats = this.directory.getCacheStats();

    return {
      cpId: this.config.cpId,
      authMode: this.config.authMode,
      authentication: authHealth,
      directory: directoryStats,
      encryption: this.encryption.getEncryptionInfo(),
    };
  }
}
