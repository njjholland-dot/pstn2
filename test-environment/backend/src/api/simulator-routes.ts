/**
 * PSTN2 Simulator API Routes
 *
 * Controls test scenarios and provides test harness functionality
 */

import { Router, Request, Response } from 'express';
import { dbManager } from '../lib/database/connection';
import { AuthenticationService } from '../lib/core/authentication';
import { DirectoryService } from '../lib/core/directory';
import { RoutingService } from '../lib/core/routing';
import { MessagingService } from '../lib/core/messaging';
import {
  SimulateCallRequest,
  CallDirection,
  AuthMethod,
  AuthResult,
  NumberStatus
} from '../lib/core/types';
import {
  generateCallReference,
  normalizePhoneNumber,
  getCPEndpoint
} from '../lib/core/utils';

/**
 * Create simulator routes
 */
export async function createSimulatorRoutes(): Promise<Router> {
  const router = Router();

  // ==========================================================================
  // Call Simulation
  // ==========================================================================

  /**
   * POST /api/simulator/call/initiate
   * Initiate a simulated call between CPs
   */
  router.post('/call/initiate', async (req: Request, res: Response) => {
    try {
      const request: SimulateCallRequest = req.body;
      const callReference = generateCallReference();

      const fromCP = request.fromCP;
      const fromNumber = normalizePhoneNumber(request.fromNumber);
      const toNumber = normalizePhoneNumber(request.toNumber);

      // Get database connections
      const fromDB = dbManager.getConnection(fromCP);

      // Get CP configs
      const fromConfig = await getCPConfig(fromCP);

      // Initialize services for originating CP
      const messaging = new MessagingService(
        fromCP,
        fromDB,
        fromConfig.request_timeout_ms,
        fromConfig.max_retries
      );

      const directory = new DirectoryService(
        fromCP,
        fromDB,
        messaging,
        fromConfig.api_endpoint,
        fromConfig.cache_ttl_seconds
      );

      const authentication = new AuthenticationService(
        fromCP,
        fromDB,
        messaging,
        request.authMode || fromConfig.auth_mode
      );

      const routing = new RoutingService(
        fromCP,
        fromDB,
        messaging,
        directory,
        fromConfig.api_endpoint,
        fromConfig.public_key
      );

      // Step 1: Create call record
      const callId = await createCallRecord(fromDB, {
        callReference,
        callerID: fromNumber,
        calledID: toNumber,
        direction: CallDirection.OUTBOUND,
        authMethod: (request.authMode || fromConfig.auth_mode) as AuthMethod
      });

      // Step 2: Look up destination CP
      const destinationEntry = await directory.lookupNumber(toNumber);

      if (!destinationEntry) {
        await updateCallRecord(fromDB, callReference, {
          authResult: AuthResult.FAILED
        });

        return res.json({
          success: false,
          callReference,
          error: {
            code: 'NUMBER_NOT_FOUND',
            message: `No CP found for number: ${toNumber}`
          }
        });
      }

      // Create call record in destination CP
      const toCP = destinationEntry.cpId;
      const toDB = dbManager.getConnection(toCP);
      await createCallRecord(toDB, {
        callReference,
        callerID: fromNumber,
        calledID: toNumber,
        direction: CallDirection.INBOUND,
        authMethod: (request.authMode || fromConfig.auth_mode) as AuthMethod
      });

      let authResponse;
      let portingChain: string[] | undefined;

      // Step 3: Authenticate based on mode
      if (request.authMode === 'token_pool' || fromConfig.auth_mode === 'token_pool') {
        // Token Pool mode
        const tokenResponse = await authentication.createToken({
          callerID: fromNumber,
          calledID: toNumber,
          callReference,
          ttl: 30
        });

        // Verify token at destination
        const toMessaging = new MessagingService(toCP, toDB);
        const toAuth = new AuthenticationService(toCP, toDB, toMessaging, 'token_pool');

        const verifyResponse = await toAuth.verifyToken({
          tokenId: tokenResponse.tokenId
        });

        authResponse = {
          verified: verifyResponse.valid,
          errorMessage: verifyResponse.errorMessage
        };
      } else {
        // Direct Query mode
        authResponse = await authentication.verifyCall({
          callerID: fromNumber,
          calledID: toNumber,
          callReference,
          timestamp: new Date().toISOString()
        });

        portingChain = authResponse.portingChain;
      }

      // Update call records with auth result
      const authResult = authResponse.verified ? AuthResult.VERIFIED : AuthResult.FAILED;
      await updateCallRecord(fromDB, callReference, {
        authResult,
        portingChain: portingChain ? JSON.stringify(portingChain) : undefined
      });
      await updateCallRecord(toDB, callReference, {
        authResult,
        portingChain: portingChain ? JSON.stringify(portingChain) : undefined
      });

      let routingResponse;

      // Step 4: Request direct routing if requested and auth succeeded
      if (request.requestRouting && authResponse.verified) {
        routingResponse = await routing.requestRouting({
          destinationNumber: toNumber,
          callerID: fromNumber,
          callReference,
          mediaCapabilities: {
            codecs: ['opus', 'g722'],
            encryption: ['srtp-aes256'],
            video: false
          },
          publicKey: fromConfig.public_key,
          branding: request.branding
        });

        // Update call records with routing result
        if (routingResponse.accepted) {
          await updateCallRecord(fromDB, callReference, {
            routingAccepted: true,
            directRoutingFqdn: routingResponse.connectionDetails?.fqdn,
            directRoutingPort: routingResponse.connectionDetails?.port
          });
          await updateCallRecord(toDB, callReference, {
            routingAccepted: true,
            directRoutingFqdn: routingResponse.connectionDetails?.fqdn,
            directRoutingPort: routingResponse.connectionDetails?.port
          });
        }
      }

      // Step 5: Get message history
      const messages = await messaging.getMessageHistory(callReference);

      // Mark call as completed
      await completeCallRecord(fromDB, callReference);
      await completeCallRecord(toDB, callReference);

      res.json({
        success: true,
        callReference,
        authResult: authResponse.verified ? 'verified' : 'failed',
        authDetails: {
          callerName: authResponse.callerName,
          callPurpose: authResponse.callPurpose
        },
        portingChain,
        routingAccepted: routingResponse?.accepted || false,
        connectionDetails: routingResponse?.connectionDetails,
        messages: messages.map(m => ({
          messageId: m.messageId,
          messageType: m.messageType,
          direction: m.direction,
          fromCP: m.fromCP,
          toCP: m.toCP,
          timestamp: m.timestamp,
          durationMs: m.durationMs,
          statusCode: m.httpStatusCode
        }))
      });
    } catch (error) {
      console.error('Call simulation error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'SIMULATION_ERROR',
          message: (error as Error).message
        }
      });
    }
  });

  /**
   * GET /api/simulator/call/:callReference/messages
   * Get message history for a call
   */
  router.get('/call/:callReference/messages', async (req: Request, res: Response) => {
    try {
      const { callReference } = req.params;

      // Try all CPs to find messages
      const allMessages = [];

      for (const cpId of ['CP1-UK-0001', 'CP2-UK-0002', 'CP3-UK-0003']) {
        const db = dbManager.getConnection(cpId);
        const messaging = new MessagingService(cpId, db);
        const messages = await messaging.getMessageHistory(callReference);
        allMessages.push(...messages);
      }

      // Sort by timestamp
      allMessages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

      res.json({
        success: true,
        callReference,
        messageCount: allMessages.length,
        messages: allMessages
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: (error as Error).message
      });
    }
  });

  /**
   * GET /api/simulator/call/:callReference/details
   * Get call details
   */
  router.get('/call/:callReference/details', async (req: Request, res: Response) => {
    try {
      const { callReference } = req.params;

      // Try all CPs to find the call
      for (const cpId of ['CP1-UK-0001', 'CP2-UK-0002', 'CP3-UK-0003']) {
        const db = dbManager.getConnection(cpId);

        const sql = `
          SELECT * FROM call_records
          WHERE call_reference = ?
        `;

        const call = await db.queryOne<any>(sql, [callReference]);

        if (call) {
          return res.json({
            success: true,
            cpId,
            call: {
              ...call,
              porting_chain: call.porting_chain ? JSON.parse(call.porting_chain) : null,
              branding: call.branding ? JSON.parse(call.branding) : null
            }
          });
        }
      }

      res.status(404).json({
        success: false,
        error: 'Call not found'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: (error as Error).message
      });
    }
  });

  // ==========================================================================
  // CP Management
  // ==========================================================================

  /**
   * GET /api/simulator/cp/:cpId/calls
   * Get all calls for a CP
   */
  router.get('/cp/:cpId/calls', async (req: Request, res: Response) => {
    try {
      const { cpId } = req.params;
      const { limit = 50, direction } = req.query;

      const db = dbManager.getConnection(cpId);

      let sql = `
        SELECT * FROM call_records
        ${direction ? 'WHERE direction = ?' : ''}
        ORDER BY created_at DESC
        LIMIT ?
      `;

      const params = direction ? [direction, parseInt(limit as string)] : [parseInt(limit as string)];
      const calls = await db.query<any>(sql, params);

      res.json({
        success: true,
        cpId,
        count: calls.length,
        calls: calls.map(call => ({
          ...call,
          porting_chain: call.porting_chain ? JSON.parse(call.porting_chain) : null,
          branding: call.branding ? JSON.parse(call.branding) : null
        }))
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: (error as Error).message
      });
    }
  });

  /**
   * GET /api/simulator/cp/:cpId/numbers
   * Get all numbers owned by a CP
   */
  router.get('/cp/:cpId/numbers', async (req: Request, res: Response) => {
    try {
      const { cpId } = req.params;
      const { status, limit = 100 } = req.query;

      const db = dbManager.getConnection(cpId);

      let sql = `
        SELECT * FROM numbers
        ${status ? 'WHERE status = ?' : ''}
        ORDER BY number
        LIMIT ?
      `;

      const params = status ? [status, parseInt(limit as string)] : [parseInt(limit as string)];
      const numbers = await db.query<any>(sql, params);

      res.json({
        success: true,
        cpId,
        count: numbers.length,
        numbers
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: (error as Error).message
      });
    }
  });

  /**
   * POST /api/simulator/cp/:cpId/port-number
   * Simulate number porting
   */
  router.post('/cp/:cpId/port-number', async (req: Request, res: Response) => {
    try {
      const { cpId } = req.params;
      const { number, toCP } = req.body;

      const fromDB = dbManager.getConnection(cpId);
      const toDB = dbManager.getConnection(toCP);

      const normalized = normalizePhoneNumber(number);

      // Update source CP - mark as ported out
      const updateFromSql = `
        UPDATE numbers
        SET status = ?, ported_to_cp = ?
        WHERE number = ?
      `;
      await fromDB.update(updateFromSql, [NumberStatus.PORTED_OUT, toCP, normalized]);

      // Check if number exists in destination CP
      const checkSql = `SELECT COUNT(*) as count FROM numbers WHERE number = ?`;
      const existing = await toDB.queryOne<any>(checkSql, [normalized]);

      if (!existing || existing.count === 0) {
        // Get number range
        const rangeSql = `SELECT number_range FROM numbers WHERE number = ?`;
        const rangeResult = await fromDB.queryOne<any>(rangeSql, [normalized]);

        // Insert into destination CP
        const insertSql = `
          INSERT INTO numbers (number, number_range, status, ported_from_cp)
          VALUES (?, ?, ?, ?)
        `;
        await toDB.insert(insertSql, [
          normalized,
          rangeResult?.number_range || normalized.slice(0, -2) + 'XX',
          NumberStatus.PORTED_IN,
          cpId
        ]);
      } else {
        // Update existing record
        const updateToSql = `
          UPDATE numbers
          SET status = ?, ported_from_cp = ?
          WHERE number = ?
        `;
        await toDB.update(updateToSql, [NumberStatus.PORTED_IN, cpId, normalized]);
      }

      // Log porting event in both CPs
      const historySql = `
        INSERT INTO porting_history (number, from_cp, to_cp)
        VALUES (?, ?, ?)
      `;
      await fromDB.insert(historySql, [normalized, cpId, toCP]);
      await toDB.insert(historySql, [normalized, cpId, toCP]);

      res.json({
        success: true,
        message: `Number ${normalized} ported from ${cpId} to ${toCP}`,
        number: normalized,
        fromCP: cpId,
        toCP
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: (error as Error).message
      });
    }
  });

  /**
   * GET /api/simulator/cp/:cpId/stats
   * Get statistics for a CP
   */
  router.get('/cp/:cpId/stats', async (req: Request, res: Response) => {
    try {
      const { cpId } = req.params;
      const db = dbManager.getConnection(cpId);

      const sql = `
        SELECT
          COUNT(*) as total_calls,
          SUM(CASE WHEN direction = 'inbound' THEN 1 ELSE 0 END) as inbound_calls,
          SUM(CASE WHEN direction = 'outbound' THEN 1 ELSE 0 END) as outbound_calls,
          SUM(CASE WHEN auth_result = 'verified' THEN 1 ELSE 0 END) as auth_successful,
          SUM(CASE WHEN auth_result = 'failed' THEN 1 ELSE 0 END) as auth_failed,
          SUM(CASE WHEN routing_accepted = TRUE THEN 1 ELSE 0 END) as routing_successful,
          AVG(auth_duration_ms) as avg_auth_duration
        FROM call_records
        WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
      `;

      const stats = await db.queryOne<any>(sql);

      const numbersSql = `
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
          SUM(CASE WHEN status = 'ported_out' THEN 1 ELSE 0 END) as ported_out,
          SUM(CASE WHEN status = 'ported_in' THEN 1 ELSE 0 END) as ported_in
        FROM numbers
      `;

      const numbersStats = await db.queryOne<any>(numbersSql);

      res.json({
        success: true,
        cpId,
        calls: stats,
        numbers: numbersStats
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: (error as Error).message
      });
    }
  });

  // ==========================================================================
  // System-wide
  // ==========================================================================

  /**
   * GET /api/simulator/stats
   * Get overall system statistics
   */
  router.get('/stats', async (req: Request, res: Response) => {
    try {
      const allStats = [];

      for (const cpId of ['CP1-UK-0001', 'CP2-UK-0002', 'CP3-UK-0003']) {
        const db = dbManager.getConnection(cpId);

        const sql = `
          SELECT
            ? as cp_id,
            COUNT(*) as total_calls,
            SUM(CASE WHEN auth_result = 'verified' THEN 1 ELSE 0 END) as auth_successful
          FROM call_records
          WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
        `;

        const stats = await db.queryOne<any>(sql, [cpId]);
        allStats.push(stats);
      }

      res.json({
        success: true,
        cps: allStats,
        totalCalls: allStats.reduce((sum, s) => sum + (s.total_calls || 0), 0),
        totalAuthSuccessful: allStats.reduce((sum, s) => sum + (s.auth_successful || 0), 0)
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: (error as Error).message
      });
    }
  });

  return router;
}

// ==========================================================================
// Helper Functions
// ==========================================================================

async function getCPConfig(cpId: string): Promise<any> {
  const db = dbManager.getConnection(cpId);
  return await db.queryOne('SELECT * FROM cp_config WHERE cp_id = ?', [cpId]);
}

async function createCallRecord(db: any, data: any): Promise<number> {
  const sql = `
    INSERT INTO call_records (
      call_reference, caller_id, called_id, direction, auth_method
    ) VALUES (?, ?, ?, ?, ?)
  `;

  return await db.insert(sql, [
    data.callReference,
    data.callerID,
    data.calledID,
    data.direction,
    data.authMethod
  ]);
}

async function updateCallRecord(db: any, callReference: string, updates: any): Promise<void> {
  const fields = [];
  const values = [];

  if (updates.authResult) {
    fields.push('auth_result = ?');
    values.push(updates.authResult);
  }
  if (updates.portingChain) {
    fields.push('porting_chain = ?');
    values.push(updates.portingChain);
  }
  if (updates.routingAccepted !== undefined) {
    fields.push('routing_accepted = ?');
    values.push(updates.routingAccepted);
  }
  if (updates.directRoutingFqdn) {
    fields.push('direct_routing_fqdn = ?');
    values.push(updates.directRoutingFqdn);
  }
  if (updates.directRoutingPort) {
    fields.push('direct_routing_port = ?');
    values.push(updates.directRoutingPort);
  }

  if (fields.length === 0) return;

  values.push(callReference);

  const sql = `
    UPDATE call_records
    SET ${fields.join(', ')}
    WHERE call_reference = ?
  `;

  await db.update(sql, values);
}

async function completeCallRecord(db: any, callReference: string): Promise<void> {
  const sql = `
    UPDATE call_records
    SET completed_at = NOW()
    WHERE call_reference = ?
  `;

  await db.update(sql, [callReference]);
}
