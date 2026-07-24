/**
 * PSTN2 Test Harness - Main Server
 *
 * Initializes and runs all CP APIs and simulator
 */

import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { dbManager } from './lib/database/connection';
import { getCPDatabaseConfig } from './lib/core/utils';

// Load environment variables
dotenv.config();

// Import route handlers (will be created next)
import { createCPRoutes } from './api/cp-routes';
import { createSimulatorRoutes } from './api/simulator-routes';

// ============================================================================
// Server Configuration
// ============================================================================

interface CPConfig {
  cpId: string;
  port: number;
  app: Application;
}

const CPS: CPConfig[] = [
  { cpId: 'CP1-UK-0001', port: parseInt(process.env.CP1_API_PORT || '3001', 10), app: express() },
  { cpId: 'CP2-UK-0002', port: parseInt(process.env.CP2_API_PORT || '3002', 10), app: express() },
  { cpId: 'CP3-UK-0003', port: parseInt(process.env.CP3_API_PORT || '3003', 10), app: express() }
];

const SIMULATOR_PORT = parseInt(process.env.SIMULATOR_PORT || '3000', 10);
const simulatorApp = express();

// ============================================================================
// Middleware Setup
// ============================================================================

function setupMiddleware(app: Application, name: string) {
  // CORS
  app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Message-ID', 'X-From-CP', 'X-To-CP']
  }));

  // Body parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Request logging
  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      console.log(
        `[${name}] ${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`
      );
    });
    next();
  });

  // Health check
  app.get('/health', (req: Request, res: Response) => {
    res.json({
      status: 'healthy',
      service: name,
      timestamp: new Date().toISOString()
    });
  });
}

// ============================================================================
// Error Handler
// ============================================================================

function setupErrorHandler(app: Application) {
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    console.error(`Error:`, err);

    const statusCode = err.statusCode || 500;
    const errorCode = err.code || 'INTERNAL_ERROR';

    res.status(statusCode).json({
      success: false,
      error: {
        code: errorCode,
        message: err.message || 'Internal server error',
        details: err.details
      },
      timestamp: new Date().toISOString()
    });
  });
}

// ============================================================================
// Database Initialization
// ============================================================================

async function initializeDatabases() {
  console.log('Initializing database connections...');

  for (const cp of CPS) {
    const config = getCPDatabaseConfig(cp.cpId);
    dbManager.registerCP(cp.cpId, config);
    console.log(`✓ Registered database for ${cp.cpId}`);
  }

  // Test all connections
  await dbManager.testAllConnections();
  console.log('✓ All database connections successful\n');
}

// ============================================================================
// Server Initialization
// ============================================================================

async function initializeServers() {
  console.log('Initializing servers...\n');

  // Initialize CP servers
  for (const cp of CPS) {
    console.log(`Initializing ${cp.cpId}...`);

    setupMiddleware(cp.app, cp.cpId);

    // Register CP routes
    cp.app.use('/pstn2/v1', await createCPRoutes(cp.cpId));

    setupErrorHandler(cp.app);

    console.log(`✓ ${cp.cpId} ready on port ${cp.port}\n`);
  }

  // Initialize simulator server
  console.log('Initializing Simulator...');

  setupMiddleware(simulatorApp, 'Simulator');

  // Register simulator routes
  simulatorApp.use('/api', await createSimulatorRoutes());

  setupErrorHandler(simulatorApp);

  console.log(`✓ Simulator ready on port ${SIMULATOR_PORT}\n`);
}

// ============================================================================
// Server Startup
// ============================================================================

async function startServers() {
  // Start CP servers
  for (const cp of CPS) {
    cp.app.listen(cp.port, () => {
      console.log(`🚀 ${cp.cpId} API listening on http://localhost:${cp.port}`);
    });
  }

  // Start simulator server
  simulatorApp.listen(SIMULATOR_PORT, () => {
    console.log(`🚀 Simulator API listening on http://localhost:${SIMULATOR_PORT}`);
  });

  console.log('\n' + '='.repeat(60));
  console.log('PSTN2 Test Harness Running');
  console.log('='.repeat(60));
  console.log(`CP1 API:    http://localhost:${CPS[0].port}`);
  console.log(`CP2 API:    http://localhost:${CPS[1].port}`);
  console.log(`CP3 API:    http://localhost:${CPS[2].port}`);
  console.log(`Simulator:  http://localhost:${SIMULATOR_PORT}`);
  console.log('='.repeat(60) + '\n');
}

// ============================================================================
// Graceful Shutdown
// ============================================================================

async function gracefulShutdown() {
  console.log('\nShutting down gracefully...');

  try {
    await dbManager.closeAll();
    console.log('✓ Database connections closed');

    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// ============================================================================
// Main Entry Point
// ============================================================================

async function main() {
  try {
    console.log('\n' + '='.repeat(60));
    console.log('PSTN2 Test Harness - Starting Up');
    console.log('='.repeat(60) + '\n');

    await initializeDatabases();
    await initializeServers();
    await startServers();

  } catch (error) {
    console.error('Fatal error during startup:', error);
    process.exit(1);
  }
}

// Start the server
main();

// Export for testing
export { simulatorApp, CPS };
