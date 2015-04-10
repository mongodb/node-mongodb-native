"use strict";

/**
 * Creates a new MongoError
 * @class
 * @augments Error
 * @param {string} message The error message
 * @return {MongoError} A cursor instance
 */
function MongoError(message) {
  this.name = 'MongoError';
  this.message = message;
  Error.captureStackTrace(this, MongoError);
}

/**
 * Creates a new MongoError object
 * @class
 * @param {object} options The error options
 * @return {MongoError} A cursor instance
 */
MongoError.create = function(options) {
  var err = null;

  if(options instanceof Error) {
    err = new MongoError(options.message);
    err.stack = options.stack;
  } else if(typeof options == 'string') {
    err = new MongoError(options);
  } else {
    err = new MongoError(options.message || options.errmsg || "n/a");
    // Other options
    for(var name in options) {
      err[name] = options[name];
    }
  }

  return err;
}

// Extend JavaScript error
MongoError.prototype = new Error; 

module.exports = MongoError;
