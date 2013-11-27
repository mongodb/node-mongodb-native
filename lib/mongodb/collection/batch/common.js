// Error codes
var UNKNOWN_ERROR = 8;
var INVALID_BSON_ERROR = 22;
var REPLICATION_ERROR = 64;
var BATCH_ERROR = 65;

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
          code: BATCH_ERROR
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
      if(batchResult.errDetails[i].code == REPLICATION_ERROR) {
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

// Exports symbols
exports.BatchWriteResult = BatchWriteResult;
exports.WriteError = WriteError;
exports.Batch = Batch;
exports.LegacyOp = LegacyOp;
exports.INVALID_BSON_ERROR = INVALID_BSON_ERROR;
exports.REPLICATION_ERROR = REPLICATION_ERROR;
exports.BATCH_ERROR = BATCH_ERROR;
exports.UNKNOWN_ERROR = UNKNOWN_ERROR;