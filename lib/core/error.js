'use strict';

const MONGODB_ERROR_CODES = require('../error_codes').MONGODB_ERROR_CODES;

const kErrorLabels = Symbol('errorLabels');

/**
 * Creates a new MongoError
 *
 * @augments Error
 * @param {Error|string|object} message The error message
 * @property {string} message The error message
 * @property {string} stack The error call stack
 */
class MongoError extends Error {
  constructor(message) {
    if (message instanceof Error) {
      super(message.message);
      this.stack = message.stack;
    } else {
      if (typeof message === 'string') {
        super(message);
      } else {
        super(message.message || message.errmsg || message.$err || 'n/a');
        if (message.errorLabels) {
          this[kErrorLabels] = new Set(message.errorLabels);
        }

        for (var name in message) {
          if (name === 'errorLabels' || name === 'errmsg') {
            continue;
          }

          this[name] = message[name];
        }
      }

      Error.captureStackTrace(this, this.constructor);
    }

    this.name = 'MongoError';
  }

  /**
   * Legacy name for server error responses
   */
  get errmsg() {
    return this.message;
  }

  /**
   * Creates a new MongoError object
   *
   * @param {Error|string|object} options The options used to create the error.
   * @return {MongoError} A MongoError instance
   * @deprecated Use `new MongoError()` instead.
   */
  static create(options) {
    return new MongoError(options);
  }

  /**
   * Checks the error to see if it has an error label
   * @param {string} label The error label to check for
   * @returns {boolean} returns true if the error has the provided error label
   */
  hasErrorLabel(label) {
    if (this[kErrorLabels] == null) {
      return false;
    }

    return this[kErrorLabels].has(label);
  }

  addErrorLabel(label) {
    if (this[kErrorLabels] == null) {
      this[kErrorLabels] = new Set();
    }

    this[kErrorLabels].add(label);
  }

  get errorLabels() {
    return this[kErrorLabels] ? Array.from(this[kErrorLabels]) : [];
  }
}

const kBeforeHandshake = Symbol('beforeHandshake');
function isNetworkErrorBeforeHandshake(err) {
  return err[kBeforeHandshake] === true;
}

/**
 * An error indicating an issue with the network, including TCP
 * errors and timeouts.
 *
 * @param {Error|string|object} message The error message
 * @property {string} message The error message
 * @property {string} stack The error call stack
 * @extends MongoError
 */
class MongoNetworkError extends MongoError {
  constructor(message, options) {
    super(message);
    this.name = 'MongoNetworkError';

    if (options && typeof options.beforeHandshake === 'boolean') {
      this[kBeforeHandshake] = options.beforeHandshake;
    }
  }
}

/**
 * An error indicating a network timeout occurred
 *
 * @param {Error|string|object} message The error message
 * @property {string} message The error message
 * @property {object} [options.beforeHandshake] Indicates the timeout happened before a connection handshake completed
 * @extends MongoError
 */
class MongoNetworkTimeoutError extends MongoNetworkError {
  constructor(message, options) {
    super(message, options);
    this.name = 'MongoNetworkTimeoutError';
  }
}

/**
 * An error used when attempting to parse a value (like a connection string)
 *
 * @param {Error|string|object} message The error message
 * @property {string} message The error message
 * @extends MongoError
 */
class MongoParseError extends MongoError {
  constructor(message) {
    super(message);
    this.name = 'MongoParseError';
  }
}

/**
 * An error signifying a client-side timeout event
 *
 * @param {Error|string|object} message The error message
 * @param {string|object} [reason] The reason the timeout occured
 * @property {string} message The error message
 * @property {string} [reason] An optional reason context for the timeout, generally an error saved during flow of monitoring and selecting servers
 * @extends MongoError
 */
class MongoTimeoutError extends MongoError {
  constructor(message, reason) {
    if (reason && reason.error) {
      super(reason.error.message || reason.error);
    } else {
      super(message);
    }

    this.name = 'MongoTimeoutError';
    if (reason) {
      this.reason = reason;
    }
  }
}

/**
 * An error signifying a client-side server selection error
 *
 * @param {Error|string|object} message The error message
 * @param {string|object} [reason] The reason the timeout occured
 * @property {string} message The error message
 * @property {string} [reason] An optional reason context for the timeout, generally an error saved during flow of monitoring and selecting servers
 * @extends MongoError
 */
class MongoServerSelectionError extends MongoTimeoutError {
  constructor(message, reason) {
    super(message, reason);
    this.name = 'MongoServerSelectionError';
  }
}

function makeWriteConcernResultObject(input) {
  const output = Object.assign({}, input);

  if (output.ok === 0) {
    output.ok = 1;
    delete output.errmsg;
    delete output.code;
    delete output.codeName;
  }

  return output;
}

/**
 * An error thrown when the server reports a writeConcernError
 *
 * @param {Error|string|object} message The error message
 * @param {object} result The result document (provided if ok: 1)
 * @property {string} message The error message
 * @property {object} [result] The result document (provided if ok: 1)
 * @extends MongoError
 */
class MongoWriteConcernError extends MongoError {
  constructor(message, result) {
    super(message);
    this.name = 'MongoWriteConcernError';

    if (result && Array.isArray(result.errorLabels)) {
      this[kErrorLabels] = new Set(result.errorLabels);
    }

    if (result != null) {
      this.result = makeWriteConcernResultObject(result);
    }
  }
}

// see: https://github.com/mongodb/specifications/blob/master/source/retryable-writes/retryable-writes.rst#terms
const RETRYABLE_ERROR_CODES = new Set([
  MONGODB_ERROR_CODES.HostUnreachable,
  MONGODB_ERROR_CODES.HostNotFound,
  MONGODB_ERROR_CODES.NetworkTimeout,
  MONGODB_ERROR_CODES.ShutdownInProgress,
  MONGODB_ERROR_CODES.PrimarySteppedDown,
  MONGODB_ERROR_CODES.SocketException,
  MONGODB_ERROR_CODES.NotMaster,
  MONGODB_ERROR_CODES.InterruptedAtShutdown,
  MONGODB_ERROR_CODES.InterruptedDueToReplStateChange,
  MONGODB_ERROR_CODES.NotMasterNoSlaveOk,
  MONGODB_ERROR_CODES.NotMasterOrSecondary
]);

const RETRYABLE_WRITE_ERROR_CODES = new Set([
  MONGODB_ERROR_CODES.InterruptedAtShutdown,
  MONGODB_ERROR_CODES.InterruptedDueToReplStateChange,
  MONGODB_ERROR_CODES.NotMaster,
  MONGODB_ERROR_CODES.NotMasterNoSlaveOk,
  MONGODB_ERROR_CODES.NotMasterOrSecondary,
  MONGODB_ERROR_CODES.PrimarySteppedDown,
  MONGODB_ERROR_CODES.ShutdownInProgress,
  MONGODB_ERROR_CODES.HostNotFound,
  MONGODB_ERROR_CODES.HostUnreachable,
  MONGODB_ERROR_CODES.NetworkTimeout,
  MONGODB_ERROR_CODES.SocketException,
  MONGODB_ERROR_CODES.ExceededTimeLimit
]);

function isRetryableEndTransactionError(error) {
  return error.hasErrorLabel('RetryableWriteError');
}

function isRetryableWriteError(error) {
  if (error instanceof MongoWriteConcernError) {
    return (
      RETRYABLE_WRITE_ERROR_CODES.has(error.code) ||
      RETRYABLE_WRITE_ERROR_CODES.has(error.result.code)
    );
  }

  return RETRYABLE_WRITE_ERROR_CODES.has(error.code);
}

/**
 * Determines whether an error is something the driver should attempt to retry
 *
 * @ignore
 * @param {MongoError|Error} error
 */
function isRetryableError(error) {
  return (
    RETRYABLE_ERROR_CODES.has(error.code) ||
    error instanceof MongoNetworkError ||
    error.message.match(/not master/) ||
    error.message.match(/node is recovering/)
  );
}

const SDAM_RECOVERING_CODES = new Set([
  MONGODB_ERROR_CODES.ShutdownInProgress,
  MONGODB_ERROR_CODES.PrimarySteppedDown,
  MONGODB_ERROR_CODES.InterruptedAtShutdown,
  MONGODB_ERROR_CODES.InterruptedDueToReplStateChange,
  MONGODB_ERROR_CODES.NotMasterOrSecondary
]);

const SDAM_NOTMASTER_CODES = new Set([
  MONGODB_ERROR_CODES.NotMaster,
  MONGODB_ERROR_CODES.NotMasterNoSlaveOk,
  MONGODB_ERROR_CODES.LegacyNotPrimary
]);

const SDAM_NODE_SHUTTING_DOWN_ERROR_CODES = new Set([
  MONGODB_ERROR_CODES.InterruptedAtShutdown,
  MONGODB_ERROR_CODES.ShutdownInProgress
]);

function isRecoveringError(err) {
  if (typeof err.code === 'number') {
    // If any error code exists, we ignore the error.message
    return SDAM_RECOVERING_CODES.has(err.code);
  }

  return /not master or secondary/.test(err.message) || /node is recovering/.test(err.message);
}

function isNotMasterError(err) {
  if (typeof err.code === 'number') {
    // If any error code exists, we ignore the error.message
    return SDAM_NOTMASTER_CODES.has(err.code);
  }

  if (isRecoveringError(err)) {
    return false;
  }

  return /not master/.test(err.message);
}

function isNodeShuttingDownError(err) {
  return err.code && SDAM_NODE_SHUTTING_DOWN_ERROR_CODES.has(err.code);
}

/**
 * Determines whether SDAM can recover from a given error. If it cannot
 * then the pool will be cleared, and server state will completely reset
 * locally.
 * @see https://github.com/mongodb/specifications/blob/master/source/server-discovery-and-monitoring/server-discovery-and-monitoring.rst#not-master-and-node-is-recovering
 * @param {MongoError} error
 * @returns {boolean}
 */
function isSDAMUnrecoverableError(error) {
  // NOTE: null check is here for a strictly pre-CMAP world, a timeout or
  //       close event are considered unrecoverable
  if (error instanceof MongoParseError || error == null) {
    return true;
  }

  return isRecoveringError(error) || isNotMasterError(error);
}

module.exports = {
  MongoError,
  MongoNetworkError,
  MongoNetworkTimeoutError,
  MongoParseError,
  MongoTimeoutError,
  MongoServerSelectionError,
  MongoWriteConcernError,
  isRetryableError,
  isSDAMUnrecoverableError,
  isNodeShuttingDownError,
  isRetryableWriteError,
  isNetworkErrorBeforeHandshake,
  isRetryableEndTransactionError
};
