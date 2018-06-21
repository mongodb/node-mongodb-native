'use strict';

var util = require('util');

const mongoErrorContextSymbol = Symbol('mongoErrorContextSymbol');

/**
 * Creates a new MongoError
 * @class
 * @augments Error
 * @param {Error|string|object} message The error message
 * @property {string} message The error message
 * @property {string} stack The error call stack
 * @return {MongoError} A MongoError instance
 */
function MongoError(message) {
  var tmp = Error.apply(this, arguments);
  tmp.name = this.name = 'MongoError';

  if (message instanceof Error) {
    this.message = message.message;
    this.stack = message.stack;
  } else {
    if (typeof message === 'string') {
      this.message = message;
    } else {
      this.message = message.message || message.errmsg || message.$err || 'n/a';
      for (var name in message) {
        this[name] = message[name];
      }
    }
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  this[mongoErrorContextSymbol] = this[mongoErrorContextSymbol] || {};
}
util.inherits(MongoError, Error);

/**
 * Creates a new MongoError object
 * @method
 * @param {Error|string|object} options The options used to create the error.
 * @return {MongoError} A MongoError instance
 * @deprecated Use `new MongoError()` instead.
 */
MongoError.create = function(options) {
  return new MongoError(options);
};

/**
 * Creates a new MongoNetworkError
 * @class
 * @param {Error|string|object} message The error message
 * @property {string} message The error message
 * @property {string} stack The error call stack
 * @return {MongoNetworkError} A MongoNetworkError instance
 * @extends {MongoError}
 */
var MongoNetworkError = function(message) {
  MongoError.call(this, message);
  this.name = 'MongoNetworkError';

  // This is added as part of the transactions specification
  this.errorLabels = ['TransientTransactionError'];
};
util.inherits(MongoNetworkError, MongoError);

/**
 * An error used when attempting to parse a value (like a connection string)
 *
 * @class
 * @param {Error|string|object} message The error message
 * @property {string} message The error message
 * @return {MongoParseError} A MongoParseError instance
 * @extends {MongoError}
 */
const MongoParseError = function(message) {
  MongoError.call(this, message);
  this.name = 'MongoParseError';
};
util.inherits(MongoParseError, MongoError);

/**
 * An error signifying a timeout event
 *
 * @class
 * @param {Error|string|object} message The error message
 * @property {string} message The error message
 * @return {MongoTimeoutError} A MongoTimeoutError instance
 * @extends {MongoError}
 */
const MongoTimeoutError = function(message) {
  MongoError.call(this, message);
  this.name = 'MongoTimeoutError';
};
util.inherits(MongoTimeoutError, MongoError);

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

function isRetryableError(error) {
  if (
    RETRYABLE_ERROR_CODES.has(error.code) ||
    error instanceof MongoNetworkError ||
    error.message.match(/not master/) ||
    error.message.match(/node is recovering/)
  ) {
    return true;
  }

  return false;
}

/**
 * An error thrown when the server reports a writeConcernError
 *
 * @class
 * @param {Error|string|object} message The error message
 * @param {object} result The result document (provided if ok: 1)
 * @property {string} message The error message
 * @property {object} [result] The result document (provided if ok: 1)
 * @return {MongoWriteConcernError} A MongoWriteConcernError instance
 * @extends {MongoError}
 */
const MongoWriteConcernError = function(message, result) {
  MongoError.call(this, message);
  this.name = 'MongoWriteConcernError';

  if (result != null) {
    this.result = result;
  }
};
util.inherits(MongoWriteConcernError, MongoError);

module.exports = {
  MongoError,
  MongoNetworkError,
  MongoParseError,
  MongoTimeoutError,
  MongoWriteConcernError,
  mongoErrorContextSymbol,
  isRetryableError
};
