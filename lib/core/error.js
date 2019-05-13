'use strict';

const mongoErrorContextSymbol = Symbol('mongoErrorContextSymbol');

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
          this[name] = message[name];
        }
      }

      Error.captureStackTrace(this, this.constructor);
    }

    this.name = 'MongoError';
    this[mongoErrorContextSymbol] = this[mongoErrorContextSymbol] || {};
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

  hasErrorLabel(label) {
    return this.errorLabels && this.errorLabels.indexOf(label) !== -1;
  }
}

/**
 * Creates a new MongoNetworkError
 *
 * @param {Error|string|object} message The error message
 * @property {string} message The error message
 * @property {string} stack The error call stack
 */
class MongoNetworkError extends MongoError {
  constructor(message) {
    super(message);
    this.name = 'MongoNetworkError';

    // This is added as part of the transactions specification
    this.errorLabels = ['TransientTransactionError'];
  }
}

/**
 * An error used when attempting to parse a value (like a connection string)
 *
 * @param {Error|string|object} message The error message
 * @property {string} message The error message
 */
class MongoParseError extends MongoError {
  constructor(message) {
    super(message);
    this.name = 'MongoParseError';
  }
}

/**
 * An error signifying a timeout event
 *
 * @param {Error|string|object} message The error message
 * @property {string} message The error message
 */
class MongoTimeoutError extends MongoError {
  constructor(message) {
    super(message);
    this.name = 'MongoTimeoutError';
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

module.exports = {
  MongoError,
  MongoNetworkError,
  MongoParseError,
  MongoTimeoutError,
  MongoWriteConcernError,
  mongoErrorContextSymbol,
  isRetryableError
};
