/**
 * Structured System Logger
 * 
 * Provides consistent, timestamped console logging with log-level segregation.
 * Adheres to SRP by handling formatting and output of application events.
 */

const LogLevel = {
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR',
  DEBUG: 'DEBUG'
};

class Logger {
  constructor(context = 'App') {
    this.context = context;
  }

  _format(level, message) {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${level}] [${this.context}]: ${message}`;
  }

  info(message, ...args) {
    console.log(this._format(LogLevel.INFO, message), ...args);
  }

  warn(message, ...args) {
    console.warn(this._format(LogLevel.WARN, message), ...args);
  }

  error(message, error) {
    console.error(this._format(LogLevel.ERROR, message));
    if (error) {
      if (error.stack) {
        console.error(error.stack);
      } else {
        console.error(error);
      }
    }
  }

  debug(message, ...args) {
    if (process.env.DEBUG === 'true') {
      console.debug(this._format(LogLevel.DEBUG, message), ...args);
    }
  }

  createChild(context) {
    return new Logger(`${this.context}:${context}`);
  }
}

module.exports = new Logger();

