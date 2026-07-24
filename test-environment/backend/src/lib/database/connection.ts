/**
 * Database Connection Manager
 *
 * Manages MySQL connections for each CP database
 */

import mysql from 'mysql2/promise';
import { DatabaseConfig } from '../core/types';

export class DatabaseConnection {
  private pool: mysql.Pool;
  private cpId: string;

  constructor(cpId: string, config: DatabaseConfig) {
    this.cpId = cpId;
    this.pool = mysql.createPool({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0
    });
  }

  /**
   * Execute a query
   */
  async query<T = any>(sql: string, params?: any[]): Promise<T[]> {
    try {
      const [rows] = await this.pool.execute(sql, params);
      return rows as T[];
    } catch (error) {
      console.error(`[${this.cpId}] Database query error:`, error);
      throw error;
    }
  }

  /**
   * Execute a single query and return first result
   */
  async queryOne<T = any>(sql: string, params?: any[]): Promise<T | null> {
    const results = await this.query<T>(sql, params);
    return results.length > 0 ? results[0] : null;
  }

  /**
   * Insert a record and return the insert ID
   */
  async insert(sql: string, params?: any[]): Promise<number> {
    try {
      const [result] = await this.pool.execute(sql, params);
      return (result as any).insertId;
    } catch (error) {
      console.error(`[${this.cpId}] Database insert error:`, error);
      throw error;
    }
  }

  /**
   * Update records and return affected rows
   */
  async update(sql: string, params?: any[]): Promise<number> {
    try {
      const [result] = await this.pool.execute(sql, params);
      return (result as any).affectedRows;
    } catch (error) {
      console.error(`[${this.cpId}] Database update error:`, error);
      throw error;
    }
  }

  /**
   * Begin a transaction
   */
  async beginTransaction(): Promise<mysql.PoolConnection> {
    const connection = await this.pool.getConnection();
    await connection.beginTransaction();
    return connection;
  }

  /**
   * Commit a transaction
   */
  async commit(connection: mysql.PoolConnection): Promise<void> {
    await connection.commit();
    connection.release();
  }

  /**
   * Rollback a transaction
   */
  async rollback(connection: mysql.PoolConnection): Promise<void> {
    await connection.rollback();
    connection.release();
  }

  /**
   * Test the database connection
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.pool.query('SELECT 1');
      console.log(`[${this.cpId}] Database connection successful`);
      return true;
    } catch (error) {
      console.error(`[${this.cpId}] Database connection failed:`, error);
      return false;
    }
  }

  /**
   * Close the connection pool
   */
  async close(): Promise<void> {
    await this.pool.end();
    console.log(`[${this.cpId}] Database connection closed`);
  }

  /**
   * Get the connection pool (for advanced usage)
   */
  getPool(): mysql.Pool {
    return this.pool;
  }
}

/**
 * Database Connection Manager for all CPs
 */
export class DatabaseManager {
  private connections: Map<string, DatabaseConnection> = new Map();

  /**
   * Register a CP database connection
   */
  registerCP(cpId: string, config: DatabaseConfig): DatabaseConnection {
    const connection = new DatabaseConnection(cpId, config);
    this.connections.set(cpId, connection);
    return connection;
  }

  /**
   * Get a CP's database connection
   */
  getConnection(cpId: string): DatabaseConnection {
    const connection = this.connections.get(cpId);
    if (!connection) {
      throw new Error(`No database connection found for CP: ${cpId}`);
    }
    return connection;
  }

  /**
   * Test all database connections
   */
  async testAllConnections(): Promise<void> {
    const results = await Promise.all(
      Array.from(this.connections.entries()).map(async ([cpId, conn]) => {
        const success = await conn.testConnection();
        return { cpId, success };
      })
    );

    const failed = results.filter(r => !r.success);
    if (failed.length > 0) {
      throw new Error(
        `Database connection failed for: ${failed.map(f => f.cpId).join(', ')}`
      );
    }

    console.log('All database connections successful');
  }

  /**
   * Close all database connections
   */
  async closeAll(): Promise<void> {
    await Promise.all(
      Array.from(this.connections.values()).map(conn => conn.close())
    );
    this.connections.clear();
  }
}

// Global database manager instance
export const dbManager = new DatabaseManager();
