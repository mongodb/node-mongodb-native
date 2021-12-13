import { format } from 'util';

import { MongoInvalidArgumentError } from './error';
import { enumToString } from './utils';

// Filters for classes
const classFilters: any = {};
let filteredClasses: any = {};
let level: LoggerLevel;

// Save the process id
const pid = process.pid;

// current logger
// eslint-disable-next-line no-console
let currentLogger: LoggerFunction = console.warn;

/** @public */
export const LoggerLevel = Object.freeze({
  ERROR: 'error',
  WARN: 'warn',
  INFO: 'info',
  DEBUG: 'debug',
  error: 'error',
  warn: 'warn',
  info: 'info',
  debug: 'debug'
} as const);

/** @public */
export type LoggerLevel = typeof LoggerLevel[keyof typeof LoggerLevel];

/** @public */
export type LoggerFunction = (message?: any, ...optionalParams: any[]) => void;

/** @public */
export interface LoggerOptions {
  logger?: LoggerFunction;
  loggerLevel?: LoggerLevel;
}

/**
 * @public
 */
export class Logger {
  className: string;

  /**
   * Creates a new Logger instance
   *
   * @param className - The Class name associated with the logging instance
   * @param options - Optional logging settings
   */
  constructor(className: string, options?: LoggerOptions) {
    options = options ?? {};

    // Current reference
    this.className = className;

    // Current logger
    if (!(options.logger instanceof Logger) && typeof options.logger === 'function') {
      currentLogger = options.logger;
    }

    // Set level of logging, default is error
    if (options.loggerLevel) {
      level = options.loggerLevel || LoggerLevel.ERROR;
    }

    // Add all class names
    if (filteredClasses[this.className] == null) {
      classFilters[this.className] = true;
    }
  }

  /**
   * Log a message at the debug level
   *
   * @param message - The message to log
   * @param object - Additional meta data to log
   */
  debug(message: string, object?: unknown): void {
    if (
      this.isDebug() &&
      ((Object.keys(filteredClasses).length > 0 && filteredClasses[this.className]) ||
        (Object.keys(filteredClasses).length === 0 && classFilters[this.className]))
    ) {
      const dateTime = new Date().getTime();
      const msg = format('[%s-%s:%s] %s %s', 'DEBUG', this.className, pid, dateTime, message);
      const state = {
        type: LoggerLevel.DEBUG,
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
   * @param message - The message to log
   * @param object - Additional meta data to log
   */
  warn(message: string, object?: unknown): void {
    if (
      this.isWarn() &&
      ((Object.keys(filteredClasses).length > 0 && filteredClasses[this.className]) ||
        (Object.keys(filteredClasses).length === 0 && classFilters[this.className]))
    ) {
      const dateTime = new Date().getTime();
      const msg = format('[%s-%s:%s] %s %s', 'WARN', this.className, pid, dateTime, message);
      const state = {
        type: LoggerLevel.WARN,
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
   * @param message - The message to log
   * @param object - Additional meta data to log
   */
  info(message: string, object?: unknown): void {
    if (
      this.isInfo() &&
      ((Object.keys(filteredClasses).length > 0 && filteredClasses[this.className]) ||
        (Object.keys(filteredClasses).length === 0 && classFilters[this.className]))
    ) {
      const dateTime = new Date().getTime();
      const msg = format('[%s-%s:%s] %s %s', 'INFO', this.className, pid, dateTime, message);
      const state = {
        type: LoggerLevel.INFO,
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
   * @param message - The message to log
   * @param object - Additional meta data to log
   */
  error(message: string, object?: unknown): void {
    if (
      this.isError() &&
      ((Object.keys(filteredClasses).length > 0 && filteredClasses[this.className]) ||
        (Object.keys(filteredClasses).length === 0 && classFilters[this.className]))
    ) {
      const dateTime = new Date().getTime();
      const msg = format('[%s-%s:%s] %s %s', 'ERROR', this.className, pid, dateTime, message);
      const state = {
        type: LoggerLevel.ERROR,
        message,
        className: this.className,
        pid,
        date: dateTime
      } as any;

      if (object) state.meta = object;
      currentLogger(msg, state);
    }
  }

  /** Is the logger set at info level */
  isInfo(): boolean {
    return level === LoggerLevel.INFO || level === LoggerLevel.DEBUG;
  }

  /** Is the logger set at error level */
  isError(): boolean {
    return level === LoggerLevel.ERROR || level === LoggerLevel.INFO || level === LoggerLevel.DEBUG;
  }

  /** Is the logger set at error level */
  isWarn(): boolean {
    return (
      level === LoggerLevel.ERROR ||
      level === LoggerLevel.WARN ||
      level === LoggerLevel.INFO ||
      level === LoggerLevel.DEBUG
    );
  }

  /** Is the logger set at debug level */
  isDebug(): boolean {
    return level === LoggerLevel.DEBUG;
  }

  /** Resets the logger to default settings, error and no filtered classes */
  static reset(): void {
    level = LoggerLevel.ERROR;
    filteredClasses = {};
  }

  /** Get the current logger function */
  static currentLogger(): LoggerFunction {
    return currentLogger;
  }

  /**
   * Set the current logger function
   *
   * @param logger - Custom logging function
   */
  static setCurrentLogger(logger: LoggerFunction): void {
    if (typeof logger !== 'function') {
      throw new MongoInvalidArgumentError('Current logger must be a function');
    }

    currentLogger = logger;
  }

  /**
   * Filter log messages for a particular class
   *
   * @param type - The type of filter (currently only class)
   * @param values - The filters to apply
   */
  static filter(type: string, values: string[]): void {
    if (type === 'class' && Array.isArray(values)) {
      filteredClasses = {};
      values.forEach(x => (filteredClasses[x] = true));
    }
  }

  /**
   * Set the current log level
   *
   * @param newLevel - Set current log level (debug, warn, info, error)
   */
  static setLevel(newLevel: LoggerLevel): void {
    if (
      newLevel !== LoggerLevel.INFO &&
      newLevel !== LoggerLevel.ERROR &&
      newLevel !== LoggerLevel.DEBUG &&
      newLevel !== LoggerLevel.WARN
    ) {
      throw new MongoInvalidArgumentError(
        `Argument "newLevel" should be one of ${enumToString(LoggerLevel)}`
      );
    }

    level = newLevel;
  }
}
