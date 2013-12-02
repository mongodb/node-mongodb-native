var shared = require('../shared')
	, common = require('./common')
	, utils = require('../../utils')
  , hasWriteCommands = utils.hasWriteCommands
  , WriteError = common.WriteError
  , BatchWriteResult = common.BatchWriteResult
  , LegacyOp = common.LegacyOp
  , Batch = common.Batch
  , mergeBatchResults = common.mergeBatchResults;

/**
 * Wraps the operations done for the batch
 */
var OrderedBulkOperation = function(collection, options) {
	options = options == null ? {} : options;
	// TODO Bring from driver information in isMaster
	var self = this;
	var executed = false;
	var useLegacyOps = options.useLegacyOps || false;
	
	// Current item
	var currentOp = null;

	// Handle to the bson serializer, used to calculate running sizes
  var db = collection.db;
	var bson = db.bson;

	// Namespace for the operation
  var namespace = collection.collectionName;  

  // Set max byte size
	var maxNumberOfDocsInBatch = db.serverConfig.checkoutWriter().maxNumberOfDocsInBatch;
	var maxBatchSizeBytes = db.serverConfig.checkoutWriter().maxBsonSize;

  // Get the write concern
  var writeConcern = shared._getWriteConcern(collection, options);
	
  // Current batch
  var currentBatch = null;
  var currentIndex = 0;
  var currentBatchSize = 0;
  var currentBatchSizeBytes = 0;
  var batches = [];

  // Final results
  var mergeResults = { n: 0, upserted: [], errDetails: [], wcErrors: 0}

	// Insert a document
	this.insert = function(document) {
		return addToOperationsList(self, common.INSERT, document);
	}

	var getOrderedCommand = function(_self, _namespace, _docType, _operationDocuments) {
		// Set up the types of operation
		if(_docType == common.INSERT) {
			return {
					insert: _namespace
				, documents: _operationDocuments
				, ordered:true 
			}
		} else if(_docType == common.UPDATE) {
			return {
					update: _namespace
				, updates: _operationDocuments
				, ordered:true
			};
		} else if(_docType == common.REMOVE) {
			return {
					delete: _namespace
				, deletes: _operationDocuments
				, ordered:true
			};
		}		
	}

	// Add to internal list of documents
	var addToOperationsList = function(_self, docType, document) {
    // Get the bsonSize
    var bsonSize = bson.calculateObjectSize(document, false);
    // Throw error if the doc is bigger than the max BSON size
    if(bsonSize >= maxBatchSizeBytes) throw utils.toError("document is larger than the maximum size " + maxBatchSizeBytes);
    // Create a new batch object if we don't have a current one
    if(currentBatch == null) currentBatch = new Batch(docType, currentIndex);
    
    // Check if we need to switch batch type
    if(currentBatch.batchType != docType) {
      // Save current batch
      batches.push(currentBatch);
      // Create a new batch
      currentBatch = new Batch(docType, currentIndex);  
    }

    // Update current batch size
    currentBatchSize = currentBatchSize + 1;
    currentBatchSizeBytes = currentBatchSizeBytes + bsonSize;

    // Check if we need to create a new batch
    if((currentBatchSize >= maxNumberOfDocsInBatch)
      || (currentBatchSizeBytes >= maxBatchSizeBytes)) {
      // Save the batch to the execution stack
      batches.push(currentBatch);
      
      // Create a new batch
      currentBatch = new Batch(docType, currentIndex);
      
      // Reset the current size trackers
      currentBatchSize = 0;
      currentBatchSizeBytes = 0;
    }

    // We have an array of documents
    if(Array.isArray(document)) {
      currentBatch.operations = currentBatch.operations.concat(document);
      currentIndex = currentIndex + document.length;
    } else {
    	currentBatch.originalIndexes.push(currentIndex);
      currentBatch.operations.push(document)
      currentIndex = currentIndex + 1;
    }

    // Return self
		return _self;
	}

	// 
	// All operations chained to a find
	//
	var findOperations = {
		update: function(updateDocument) {
			// Perform upsert
			var upsert = typeof currentOp.upsert == 'boolean' ? currentOp.upsert : false;
			
			// Establish the update command
			var document = {
					q: currentOp.selector
				, u: updateDocument
				, multi: true
				, upsert: upsert
			}

			// Clear out current Op
			currentOp = null;
			// Add the update document to the list
			return addToOperationsList(self, common.UPDATE, document);
		},

		updateOne: function(updateDocument) {
			// Perform upsert
			var upsert = typeof currentOp.upsert == 'boolean' ? currentOp.upsert : false;
			
			// Establish the update command
			var document = {
					q: currentOp.selector
				, u: updateDocument
				, multi: false
				, upsert: upsert
			}

			// Clear out current Op
			currentOp = null;
			// Add the update document to the list
			return addToOperationsList(self, common.UPDATE, document);
		},

		replaceOne: function(updateDocument) {
			findOperations.updateOne(updateDocument);
		},

		upsert: function() {
			currentOp.upsert = true;
			// Return the findOperations
			return findOperations;
		},

		removeOne: function() {		
			// Establish the update command
			var document = {
					q: currentOp.selector
				, limit: 1
			}

			// Clear out current Op
			currentOp = null;
			// Add the remove document to the list
			return addToOperationsList(self, common.REMOVE, document);
		},

		remove: function() {
			// Establish the update command
			var document = {
					q: currentOp.selector
				, limit: 0
			}

			// Clear out current Op
			currentOp = null;
			// Add the remove document to the list
			return addToOperationsList(self, common.REMOVE, document);				
		}
	}

	//
	// Find selector
	this.find = function(selector) {
		// Save a current selector
		currentOp = {
			selector: selector
		}

		return findOperations;
	}

	//
	// Execute next write command in a chain
	var executeCommands = function(callback) {
		if(batches.length == 0) {
			return callback(null, new BatchWriteResult(mergeResults));
		}

		// Ordered execution of the command
		var batch = batches.shift();
		
		// Build the command
		var cmd = null;

    // Generate the right update
    if(batch.batchType == common.UPDATE) {
      cmd = { update: namespace, updates: batch.operations, ordered: true }
    } else if(batch.batchType == common.INSERT) {
      cmd = { insert: namespace, documents: batch.operations, ordered: true }
    } else if(batch.batchType == common.REMOVE) {
      cmd = { delete: namespace, deletes: batch.operations, ordered: true }
    }

    // If we have a write concern
    if(writeConcern != null) {
      cmd.writeConcern = writeConcern;
    }    

		// Execute it
		db.command(cmd, function(err, result) {			
			// Merge the results together
			var mergeResult = mergeBatchResults(true, batch, mergeResults, err, result);
			if(mergeResult != null) {
				return callback(null, new BatchWriteResult(mergeResults));
			}

      // If we are ordered and have errors and they are 
      // not all replication errors terminate the operation          
      if(mergeResults.errDetails.length > 0 
        && mergeResults.errDetails.length != mergeResults.wcErrors) {
          return callback(null, new BatchWriteResult(mergeResults));
      }

			// Execute the next command in line
			executeCommands(callback);
		});
	}

	// 
	// Merge a legacy result into the master results
	var mergeLegacyResults = function(_ordered, _op, _batch, _results, _result, _index) {
    // Handle error
    if(_result.errmsg || _result.err || _result instanceof Error) {
      var code = _result.code || common.UNKNOWN_ERROR; // Returned error code or unknown code
      var errmsg = _result.errmsg || _result.err;
      errmsg = errmsg || _result.message;

      // Result is replication issue, rewrite error to match write command      
      if(_result.wnote || _result.wtimeout || _result.jnote) {
        // Update the replication counters
        _results.n = _results.n + 1;
        _results.wcErrors = _results.wcErrors + 1;
        // Set the code to replication error
        code = common.WRITE_CONCERN_ERROR;
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
      _results.errDetails.push(errResult);

      // Check if we any errors
      if(_ordered == true 
        && _result.jnote == null 
        && _result.wnote == null 
        && _result.wtimeout == null) {
        return false;
      }
    } else if(_batch.batchType == common.INSERT) {
      _results.n = _results.n + 1;
    } else if(_batch.batchType == common.UPDATE) {
      _results.n = _results.n + _result.n;
    } else if(_batch.batchType == common.REMOVE) {
      _results.n = _results.n + _result;
    }

    // We have an upserted field (might happen with a write concern error)
    if(_result.upserted) _results.upserted.push({
        index: _index
      , _id: _result.upserted
    })
	}

	// 
	// Execute the inserts
	var executeInserts = function(_collection, _batch, _result, _callback) {
		if(_batch.operations.length == 0) {
			return _callback(null, _result);
		}

		// Get the first update
		var document = _batch.operations.shift();
		var index = _batch.originalIndexes.shift();
		
		// Options for the update operation
		var options = writeConcern || {};
		if(useLegacyOps) options.useLegacyOps = true;

		// Execute the update
		_collection.insert(document, options, function(err, r) {
			// Merge the results in 
			var result = mergeLegacyResults(true, document, _batch, mergeResults, err || r, index);
			if(result == false) {
				return _callback(null, new BatchWriteResult(mergeResults));
			}

			// Update the index
			_batch.currentIndex = _batch.currentIndex + 1;

			// Execute the next insert		
			executeInserts(_collection, _batch, _result, _callback);
		});
	}

	//
	// Execute updates
	var executeUpdates = function(_collection, _batch, _result, _callback) {
		if(_batch.operations.length == 0) {
			return _callback(null, _result);
		}

		// Get the first update
		var update = _batch.operations.shift();
		var index = _batch.originalIndexes.shift();
		
		// Options for the update operation
		var options = writeConcern != null ? common.cloneOptions(writeConcern) : {};
		if(useLegacyOps) options.useLegacyOps = true;
		
		// Add any additional options
		if(update.multi) options.multi = update.multi;
		if(update.upsert) options.upsert = update.upsert;

		// Execute the update
		_collection.update(update.q, update.u, options, function(err, r, full) {
			// Merge the results in 
			var result = mergeLegacyResults(true, update, _batch, mergeResults, err || full, index);
			if(result == false) {
				return _callback(null, new BatchWriteResult(mergeResults));
			}

			// Update the index
			_batch.currentIndex = _batch.currentIndex + 1;

			// Execute the next insert		
			executeUpdates(_collection, _batch, _result, _callback);
		});
	}

	//
	// Execute updates
	var executeRemoves = function(_collection, _batch, _result, _callback) {
		if(_batch.operations.length == 0) {
			return _callback(null, _result);
		}

		// Get the first update
		var remove = _batch.operations.shift();
		var index = _batch.originalIndexes.shift();
		
		// Options for the update operation
		var options = writeConcern != null ? common.cloneOptions(writeConcern) : {};
		if(useLegacyOps) options.useLegacyOps = true;
		
		// Add any additional options
		options.single = remove.limit == 1 ? true : false;

		// Execute the update
		_collection.remove(remove.q, options, function(err, r) {
			// Merge the results in 
			var result = mergeLegacyResults(true, remove, _batch, mergeResults, err || r, index);
			if(result == false) {
				return _callback(null, new BatchWriteResult(mergeResults));
			}

			// Update the index
			_batch.currentIndex = _batch.currentIndex + 1;

			// // Handle error from insert function
			// if(err) {
			// 	// Merge the legacy error
			// 	if(!mergeLegacyError(true, err, _batch, remove, _result)) {
			// 		// Return error result
			// 		return _callback(null, _result);					
			// 	}
			// }

			// // Update results
			// _result.n = _result.n + r;

			// // Update the index
			// _batch.currentIndex = _batch.currentIndex + 1;

			// Execute the next insert		
			executeRemoves(_collection, _batch, _result, _callback);
		});
	}

	//
	// Execute all operation in backwards compatible fashion
	var backwardsCompatibilityExecuteCommands = function(callback) {
		if(batches.length == 0) {
			return callback(null, new BatchWriteResult(mergeResults));
		}

		// Ordered execution of the command
		var batch = batches.shift();

		// Process the legacy operations
		var processLegacyOperations = function(err, results) {
			// If we have any errors stop executing
      if(mergeResults.errDetails.length > 0 
        && mergeResults.errDetails.length != mergeResults.wcErrors) {
				return callback(null, new BatchWriteResult(mergeResults));
			}

			// // Merge the results together
			// var mergeResult = mergeBatchResults(true, batch, mergeResults, err, results);
			// if(mergeResult != null) {
			// 	return callback(null, mergeResult)
			// }

			// Execute the next step
			backwardsCompatibilityExecuteCommands(callback);			
		}

		// Execute an insert batch
		if(batch.batchType == common.INSERT) {
			return executeInserts(collection, batch, {n: 0}, processLegacyOperations);
		}

		// Execute an update batch
		if(batch.batchType == common.UPDATE) {
			return executeUpdates(collection, batch, {n: 0}, processLegacyOperations);
		}

		// Execute an update batch
		if(batch.batchType == common.REMOVE) {
			return executeRemoves(collection, batch, {n: 0}, processLegacyOperations);
		}
	}

	//
	// Execute the bulk operation
	this.execute = function(_writeConcern, callback) {
		if(executed) throw new util.toError("batch cannot be re-executed");
		if(typeof _writeConcern == 'function') {
			callback = _writeConcern;
		} else {
			writeConcern = _writeConcern;
		}

    // If we have current batch
    if(currentBatch) batches.push(currentBatch);
		
		// Check if we support bulk commands, override if needed to use legacy ops
		if(hasWriteCommands(db.serverConfig.checkoutWriter()) && !useLegacyOps)
			return executeCommands(callback);

		// Run in backward compatibility mode
		backwardsCompatibilityExecuteCommands(callback);
	}
}

/**
 * Returns an unordered batch object
 *
 */
var initializeOrderedBulkOp = function(options) {
	return new OrderedBulkOperation(this, options);
}

exports.initializeOrderedBulkOp = initializeOrderedBulkOp;