"use strict";

var utils = require('../utils');

// Error codes
var UNKNOWN_ERROR = 8;
var INVALID_BSON_ERROR = 22;
var WRITE_CONCERN_ERROR = 64;
var MULTIPLE_ERROR = 65;

// Insert types
var INSERT = 1;
var UPDATE = 2;
var REMOVE = 3


// Get write concern
var writeConcern = function(target, col, options) {
  if(options.w != null || options.j != null || options.fsync != null) {
    target.writeConcern = options;
  } else if(col.writeConcern.w != null || col.writeConcern.j != null || col.writeConcern.fsync != null) {
    target.writeConcern = col.writeConcern;
  }

  return target
}

/**
 * Helper function to define properties
 * @ignore
 */
var defineReadOnlyProperty = function(self, name, value) {
  Object.defineProperty(self, name, {
      enumerable: true
    , get: function() {
      return value;
    }
  });
}

/**
 * Keeps the state of a unordered batch so we can rewrite the results
 * correctly after command execution
 * @ignore
 */
var Batch = function(batchType, originalZeroIndex) {
  this.originalZeroIndex = originalZeroIndex;
  this.currentIndex = 0;
  this.originalIndexes = [];
  this.batchType = batchType;
  this.operations = [];
  this.size = 0;
  this.sizeBytes = 0;
}

/**
 * Wraps a legacy operation so we can correctly rewrite it's error
 * @ignore
 */
var LegacyOp = function(batchType, operation, index) {
  this.batchType = batchType;
  this.index = index;
  this.operation = operation;
}

/**
 * Create a new BulkWriteResult instance (INTERNAL TYPE, do not instantiate directly)
 *
 * @class
 * @property {boolean} ok Did bulk operation correctly execute
 * @property {number} nInserted number of inserted documents
 * @property {number} nUpdated number of documents updated logically
 * @property {number} nUpserted Number of upserted documents
 * @property {number} nModified Number of documents updated physically on disk
 * @property {number} nRemoved Number of removed documents
 * @return {BulkWriteResult} a BulkWriteResult instance
 */
var BulkWriteResult = function(bulkResult) {
  defineReadOnlyProperty(this, "ok", bulkResult.ok);
  defineReadOnlyProperty(this, "nInserted", bulkResult.nInserted);
  defineReadOnlyProperty(this, "nUpserted", bulkResult.nUpserted);
  defineReadOnlyProperty(this, "nMatched", bulkResult.nMatched);
  defineReadOnlyProperty(this, "nModified", bulkResult.nModified);
  defineReadOnlyProperty(this, "nRemoved", bulkResult.nRemoved);

  /**
   * Return an array of inserted ids
   *
   * @return {object[]}
   */
  this.getInsertedIds = function() {
    return bulkResult.insertedIds;
  }

  /**
   * Return an array of upserted ids
   *
   * @return {object[]}
   */
  this.getUpsertedIds = function() {
    return bulkResult.upserted;
  }

  /**
   * Return the upserted id at position x
   *
   * @param {number} index the number of the upserted id to return, returns undefined if no result for passed in index
   * @return {object}
   */
  this.getUpsertedIdAt = function(index) {
    return bulkResult.upserted[index];
  }

  /**
   * Return raw internal result
   *
   * @return {object}
   */
  this.getRawResponse = function() {
    return bulkResult;
  }

  /**
   * Returns true if the bulk operation contains a write error
   *
   * @return {boolean}
   */
  this.hasWriteErrors = function() {
    return bulkResult.writeErrors.length > 0;
  }

  /**
   * Returns the number of write errors off the bulk operation
   *
   * @return {number}
   */
  this.getWriteErrorCount = function() {
    return bulkResult.writeErrors.length;
  }

  /**
   * Returns a specific write error object
   *
   * @return {WriteError}
   */
  this.getWriteErrorAt = function(index) {
    if(index < bulkResult.writeErrors.length) {
      return bulkResult.writeErrors[index];
    }
    return null;
  }

  /**
   * Retrieve all write errors
   *
   * @return {object[]}
   */
  this.getWriteErrors = function() {
    return bulkResult.writeErrors;
  }

  /**
   * Retrieve lastOp if available
   *
   * @return {object}
   */
  this.getLastOp = function() {
    return bulkResult.lastOp;
  }

  /**
   * Retrieve the write concern error if any
   *
   * @return {WriteConcernError}
   */
  this.getWriteConcernError = function() {
    if(bulkResult.writeConcernErrors.length == 0) {
      return null;
    } else if(bulkResult.writeConcernErrors.length == 1) {
      // Return the error
      return bulkResult.writeConcernErrors[0];
    } else {

      // Combine the errors
      var errmsg = "";
      for(var i = 0; i < bulkResult.writeConcernErrors.length; i++) {
        var err = bulkResult.writeConcernErrors[i];
        errmsg = errmsg + err.errmsg;

        // TODO: Something better
        if(i == 0) errmsg = errmsg + " and ";
      }

      return new WriteConcernError({ errmsg : errmsg, code : WRITE_CONCERN_ERROR });
    }
  }

  this.toJSON = function() {
    return bulkResult;
  }

  this.toString = function() {
    return "BulkWriteResult(" + this.toJSON(bulkResult) + ")";
  }

  this.isOk = function() {
    return bulkResult.ok == 1;
  }
}

/**
 * Create a new WriteConcernError instance (INTERNAL TYPE, do not instantiate directly)
 *
 * @class
 * @property {number} code Write concern error code.
 * @property {string} errmsg Write concern error message.
 * @return {WriteConcernError} a WriteConcernError instance
 */
var WriteConcernError = function(err) {
  if(!(this instanceof WriteConcernError)) return new WriteConcernError(err);

  // Define properties
  defineReadOnlyProperty(this, "code", err.code);
  defineReadOnlyProperty(this, "errmsg", err.errmsg);

  this.toJSON = function() {
    return {code: err.code, errmsg: err.errmsg};
  }

  this.toString = function() {
    return "WriteConcernError(" + err.errmsg + ")";
  }
}

/**
 * Create a new WriteError instance (INTERNAL TYPE, do not instantiate directly)
 *
 * @class
 * @property {number} code Write concern error code.
 * @property {number} index Write concern error original bulk operation index.
 * @property {string} errmsg Write concern error message.
 * @return {WriteConcernError} a WriteConcernError instance
 */
var WriteError = function(err) {
  if(!(this instanceof WriteError)) return new WriteError(err);

  // Define properties
  defineReadOnlyProperty(this, "code", err.code);
  defineReadOnlyProperty(this, "index", err.index);
  defineReadOnlyProperty(this, "errmsg", err.errmsg);

  //
  // Define access methods
  this.getOperation = function() {
    return err.op;
  }

  this.toJSON = function() {
    return {code: err.code, index: err.index, errmsg: err.errmsg, op: err.op};
  }

  this.toString = function() {
    return "WriteError(" + JSON.stringify(this.toJSON()) + ")";
  }
}

/**
 * Merges results into shared data structure
 * @ignore
 */
var mergeBatchResults = function(ordered, batch, bulkResult, err, result) {
  // If we have an error set the result to be the err object
  if(err) {
    result = err;
  } else if(result && result.result) {
    result = result.result;
  } else if(result == null) {
    return;
  }

  // Do we have a top level error stop processing and return
  if(result.ok == 0 && bulkResult.ok == 1) {
    bulkResult.ok = 0;
    // bulkResult.error = utils.toError(result);
    var writeError = {
        index: 0
      , code: result.code || 0
      , errmsg: result.message
      , op: batch.operations[0]
    };

    bulkResult.writeErrors.push(new WriteError(writeError));
    return;
  } else if(result.ok == 0 && bulkResult.ok == 0) {
    return;
  }

  // Add lastop if available
  if(result.lastOp) {
    bulkResult.lastOp = result.lastOp;
  }

  // If we have an insert Batch type
  if(batch.batchType == INSERT && result.n) {
    bulkResult.nInserted = bulkResult.nInserted + result.n;
  }

  // If we have an insert Batch type
  if(batch.batchType == REMOVE && result.n) {
    bulkResult.nRemoved = bulkResult.nRemoved + result.n;
  }

  var nUpserted = 0;

  // We have an array of upserted values, we need to rewrite the indexes
  if(Array.isArray(result.upserted)) {
    nUpserted = result.upserted.length;

    for(var i = 0; i < result.upserted.length; i++) {
      bulkResult.upserted.push({
          index: result.upserted[i].index + batch.originalZeroIndex
        , _id: result.upserted[i]._id
      });
    }
  } else if(result.upserted) {

    nUpserted = 1;

    bulkResult.upserted.push({
        index: batch.originalZeroIndex
      , _id: result.upserted
    });
  }

  // If we have an update Batch type
  if(batch.batchType == UPDATE && result.n) {
    var nModified = result.nModified;
    bulkResult.nUpserted = bulkResult.nUpserted + nUpserted;
    bulkResult.nMatched = bulkResult.nMatched + (result.n - nUpserted);

    if(typeof nModified == 'number') {
      bulkResult.nModified = bulkResult.nModified + nModified;
    } else {
      bulkResult.nModified = null;
    }
  }

  if(Array.isArray(result.writeErrors)) {
    for(var i = 0; i < result.writeErrors.length; i++) {

      var writeError = {
          index: batch.originalZeroIndex + result.writeErrors[i].index
        , code: result.writeErrors[i].code
        , errmsg: result.writeErrors[i].errmsg
        , op: batch.operations[result.writeErrors[i].index]
      };

      bulkResult.writeErrors.push(new WriteError(writeError));
    }
  }

  if(result.writeConcernError) {
    bulkResult.writeConcernErrors.push(new WriteConcernError(result.writeConcernError));
  }
}

//
// Clone the options
var cloneOptions = function(options) {
  var clone = {};
  var keys = Object.keys(options);
  for(var i = 0; i < keys.length; i++) {
    clone[keys[i]] = options[keys[i]];
  }

  return clone;
}

// Exports symbols
exports.BulkWriteResult = BulkWriteResult;
exports.WriteError = WriteError;
exports.Batch = Batch;
exports.LegacyOp = LegacyOp;
exports.mergeBatchResults = mergeBatchResults;
exports.cloneOptions = cloneOptions;
exports.writeConcern = writeConcern;
exports.INVALID_BSON_ERROR = INVALID_BSON_ERROR;
exports.WRITE_CONCERN_ERROR = WRITE_CONCERN_ERROR;
exports.MULTIPLE_ERROR = MULTIPLE_ERROR;
exports.UNKNOWN_ERROR = UNKNOWN_ERROR;
exports.INSERT = INSERT;
exports.UPDATE = UPDATE;
exports.REMOVE = REMOVE;
