"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Logger = exports.LoggerLevel = void 0;
const util_1 = require("util");
const error_1 = require("./error");
const utils_1 = require("./utils");
// Filters for classes
const classFilters = {};
let filteredClasses = {};
let level;
// Save the process id
const pid = process.pid;
// current logger
// eslint-disable-next-line no-console
let currentLogger = console.warn;
/** @public */
exports.LoggerLevel = Object.freeze({
    ERROR: 'error',
    WARN: 'warn',
    INFO: 'info',
    DEBUG: 'debug',
    error: 'error',
    warn: 'warn',
    info: 'info',
    debug: 'debug'
});
/**
 * @public
 */
class Logger {
    /**
     * Creates a new Logger instance
     *
     * @param className - The Class name associated with the logging instance
     * @param options - Optional logging settings
     */
    constructor(className, options) {
        options = options !== null && options !== void 0 ? options : {};
        // Current reference
        this.className = className;
        // Current logger
        if (!(options.logger instanceof Logger) && typeof options.logger === 'function') {
            currentLogger = options.logger;
        }
        // Set level of logging, default is error
        if (options.loggerLevel) {
            level = options.loggerLevel || exports.LoggerLevel.ERROR;
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
    debug(message, object) {
        if (this.isDebug() &&
            ((Object.keys(filteredClasses).length > 0 && filteredClasses[this.className]) ||
                (Object.keys(filteredClasses).length === 0 && classFilters[this.className]))) {
            const dateTime = new Date().getTime();
            const msg = (0, util_1.format)('[%s-%s:%s] %s %s', 'DEBUG', this.className, pid, dateTime, message);
            const state = {
                type: exports.LoggerLevel.DEBUG,
                message,
                className: this.className,
                pid,
                date: dateTime
            };
            if (object)
                state.meta = object;
            currentLogger(msg, state);
        }
    }
    /**
     * Log a message at the warn level
     *
     * @param message - The message to log
     * @param object - Additional meta data to log
     */
    warn(message, object) {
        if (this.isWarn() &&
            ((Object.keys(filteredClasses).length > 0 && filteredClasses[this.className]) ||
                (Object.keys(filteredClasses).length === 0 && classFilters[this.className]))) {
            const dateTime = new Date().getTime();
            const msg = (0, util_1.format)('[%s-%s:%s] %s %s', 'WARN', this.className, pid, dateTime, message);
            const state = {
                type: exports.LoggerLevel.WARN,
                message,
                className: this.className,
                pid,
                date: dateTime
            };
            if (object)
                state.meta = object;
            currentLogger(msg, state);
        }
    }
    /**
     * Log a message at the info level
     *
     * @param message - The message to log
     * @param object - Additional meta data to log
     */
    info(message, object) {
        if (this.isInfo() &&
            ((Object.keys(filteredClasses).length > 0 && filteredClasses[this.className]) ||
                (Object.keys(filteredClasses).length === 0 && classFilters[this.className]))) {
            const dateTime = new Date().getTime();
            const msg = (0, util_1.format)('[%s-%s:%s] %s %s', 'INFO', this.className, pid, dateTime, message);
            const state = {
                type: exports.LoggerLevel.INFO,
                message,
                className: this.className,
                pid,
                date: dateTime
            };
            if (object)
                state.meta = object;
            currentLogger(msg, state);
        }
    }
    /**
     * Log a message at the error level
     *
     * @param message - The message to log
     * @param object - Additional meta data to log
     */
    error(message, object) {
        if (this.isError() &&
            ((Object.keys(filteredClasses).length > 0 && filteredClasses[this.className]) ||
                (Object.keys(filteredClasses).length === 0 && classFilters[this.className]))) {
            const dateTime = new Date().getTime();
            const msg = (0, util_1.format)('[%s-%s:%s] %s %s', 'ERROR', this.className, pid, dateTime, message);
            const state = {
                type: exports.LoggerLevel.ERROR,
                message,
                className: this.className,
                pid,
                date: dateTime
            };
            if (object)
                state.meta = object;
            currentLogger(msg, state);
        }
    }
    /** Is the logger set at info level */
    isInfo() {
        return level === exports.LoggerLevel.INFO || level === exports.LoggerLevel.DEBUG;
    }
    /** Is the logger set at error level */
    isError() {
        return level === exports.LoggerLevel.ERROR || level === exports.LoggerLevel.INFO || level === exports.LoggerLevel.DEBUG;
    }
    /** Is the logger set at error level */
    isWarn() {
        return (level === exports.LoggerLevel.ERROR ||
            level === exports.LoggerLevel.WARN ||
            level === exports.LoggerLevel.INFO ||
            level === exports.LoggerLevel.DEBUG);
    }
    /** Is the logger set at debug level */
    isDebug() {
        return level === exports.LoggerLevel.DEBUG;
    }
    /** Resets the logger to default settings, error and no filtered classes */
    static reset() {
        level = exports.LoggerLevel.ERROR;
        filteredClasses = {};
    }
    /** Get the current logger function */
    static currentLogger() {
        return currentLogger;
    }
    /**
     * Set the current logger function
     *
     * @param logger - Custom logging function
     */
    static setCurrentLogger(logger) {
        if (typeof logger !== 'function') {
            throw new error_1.MongoInvalidArgumentError('Current logger must be a function');
        }
        currentLogger = logger;
    }
    /**
     * Filter log messages for a particular class
     *
     * @param type - The type of filter (currently only class)
     * @param values - The filters to apply
     */
    static filter(type, values) {
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
    static setLevel(newLevel) {
        if (newLevel !== exports.LoggerLevel.INFO &&
            newLevel !== exports.LoggerLevel.ERROR &&
            newLevel !== exports.LoggerLevel.DEBUG &&
            newLevel !== exports.LoggerLevel.WARN) {
            throw new error_1.MongoInvalidArgumentError(`Argument "newLevel" should be one of ${(0, utils_1.enumToString)(exports.LoggerLevel)}`);
        }
        level = newLevel;
    }
}
exports.Logger = Logger;
//# sourceMappingURL=logger.js.map