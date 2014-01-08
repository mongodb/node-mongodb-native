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
  defineReadOnlyProperty(this, "nUpdated", bulkResult.nUpdated);
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
      bulkResult.writeConcernErrors[0];
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

  this.isOK = function() {
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

  this.tojson = function() {
    return err;
  }

  this.toString = function() {
    return "WriteConcernError(" + err.errmsg + ")";
  }

  this.shellPrint = function() {
    return this.toString();
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
    return err;
  }

  this.toString = function() {
    return "WriteError(" + this.toJSON(err) + ")";
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

  // console.log("$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$ mergeBatchResults")
  // console.dir(result)

  //
  // NEEDED to pass tests as some write errors are
  // returned as write concern errors (j write on non journal mongod)
  // also internal error code 75 is still making it out as a write concern error
  //
  if(ordered && result && result.writeConcernError
    && (result.writeConcernError.code == 2 || result.writeConcernError.code == 75)) {
    throw "legacy batch failed, cannot aggregate results: " + result.writeConcernError.errmsg;
  }

  // If we have an insert Batch type
  if(batch.batchType == INSERT) {
    bulkResult.nInserted = bulkResult.nInserted + result.n;
  }

  // If we have an insert Batch type
  if(batch.batchType == REMOVE) {
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
  if(batch.batchType == UPDATE) {
    var nModified = result.nDocsModified ? result.nDocsModified : 0;
    bulkResult.nUpserted = bulkResult.nUpserted + nUpserted;
    bulkResult.nUpdated = bulkResult.nUpdated + (result.n - nUpserted);
    bulkResult.nModified = bulkResult.nModified + nModified;
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

  // // Get the n
  // var n = typeof result.n != 'number' ? 0 : result.n;
  // // Add the results
  // bulkResult.n = bulkResult.n + n;

  // // If we have an insert Batch type
  // if(batch.batchType == INSERT) {
  //   bulkResult.nInserted = bulkResult.nInserted + result.n;
  // }

  // // If we have an insert Batch type
  // if(batch.batchType == REMOVE) {
  //   bulkResult.nRemoved = bulkResult.nRemoved + result.n;
  // }

  // // We have an array of upserted values, we need to rewrite the indexes
  // if(Array.isArray(result.upserted)) {
  //   bulkResult.nUpserted = bulkResult.nUpserted + result.upserted.length;
  //   bulkResult.nUpdated = bulkResult.nUpdated + (result.n - result.upserted.length);

  //   for(var i = 0; i < result.upserted.length; i++) {
  //     bulkResult.upserted.push({
  //         index: result.upserted[i].index + batch.originalZeroIndex
  //       , _id: result.upserted[i]._id
  //     });
  //   }
  // } else if(result.upserted) { 
  //   bulkResult.nUpserted = bulkResult.nUpserted + 1;
  //   bulkResult.nUpdated = bulkResult.nUpdated + (result.n - 1);
  //   bulkResult.upserted.push({
  //       index: batch.originalZeroIndex
  //     , _id: result.upserted
  //   });           
  // }

  // // We have a top level error as well as single operation errors
  // // in writeErrors, apply top level and override with writeErrors ones
  // if(result.ok == 0) {
  //   // Error details
  //   var writeErrors = [];
  //   var numberOfOperations = batch.operations.length;

  //   // Establish if we need to cut off top level errors due to ordered
  //   if(ordered && Array.isArray(result.writeErrors)) {
  //     numberOfOperations = result.writeErrors[result.writeErrors.length - 1].index;
  //   }

  //   // Apply any writeErrors      
  //   if(Array.isArray(result.writeErrors)) {
  //     for(var i = 0; i < result.writeErrors.length; i++) {
  //       var originalIndex = ordered 
  //         ? (result.writeErrors[i].index + batch.originalZeroIndex)
  //         : (batch.originalIndexes[result.writeErrors[i].index])
  //       var index = result.code != MULTIPLE_ERROR ? result.writeErrors[i].index : i;

  //       // Update the number of replication errors
  //       if(result.writeErrors[i].code == WRITE_CONCERN_ERROR) {
  //         bulkResult.wcErrors = bulkResult.wcErrors + 1;
  //       }

  //       writeErrors[index] = {
  //           index: originalIndex
  //         , code: result.writeErrors[i].code
  //         , errmsg: result.writeErrors[i].errmsg
  //         , op: batch.operations[result.writeErrors[i].index]
  //       }
  //     }          
  //   }

  //   // Any other errors get the batch error code, if one exists
  //   if(result.code != MULTIPLE_ERROR) {
    
  //     // All errors without writeErrors are affected by the batch error
  //     for(var i = 0; i < numberOfOperations; i++) {
      
  //       if(writeErrors[i]) continue;
      
  //       // Update the number of replication errors
  //       if(result.code == WRITE_CONCERN_ERROR) {
  //         bulkResult.wcErrors = bulkResult.wcErrors + 1;
  //       }

  //       // Add the error to the writeErrors
  //       writeErrors[i] = {
  //           index: batch.originalIndexes[i]
  //         , code: result.code
  //         , errmsg: result.errmsg
  //         , op: batch.operations[i]           
  //       };
  //     }
  //   }


  //   // Merge the error details
  //   bulkResult.writeErrors = bulkResult.writeErrors.concat(writeErrors);
  //   return;
  // }
}

// 
// Merge a legacy result into the master results
var mergeLegacyResults = function(_ordered, _op, _batch, _results, _result, _index) {
  // console.log("$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$")
  // console.dir(_result)
  // Handle error
  if(_result.errmsg || _result.err || _result instanceof Error) {
    var code = _result.code || UNKNOWN_ERROR; // Returned error code or unknown code
    var errmsg = _result.errmsg || _result.err;
    errmsg = errmsg || _result.message;

    // Result is replication issue, rewrite error to match write command      
    if(_result.wnote || _result.wtimeout || _result.jnote) {
      // Update the replication counters
      _results.n = _results.n + 1;
      _results.wcErrors = _results.wcErrors + 1;
      // Set the code to replication error
      code = WRITE_CONCERN_ERROR;
      // Ensure we get the right error message
      errmsg = _result.wnote || errmsg;
      errmsg = _result.jnote || errmsg;
    }

    // Create the emulated result set
    var errResult = {
        index: _index
      , code: code
      , errmsg: errmsg
      , op: _op
    };

    if(_result.errInfo) {
      errResult.errInfo = _result.errInfo;
    }
    
    // Err details
    _results.errDetails.push(errResult);

    // Check if we any errors
    if(_ordered == true 
      && _result.jnote == null 
      && _result.wnote == null 
      && _result.wtimeout == null) {
      return false;
    }
  } else if(_batch.batchType == INSERT) {
    _results.n = _results.n + 1;
    _results.nInserted = _results.nInserted + 1;
  } else if(_batch.batchType == UPDATE) {
    _results.n = _results.n + _result.n;

    if(_result.upserted) {
      _results.nUpserted = _results.nUpserted + 1;
    } else {
      _results.nUpdated = _results.nUpdated + _result.n;
    }
  } else if(_batch.batchType == REMOVE) {
    _results.n = _results.n + _result;
    _results.nRemoved = _results.nRemoved + _result;
  }

  // We have an upserted field (might happen with a write concern error)
  if(_result.upserted) _results.upserted.push({
      index: _index
    , _id: _result.upserted
  })
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