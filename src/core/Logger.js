/**
 * PRIVISEE-X v2.0
 * Core: Structured Logger
 * 
 * Provides consistent logging levels, timestamps, and context.
 * Can be extended to persist logs to storage or export them.
 */

export const LogLevel = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  NONE: 4
};

export class Logger {
  constructor(context, minLevel = LogLevel.INFO) {
    this.context = context;
    this.minLevel = minLevel;
  }

  /**
   * Create a child logger with additional context
   * @param {string} subContext 
   */
  child(subContext) {
    return new Logger(`${this.context}:${subContext}`, this.minLevel);
  }

  debug(message, ...args) {
    this._log(LogLevel.DEBUG, message, args);
  }

  info(message, ...args) {
    this._log(LogLevel.INFO, message, args);
  }

  warn(message, ...args) {
    this._log(LogLevel.WARN, message, args);
  }

  error(message, ...args) {
    this._log(LogLevel.ERROR, message, args);
  }

  _log(level, message, args) {
    if (level < this.minLevel) return;

    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${this.levelName(level)}] [${this.context}]`;

    switch (level) {
      case LogLevel.DEBUG:
        console.debug(prefix, message, ...args);
        break;
      case LogLevel.INFO:
        console.info(prefix, message, ...args);
        break;
      case LogLevel.WARN:
        console.warn(prefix, message, ...args);
        break;
      case LogLevel.ERROR:
        console.error(prefix, message, ...args);
        break;
    }
  }

  levelName(level) {
    return Object.keys(LogLevel).find(key => LogLevel[key] === level) || 'UNKNOWN';
  }
}

// Factory for getting loggers
export const createLogger = (context) => new Logger(context);
