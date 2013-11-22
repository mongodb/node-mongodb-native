var shared = require('../shared')
  , hasWriteCommands = require('../../utils').hasWriteCommands

// Insert types
var NONE = 0;
var INSERT = 1;
var UPDATE = 2;
var REMOVE = 3

/**
 * Wraps the operations done for the batch
 */
var OrderedBulkOperation = function(collection, options) {
	options = options == null ? {} : options;
	// TODO Bring from driver information in isMaster
	var maxBatchSizeDocuments = 10000;
	
	// Merge index
	var currentExecutionIndex = 0;
	var operationDocuments = [];
	var destroyed = false;

	// Current operation
	var currentOperation = null;
	var currentOperationType = null;
	var bulkOperations = [];
	// Start index is always 0
	var indexes = [0];
	var currentTotalIndex = 0;

	// Current item
	var currentOp = null;

	// Handle to the bson serializer, used to calculate running sizes
  var db = collection.db;
	var bson = db.bson;
	var self = this;

  // Set max byte size
	var maxBatchSizeBytes = db.serverConfig.checkoutWriter().maxBsonSize;

  // Get the write concern
  var writeConcern = shared._getWriteConcern(collection, options);
	
  // Batch size
  var batchSize = 0;

	// Namespace for the operation
  var namespace = collection.collectionName;  
  var maxTimeMS = options.maxTimeMS;
  var db = collection.db;

  // Final results
  var finalResults = {
			ok: 1
		,	n: 0  	
  };

	// Insert a document
	this.insert = function(document) {
		return addToOperationsList(self, INSERT, document);
	}

	var getOrderedCommand = function(_self, _namespace, _docType, _operationDocuments) {
		// Set up the types of operation
		if(_docType == INSERT) {
			return {
					insert: _namespace
				, documents: _operationDocuments
				, ordered:true 
			}
		} else if(_docType == UPDATE) {
			return {
					update: _namespace
				, updates: _operationDocuments
				, ordered:true
			};
		} else if(_docType == REMOVE) {
			return {
					delete: _namespace
				, deletes: _operationDocuments
				, ordered:true
			};
		}		
	}

	// Add to internal list of documents
	var addToOperationsList = function(_self, docType, document) {
		var size = bson.calculateObjectSize(document, false);

		// If a different document type than original push back the operations
		if(docType != currentOperationType) {
			
			// Push the current operation to the list for execution
			if(currentOperation != null) {
				bulkOperations.push(currentOperation);
				currentTotalIndex += operationDocuments.length;
				indexes.push(currentTotalIndex);
			}
			
			// Var documents
			operationDocuments = [];

			// Create a new type
			currentOperationType = docType;

			// Set up current write operation			
			currentOperation = getOrderedCommand(_self, namespace, docType, operationDocuments);

			// Create a new type
			currentOperation.writeConcern = writeConcern;
			
			// Set the batch Size
			batchSize = size;

			// Push the operation
			if(Array.isArray(document)) {
				for(var i = 0; i < document.length; i++) {
					operationDocuments.push(document[i])		
				}
			} else {
				operationDocuments.push(document)	
			}
			
			// Return self
			return _self;
		}

		// List of the operations
		if((operationDocuments.length > maxBatchSizeDocuments)
			|| (batchSize > maxBatchSizeBytes)) {

			// Push the operation to the list
			bulkOperations.push(currentOperation);
			currentTotalIndex += operationDocuments.length;
			indexes.push(currentTotalIndex);

			// Set the size
			batchSize = size;

			// Var documents
			operationDocuments = [];

			// Create a new type
			currentOperationType = docType;

			// Set up current write operation			
			currentOperation = getOrderedCommand(_self, namespace, docType, operationDocuments);

			// Create a new type
			currentOperation.writeConcern = writeConcern;
		}

		// Update the batchSize list
		batchSize += size;
		// Push the operation
		if(Array.isArray(document)) {
			for(var i = 0; i < document.length; i++) {
				operationDocuments.push(document[i])		
			}
		} else {
			operationDocuments.push(document)	
		}
		// Return for chaining
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
			return addToOperationsList(self, UPDATE, document);
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
			return addToOperationsList(self, UPDATE, document);
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
			return addToOperationsList(self, REMOVE, document);
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
			return addToOperationsList(self, REMOVE, document);				
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
	var executeCommands = function(context, callback) {
		if(context.commands.length == 0) {
			return callback(null, finalResults);
		}

		// Ordered execution of the command
		var command = context.commands.shift();
		var startIndex = indexes.shift();
		
		// Execute it
		db.command(command, function(err, result) {			
			// If we have a single error, we have a single batch of one error
			if(err != null || (result != null && Array.isArray(result.errDetails))) {
				finalResults.ok = 0;
				finalResults.n += err.n;
				finalResults.code = err.code;
				finalResults.errmsg = err.errmsg;
				finalResults.errDetails = Array.isArray(finalResults.errDetails) ? finalResults.errDetails : []
				
				// Single error case merge in the result
				if(err != null && err.errDetails == null) {
					// Merge in the single error
					finalResults.errDetails.push({
							index: startIndex
						,	code: err.code
						, errmsg: err.errmsg
					})
				} else {
					var errDetails = err && err.errDetails ? err.errDetails : result.errDetails;
					// Let's traverse all the error details and merge them in
					for(var i = 0; i < errDetails.length; i++) {
						finalResults.errDetails.push({
								index: (startIndex + errDetails[i].index)
							,	code: err.code
							, errmsg: err.errmsg
						});
					}
				}
			} else if(result != null) {
				finalResults.n += result.n;
			}

			//
			// Merge any upserted values
			if(result != null && Array.isArray(result.upserted)) {
				// Ensure upserted results are correct
				finalResults.upserted = Array.isArray(finalResults.upserted) ? finalResults.upserted : [];
				// Merge in all the upserted items rewriting the index
				for(var i = 0; i < result.upserted.length; i++) {
					finalResults.upserted.push({
							index: (startIndex + result.upserted[i].index)
						,	_id: result.upserted[i]._id
					})
				}
			} else if(result != null && result.upserted != null) {
				finalResults.upserted.push({
						index: (startIndex + result.upserted.index)
					,	_id: result.upserted._id
				})				
			}

			// It's an ordered batch if there is an error terminate
			if(finalResults.ok == 0) {
				// Set batch is dead
				destroyed = true;
				// Return the aggregated results
				return callback(null, finalResults);
			}

			// Execute the next command in line
			executeCommands(context, callback);
		});
	}

	//
	// Execute all operation in backwards compatible fashion
	var backwardsCompatibilityExecuteCommands = function(context, callback) {
		if(context.commands.length == 0) {
			return callback(null, finalResults);
		}

		// Get a command
		var command = context.commands.shift();

		// Execute all the ops for that command
		if(command.update) {
			return executeUpdates(context, command, {n:0}, function(err, result) {
				// Merge the results
				finalResults.n += result.n;
				
				// Do we have error details
				if(result.errDetails) {
					finalResults.ok = 0;
					finalResults.code = 99999;
					finalResults.errmsg = "batch op errors occurred";
					finalResults.errDetails = result.errDetails;
					return callback(null, finalResults);
				}

				// Handle all the upserted values
				if(result.upserted && !Array.isArray(finalResults.upserted)) finalResults.upserted = [];
				if(result.upserted) finalResults.upserted = finalResults.upserted.concat(result.upserted);
				// Set batch is dead
				destroyed = true;
				// Execute the next command
				backwardsCompatibilityExecuteCommands(context, callback)
			});
		}

		if(command.insert) {
			return executeInserts(context, command, {n:0}, function(err, result) {
				// console.dir("executeInserts ==== " + context.commands.length)
				// Merge the results
				finalResults.n += result.n;
				
				// Do we have error details
				if(result.errDetails) {
					finalResults.ok = 0;
					finalResults.code = 99999;
					finalResults.errmsg = "batch op errors occurred";
					finalResults.errDetails = result.errDetails;
					return callback(null, finalResults);
				}

				// Execute the next command
				backwardsCompatibilityExecuteCommands(context, callback)
			});
		}

		if(command.delete) {		
			return executeDeletes(context, command, {n:0}, function(err, result) {
				// Merge the results
				finalResults.n += result.n;
				
				// Do we have error details
				if(result.errDetails) {
					finalResults.ok = 0;
					finalResults.code = 99999;
					finalResults.errmsg = "batch op errors occurred";
					finalResults.errDetails = result.errDetails;
					return callback(null, finalResults);
				}

				// Execute next command
				backwardsCompatibilityExecuteCommands(context, callback)
			});
		}
	}

	//
	// Execute the bulk operation
	this.execute = function(callback) {
		if(destroyed) throw new util.toError("batch cannot be re-executed");

		if(currentOperation != null) {
			bulkOperations.push(currentOperation);
			currentTotalIndex += operationDocuments.length;
			indexes.push(currentTotalIndex);
		}
		
		// Context for execution of all the commands
		var context = {
			commands: bulkOperations
		};

		// Check if we support bulk commands
		if(hasWriteCommands(db.serverConfig.checkoutWriter()))
			return executeCommands(context, callback);

		// Add fields to context
		context.writeConcern = writeConcern;
		context.collection = collection;
		context.index = 0;

		// Run in backward compatibility mode
		backwardsCompatibilityExecuteCommands(context, callback);
	}
}

var executeDeletes = function(context, command, result, callback) {
	if(command.deletes.length == 0) {
		return callback(null, result);
	}

	// Get the first update
	var del = command.deletes.shift();
	// Apply the update to the collection
	var collection = context.collection;

	// Options for the update operation
	var options = {}
	if(context.writeConcern.w) options.w = context.writeConcern.w;
	if(context.writeConcern.wtimeout) options.wtimeout = context.writeConcern.wtimeout;
	if(context.writeConcern.j) options.j = context.writeConcern.j;
	if(context.writeConcern.fsync) options.fsync = context.writeConcern.fsync;
	// Add the single option if set
	if(del.limit == 1) options.single = true;

	// Execute the update
	collection.remove(del, options, function(err, r) {
		// Handle error from insert function
		if(err) {
			if(!Array.isArray(result.errDetails)) result.errDetails = [];
			result.errDetails.push({
				index: context.index, errmsg: err.err, code: err.code
			});
			// Return error result
			return callback(null, result);
		}

		// Update results
		result.n = result.n + 1;
		// Update the index
		context.index = context.index + 1;
		// Execute the next insert		
		executeDeletes(context, command, result, callback);
	});
}

var executeInserts = function(context, command, result, callback) {
	if(command.documents.length == 0) {
		return callback(null, result);
	}

	// Get the first update
	var document = command.documents.shift();
	// Apply the update to the collection
	var collection = context.collection;
	
	// Options for the update operation
	var options = {}
	if(context.writeConcern.w) options.w = context.writeConcern.w;
	if(context.writeConcern.wtimeout) options.wtimeout = context.writeConcern.wtimeout;
	if(context.writeConcern.j) options.j = context.writeConcern.j;
	if(context.writeConcern.fsync) options.fsync = context.writeConcern.fsync;

	// Execute the update
	collection.insert(document, options, function(err, r) {
		// Handle error from insert function
		if(err) {
			if(!Array.isArray(result.errDetails)) result.errDetails = [];
			result.errDetails.push({
				index: context.index, errmsg: err.err, code: err.code
			});
			// Return error result
			return callback(null, result);
		}

		// Update results
		result.n = result.n + 1;
		// Update the index
		context.index = context.index + 1;
		// Execute the next insert		
		executeInserts(context, command, result, callback);
	});
}

var executeUpdates = function(context, command, result, callback) {
	if(command.updates.length == 0) {
		return callback(null, result);
	}

	// Get the first update
	var update = command.updates.shift();
	// Apply the update to the collection
	var collection = context.collection;
	
	// Options for the update operation
	var options = {}
	if(update.multi) options.multi = update.multi;
	if(update.upsert) options.upsert = update.upsert
	if(context.writeConcern.w) options.w = context.writeConcern.w;
	if(context.writeConcern.wtimeout) options.wtimeout = context.writeConcern.wtimeout;
	if(context.writeConcern.j) options.j = context.writeConcern.j;
	if(context.writeConcern.fsync) options.fsync = context.writeConcern.fsync;

	// Execute the update
	collection.update(update.q, update.u, options, function(err, r, full) {
		if(err) return callback(err, result);
		// Merge results
		result.n += full.n;

		// Set up the array
		if(full.upserted && !Array.isArray(result.upserted)) {
			result.upserted = [];
		}
		
		// Add result to array
		if(full.upserted) {
			result.upserted.push({index: context.index, _id: full.upserted});
		}
		
		// Update the index
		context.index = context.index + 1;
		// Execute next update
		executeUpdates(context, command, result, callback);
	});
}

/**
 * Returns an unordered batch object
 *
 */
var initializeOrderedBulkOp = function(options) {
	return new OrderedBulkOperation(this, options);
}

exports.initializeOrderedBulkOp = initializeOrderedBulkOp;
