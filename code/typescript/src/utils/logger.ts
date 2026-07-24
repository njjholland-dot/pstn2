/**
 * Logger utility using Winston
 */

import winston from 'winston';

type LogLevel = 'error' | 'warn' | 'info' | 'debug';

class Logger {
  private logger: winston.Logger;

  constructor(level: LogLevel = 'info') {
    this.logger = winston.createLogger({
      level,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      defaultMeta: { service: 'pstn2' },
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.printf(({ level, message, timestamp, ...meta }) => {
              const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
              return `${timestamp} [${level}]: ${message} ${metaStr}`;
            })
          ),
        }),
      ],
    });
  }

  setLevel(level: LogLevel): void {
    this.logger.level = level;
  }

  error(message: string, meta?: Record<string, unknown>): void {
    this.logger.error(message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.logger.warn(message, meta);
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.logger.info(message, meta);
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.logger.debug(message, meta);
  }
}

// Singleton instance
let loggerInstance: Logger | null = null;

export function getLogger(level?: LogLevel): Logger {
  if (!loggerInstance) {
    loggerInstance = new Logger(level);
  } else if (level) {
    loggerInstance.setLevel(level);
  }
  return loggerInstance;
}

export default Logger;
