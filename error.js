'use strict';

var util = require('util');

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
}
util.inherits(MongoError, Error);

/**
 * Creates a new MongoError object
 * @method
 * @param {Error|string|object} options The options used to create the error.
 * @return {MongoError} A MongoError instance
 * @deprecated Use new MongoError() instead.
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
};
util.inherits(MongoNetworkError, MongoError);

module.exports = {
  MongoError: MongoError,
  MongoNetworkError: MongoNetworkError
};
