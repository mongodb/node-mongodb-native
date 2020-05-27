'use strict';

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
        for (var name in message) {
          if (name === 'errmsg') {
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
    return this.errorLabels && this.errorLabels.indexOf(label) !== -1;
  }
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
  constructor(message) {
    super(message);
    this.name = 'MongoNetworkError';
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

    if (result != null) {
      this.result = makeWriteConcernResultObject(result);
    }
  }
}

// see: https://github.com/mongodb/specifications/blob/master/source/retryable-writes/retryable-writes.rst#terms
const RETRYABLE_ERROR_CODES = new Set([
  6, // HostUnreachable
  7, // HostNotFound
  89, // NetworkTimeout
  91, // ShutdownInProgress
  189, // PrimarySteppedDown
  9001, // SocketException
  10107, // NotMaster
  11600, // InterruptedAtShutdown
  11602, // InterruptedDueToReplStateChange
  13435, // NotMasterNoSlaveOk
  13436 // NotMasterOrSecondary
]);

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
  91, // ShutdownInProgress
  189, // PrimarySteppedDown
  11600, // InterruptedAtShutdown
  11602, // InterruptedDueToReplStateChange
  13436 // NotMasterOrSecondary
]);

const SDAM_NOTMASTER_CODES = new Set([
  10107, // NotMaster
  13435 // NotMasterNoSlaveOk
]);

const SDAM_NODE_SHUTTING_DOWN_ERROR_CODES = new Set([
  11600, // InterruptedAtShutdown
  91 // ShutdownInProgress
]);

function isRecoveringError(err) {
  if (err.code && SDAM_RECOVERING_CODES.has(err.code)) {
    return true;
  }

  return err.message.match(/not master or secondary/) || err.message.match(/node is recovering/);
}

function isNotMasterError(err) {
  if (err.code && SDAM_NOTMASTER_CODES.has(err.code)) {
    return true;
  }

  if (isRecoveringError(err)) {
    return false;
  }

  return err.message.match(/not master/);
}

function isNodeShuttingDownError(err) {
  return err.code && SDAM_NODE_SHUTTING_DOWN_ERROR_CODES.has(err.code);
}

/**
 * Determines whether SDAM can recover from a given error. If it cannot
 * then the pool will be cleared, and server state will completely reset
 * locally.
 *
 * @ignore
 * @see https://github.com/mongodb/specifications/blob/master/source/server-discovery-and-monitoring/server-discovery-and-monitoring.rst#not-master-and-node-is-recovering
 * @param {MongoError|Error} error
 */
function isSDAMUnrecoverableError(error) {
  // NOTE: null check is here for a strictly pre-CMAP world, a timeout or
  //       close event are considered unrecoverable
  if (error instanceof MongoParseError || error == null) {
    return true;
  }

  if (isRecoveringError(error) || isNotMasterError(error)) {
    return true;
  }

  return false;
}

function isNetworkTimeoutError(err) {
  return err instanceof MongoNetworkError && err.message.match(/timed out/);
}

module.exports = {
  MongoError,
  MongoNetworkError,
  MongoParseError,
  MongoTimeoutError,
  MongoServerSelectionError,
  MongoWriteConcernError,
  isRetryableError,
  isSDAMUnrecoverableError,
  isNodeShuttingDownError,
  isNetworkTimeoutError
};
