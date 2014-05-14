var utils = require('../../utils');

// Error codes
var UNKNOWN_ERROR = 8;
var INVALID_BSON_ERROR = 22;
var WRITE_CONCERN_ERROR = 64;
var MULTIPLE_ERROR = 65;

// Insert types
var INSERT = 1;
var UPDATE = 2;
var REMOVE = 3

/**
 * Helper function to define properties
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
 */
var Batch = function(batchType, originalZeroIndex) {  
  this.originalZeroIndex = originalZeroIndex;
  this.currentIndex = 0;
  this.originalIndexes = [];
  this.batchType = batchType;
  this.operations = [];
  this.size = 0;
}

/**
 * Wraps a legacy operation so we can correctly rewrite it's error
 */
var LegacyOp = function(batchType, operation, index) {
  this.batchType = batchType;
  this.index = index;
  this.operation = operation;
}

/**
 * Create a new BatchWriteResult instance (INTERNAL TYPE, do not instantiate directly)
 *
 * @class Represents a BatchWriteResult
 * @property **ok** {boolean} did bulk operation correctly execute
 * @property **nInserted** {number} number of inserted documents
 * @property **nUpdated** {number} number of documents updated logically
 * @property **nUpserted** {number} number of upserted documents
 * @property **nModified** {number} number of documents updated physically on disk
 * @property **nRemoved** {number} number of removed documents
 * @param {Object} batchResult internal data structure with results.
 * @return {BatchWriteResult} a BatchWriteResult instance
 */
var BatchWriteResult = function(bulkResult) {
  defineReadOnlyProperty(this, "ok", bulkResult.ok);
  defineReadOnlyProperty(this, "nInserted", bulkResult.nInserted);
  defineReadOnlyProperty(this, "nUpserted", bulkResult.nUpserted);
  defineReadOnlyProperty(this, "nMatched", bulkResult.nMatched);
  defineReadOnlyProperty(this, "nModified", bulkResult.nModified);
  defineReadOnlyProperty(this, "nRemoved", bulkResult.nRemoved);
  
  /**
   * Return an array of upserted ids
   *
   * @return {Array}
   * @api public
   */
  this.getUpsertedIds = function() {
    return bulkResult.upserted;
  }

  /**
   * Return the upserted id at position x
   *
   * @param {Number} index the number of the upserted id to return, returns undefined if no result for passed in index
   * @return {Array}
   * @api public
   */
  this.getUpsertedIdAt = function(index) {
    return bulkResult.upserted[index]; 
  }

  /**
   * Return raw internal result
   *
   * @return {Object}
   * @api public
   */
  this.getRawResponse = function() {
    return bulkResult;
  }

  /**
   * Returns true if the bulk operation contains a write error
   *
   * @return {Boolean}
   * @api public
   */
  this.hasWriteErrors = function() {
    return bulkResult.writeErrors.length > 0;
  }

  /**
   * Returns the number of write errors off the bulk operation
   *
   * @return {Number}
   * @api public
   */
  this.getWriteErrorCount = function() {
    return bulkResult.writeErrors.length;
  }

  /**
   * Returns a specific write error object
   *
   * @return {WriteError}
   * @api public
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
   * @return {Array}
   * @api public
   */
  this.getWriteErrors = function() {
    return bulkResult.writeErrors;
  }

  /**
   * Retrieve lastOp if available
   *
   * @return {Array}
   * @api public
   */
  this.getLastOp = function() {
    return bulkResult.lastOp;
  }

  /**
   * Retrieve the write concern error if any
   *
   * @return {WriteConcernError}
   * @api public
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
    return "BatchWriteResult(" + this.toJSON(bulkResult) + ")";
  }

  this.isOk = function() {
    return bulkResult.ok == 1;
  }
}

/**
 * Wraps a write concern error
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
 * Wraps the error
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
 */
var mergeBatchResults = function(ordered, batch, bulkResult, err, result) {
  // If we have an error set the result to be the err object
  if(err) {
    result = err;
  }

  // Do we have a top level error stop processing and return
  if(result.ok == 0 && bulkResult.ok == 1) {
    bulkResult.ok = 0;
    bulkResult.error = utils.toError(result);
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
// Merge a legacy result into the master results
var mergeLegacyResults = function(_ordered, _op, _batch, _results, _result, _index) {
  // If we have an error already
  if(_results.ok == 0) return false;
  // Handle error
  if((_result.errmsg || _result.err || _result instanceof Error) && _result.wtimeout != true) {
    // && ((_result.wtimeout == null && _result.jnote == null && _result.wnote == null)) || _result.err == "norepl") {
    var code = _result.code || UNKNOWN_ERROR; // Returned error code or unknown code
    var errmsg = _result.errmsg || _result.err;
    errmsg = errmsg || _result.message;

    // Result is replication issue, rewrite error to match write command      
    if(_result.wnote || _result.wtimeout || _result.jnote) {
      // Set the code to replication error
      code = WRITE_CONCERN_ERROR;
      // Ensure we get the right error message
      errmsg = _result.wnote || errmsg;
      errmsg = _result.jnote || errmsg;
    }

    //
    // We have an error that is a show stopper, 16544 and 13 are auth errors that should stop processing
    if(_result.wnote 
      || _result.jnote == "journaling not enabled on this server" 
      || _result.err == "norepl"
      || _result.code == 16544 
      || _result.code == 13) {
      _results.ok = 0;
      _results.error = utils.toError({code: code, errmsg: errmsg});
      return false;
    }    

    // Create a write error
    var errResult = new WriteError({
        index: _index
      , code: code
      , errmsg: errmsg
      , op: _op      
    });
    
    // Err details
    _results.writeErrors.push(errResult);

    // Check if we any errors
    if(_ordered == true 
      && _result.jnote == null 
      && _result.wnote == null 
      && _result.wtimeout == null) {
      return false;
    }
  } else if(_batch.batchType == INSERT) {
    _results.nInserted = _results.nInserted + 1;
  } else if(_batch.batchType == UPDATE) {
    // If we have an upserted value or if the user provided a custom _id value
    if(_result.upserted || (!_result.updatedExisting && _result.upserted == null)) {
      _results.nUpserted = _results.nUpserted + 1;
    } else {
      _results.nMatched = _results.nMatched + _result.n;
      _results.nModified = null;
     }
  } else if(_batch.batchType == REMOVE) {
    _results.nRemoved = _results.nRemoved + _result;
  }

  // We have a write concern error, add a write concern error to the results
  if(_result.wtimeout != null || _result.jnote != null || _result.wnote != null) {
    var error = _result.err || _result.errmsg || _result.wnote || _result.jnote || _result.wtimeout;
    var code = _result.code || WRITE_CONCERN_ERROR;
    // Push a write concern error to the list
    _results.writeConcernErrors.push(new WriteConcernError({errmsg: error, code: code}));
  }

  // We have an upserted field (might happen with a write concern error)
  if(_result.upserted) {
    _results.upserted.push({
        index: _index
      , _id: _result.upserted
    })
  } else if(!_result.updatedExisting && _result.upserted == null && _op.q && _op.q._id) {
    _results.upserted.push({
        index: _index
      , _id: _op.q._id
    })    
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
exports.BatchWriteResult = BatchWriteResult;
exports.WriteError = WriteError;
exports.Batch = Batch;
exports.LegacyOp = LegacyOp;
exports.mergeBatchResults = mergeBatchResults;
exports.cloneOptions = cloneOptions;
exports.mergeLegacyResults = mergeLegacyResults;
exports.INVALID_BSON_ERROR = INVALID_BSON_ERROR;
exports.WRITE_CONCERN_ERROR = WRITE_CONCERN_ERROR;
exports.MULTIPLE_ERROR = MULTIPLE_ERROR;
exports.UNKNOWN_ERROR = UNKNOWN_ERROR;
exports.INSERT = INSERT;
exports.UPDATE = UPDATE;
exports.REMOVE = REMOVE;