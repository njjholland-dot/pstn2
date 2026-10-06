/**
 * Minimal, dependency-free logger.
 *
 * The SDK logs through a single shared logger. The default level is `warn`
 * so library output never drowns out the host application; set
 * `logLevel: 'info' | 'debug'` on the client (or PSTN2_LOG_LEVEL in the
 * examples) to see protocol traffic, or `'silent'` to turn it off.
 * A custom sink can be installed with `setLogSink()` (e.g. to forward to
 * pino/winston in your application).
 */

export type LogLevel = 'silent' | 'error' | 'warn' | 'info' | 'debug';

const ORDER: Record<LogLevel, number> = { silent: 0, error: 1, warn: 2, info: 3, debug: 4 };

export type LogSink = (level: Exclude<LogLevel, 'silent'>, message: string, meta?: Record<string, unknown>) => void;

const defaultSink: LogSink = (level, message, meta) => {
  const line = `${new Date().toISOString()} [pstn2 ${level}] ${message}${
    meta && Object.keys(meta).length ? ' ' + JSON.stringify(meta) : ''
  }`;
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
};

export class Logger {
  private level: LogLevel;
  private sink: LogSink = defaultSink;

  constructor(level: LogLevel = 'warn') {
    this.level = level;
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  getLevel(): LogLevel {
    return this.level;
  }

  setSink(sink: LogSink | undefined): void {
    this.sink = sink || defaultSink;
  }

  private log(level: Exclude<LogLevel, 'silent'>, message: string, meta?: Record<string, unknown>): void {
    if (ORDER[level] <= ORDER[this.level]) this.sink(level, message, meta);
  }

  error(message: string, meta?: Record<string, unknown>): void {
    this.log('error', message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.log('warn', message, meta);
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.log('info', message, meta);
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.log('debug', message, meta);
  }
}

const shared = new Logger((process.env.PSTN2_LOG_LEVEL as LogLevel) in ORDER ? (process.env.PSTN2_LOG_LEVEL as LogLevel) : 'warn');

/** The shared SDK logger. Passing a level changes it for every module. */
export function getLogger(level?: LogLevel): Logger {
  if (level) shared.setLevel(level);
  return shared;
}

/** Install a custom log sink (or `undefined` to restore console output). */
export function setLogSink(sink: LogSink | undefined): void {
  shared.setSink(sink);
}

export default Logger;
