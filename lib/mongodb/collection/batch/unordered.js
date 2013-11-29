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
var UnorderedBulkOperation = function(collection, options) {
	options = options == null ? {} : options;

	// Contains reference to self
	var self = this;
	// Get the namesspace for the write operations
  var namespace = collection.collectionName;
  // Used to mark operation as executed
  var executed = false;

  // Let's us force backward compatible legacy op use
	var useLegacyOps = options.useLegacyOps || false;

	// Current item
  // var currentBatch = null;
	var currentOp = null;
	var currentIndex = 0;
  var currentBatchSize = 0;
  var currentBatchSizeBytes = 0;
  var batches = [];

  // The current Batches for the different operations
  var currentInsertBatch = null;
  var currentUpdateBatch = null;
  var currentRemoveBatch = null;

	// Handle to the bson serializer, used to calculate running sizes
  var db = collection.db;
	var bson = db.bson;

  // Set max byte size
	var maxBatchSizeBytes = db.serverConfig.checkoutWriter().maxBsonSize;
	var maxNumberOfDocsInBatch = db.serverConfig.checkoutWriter().maxNumberOfDocsInBatch;

  // Get the write concern
  var writeConcern = shared._getWriteConcern(collection, options);

  // Final results
  var mergeResults = { n: 0, upserted: [], errDetails: [], wcErrors: 0}

	// 
	// Add to the operations list
	//
	var addToOperationsList = function(_self, docType, document) {
    // Get the bsonSize
    var bsonSize = bson.calculateObjectSize(document, false);
    // Throw error if the doc is bigger than the max BSON size
    if(bsonSize >= maxBatchSizeBytes) throw utils.toError("document is larger than the maximum size " + maxBatchSizeBytes);
    // Holds the current batch
    var currentBatch = null;
    // Get the right type of batch
    if(docType == common.INSERT) {
    	currentBatch = currentInsertBatch;
    } else if(docType == common.UPDATE) {
    	currentBatch = currentUpdateBatch;
    } else if(docType == common.REMOVE) {
    	currentBatch = currentRemoveBatch;
    }

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
      currentBatch.operations.push(document);
      currentBatch.originalIndexes.push(currentIndex);
      currentIndex = currentIndex + 1;
    }

    // Save back the current Batch to the right type
    if(docType == common.INSERT) {
    	currentInsertBatch = currentBatch;
    } else if(docType == common.UPDATE) {
    	currentUpdateBatch = currentBatch;
    } else if(docType == common.REMOVE) {
    	currentRemoveBatch = currentBatch;
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
	// Insert a document
	this.insert = function(document) {
		return addToOperationsList(self, common.INSERT, document);
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
	// Execute the command
	var executeBatch = function(batch, callback) {
		// Contains the command we are going to execute
		var cmd = null;

    // Generate the right update
    if(batch.batchType == common.UPDATE) {
      cmd = { update: namespace, updates: batch.operations, ordered: false }
    } else if(batch.batchType == common.INSERT) {
      cmd = { insert: namespace, documents: batch.operations, ordered: false }
    } else if(batch.batchType == common.REMOVE) {
      cmd = { delete: namespace, deletes: batch.operations, ordered: false }
    }

    // If we have a write concern
    if(writeConcern != null) {
      cmd.writeConcern = writeConcern;
    }    

		// Execute the write command
		db.command(cmd, function(err, result) {
			// console.log("==================================== execute command")
			// console.dir(cmd)
			// console.dir(err)
			// console.dir(result)

			// Merge the results together
			callback(null, mergeBatchResults(false, batch, mergeResults, err, result));
		});
	}

	//
	// Execute all the commands
	var executeBatches = function(callback) {
		var numberOfCommandsToExecute = batches.length;
		// Execute over all the batches
		for(var i = 0; i < batches.length; i++) {
			executeBatch(batches[i], function(err, result) {
				numberOfCommandsToExecute = numberOfCommandsToExecute - 1;

				// Execute
				if(numberOfCommandsToExecute == 0) {
					callback(null, new BatchWriteResult(mergeResults));
				}
			});
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
    if(currentInsertBatch) batches.push(currentInsertBatch);
    if(currentUpdateBatch) batches.push(currentUpdateBatch);
    if(currentRemoveBatch) batches.push(currentRemoveBatch);

		// Check if we support bulk commands, override if needed to use legacy ops
		if(hasWriteCommands(db.serverConfig.checkoutWriter()) && !useLegacyOps)
			return executeBatches(callback);

		// Run in backward compatibility mode
		backwardsCompatibilityExecuteCommands(callback);
	}	

	//
	// Merge legacy error
	var mergeLegacyError = function(_err, _batch, _op, _i, _result) {
		var errmsg = _err.errmsg || _err.err;
		errmsg = _err.wtimeout || errmsg;
		errmsg = _err.wnote || errmsg;
		errmsg = _err.jnote || errmsg;
		errmsg = _err.message || errmsg;

		if(!Array.isArray(_result.errDetails)) _result.errDetails = [];
		_result.errDetails.push({
				index: _i
			, errmsg: errmsg
			, code: _err.code || common.UNKNOWN_ERROR
			, op: _op.operation
		});
	}

	// 
	// Execute the inserts
	var executeInserts = function(_collection, _batch, _result, _callback) {
		var totalNumberOfInserts = _batch.operations.length;
		// Options for the update operation
		var batchOptions = writeConcern || {};
		if(useLegacyOps) batchOptions.useLegacyOps = true;

		// Execute the op
		var executeLegacyInsert = function(_i, _op, _options, __callback) {
			// Execute the update
			_collection.insert(_op.operation, _options, function(err, r) {
				// console.log("---------------------------------- execute insert")
				// console.dir(err)
				// Handle error from insert function
				if(err) {
					// Merge the legacy error
					mergeLegacyError(err, _batch, _op, _i, _result);
					return __callback(null, _result);
				}

				// Update results
				_result.n = _result.n + 1;
				__callback(null, _result);
			});
		}

		// Execute all the insert operations
		for(var i = 0; i < _batch.operations.length; i++) {
			var legacyOp = new LegacyOp(_batch.batchType, _batch.operations[i], _batch.originalIndexes[i]);
			// console.dir(legacyOp)

			executeLegacyInsert(i, legacyOp, batchOptions, function(err, result) {
				totalNumberOfInserts = totalNumberOfInserts - 1;
				
				// No more inserts
				if(totalNumberOfInserts == 0) {
					_callback(null, _result);
				}
			});
		}
	}

	//
	// Execute updates
	var executeUpdates = function(_collection, _batch, _result, _callback) {
		var totalNumberOfUpdates = _batch.operations.length;
		// Options for the update operation
		var batchOptions = writeConcern || {};
		if(useLegacyOps) batchOptions.useLegacyOps = true;

		// Execute the op
		var executeLegacyUpdate = function(_i, _op, _options, __callback) {
			var options = common.cloneOptions(batchOptions);

			// Add any additional options
			if(_op.operation.multi != null) options.multi = _op.operation.multi ? 0 : 1;
			if(_op.operation.upsert != null) options.upsert = _op.operation.upsert;

			// Execute the update
			_collection.update(_op.operation.q, _op.operation.u, options, function(err, r, full) {
				// console.log("---------------------------------- execute update")
				// console.dir(err)
				// Handle error from insert function
				if(err) {
					// Merge the legacy error
					mergeLegacyError(err, _batch, _op, _i, _result);
					return __callback(null, _result);
				}

				// Update results
				_result.n = _result.n + full.n;
							
				// Add the upserted field if available
				if(full.upserted) {
					if(!Array.isArray(_result.upserted)) _result.upserted = [];
					_result.upserted.push({
							index: _i
						, _id: full.upserted
					});
				}

				return __callback(null, _result);
			});
		}

		// Execute all the insert operations
		for(var i = 0; i < _batch.operations.length; i++) {
			var legacyOp = new LegacyOp(_batch.batchType, _batch.operations[i], _batch.originalIndexes[i]);
			// console.dir(legacyOp)
			executeLegacyUpdate(i, legacyOp, options, function(err, result) {
				totalNumberOfUpdates = totalNumberOfUpdates - 1;
				
				// No more inserts
				if(totalNumberOfUpdates == 0) {
					_callback(null, _result);
				}
			});
		}
	}

	//
	// Execute updates
	var executeRemoves = function(_collection, _batch, _result, _callback) {
		var totalNumberOfRemoves = _batch.operations.length;
		// Options for the update operation
		var batchOptions = writeConcern || {};
		if(useLegacyOps) batchOptions.useLegacyOps = true;

		// Execute the op
		var executeLegacyRemove = function(_i, _op, _options, __callback) {
			var options = common.cloneOptions(batchOptions);

			// Add any additional options
			if(_op.operation.single != null) options.multi = _op.operation.single ? 1 : 0;

			// Execute the update
			_collection.remove(_op.operation.q, options, function(err, r) {
				// Handle error from insert function
				if(err) {
					// Merge the legacy error
					mergeLegacyError(err, _batch, _op, _i, _result);
					return __callback(null, _result);
				}

				// Update results
				_result.n = _result.n + r;
				return __callback(null, _result);
			});
		}

		// Execute all the insert operations
		for(var i = 0; i < _batch.operations.length; i++) {
			var legacyOp = new LegacyOp(_batch.batchType, _batch.operations[i], _batch.originalIndexes[i]);
			executeLegacyRemove(i, legacyOp, options, function(err, result) {
				totalNumberOfRemoves = totalNumberOfRemoves - 1;
				
				// No more inserts
				if(totalNumberOfRemoves == 0) {
					_callback(null, _result);
				}
			});
		}
	}

	// //
	// // Execute updates
	// var executeRemoves = function(_collection, _batch, _result, _callback) {
	// 	if(_batch.operations.length == 0) {
	// 		return _callback(null, _result);
	// 	}

	// 	// Get the first update
	// 	var remove = _batch.operations.shift();
		
	// 	// Options for the update operation
	// 	var options = writeConcern || {};
	// 	if(useLegacyOps) options.useLegacyOps = true;
		
	// 	// Add any additional options
	// 	options.single = remove.limit == 1 ? true : false;

	// 	// Execute the update
	// 	_collection.remove(remove.q, options, function(err, r, full) {
	// 		// Handle error from insert function
	// 		if(err) {
	// 			// Merge the legacy error
	// 			mergeLegacyError(err, _batch, remove, _result);
	// 			// Return error result
	// 			return _callback(null, _result);
	// 		}

	// 		// Update results
	// 		_result.n = _result.n + r;

	// 		// Update the index
	// 		_batch.currentIndex = _batch.currentIndex + 1;

	// 		// Execute the next insert		
	// 		executeRemoves(_collection, _batch, _result, _callback);
	// 	});
	// }

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
			// Merge the results together
			var mergeResult = mergeBatchResults(false, batch, mergeResults, err, results);
			if(mergeResult != null) {
				return callback(null, mergeResult)
			}

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
}


// /**
//  * Wraps the operations done for the batch
//  */
// var UnorderedBulkOperation = function(collection, options) {	
// 	options = options == null ? {} : options;
// 	// Namespace for the operation
//   var namespace = collection.collectionName;
//   var db = collection.db;
//   var destroyed = false;

//   // Set max byte size
// 	var maxBatchSizeBytes = db.serverConfig.checkoutWriter().maxBsonSize;

//   // Get the write concern
//   var writeConcern = shared._getWriteConcern(collection, options);

// 	// Handle to the BSON serializer, used to calculate running sizes
// 	var bson = db.bson;
// 	var self = this;

// 	// Current batch
// 	var currentBatch = null;
// 	var currentIndex = 0;
// 	var batches = [];

//   // Final results
//   var mergeResults = { n: 0, upserted: [], errDetails: [], wcErrors: 0};

// 	// Add to internal list of documents
// 	var addToOperationsList = function(docType, document) {
// 		if(currentBatch == null) currentBatch = new Batch(docType, currentIndex);
		
// 		// Get document size
// 		var size = bson.calculateObjectSize(document, false);

// 		// Check if we need to switch batch type
// 		if(currentBatch.batchType != docType) {
// 			// Save current batch
// 			batches.push(currentBatch);
// 			// Create a new batch
// 			currentBatch = new Batch(docType, currentIndex);	
// 		}

// 		// Check if we need to create a new batch
// 		if(currentBatch.size > maxBatchSizeBytes 
// 			|| currentBatch.size + size > maxBatchSizeBytes) {
// 			// Save the batch to the execution stack
// 			batches.push(currentBatch);
// 			// Create a new batch
// 			currentBatch = new Batch(docType, currentIndex);
// 		}

// 		// We have an array of documents
// 		if(Array.isArray(document)) {
// 			currentBatch.operations = currentBatch.operations.concat(document);
// 			currentIndex = currentIndex + document.length;
// 		} else {
// 			currentBatch.operations.push(document)
// 			currentIndex = currentIndex + 1;
// 		}

// 		// Update current batch size
// 		currentBatch.size = currentBatch.size + size;
// 	}

// 	// Add the insert document
// 	this.insert = function(document) {
// 		return addToOperationsList(common.INSERT, document);
// 	}

// 	//
// 	// Find based operations
// 	var findOperations = {
// 		update: function(updateDocument) {
// 			// Set the top value for the update 0 = multi true, 1 = multi false
// 			var upsert = typeof currentOp.upsert == 'boolean' ? currentOp.upsert : false;			
// 			// Establish the update command
// 			var document = {
// 					q: currentOp.selector
// 				, u: updateDocument
// 				, multi: true
// 				, upsert: upsert
// 			}

// 			// Clear out current Op
// 			currentOp = null;
// 			// Add the update document to the list
// 			return addToOperationsList(common.UPDATE, document);
// 		},

// 		updateOne: function(updateDocument) {
// 			// Set the top value for the update 0 = multi true, 1 = multi false
// 			var upsert = typeof currentOp.upsert == 'boolean' ? currentOp.upsert : false;			
// 			// Establish the update command
// 			var document = {
// 					q: currentOp.selector
// 				, u: updateDocument
// 				, multi: false
// 				, upsert: upsert
// 			}

// 			// Clear out current Op
// 			currentOp = null;
// 			// Add the update document to the list
// 			return addToOperationsList(common.UPDATE, document);
// 		},

// 		replaceOne: function(updateDocument) {
// 			findOperations.updateOne(updateDocument);
// 		},

// 		upsert: function() {
// 			currentOp.upsert = true;
// 			// Return the findOperations
// 			return findOperations;
// 		},

// 		removeOne: function() {		
// 			// Establish the update command
// 			var document = {
// 					q: currentOp.selector
// 				, limit: 1
// 			}

// 			// Clear out current Op
// 			currentOp = null;
// 			// Add the remove document to the list
// 			return addToOperationsList(common.REMOVE, document);
// 		},

// 		remove: function() {
// 			// Establish the update command
// 			var document = {
// 					q: currentOp.selector
// 				, limit: 0
// 			}

// 			// Clear out current Op
// 			currentOp = null;
// 			// Add the remove document to the list
// 			return addToOperationsList(common.REMOVE, document);
// 		}
// 	}

// 	//
// 	// Start of update and remove operations
// 	this.find = function(selector) {
// 		// Save a current selector
// 		currentOp = {
// 			selector: selector
// 		}

// 		// Return the find Operations
// 		return findOperations;
// 	}

// 	var mergeDocs = function(docs) {
// 		// Merge all the docs
// 		var _docs = [];
// 		while(docs.length > 0) {
// 			_docs = _docs.concat(docs.shift());
// 		}

// 		return _docs;
// 	}

// 	/**
// 	 * Execute all the batches
// 	 */
// 	this.execute = function(callback) {		
// 		if(destroyed) throw new util.toError("batch cannot be re-executed");
// 		// All the errors and results
// 		var errors = [];
// 		var results = [];

// 		// If we have current batch
// 		if(currentBatch) batches.push(currentBatch);
		
// 		// Total number of batches to execute
// 		var totalNumberToExecute = batches.length;

// 		// Final results
// 		var finalResults = { ok: 1, n: 0}

// 		// Execute the batch
// 		var executeBatch = function(_batch, _callback) {
// 			var command = null;

// 			if(_batch.batchType == common.UPDATE) {
// 				command = {
// 						update: namespace
// 					, updates: _batch.operations
// 					, writeConcern: writeConcern
// 				}
// 			} else if(_batch.batchType == common.INSERT) {
// 				command = {
// 						insert: namespace
// 					, documents: _batch.operations
// 					, writeConcern: writeConcern
// 				}				
// 			} else if(_batch.batchType == common.REMOVE) {
// 				command = {
// 						delete: namespace
// 					, deletes: _batch.operations
// 					, writeConcern: writeConcern
// 				}				
// 			}

// 			// Options for db execution, primary to send to master
// 			var _options = {readPreference: 'primary'};

// 			// Execute the command
// 			db.command(command, _options, function(err, result) {
// 				totalNumberToExecute = totalNumberToExecute - 1;
// 				// If we have an error
// 				if(err) result = err;

// 				// Add up the number of affected documents
// 				finalResults.n = finalResults.n + result.n;
				
// 				// Only add upserted value to final results if we have some
// 				if(result.upserted 
// 					&& !Array.isArray(finalResults.upserted)) finalResults.upserted = [];
				
// 				// We have an array of upserted values, we need to rewrite the indexes
// 				if(Array.isArray(result.upserted)) {
// 					for(var i = 0; i < result.upserted.length; i++) {
// 						finalResults.upserted.push({
// 								index: result.upserted[i].index + _batch.originalZeroIndex
// 							,	_id: result.upserted[i]._id
// 						});
// 					}
// 				}

// 				// We have a single document upserted
// 				if(result.upserted && !Array.isArray(result.upserted)) {
// 					finalResults.upserted.push({
// 							index: _batch.originalZeroIndex
// 						,	_id: result.upserted
// 					});						
// 				}

// 				// Set initial error
// 				if(result.ok == 0 && finalResults.ok == 1) {
// 					finalResults.ok = 0;
// 					finalResults.code = result.code;
// 					finalResults.errmsg = result.errmsg;
// 				}

// 				// Check if we need to add a errDetails array
// 				if(Array.isArray(result.errDetails) 
// 					&& finalResults.errDetails == null) {
// 						finalResults.errDetails = [];
// 				}

// 				// We have an array for error details, we need to rewrite the results
// 				if(Array.isArray(result.errDetails)) {
// 					for(var i = 0; i < result.errDetails.length; i++) {
// 						finalResults.errDetails.push({
// 								index: result.errDetails[i].index + _batch.originalZeroIndex
// 							, code: result.errDetails[i].code
// 							, errmsg: result.errDetails[i].errmsg
// 						})
// 					}
// 				}

// 				if(totalNumberToExecute == 0) {
// 					// Dead batch
// 					destroyed = true;
// 					// Return results
// 					_callback(null, finalResults);
// 				}
// 			});
// 		}

// 		// Execute a single legacy op
// 		var executeLegacyOp = function(_legacyOp) {
// 			return function(_callback) {				
// 				// Options for the update operation
// 				var options = {}
// 				if(writeConcern.w) options.w = writeConcern.w;
// 				if(writeConcern.wtimeout) options.wtimeout = writeConcern.wtimeout;
// 				if(writeConcern.j) options.j = writeConcern.j;
// 				if(writeConcern.fsync) options.fsync = writeConcern.fsync;

// 				// Handle the different types of operation types
// 				if(_legacyOp.batchType == common.INSERT) {
// 					collection.insert(_legacyOp.operation, options, function(err, result) {
// 						_callback(_legacyOp, err, result);
// 					});
// 				} else if(_legacyOp.batchType == common.UPDATE) {
// 					if(_legacyOp.operation.multi) options.multi = _legacyOp.operation.multi;
// 					if(_legacyOp.operation.upsert) options.upsert = _legacyOp.operation.upsert;					

// 					// Execute update operation
// 					collection.update(_legacyOp.operation.q, _legacyOp.operation.u, options, function(err, result, full) {
// 						_callback(_legacyOp, err, result, full);
// 					});
// 				} else if(_legacyOp.batchType == common.REMOVE) {
// 					if(_legacyOp.operation.limit) options.single = true;

// 					// Execute the remove command
// 					collection.remove(_legacyOp.operation.q, options, function(err, result) {
// 						_callback(_legacyOp, err, result);
// 					});
// 				}
// 			}
// 		}

// 		// Execute the operations, serially
// 		var executeCompatibilityBatch = function(_batch, _callback) {
// 			var totalToExecute = _batch.operations.length;

// 			// Run over all the operations
// 			for(var i = 0; i < _batch.operations.length; i++) {
// 				executeLegacyOp(new LegacyOp(_batch.batchType, _batch.operations[i], i))(function(_legacyOp, _err, _result, _full) {
// 					// Count down
// 					totalToExecute = totalToExecute - 1;

// 					// Handle error
// 					if(_err) {
// 						if(!Array.isArray(finalResults.errDetails)) {
// 							finalResults.errDetails = [];
// 							finalResults.ok = 0;
// 							finalResults.code = 99999;
// 							finalResults.errmsg = "batch op errors occurred";
// 						}

// 						// Save the error detail
// 						finalResults.errDetails.push({
// 								index: _legacyOp.index + _batch.originalZeroIndex
// 							,	code: _err.code
// 							, errmsg: _err.err
// 						});
// 					} else if(_legacyOp.batchType == common.INSERT) {
// 						finalResults.n = finalResults.n + 1;
// 					} else if(_legacyOp.batchType == common.UPDATE) {
// 						finalResults.n = finalResults.n + _full.n;

// 						if(_full.upserted && !Array.isArray(finalResults.upserted)) finalResults.upserted = [];
// 						if(_full.upserted) finalResults.upserted.push({
// 								index: _legacyOp.index + _batch.originalZeroIndex
// 							, _id: _full.upserted
// 						})
// 					} else if(_legacyOp.batchType == common.REMOVE) {
// 						finalResults.n = finalResults.n + _result;
// 					}

// 					if(totalToExecute == 0) {
// 						_callback(null, null);
// 					}
// 				});
// 			}
// 		}

// 		// Check if we support bulk commands
// 		if(hasWriteCommands(db.serverConfig.checkoutWriter())) {
// 			for(var i = 0; i < batches.length; i++) {
// 				executeBatch(batches[i], callback);
// 			}
// 			return
// 		}

// 		var totalBatchesToExecute = batches.length;
// 		// Execute in backwards compatible mode
// 		for(var i = 0; i < batches.length; i++) {
// 			executeCompatibilityBatch(batches[i], function() {
// 				totalBatchesToExecute = totalBatchesToExecute - 1;
// 				// All batches finished executing
// 				if(totalBatchesToExecute == 0) {
// 					// Dead batch
// 					destroyed = true;
// 					// Return the results
// 					callback(null, finalResults);
// 				}
// 			});
// 		}			
// 	}
// }

/**
 * Returns an unordered batch object
 *
 */
var initializeUnorderedBulkOp = function(options) {
	return new UnorderedBulkOperation(this, options);
}

exports.initializeUnorderedBulkOp = initializeUnorderedBulkOp;