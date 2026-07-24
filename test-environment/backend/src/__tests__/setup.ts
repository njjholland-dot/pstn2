/**
 * Jest Test Setup
 *
 * Global test configuration and setup
 */

// Set test timeout
jest.setTimeout(10000);

// Mock environment variables for testing
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '3306';
process.env.DB_USER = 'PSTN2_User';
process.env.DB_PASSWORD = 'PSTN2_Pass_2024!';
process.env.DB_NAME = 'PSTN2';
process.env.NODE_ENV = 'test';

// Suppress console.log during tests (optional)
// global.console = {
//   ...console,
//   log: jest.fn(),
// };
