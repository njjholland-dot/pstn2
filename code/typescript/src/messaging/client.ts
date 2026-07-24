/**
 * PSTN2 messaging client
 * Handles all inter-CP communication with authentication and retry logic
 */

import { HttpClient } from './http-client';
import { generateSignature, generateUUID } from '../utils/crypto';
import { extractNumberRange } from '../utils/numbering';
import { getLogger } from '../utils/logger';
import { PSTN2Config } from '../types';
import { PSTN2Error } from '../errors';

const logger = getLogger();

const PSTN2_VERSION = '1.0';

interface RequestOptions {
  skipSignature?: boolean;
  maxPortingHops?: number;
  portingChain?: string[];
}

export class MessagingClient {
  private httpClient: HttpClient;
  private config: PSTN2Config;

  constructor(config: PSTN2Config) {
    this.config = config;
    this.httpClient = new HttpClient(config.timeout, config.retries);

    // Set log level
    if (config.logLevel) {
      getLogger(config.logLevel);
    }
  }

  /**
   * Get this client's CP identifier
   */
  getCpId(): string {
    return this.config.cpId;
  }

  /**
   * Make authenticated request to another CP.
   *
   * Wraps the payload in the PSTN2 message envelope (SPECIFICATION.md
   * section 4.1): messageId, version, timestamp, and a body-level Ed25519
   * `signature` field (the canonical signature location). The signature is
   * also mirrored in the X-PSTN2-Signature header for middleboxes.
   */
  async request<TRequest, TResponse>(
    endpoint: string,
    url: string,
    data: TRequest,
    options?: RequestOptions
  ): Promise<{ response: TResponse; portingChain: string[] }> {
    const portingChain = options?.portingChain || [];
    const maxPortingHops = options?.maxPortingHops || 10;

    // Check for porting loop
    if (portingChain.length >= maxPortingHops) {
      throw new PSTN2Error(
        'internal_error' as any,
        'Maximum porting hops exceeded - possible loop',
        { portingChain }
      );
    }

    // Build the message envelope (messageId, version, timestamp)
    const envelope = {
      ...data,
      messageId: (data as any).messageId || generateUUID(),
      version: (data as any).version || PSTN2_VERSION,
      timestamp: (data as any).timestamp || new Date().toISOString(),
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-PSTN2-Version': PSTN2_VERSION,
      'X-PSTN2-CP-ID': this.config.cpId,
    };

    // Sign the envelope; the body `signature` field is canonical
    let requestData: typeof envelope & { signature?: string } = envelope;
    if (!options?.skipSignature && this.config.privateKey) {
      const signature = generateSignature(envelope, this.config.privateKey);
      requestData = { ...envelope, signature };
      headers['X-PSTN2-Signature'] = signature;
    }

    try {
      logger.info(`Request to ${url}${endpoint}`, {
        endpoint,
        cpId: this.config.cpId,
      });

      const response = await this.httpClient.post<TResponse>(
        `${url}${endpoint}`,
        requestData,
        headers
      );

      logger.info(`Response from ${url}${endpoint}`, {
        status: response.status,
      });

      return {
        response: response.data,
        portingChain,
      };
    } catch (error) {
      // Handle porting (410 Gone)
      if (error instanceof PSTN2Error && error.code === 'number_ported') {
        return this.handlePorting(endpoint, requestData, portingChain, error, options);
      }

      throw error;
    }
  }

  /**
   * Handle number porting - retry with new CP
   */
  private async handlePorting<TRequest, TResponse>(
    endpoint: string,
    data: TRequest,
    portingChain: string[],
    error: PSTN2Error,
    options?: RequestOptions
  ): Promise<{ response: TResponse; portingChain: string[] }> {
    const portingInfo = (error.details?.response as any)?.portedTo;

    if (!portingInfo || !portingInfo.apiEndpoint) {
      throw new PSTN2Error(
        'number_ported' as any,
        'Number ported but no forwarding information provided',
        error.details
      );
    }

    const newCP = portingInfo.cpID;
    const newEndpoint = portingInfo.apiEndpoint;

    logger.info(`Number ported to ${newCP}, retrying`, {
      from: portingChain[portingChain.length - 1] || 'initial',
      to: newCP,
      endpoint: newEndpoint,
    });

    // Check for loop
    if (portingChain.includes(newCP)) {
      throw new PSTN2Error(
        'internal_error' as any,
        'Porting loop detected',
        { portingChain: [...portingChain, newCP] }
      );
    }

    // Add to porting chain
    const updatedChain = [...portingChain, newCP];

    // Cache the porting information if caching is enabled
    if (this.config.cacheDirectory) {
      // TODO: Implement caching in directory module
      logger.debug('Caching porting info', { from: data, to: newCP });
    }

    // Retry with new CP, preserving the caller's options
    return this.request<TRequest, TResponse>(endpoint, newEndpoint, data, {
      ...options,
      portingChain: updatedChain,
    });
  }

  /**
   * Make GET request
   */
  async get<TResponse>(url: string, endpoint: string): Promise<TResponse> {
    const headers: Record<string, string> = {
      'X-PSTN2-Version': PSTN2_VERSION,
      'X-PSTN2-CP-ID': this.config.cpId,
    };

    const response = await this.httpClient.get<TResponse>(`${url}${endpoint}`, headers);
    return response.data;
  }

  /**
   * Generate call reference UUID
   */
  generateCallReference(): string {
    return generateUUID();
  }

  /**
   * Get current timestamp in ISO format
   */
  getCurrentTimestamp(): string {
    return new Date().toISOString();
  }

  /**
   * Validate phone number format (basic E.164 validation)
   */
  validatePhoneNumber(phoneNumber: string): boolean {
    // E.164 format: +[country code][subscriber number]
    // Length: 1-15 digits after the +
    const e164Regex = /^\+[1-9]\d{1,14}$/;
    return e164Regex.test(phoneNumber);
  }

  /**
   * Extract number range from phone number for cache lookup.
   * Delegates to the shared UK-centric numbering utility.
   */
  extractNumberRange(phoneNumber: string, prefixDigits?: number): string {
    return extractNumberRange(phoneNumber, prefixDigits);
  }
}
