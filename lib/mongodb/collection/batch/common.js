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
 * Wraps the result for the commands
 */
var BatchWriteResult = function(batchResult) {
  // Define properties
  defineReadOnlyProperty(this, "ok", batchResult.ok);
  defineReadOnlyProperty(this, "n", batchResult.n);
  
  //
  // Define access methods
  this.getUpsertedIds = function() {
    return batchResult.upserted;
  }

  this.getUpsertedIdAt = function(index) {
    return batchResult.upserted[index]; 
  }

  this.getRawResponse = function() {
    return batchResult;
  }

  this.getSingleError = function() {
    if(this.hasErrors()) {
      return new WriteError({
          code: MULTIPLE_ERROR
        , errmsg: "batch item errors occurred"
        , index: 0
      })
    }
  }

  this.hasErrors = function() {
    return batchResult.errDetails.length > 0;
  }

  this.getErrorCount = function() {
    var count = 0;
    if(batchResult.errDetails) {
      count = count + batchResult.errDetails.length;
    } else if(batchResult.ok == 0) {
      count = count + 1;
    }

    return count;
  }

  this.getErrorAt = function(index) {
    if(batchResult.errDetails 
      && index < batchResult.errDetails.length) {
      return new WriteError(batchResult.errDetails[index]);
    }

    return null;
  }

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

  this.tojson = function() {
    return batchResult;
  }

  this.toString = function() {
    return "BatchWriteResult(" + tojson(batchResult) + ")";
  }

  this.shellPrint = function() {
    return this.toString();
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

  this.tojson = function() {
    return err;
  }

  this.toString = function() {
    return "WriteError(" + tojson(err) + ")";
  }

  this.shellPrint = function() {
    return this.toString();
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

  // Get the n
  var n = typeof result.n != 'number' ? 0 : result.n;
  // Add the results
  mergeResult.n = mergeResult.n + n;

  // We have an array of upserted values, we need to rewrite the indexes
  if(Array.isArray(result.upserted)) {
    for(var i = 0; i < result.upserted.length; i++) {
      mergeResult.upserted.push({
          index: result.upserted[i].index + batch.originalZeroIndex
        , _id: result.upserted[i]._id
      });
    }
  }

  // We have a single document upserted
  if(result.upserted 
    && !Array.isArray(result.upserted)) {
    mergeResult.upserted.push({
        index: batch.originalZeroIndex
      , _id: result.upserted
    });           
  }

  // We have a top level error and no error details, replicate error to
  // all the original errors
  if(result.ok == 0 
    && result.code != MULTIPLE_ERROR
    && !Array.isArray(result.errDetails)) {

    // Rewrite all the batch items as errors
    for(var i = 0; i < batch.operations.length; i++) {
      // Update the number of replication errors
      if(result.code == WRITE_CONCERN_ERROR) {
        mergeResult.wcErrors = mergeResult.wcErrors + 1;
      }

      // Add the error to the errDetails
      mergeResult.errDetails.push({
          index: batch.originalIndexes[i]
        , code: result.code
        , errmsg: result.errmsg
        , op: batch.operations[i]           
      });
    }

    return;
  }

  // We have a top level error as well as single operation errors
  // in errDetails, apply top level and override with errDetails ones
  if(result.ok == 0 
    && result.code != MULTIPLE_ERROR
    && !ordered
    && Array.isArray(result.errDetails)) {

    // Error details
    var errDetails = [];

    // Rewrite all the batch items as errors
    for(var i = 0; i < batch.operations.length; i++) {
      // Update the number of replication errors
      if(result.code == WRITE_CONCERN_ERROR) {
        mergeResult.wcErrors = mergeResult.wcErrors + 1;
      }

      // Add the error to the errDetails
      errDetails.push({
          index: batch.originalIndexes[i]
        , code: result.code
        , errmsg: result.errmsg
        , op: batch.operations[i]           
      });
    }

    // Apply any overriding errDetails      
    for(var i = 0; i < result.errDetails.length; i++) {
      // Calculate the index
      var index = ordered 
        ? (result.errDetails[i].index + batch.originalZeroIndex)
        : (batch.originalIndexes[result.errDetails[i].index])
      // Add the err detail
      errDetails[result.errDetails[i].index] = {
          index: index
        , code: result.errDetails[i].code
        , errmsg: result.errDetails[i].errmsg
        , op: errDetails[result.errDetails[i].index].op
      }
    }

    // Merge the error details
    mergeResult.errDetails = mergeResults.errDetails.concat(errDetails);
    return;
  }

  // We have errDetails we need to merge in
  if(result.ok == 0 
    && Array.isArray(result.errDetails)) {

    // Apply any overriding errDetails      
    for(var i = 0; i < result.errDetails.length; i++) {
      // Calculate the index
      var index = ordered 
        ? (result.errDetails[i].index + batch.originalZeroIndex)
        : (batch.originalIndexes[result.errDetails[i].index])
      // Add the err detail
      mergeResult.errDetails.push({
          index: index
        , code: result.errDetails[i].code
        , errmsg: result.errDetails[i].errmsg
        , op: batch.operations[result.errDetails[i].index]
      })
    }

    return
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
exports.INVALID_BSON_ERROR = INVALID_BSON_ERROR;
exports.WRITE_CONCERN_ERROR = WRITE_CONCERN_ERROR;
exports.MULTIPLE_ERROR = MULTIPLE_ERROR;
exports.UNKNOWN_ERROR = UNKNOWN_ERROR;
exports.INSERT = INSERT;
exports.UPDATE = UPDATE;
exports.REMOVE = REMOVE;