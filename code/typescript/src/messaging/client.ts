/**
 * PSTN2 messaging client
 * Handles all inter-CP communication with authentication and retry logic
 */

import { HttpClient } from './http-client';
import { generateSignature, generateUUID } from '../utils/crypto';
import { getLogger } from '../utils/logger';
import { PSTN2Config, HttpResponse } from '../types';
import { PSTN2Error, NumberPortedError } from '../errors';

const logger = getLogger();

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
   * Make authenticated request to another CP
   */
  async request<TRequest, TResponse>(
    endpoint: string,
    url: string,
    data: TRequest,
    options?: {
      skipSignature?: boolean;
      maxPortingHops?: number;
      portingChain?: string[];
    }
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

    // Add timestamp if not present
    const requestData = {
      ...data,
      timestamp: (data as any).timestamp || new Date().toISOString(),
    };

    // Generate signature
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (!options?.skipSignature && this.config.privateKey) {
      const signature = generateSignature(requestData, this.config.privateKey);
      headers['X-CP-Signature'] = `HMAC-SHA256 ${signature}`;
      headers['X-CP-ID'] = this.config.cpId;
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
        return this.handlePorting(endpoint, requestData, portingChain, error);
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
    error: PSTN2Error
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

    // Retry with new CP
    return this.request<TRequest, TResponse>(endpoint, newEndpoint, data, {
      portingChain: updatedChain,
    });
  }

  /**
   * Make GET request
   */
  async get<TResponse>(url: string, endpoint: string): Promise<TResponse> {
    const headers: Record<string, string> = {
      'X-CP-ID': this.config.cpId,
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
   * Extract number range from phone number for cache lookup
   */
  extractNumberRange(phoneNumber: string, prefixLength: number = 6): string {
    // Remove the + and take first N digits
    return phoneNumber.substring(0, prefixLength + 1); // +1 for the + sign
  }
}
