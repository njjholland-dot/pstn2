/**
 * PSTN2 Messaging Service
 *
 * Handles HTTP requests to other CPs and message logging
 */

import axios, { AxiosError } from 'axios';
import { DatabaseConnection } from '../database/connection';
import {
  MessageType,
  MessageLogEntry,
  PSTN2Error,
  ErrorCode
} from './types';
import {
  generateMessageId,
  getCurrentTimestamp,
  retryWithBackoff,
  getMillisecondsBetween
} from './utils';

export class MessagingService {
  constructor(
    private cpId: string,
    private db: DatabaseConnection,
    private requestTimeoutMs: number = 2000,
    private maxRetries: number = 3
  ) {}

  /**
   * Send a message to another CP
   */
  async sendMessage(
    toCP: string,
    endpoint: string,
    messageType: MessageType,
    payload: any,
    callReference?: string
  ): Promise<any> {
    const messageId = generateMessageId();
    const startTime = new Date();

    try {
      // Make HTTP request with retry
      const response = await retryWithBackoff(
        async () => {
          return await axios.post(endpoint, payload, {
            timeout: this.requestTimeoutMs,
            headers: {
              'Content-Type': 'application/json',
              'X-Message-ID': messageId,
              'X-From-CP': this.cpId,
              'X-To-CP': toCP
            }
          });
        },
        this.maxRetries,
        500
      );

      const duration = getMillisecondsBetween(startTime, new Date());

      // Log successful message
      await this.logMessage({
        messageId,
        callReference,
        messageType,
        direction: 'sent',
        fromCP: this.cpId,
        toCP,
        requestPayload: payload,
        responsePayload: response.data,
        httpStatusCode: response.status,
        durationMs: duration,
        timestamp: startTime
      });

      return response.data;
    } catch (error) {
      const duration = getMillisecondsBetween(startTime, new Date());
      const axiosError = error as AxiosError;

      // Log failed message
      await this.logMessage({
        messageId,
        callReference,
        messageType,
        direction: 'sent',
        fromCP: this.cpId,
        toCP,
        requestPayload: payload,
        httpStatusCode: axiosError.response?.status,
        errorMessage: axiosError.message,
        durationMs: duration,
        timestamp: startTime
      });

      // Determine error type
      if (axiosError.code === 'ECONNABORTED' || axiosError.code === 'ETIMEDOUT') {
        throw new PSTN2Error(
          ErrorCode.TIMEOUT,
          `Request to ${toCP} timed out after ${this.requestTimeoutMs}ms`,
          408
        );
      }

      if (axiosError.code === 'ECONNREFUSED') {
        throw new PSTN2Error(
          ErrorCode.NETWORK_ERROR,
          `Cannot connect to ${toCP} at ${endpoint}`,
          503
        );
      }

      throw new PSTN2Error(
        ErrorCode.NETWORK_ERROR,
        `Network error: ${axiosError.message}`,
        500
      );
    }
  }

  /**
   * Log a message to the database
   */
  async logMessage(entry: MessageLogEntry): Promise<void> {
    const sql = `
      INSERT INTO message_log (
        message_id, call_reference, message_type, direction,
        from_cp, to_cp, request_payload, response_payload,
        http_status_code, error_message, duration_ms, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await this.db.query(sql, [
      entry.messageId,
      entry.callReference || null,
      entry.messageType,
      entry.direction,
      entry.fromCP,
      entry.toCP,
      JSON.stringify(entry.requestPayload),
      entry.responsePayload ? JSON.stringify(entry.responsePayload) : null,
      entry.httpStatusCode || null,
      entry.errorMessage || null,
      entry.durationMs || null,
      entry.timestamp
    ]);
  }

  /**
   * Get message history for a call
   */
  async getMessageHistory(callReference: string): Promise<MessageLogEntry[]> {
    const sql = `
      SELECT
        message_id, call_reference, message_type, direction,
        from_cp, to_cp, request_payload, response_payload,
        http_status_code, error_message, duration_ms, timestamp
      FROM message_log
      WHERE call_reference = ?
      ORDER BY timestamp ASC
    `;

    const rows = await this.db.query<any>(sql, [callReference]);

    return rows.map(row => ({
      messageId: row.message_id,
      callReference: row.call_reference,
      messageType: row.message_type as MessageType,
      direction: row.direction as 'sent' | 'received',
      fromCP: row.from_cp,
      toCP: row.to_cp,
      requestPayload: JSON.parse(row.request_payload),
      responsePayload: row.response_payload ? JSON.parse(row.response_payload) : undefined,
      httpStatusCode: row.http_status_code,
      errorMessage: row.error_message,
      durationMs: row.duration_ms,
      timestamp: new Date(row.timestamp)
    }));
  }

  /**
   * Get recent messages for this CP
   */
  async getRecentMessages(limit: number = 50): Promise<MessageLogEntry[]> {
    const sql = `
      SELECT
        message_id, call_reference, message_type, direction,
        from_cp, to_cp, request_payload, response_payload,
        http_status_code, error_message, duration_ms, timestamp
      FROM message_log
      WHERE from_cp = ? OR to_cp = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `;

    const rows = await this.db.query<any>(sql, [this.cpId, this.cpId, limit]);

    return rows.map(row => ({
      messageId: row.message_id,
      callReference: row.call_reference,
      messageType: row.message_type as MessageType,
      direction: row.direction as 'sent' | 'received',
      fromCP: row.from_cp,
      toCP: row.to_cp,
      requestPayload: JSON.parse(row.request_payload),
      responsePayload: row.response_payload ? JSON.parse(row.response_payload) : undefined,
      httpStatusCode: row.http_status_code,
      errorMessage: row.error_message,
      durationMs: row.duration_ms,
      timestamp: new Date(row.timestamp)
    }));
  }

  /**
   * Log an incoming message (received)
   */
  async logIncomingMessage(
    messageType: MessageType,
    fromCP: string,
    payload: any,
    callReference?: string
  ): Promise<string> {
    const messageId = generateMessageId();

    await this.logMessage({
      messageId,
      callReference,
      messageType,
      direction: 'received',
      fromCP,
      toCP: this.cpId,
      requestPayload: payload,
      timestamp: new Date()
    });

    return messageId;
  }

  /**
   * Update a logged message with response data
   */
  async updateMessageWithResponse(
    messageId: string,
    responsePayload: any,
    statusCode: number,
    durationMs?: number
  ): Promise<void> {
    const sql = `
      UPDATE message_log
      SET response_payload = ?,
          http_status_code = ?,
          duration_ms = ?
      WHERE message_id = ?
    `;

    await this.db.update(sql, [
      JSON.stringify(responsePayload),
      statusCode,
      durationMs || null,
      messageId
    ]);
  }

  /**
   * Get message statistics
   */
  async getMessageStats(): Promise<{
    totalSent: number;
    totalReceived: number;
    avgDuration: number;
    successRate: number;
  }> {
    const sql = `
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN direction = 'sent' THEN 1 ELSE 0 END) as sent,
        SUM(CASE WHEN direction = 'received' THEN 1 ELSE 0 END) as received,
        AVG(duration_ms) as avg_duration,
        SUM(CASE WHEN http_status_code BETWEEN 200 AND 299 THEN 1 ELSE 0 END) as successful
      FROM message_log
      WHERE from_cp = ? OR to_cp = ?
    `;

    const result = await this.db.queryOne<any>(sql, [this.cpId, this.cpId]);

    if (!result) {
      return { totalSent: 0, totalReceived: 0, avgDuration: 0, successRate: 0 };
    }

    const total = result.total || 0;
    const successful = result.successful || 0;

    return {
      totalSent: result.sent || 0,
      totalReceived: result.received || 0,
      avgDuration: result.avg_duration || 0,
      successRate: total > 0 ? (successful / total) * 100 : 0
    };
  }
}
