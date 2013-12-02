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
var mergeBatchResults = function(_ordered, _batch, _mergeResults, _err, _result) {
  // If we have an error set the result to be the err object
  if(_err) {
    _result = _err;
  }

  // Get the n
  var n = typeof _result.n != 'number' ? 0 : _result.n;
  // Add the results
  _mergeResults.n = _mergeResults.n + n;

  // We have an array of upserted values, we need to rewrite the indexes
  if(Array.isArray(_result.upserted)) {
    for(var i = 0; i < _result.upserted.length; i++) {
      // Calculate the index
      var index = _ordered 
        ? (_result.upserted[i].index + _batch.originalZeroIndex)
        : (_batch.originalIndexes[_result.upserted[i].index])
      // Add an item
      _mergeResults.upserted.push({
          index: index
        , _id: _result.upserted[i]._id
      });
    }
  }

  // We have a single document upserted
  if(_result.upserted 
    && !Array.isArray(_result.upserted)) {
    _mergeResults.upserted.push({
        index: _batch.originalZeroIndex
      , _id: _result.upserted
    });           
  }

  // Top level error should be reflected for all the operations
  if(_result.ok == 0 
    && !Array.isArray(_result.errDetails)) {
    // && !_ordered) {
    
    // Rewrite all the batch items as errors
    for(var i = 0; i < _batch.operations.length; i++) {
      // Update the number of replication errors
      if(_result.code == WRITE_CONCERN_ERROR) {
        _mergeResults.wcErrors = _mergeResults.wcErrors + 1;
      }

      // Grab the original item's index
      var index = _batch.originalIndexes[i];

      // Add the error to the errDetails
      _mergeResults.errDetails.push({
          index: index
        , code: _result.code
        , errmsg: _result.errmsg
        , op: _batch.operations[i]           
      });
    }

    // Shortcut returning false to alert we are done
    return new BatchWriteResult(_mergeResults);
  }

  // Ordered we only signal the first document as a failure
  if(_result.ok == 0 && _result.code != MULTIPLE_ERROR && _ordered) {
    // Update the number of replication errors
    if(_result.code == WRITE_CONCERN_ERROR) {
      _mergeResults.wcErrors = _mergeResults.wcErrors + 1;
    }

    // Add the replication error
    _mergeResults.errDetails.push({
        index: _batch.originalZeroIndex + 0
      , code: _result.code
      , errmsg: _result.errmsg
      , op: _batch.operations[0]
    });  

    // We have an array for error details, we need to rewrite the results
    if(Array.isArray(_result.errDetails)) {
      for(var i = 0; i < _result.errDetails.length; i++) {
        // Update the number of replication errors
        if(_result.errDetails[i].code == WRITE_CONCERN_ERROR) {
          _mergeResults.wcErrors = _mergeResults.wcErrors + 1;
        }

        // Calculate the index
        var index = _ordered 
          ? (_result.errDetails[i].index + _batch.originalZeroIndex)
          : (_batch.originalIndexes[_result.errDetails[i].index])

        // Add the error to errDetails
        var errResult = {
            index: index
          , code: _result.errDetails[i].code
          , errmsg: _result.errDetails[i].errmsg
          , op: _result.errDetails[i].op || _batch.operations[_result.errDetails[i].index]
        };

        if(_result.errDetails[i].errInfo) {
          errResult.errInfo = _result.errDetails[i].errInfo;
        }

        // Overwrite the top level error with the specific errDetails error
        _mergeResults.errDetails[errResult.index] = errResult;
      }
    }

    // Shortcut
    return
  }

  // We have an array for error details, we need to rewrite the results
  if(Array.isArray(_result.errDetails)) {
    for(var i = 0; i < _result.errDetails.length; i++) {
      // Update the number of replication errors
      if(_result.errDetails[i].code == WRITE_CONCERN_ERROR) {
        _mergeResults.wcErrors = _mergeResults.wcErrors + 1;
      }

      // Calculate the index
      var index = _ordered 
        ? (_result.errDetails[i].index + _batch.originalZeroIndex)
        : (_batch.originalIndexes[_result.errDetails[i].index])

      // Add the error to errDetails
      var errResult = {
          index: index
        , code: _result.errDetails[i].code
        , errmsg: _result.errDetails[i].errmsg
        , op: _result.errDetails[i].op || _batch.operations[_result.errDetails[i].index]
      };

      if(_result.errDetails[i].errInfo) {
        errResult.errInfo = _result.errDetails[i].errInfo;
      }

      _mergeResults.errDetails.push(errResult);
    }
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