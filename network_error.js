"use strict";

/**
 * Creates a new MongoNetworkError
 * @class
 * @augments Error
 * @param {string} message The error message
 * @return {MongoNetworkError} A MongoNetworkError instance
 */
function MongoNetworkError(message) {
  this.name = 'MongoNetworkError';
  this.message = message;
  Error.captureStackTrace(this, MongoNetworkError);
}

/**
 * Creates a new MongoNetworkError object
 * @method
 * @param {object} options The error options
 * @return {MongoNetworkError} A MongoNetworkError instance
 */
MongoNetworkError.create = function(options) {
  var err = null;

  if(options instanceof Error) {
    err = new MongoNetworkError(options.message);
    err.stack = options.stack;
  } else if(typeof options == 'string') {
    err = new MongoNetworkError(options);
  } else {
    err = new MongoNetworkError(options.message || options.errmsg || options.$err || "n/a");
    // Other options
    for(var name in options) {
      err[name] = options[name];
    }
  }

  return err;
}

// Extend JavaScript error
MongoNetworkError.prototype = new Error;

module.exports = MongoNetworkError;
