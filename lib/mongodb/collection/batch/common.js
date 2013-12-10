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
 * @property **n** {number} number of documents affected
 * @property **nInserted** {number} number of inserted documents
 * @property **nUpdated** {number} number of updated documents
 * @property **nUpserted** {number} number of upserted documents
 * @property **nRemoved** {number} number of removed documents
 * @param {Object} batchResult internal data structure with results.
 * @return {BatchWriteResult} a BatchWriteResult instance
 */
var BatchWriteResult = function(batchResult) {
  defineReadOnlyProperty(this, "n", batchResult.n);
  defineReadOnlyProperty(this, "nInserted", batchResult.nInserted);
  defineReadOnlyProperty(this, "nUpdated", batchResult.nUpdated);
  defineReadOnlyProperty(this, "nUpserted", batchResult.nUpserted);
  defineReadOnlyProperty(this, "nRemoved", batchResult.nRemoved);
  
  /**
   * Return an array of upserted ids
   *
   * @return {Array}
   * @api public
   */
  this.getUpsertedIds = function() {
    return batchResult.upserted;
  }

  /**
   * Return the upserted id at position x
   *
   * @param {Number} index the number of the upserted id to return, returns undefined if no result for passed in index
   * @return {Array}
   * @api public
   */
  this.getUpsertedIdAt = function(index) {
    return batchResult.upserted[index]; 
  }

  /**
   * Return raw internal result
   *
   * @return {Object}
   * @api public
   */
  this.getRawResponse = function() {
    return batchResult;
  }

  /**
   * Returns top level error object
   *
   * @return {Object}
   * @api public
   */
  this.getSingleError = function() {
    if(this.hasErrors()) {
      return new WriteError({
          code: MULTIPLE_ERROR
        , errmsg: "batch item errors occurred"
        , index: 0
      })
    }
  }

  /**
   * Checks if results have errors
   *
   * @return {Boolean}
   * @api public
   */
  this.hasErrors = function() {
    return batchResult.errDetails.length > 0;
  }

  /**
   * Returns the number of errors
   *
   * @return {Number}
   * @api public
   */
  this.getErrorCount = function() {
    var count = 0;
    if(batchResult.errDetails) {
      count = count + batchResult.errDetails.length;
    } else if(batchResult.ok == 0) {
      count = count + 1;
    }

    return count;
  }

  /**
   * Returns the WriteError at the passed in index, returns undefined if no error at the provided index
   *
   * @param {Number} index the number of the error to return, returns undefined if no result for passed in index
   * @return {WriteError}
   * @api public
   */
  this.getErrorAt = function(index) {
    if(batchResult.errDetails 
      && index < batchResult.errDetails.length) {
      return new WriteError(batchResult.errDetails[index]);
    }

    return null;
  }

  /**
   * Returns the number of write concern errors
   *
   * @return {Number}
   * @api public
   */
  this.getWCErrors = function() {
    var wcErrors = [];
    // No errDetails return no WCErrors
    if(!Array.isArray(batchResult.errDetails)) return wcErrors;

    // Locate any WC errors
    for(var i = 0; i < batchResult.errDetails.length; i++) {
      // 64 signals a write concern error
      if(batchResult.errDetails[i].code == WRITE_CONCERN_ERROR) {
        wcErrors.push(batchResult.errDetails[i]);
      }
    }

    // Return the errors
    return wcErrors;
  }

  this.toJSON = function() {
    return batchResult;
  }

  this.toString = function() {
    return "BatchWriteResult(" + this.toJSON(batchResult) + ")";
  }

  this.isOK = function() {
    return batchResult.ok == 1;
  }
}

/**
 * Wraps the error
 */
var WriteError = function(err) {
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
var mergeBatchResults = function(ordered, batch, mergeResult, err, result) {
  // If we have an error set the result to be the err object
  if(err) {
    result = err;
  }

  // console.log("==============================================================")
  // console.dir(result)

  // Get the n
  var n = typeof result.n != 'number' ? 0 : result.n;
  // Add the results
  mergeResult.n = mergeResult.n + n;

  // If we have an insert Batch type
  if(batch.batchType == INSERT) {
    mergeResult.nInserted = mergeResult.nInserted + result.n;
  }

  // If we have an insert Batch type
  if(batch.batchType == REMOVE) {
    mergeResult.nRemoved = mergeResult.nRemoved + result.n;
  }

  // We have an array of upserted values, we need to rewrite the indexes
  if(Array.isArray(result.upserted)) {
    mergeResult.nUpserted = mergeResult.nUpserted + result.upserted.length;
    mergeResult.nUpdated = mergeResult.nUpdated + (result.n - result.upserted.length);

    for(var i = 0; i < result.upserted.length; i++) {
      mergeResult.upserted.push({
          index: result.upserted[i].index + batch.originalZeroIndex
        , _id: result.upserted[i]._id
      });
    }
  } else if(result.upserted) { 
    mergeResult.nUpserted = mergeResult.nUpserted + 1;
    mergeResult.nUpdated = mergeResult.nUpdated + (result.n - 1);
    mergeResult.upserted.push({
        index: batch.originalZeroIndex
      , _id: result.upserted
    });           
  }

  // We have a top level error as well as single operation errors
  // in errDetails, apply top level and override with errDetails ones
  if(result.ok == 0) {
    // Error details
    var errDetails = [];
    var numberOfOperations = batch.operations.length;

    // Establish if we need to cut off top level errors due to ordered
    if(ordered && Array.isArray(result.errDetails)) {
      numberOfOperations = result.errDetails[result.errDetails.length - 1].index;
    }

    // Apply any errDetails      
    if(Array.isArray(result.errDetails)) {
      for(var i = 0; i < result.errDetails.length; i++) {
        var originalIndex = ordered 
          ? (result.errDetails[i].index + batch.originalZeroIndex)
          : (batch.originalIndexes[result.errDetails[i].index])
        var index = result.code != MULTIPLE_ERROR ? result.errDetails[i].index : i;

        // Update the number of replication errors
        if(result.errDetails[i].code == WRITE_CONCERN_ERROR) {
          mergeResult.wcErrors = mergeResult.wcErrors + 1;
        }

        errDetails[index] = {
            index: originalIndex
          , code: result.errDetails[i].code
          , errmsg: result.errDetails[i].errmsg
          , op: batch.operations[result.errDetails[i].index]
        }
      }          
    }

    // Any other errors get the batch error code, if one exists
    if(result.code != MULTIPLE_ERROR) {
    
      // All errors without errDetails are affected by the batch error
      for(var i = 0; i < numberOfOperations; i++) {
      
        if(errDetails[i]) continue;
      
        // Update the number of replication errors
        if(result.code == WRITE_CONCERN_ERROR) {
          mergeResult.wcErrors = mergeResult.wcErrors + 1;
        }

        // Add the error to the errDetails
        errDetails[i] = {
            index: batch.originalIndexes[i]
          , code: result.code
          , errmsg: result.errmsg
          , op: batch.operations[i]           
        };
      }
    }


    // Merge the error details
    mergeResult.errDetails = mergeResult.errDetails.concat(errDetails);
    return;
  }
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