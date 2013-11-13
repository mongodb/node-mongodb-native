var shared = require('../shared')
  , hasWriteCommands = require('../../utils').hasWriteCommands;

// Insert types
var NONE = 0;
var INSERT = 1;
var UPDATE = 2;
var REMOVE = 3

/**
 * Batch wrapper
 */
var Batch = function(batchType, originalZeroIndex) {	
	this.originalZeroIndex = originalZeroIndex;
	this.batchType = batchType;
	this.operations = []
	this.size = 0;
}

var LegacyOp = function(batchType, operation, index) {
	this.batchType = batchType;
	this.index = index;
	this.operation = operation;
}

/**
 * Wraps the operations done for the batch
 */
var UnorderedBulkOperation = function(collection, options) {	
	options = options == null ? {} : options;
	// Namespace for the operation
  var namespace = collection.collectionName;
  var maxTimeMS = options.maxTimeMS;
  var db = collection.db;
  var destroyed = false;

  // Set max byte size
	var maxBatchSizeBytes = db.serverConfig.checkoutWriter().maxBsonSize;

  // Get the write concern
  var writeConcern = shared._getWriteConcern(collection, options);

	// Handle to the BSON serializer, used to calculate running sizes
	var bson = db.bson;
	var self = this;

	// Current batch
	var currentBatch = null;
	var currentIndex = 0;
	var batches = [];

	// Add to internal list of documents
	var addToOperationsList = function(docType, document) {
		if(currentBatch == null) currentBatch = new Batch(docType, currentIndex);
		
		// Get document size
		var size = bson.calculateObjectSize(document, false);

		// Check if we need to switch batch type
		if(currentBatch.batchType != docType) {
			// Save current batch
			batches.push(currentBatch);
			// Create a new batch
			currentBatch = new Batch(docType, currentIndex);	
		}

		// Check if we need to create a new batch
		if(currentBatch.size > maxBatchSizeBytes 
			|| currentBatch.size + size > maxBatchSizeBytes) {
			// Save the batch to the execution stack
			batches.push(currentBatch);
			// Create a new batch
			currentBatch = new Batch(docType, currentIndex);
		}

		// We have an array of documents
		if(Array.isArray(document)) {
			currentBatch.operations = currentBatch.operations.concat(document);
			currentIndex = currentIndex + document.length;
		} else {
			currentBatch.operations.push(document)
			currentIndex = currentIndex + 1;
		}

		// Update current batch size
		currentBatch.size = currentBatch.size + size;
	}

	// Add the insert document
	this.insert = function(document) {
		return addToOperationsList(INSERT, document);
	}

	//
	// Find based operations
	var findOperations = {
		update: function(updateDocument) {
			// Set the top value for the update 0 = multi true, 1 = multi false
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
			return addToOperationsList(UPDATE, document);
		},

		updateOne: function(updateDocument) {
			// Set the top value for the update 0 = multi true, 1 = multi false
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
			return addToOperationsList(UPDATE, document);
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
			return addToOperationsList(REMOVE, document);
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
			return addToOperationsList(REMOVE, document);
		}
	}

	//
	// Start of update and remove operations
	this.find = function(selector) {
		// Save a current selector
		currentOp = {
			selector: selector
		}

		// Return the find Operations
		return findOperations;
	}

	var mergeDocs = function(docs) {
		// Merge all the docs
		var _docs = [];
		while(docs.length > 0) {
			_docs = _docs.concat(docs.shift());
		}

		return _docs;
	}

	/**
	 * Execute all the batches
	 */
	this.execute = function(callback) {		
		if(destroyed) throw new util.toError("batch cannot be re-executed");
		// All the errors and results
		var errors = [];
		var results = [];

		// If we have current batch
		if(currentBatch) batches.push(currentBatch);
		
		// Total number of batches to execute
		var totalNumberToExecute = batches.length;

		// Final results
		var finalResults = { ok: 1, n: 0}

		// Execute the batch
		var executeBatch = function(_batch, _callback) {
			var command = null;

			if(_batch.batchType == UPDATE) {
				command = {
						update: namespace
					, updates: _batch.operations
					, writeConcern: writeConcern
				}
			} else if(_batch.batchType == INSERT) {
				command = {
						insert: namespace
					, documents: _batch.operations
					, writeConcern: writeConcern
				}				
			} else if(_batch.batchType == REMOVE) {
				command = {
						delete: namespace
					, deletes: _batch.operations
					, writeConcern: writeConcern
				}				
			}

			// Options for db execution, primary to send to master and optional maxTimeMS
			var _options = {readPreference: 'primary'};

			// Execute the command
			db.command(command, _options, function(err, result) {
				totalNumberToExecute = totalNumberToExecute - 1;
				// If we have an error
				if(err) result = err;

				// Add up the number of affected documents
				finalResults.n = finalResults.n + result.n;
				
				// Only add upserted value to final results if we have some
				if(result.upserted 
					&& !Array.isArray(finalResults.upserted)) finalResults.upserted = [];
				
				// We have an array of upserted values, we need to rewrite the indexes
				if(Array.isArray(result.upserted)) {
					for(var i = 0; i < result.upserted.length; i++) {
						finalResults.upserted.push({
								index: result.upserted[i].index + _batch.originalZeroIndex
							,	_id: result.upserted[i]._id
						});
					}
				}

				// We have a single document upserted
				if(result.upserted && !Array.isArray(result.upserted)) {
					finalResults.upserted.push({
							index: _batch.originalZeroIndex
						,	_id: result.upserted
					});						
				}

				// Set initial error
				if(result.ok == 0 && finalResults.ok == 1) {
					finalResults.ok = 0;
					finalResults.code = result.code;
					finalResults.errmsg = result.errmsg;
				}

				// Check if we need to add a errDetails array
				if(Array.isArray(result.errDetails) 
					&& finalResults.errDetails == null) {
						finalResults.errDetails = [];
				}

				// We have an array for error details, we need to rewrite the results
				if(Array.isArray(result.errDetails)) {
					for(var i = 0; i < result.errDetails.length; i++) {
						finalResults.errDetails.push({
								index: result.errDetails[i].index + _batch.originalZeroIndex
							, code: result.errDetails[i].code
							, errmsg: result.errDetails[i].errmsg
						})
					}
				}

				if(totalNumberToExecute == 0) {
					// Dead batch
					destroyed = true;
					// Return results
					_callback(null, finalResults);
				}
			});
		}

		// Execute a single legacy op
		var executeLegacyOp = function(_legacyOp) {
			return function(_callback) {				
				// Options for the update operation
				var options = {}
				if(writeConcern.w) options.w = writeConcern.w;
				if(writeConcern.wtimeout) options.wtimeout = writeConcern.wtimeout;
				if(writeConcern.j) options.j = writeConcern.j;
				if(writeConcern.fsync) options.fsync = writeConcern.fsync;

				// Handle the different types of operation types
				if(_legacyOp.batchType == INSERT) {
					collection.insert(_legacyOp.operation, options, function(err, result) {
						_callback(_legacyOp, err, result);
					});
				} else if(_legacyOp.batchType == UPDATE) {
					if(_legacyOp.operation.multi) options.multi = _legacyOp.operation.multi;
					if(_legacyOp.operation.upsert) options.upsert = _legacyOp.operation.upsert;					

					// Execute update operation
					collection.update(_legacyOp.operation.q, _legacyOp.operation.u, options, function(err, result, full) {
						_callback(_legacyOp, err, result, full);
					});
				} else if(_legacyOp.batchType == REMOVE) {
					if(_legacyOp.operation.limit) options.single = true;

					// Execute the remove command
					collection.remove(_legacyOp.operation.q, options, function(err, result) {
						_callback(_legacyOp, err, result);
					});
				}
			}
		}

		// Execute the operations, serially
		var executeCompatibilityBatch = function(_batch, _callback) {
			var totalToExecute = _batch.operations.length;

			// Run over all the operations
			for(var i = 0; i < _batch.operations.length; i++) {
				executeLegacyOp(new LegacyOp(_batch.batchType, _batch.operations[i], i))(function(_legacyOp, _err, _result, _full) {
					// Count down
					totalToExecute = totalToExecute - 1;

					// Handle error
					if(_err) {
						if(!Array.isArray(finalResults.errDetails)) {
							finalResults.errDetails = [];
							finalResults.ok = 0;
							finalResults.code = 99999;
							finalResults.errmsg = "batch op errors occurred";
						}

						// Save the error detail
						finalResults.errDetails.push({
								index: _legacyOp.index + _batch.originalZeroIndex
							,	code: _err.code
							, errmsg: _err.err
						});
					} else if(_legacyOp.batchType == INSERT) {
						finalResults.n = finalResults.n + 1;
					} else if(_legacyOp.batchType == UPDATE) {
						finalResults.n = finalResults.n + _full.n;

						if(_full.upserted && !Array.isArray(finalResults.upserted)) finalResults.upserted = [];
						if(_full.upserted) finalResults.upserted.push({
								index: _legacyOp.index + _batch.originalZeroIndex
							, _id: _full.upserted
						})
					} else if(_legacyOp.batchType == REMOVE) {
						finalResults.n = finalResults.n + _result;
					}

					if(totalToExecute == 0) {
						_callback(null, null);
					}
				});
			}
		}

		// Check if we support bulk commands
		if(hasWriteCommands(db.serverConfig.checkoutWriter())) {
			for(var i = 0; i < batches.length; i++) {
				executeBatch(batches[i], callback);
			}
			return
		}

		var totalBatchesToExecute = batches.length;
		// Execute in backwards compatible mode
		for(var i = 0; i < batches.length; i++) {
			executeCompatibilityBatch(batches[i], function() {
				totalBatchesToExecute = totalBatchesToExecute - 1;
				// All batches finished executing
				if(totalBatchesToExecute == 0) {
					// Dead batch
					destroyed = true;
					// Return the results
					callback(null, finalResults);
				}
			});
		}			
	}
}

/**
 * Returns an unordered batch object
 *
 */
var initializeBulkOp = function(options) {
	return new UnorderedBulkOperation(this, options);
}

exports.initializeBulkOp = initializeBulkOp;