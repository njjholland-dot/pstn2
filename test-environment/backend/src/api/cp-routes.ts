/**
 * PSTN2 CP API Routes
 *
 * Implements all PSTN2 protocol endpoints for each CP
 */

import { Router, Request, Response } from 'express';
import { dbManager } from '../lib/database/connection';
import { AuthenticationService } from '../lib/core/authentication';
import { DirectoryService } from '../lib/core/directory';
import { RoutingService } from '../lib/core/routing';
import { MessagingService } from '../lib/core/messaging';
import {
  AuthenticationRequest,
  RoutingRequest,
  DirectoryQueryRequest,
  TokenCreateRequest,
  TokenVerifyRequest,
  NumberStatus
} from '../lib/core/types';
import { getCPEndpoint } from '../lib/core/utils';

/**
 * Create routes for a specific CP
 */
export async function createCPRoutes(cpId: string): Promise<Router> {
  const router = Router();
  const db = dbManager.getConnection(cpId);

  // Get CP configuration from database
  const configRow = await db.queryOne<any>(
    'SELECT * FROM cp_config WHERE cp_id = ?',
    [cpId]
  );

  if (!configRow) {
    throw new Error(`No configuration found for ${cpId}`);
  }

  const config = {
    cpId: configRow.cp_id,
    apiEndpoint: configRow.api_endpoint,
    publicKey: configRow.public_key,
    privateKey: configRow.private_key,
    authMode: configRow.auth_mode as 'direct_query' | 'token_pool',
    cacheTTLSeconds: configRow.cache_ttl_seconds,
    requestTimeoutMs: configRow.request_timeout_ms,
    maxRetries: configRow.max_retries
  };

  // Initialize services
  const messaging = new MessagingService(
    cpId,
    db,
    config.requestTimeoutMs,
    config.maxRetries
  );

  const directory = new DirectoryService(
    cpId,
    db,
    messaging,
    config.apiEndpoint,
    config.cacheTTLSeconds
  );

  const authentication = new AuthenticationService(
    cpId,
    db,
    messaging,
    config.authMode
  );

  const routing = new RoutingService(
    cpId,
    db,
    messaging,
    directory,
    config.apiEndpoint,
    config.publicKey,
    true, // enableDirectRouting
    true  // enableEncryption
  );

  // ==========================================================================
  // Authentication Endpoints
  // ==========================================================================

  /**
   * POST /pstn2/v1/auth/verify
   * Verify an inbound call (Direct Query mode)
   */
  router.post('/auth/verify', async (req: Request, res: Response) => {
    try {
      const request: AuthenticationRequest = req.body;

      // Log incoming message
      await messaging.logIncomingMessage(
        'auth_request' as any,
        req.headers['x-from-cp'] as string || 'unknown',
        request,
        request.callReference
      );

      // Respond to authentication query
      const response = await authentication.respondToAuthQuery(request);

      res.json(response);
    } catch (error) {
      res.status(500).json({
        verified: false,
        errorCode: 'AUTHENTICATION_ERROR',
        errorMessage: (error as Error).message
      });
    }
  });

  /**
   * POST /pstn2/v1/auth/token/create
   * Create an authentication token (Token Pool mode)
   */
  router.post('/auth/token/create', async (req: Request, res: Response) => {
    try {
      const request: TokenCreateRequest = req.body;

      const response = await authentication.createToken(request);

      res.json(response);
    } catch (error) {
      res.status(500).json({
        error: 'TOKEN_CREATE_ERROR',
        message: (error as Error).message
      });
    }
  });

  /**
   * POST /pstn2/v1/auth/token/verify
   * Verify an authentication token (Token Pool mode)
   */
  router.post('/auth/token/verify', async (req: Request, res: Response) => {
    try {
      const request: TokenVerifyRequest = req.body;

      const response = await authentication.verifyToken(request);

      res.json(response);
    } catch (error) {
      res.status(500).json({
        valid: false,
        errorMessage: (error as Error).message
      });
    }
  });

  // ==========================================================================
  // Routing Endpoints
  // ==========================================================================

  /**
   * POST /pstn2/v1/routing/request
   * Handle inbound routing request
   */
  router.post('/routing/request', async (req: Request, res: Response) => {
    try {
      const request: RoutingRequest = req.body;

      // Log incoming message
      await messaging.logIncomingMessage(
        'routing_request' as any,
        req.headers['x-from-cp'] as string || 'unknown',
        request,
        request.callReference
      );

      // Accept or reject routing
      const response = await routing.acceptRouting(request);

      res.json(response);
    } catch (error) {
      res.status(500).json({
        accepted: false,
        rejectionReason: (error as Error).message
      });
    }
  });

  // ==========================================================================
  // Directory Endpoints
  // ==========================================================================

  /**
   * POST /pstn2/v1/directory/query
   * Query if a number belongs to this CP
   */
  router.post('/directory/query', async (req: Request, res: Response) => {
    try {
      const request: DirectoryQueryRequest = req.body;

      const response = await directory.respondToQuery(request);

      res.json(response);
    } catch (error) {
      res.status(500).json({
        found: false,
        error: (error as Error).message
      });
    }
  });

  /**
   * GET /pstn2/v1/directory/all
   * Get all number ranges owned by this CP
   */
  router.get('/directory/all', async (req: Request, res: Response) => {
    try {
      const response = await directory.publishDirectory();

      res.json(response);
    } catch (error) {
      res.status(500).json({
        error: (error as Error).message
      });
    }
  });

  // ==========================================================================
  // Porting Endpoints
  // ==========================================================================

  /**
   * POST /pstn2/v1/porting/query
   * Query porting status of a number
   */
  router.post('/porting/query', async (req: Request, res: Response) => {
    try {
      const { number } = req.body;

      const sql = `
        SELECT status, ported_to_cp, ported_from_cp
        FROM numbers
        WHERE number = ?
      `;

      const result = await db.queryOne<any>(sql, [number]);

      if (!result) {
        return res.json({
          status: 'not_found'
        });
      }

      res.json({
        status: result.status,
        portedToCP: result.ported_to_cp,
        portedFromCP: result.ported_from_cp
      });
    } catch (error) {
      res.status(500).json({
        error: (error as Error).message
      });
    }
  });

  // ==========================================================================
  // Statistics & Info Endpoints
  // ==========================================================================

  /**
   * GET /pstn2/v1/info
   * Get CP information
   */
  router.get('/info', async (req: Request, res: Response) => {
    try {
      const ranges = await directory.getOurRanges();
      const stats = await directory.getDirectoryStats();

      res.json({
        cpId,
        apiEndpoint: config.apiEndpoint,
        authMode: config.authMode,
        numberRanges: ranges,
        directoryStats: stats
      });
    } catch (error) {
      res.status(500).json({
        error: (error as Error).message
      });
    }
  });

  return router;
}
