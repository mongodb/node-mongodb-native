import { format as f } from 'util';
import { MongoError } from './error';

// Filters for classes
const classFilters: any = {};
let filteredClasses: any = {};
let level: any = null;

// Save the process id
const pid = process.pid;

// current logger
let currentLogger: Logger = null;

/**
 * @callback LoggerCallback
 * @param {string} msg message being logged
 * @param {object} state an object containing more metadata about the logging message
 */
export class Logger {
  className: any;

  /**
   * Creates a new Logger instance
   *
   * @param {string} className The Class name associated with the logging instance
   * @param {object} [options] Optional settings.
   * @param {LoggerCallback} [options.logger=null] Custom logger function;
   * @param {string} [options.loggerLevel=error] Override default global log level.
   */
  constructor(className: string, options?: any) {
    if (!(this instanceof Logger)) return new Logger(className, options);
    options = options || {};

    // Current reference
    this.className = className;

    // Current logger
    if (options.logger) {
      currentLogger = options.logger;
    } else if (currentLogger == null) {
      currentLogger = console.log;
    }

    // Set level of logging, default is error
    if (options.loggerLevel) {
      level = options.loggerLevel || 'error';
    }

    // Add all class names
    if (filteredClasses[this.className] == null) classFilters[this.className] = true;
  }

  /**
   * Log a message at the debug level
   *
   * @function
   * @param {string} message The message to log
   * @param {any} [object] additional meta data to log
   * @returns {void}
   */
  debug(message: string, object?: any): void {
    if (
      this.isDebug() &&
      ((Object.keys(filteredClasses).length > 0 && filteredClasses[this.className]) ||
        (Object.keys(filteredClasses).length === 0 && classFilters[this.className]))
    ) {
      const dateTime = new Date().getTime();
      const msg = f('[%s-%s:%s] %s %s', 'DEBUG', this.className, pid, dateTime, message);
      const state = {
        type: 'debug',
        message,
        className: this.className,
        pid,
        date: dateTime
      } as any;

      if (object) state.meta = object;
      currentLogger(msg, state);
    }
  }

  /**
   * Log a message at the warn level
   *
   * @function
   * @param {string} message The message to log
   * @param {any} [object] additional meta data to log
   * @returns {void}
   */
  warn(message: string, object?: any): void {
    if (
      this.isWarn() &&
      ((Object.keys(filteredClasses).length > 0 && filteredClasses[this.className]) ||
        (Object.keys(filteredClasses).length === 0 && classFilters[this.className]))
    ) {
      const dateTime = new Date().getTime();
      const msg = f('[%s-%s:%s] %s %s', 'WARN', this.className, pid, dateTime, message);
      const state = {
        type: 'warn',
        message,
        className: this.className,
        pid,
        date: dateTime
      } as any;

      if (object) state.meta = object;
      currentLogger(msg, state);
    }
  }

  /**
   * Log a message at the info level
   *
   * @function
   * @param {string} message The message to log
   * @param {any} [object] additional meta data to log
   * @returns {void}
   */
  info(message: string, object?: any): void {
    if (
      this.isInfo() &&
      ((Object.keys(filteredClasses).length > 0 && filteredClasses[this.className]) ||
        (Object.keys(filteredClasses).length === 0 && classFilters[this.className]))
    ) {
      const dateTime = new Date().getTime();
      const msg = f('[%s-%s:%s] %s %s', 'INFO', this.className, pid, dateTime, message);
      const state = {
        type: 'info',
        message,
        className: this.className,
        pid,
        date: dateTime
      } as any;

      if (object) state.meta = object;
      currentLogger(msg, state);
    }
  }

  /**
   * Log a message at the error level
   *
   * @function
   * @param {string} message The message to log
   * @param {any} [object] additional meta data to log
   * @returns {void}
   */
  error(message: string, object?: any): void {
    if (
      this.isError() &&
      ((Object.keys(filteredClasses).length > 0 && filteredClasses[this.className]) ||
        (Object.keys(filteredClasses).length === 0 && classFilters[this.className]))
    ) {
      const dateTime = new Date().getTime();
      const msg = f('[%s-%s:%s] %s %s', 'ERROR', this.className, pid, dateTime, message);
      const state = {
        type: 'error',
        message,
        className: this.className,
        pid,
        date: dateTime
      } as any;

      if (object) state.meta = object;
      currentLogger(msg, state);
    }
  }

  /**
   * Is the logger set at info level
   *
   * @function
   * @returns {boolean}
   */
  isInfo(): boolean {
    return level === 'info' || level === 'debug';
  }

  /**
   * Is the logger set at error level
   *
   * @function
   * @returns {boolean}
   */
  isError(): boolean {
    return level === 'error' || level === 'info' || level === 'debug';
  }

  /**
   * Is the logger set at error level
   *
   * @function
   * @returns {boolean}
   */
  isWarn(): boolean {
    return level === 'error' || level === 'warn' || level === 'info' || level === 'debug';
  }

  /**
   * Is the logger set at debug level
   *
   * @function
   * @returns {boolean}
   */
  isDebug(): boolean {
    return level === 'debug';
  }

  /**
   * Resets the logger to default settings, error and no filtered classes
   *
   * @function
   * @returns {void}
   */
  static reset(): void {
    level = 'error';
    filteredClasses = {};
  }

  /**
   * Get the current logger function
   *
   * @function
   * @returns {LoggerCallback}
   */
  static currentLogger(): any {
    return currentLogger;
  }

  /**
   * Set the current logger function
   *
   * @function
   * @param {LoggerCallback} logger Logger function.
   * @returns {void}
   */
  static setCurrentLogger(logger: any): void {
    if (typeof logger !== 'function') throw new MongoError('current logger must be a function');
    currentLogger = logger;
  }

  /**
   * Set what classes to log.
   *
   * @function
   * @param {string} type The type of filter (currently only class)
   * @param {string[]} values The filters to apply
   * @returns {void}
   */
  static filter(type: string, values: any): void {
    if (type === 'class' && Array.isArray(values)) {
      filteredClasses = {};
      values.forEach((x: any) => {
        filteredClasses[x] = true;
      });
    }
  }

  /**
   * Set the current log level
   *
   * @function
   * @param {string} _level Set current log level (debug, info, error)
   * @returns {void}
   */
  static setLevel(_level: string): void {
    if (_level !== 'info' && _level !== 'error' && _level !== 'debug' && _level !== 'warn') {
      throw new Error(f('%s is an illegal logging level', _level));
    }

    level = _level;
  }
}
