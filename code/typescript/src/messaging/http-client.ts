/**
 * HTTP client with retry logic for PSTN2 messaging
 */

import axios, { AxiosInstance, AxiosRequestConfig, AxiosError } from 'axios';
import axiosRetry from 'axios-retry';
import { HttpRequestOptions, HttpResponse, ErrorCode } from '../types';
import { PSTN2Error, NetworkError, TimeoutError, RateLimitError } from '../errors';
import { getLogger } from '../utils/logger';

const logger = getLogger();

export class HttpClient {
  private client: AxiosInstance;
  private timeout: number;

  constructor(timeout: number = 2000, retries: number = 3) {
    this.timeout = timeout;

    this.client = axios.create({
      timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'PSTN2-Client/1.0.0',
      },
    });

    // Configure retry logic
    axiosRetry(this.client, {
      retries,
      retryDelay: axiosRetry.exponentialDelay,
      retryCondition: (error: AxiosError) => {
        // Retry on network errors and 5xx server errors
        return (
          axiosRetry.isNetworkOrIdempotentRequestError(error) ||
          (error.response?.status ? error.response.status >= 500 : false)
        );
      },
      onRetry: (retryCount, error) => {
        logger.warn(`Retry attempt ${retryCount} for ${error.config?.url}`, {
          error: error.message,
        });
      },
    });

    // Request interceptor for logging
    this.client.interceptors.request.use(
      (config) => {
        logger.debug(`HTTP ${config.method?.toUpperCase()} ${config.url}`, {
          headers: config.headers,
        });
        return config;
      },
      (error) => {
        logger.error('Request interceptor error', { error: error.message });
        return Promise.reject(error);
      }
    );

    // Response interceptor for logging
    this.client.interceptors.response.use(
      (response) => {
        logger.debug(`HTTP ${response.status} ${response.config.url}`, {
          status: response.status,
        });
        return response;
      },
      (error) => {
        if (error.response) {
          logger.error(`HTTP ${error.response.status} ${error.config?.url}`, {
            status: error.response.status,
            data: error.response.data,
          });
        } else {
          logger.error(`HTTP error ${error.config?.url}`, {
            error: error.message,
          });
        }
        return Promise.reject(error);
      }
    );
  }

  /**
   * Make HTTP request with error handling
   */
  async request<T = unknown>(options: HttpRequestOptions): Promise<HttpResponse<T>> {
    const config: AxiosRequestConfig = {
      method: options.method,
      url: options.url,
      data: options.data,
      headers: options.headers,
      timeout: options.timeout || this.timeout,
    };

    try {
      const response = await this.client.request<T>(config);

      return {
        status: response.status,
        data: response.data,
        headers: response.headers as Record<string, string>,
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * GET request
   */
  async get<T = unknown>(url: string, headers?: Record<string, string>): Promise<HttpResponse<T>> {
    return this.request<T>({
      method: 'GET',
      url,
      headers,
    });
  }

  /**
   * POST request
   */
  async post<T = unknown>(
    url: string,
    data: unknown,
    headers?: Record<string, string>
  ): Promise<HttpResponse<T>> {
    return this.request<T>({
      method: 'POST',
      url,
      data,
      headers,
    });
  }

  /**
   * PUT request
   */
  async put<T = unknown>(
    url: string,
    data: unknown,
    headers?: Record<string, string>
  ): Promise<HttpResponse<T>> {
    return this.request<T>({
      method: 'PUT',
      url,
      data,
      headers,
    });
  }

  /**
   * DELETE request
   */
  async delete<T = unknown>(
    url: string,
    headers?: Record<string, string>
  ): Promise<HttpResponse<T>> {
    return this.request<T>({
      method: 'DELETE',
      url,
      headers,
    });
  }

  /**
   * Handle and transform errors
   */
  private handleError(error: unknown): PSTN2Error {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;

      // Timeout
      if (axiosError.code === 'ECONNABORTED' || axiosError.message.includes('timeout')) {
        return new TimeoutError('Request timed out', {
          url: axiosError.config?.url,
          timeout: this.timeout,
        });
      }

      // Network errors
      if (
        axiosError.code === 'ECONNREFUSED' ||
        axiosError.code === 'ENOTFOUND' ||
        axiosError.code === 'ENETUNREACH'
      ) {
        return new NetworkError('Network connection failed', {
          url: axiosError.config?.url,
          code: axiosError.code,
        });
      }

      // HTTP error responses
      if (axiosError.response) {
        const status = axiosError.response.status;
        const data = axiosError.response.data as any;

        // Rate limiting
        if (status === 429) {
          const retryAfter = axiosError.response.headers['retry-after'];
          return new RateLimitError(
            retryAfter ? parseInt(retryAfter, 10) : undefined,
            { url: axiosError.config?.url }
          );
        }

        // Map HTTP status to PSTN2 errors
        const errorCode = this.mapStatusToErrorCode(status, data?.error);
        return new PSTN2Error(errorCode, data?.message || axiosError.message, {
          status,
          url: axiosError.config?.url,
          response: data,
        });
      }

      // Generic network error
      return new NetworkError(axiosError.message, {
        url: axiosError.config?.url,
      });
    }

    // Unknown error
    if (error instanceof Error) {
      return new PSTN2Error(ErrorCode.InternalError, error.message);
    }

    return new PSTN2Error(ErrorCode.InternalError, 'Unknown error occurred');
  }

  /**
   * Map HTTP status code to PSTN2 error code
   */
  private mapStatusToErrorCode(status: number, errorString?: string): ErrorCode {
    // If server provides error code, use it
    if (errorString && Object.values(ErrorCode).includes(errorString as ErrorCode)) {
      return errorString as ErrorCode;
    }

    // Map based on status code
    switch (status) {
      case 400:
        return ErrorCode.InvalidRequest;
      case 404:
        return ErrorCode.CallNotFound;
      case 410:
        return ErrorCode.NumberPorted;
      case 429:
        return ErrorCode.RateLimitExceeded;
      case 503:
        return ErrorCode.ServiceUnavailable;
      case 500:
      default:
        return ErrorCode.InternalError;
    }
  }
}
