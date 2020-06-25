'use strict';

const { format: f } = require('util');
const { MongoError } = require('./error');

// Filters for classes
let classFilters = {};
let filteredClasses = {};
let level = null;
// Save the process id
const pid = process.pid;
// current logger
let currentLogger = null;

/**
 * @callback LoggerCallback
 * @param {string} msg message being logged
 * @param {object} state an object containing more metadata about the logging message
 */

class Logger {
  /**
   * Creates a new Logger instance
   *
   * @param {string} className The Class name associated with the logging instance
   * @param {object} [options] Optional settings.
   * @param {LoggerCallback} [options.logger=null] Custom logger function;
   * @param {string} [options.loggerLevel=error] Override default global log level.
   */
  constructor(className, options) {
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
  debug(message, object) {
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
      };
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
  warn(message, object) {
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
      };
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
  info(message, object) {
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
      };
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
  error(message, object) {
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
      };
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
  isInfo() {
    return level === 'info' || level === 'debug';
  }

  /**
   * Is the logger set at error level
   *
   * @function
   * @returns {boolean}
   */
  isError() {
    return level === 'error' || level === 'info' || level === 'debug';
  }

  /**
   * Is the logger set at error level
   *
   * @function
   * @returns {boolean}
   */
  isWarn() {
    return level === 'error' || level === 'warn' || level === 'info' || level === 'debug';
  }

  /**
   * Is the logger set at debug level
   *
   * @function
   * @returns {boolean}
   */
  isDebug() {
    return level === 'debug';
  }

  /**
   * Resets the logger to default settings, error and no filtered classes
   *
   * @function
   * @returns {void}
   */
  static reset() {
    level = 'error';
    filteredClasses = {};
  }

  /**
   * Get the current logger function
   *
   * @function
   * @returns {LoggerCallback}
   */
  static currentLogger() {
    return currentLogger;
  }

  /**
   * Set the current logger function
   *
   * @function
   * @param {LoggerCallback} logger Logger function.
   * @returns {void}
   */
  static setCurrentLogger(logger) {
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
  static filter(type, values) {
    if (type === 'class' && Array.isArray(values)) {
      filteredClasses = {};

      values.forEach(x => {
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
  static setLevel(_level) {
    if (_level !== 'info' && _level !== 'error' && _level !== 'debug' && _level !== 'warn') {
      throw new Error(f('%s is an illegal logging level', _level));
    }

    level = _level;
  }
}

module.exports = Logger;
