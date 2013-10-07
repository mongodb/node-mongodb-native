var shared = require('../shared');

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
	var maxBatchSizeBytes = 1024 * 1024 * 16;
	var maxBatchSizeDocuments = 10000;
	
	// Merge index
	var currentExecutionIndex = 0;
	var operationDocuments = [];
	
	// Current operation
	var currentOperation = null;
	var currentOperationType = null;
	var bulkOperations = [];
	// Start index is always 0
	var indexes = [0];
	var currentTotalIndex = 0;

	// Current operation context
	var currentOpContext = {
		currentOp: null
	};

	// Handle to the bson serializer, used to calculate running sizes
  var db = collection.db;
	var bson = db.bson;
	var self = this;

  // Get the write concern
  var writeConcern = shared._getWriteConcern(collection, options);
	
  // Batch size
  var batchSize = 0;

	// Namespace for the operation
  var namespace = collection.db.databaseName + "." + collection.collectionName;
  var continueOnError = typeof options.continueOnError == 'boolean' ? options.continueOnError : true;
  var maxTimeMS = options.maxTimeMS;
  var db = collection.db;

	// Insert a document
	this.insert = function(document) {
		return addToOperationsList(self, INSERT, document);
	}

	// Add to internal list of documents
	var addToOperationsList = function(_self, docType, document) {
		var size = bson.calculateObjectSize(document, false);

		// If a different document type insert
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
			// Set up the type of operation
			if(docType == INSERT) currentOperation = {insert: namespace, documents: operationDocuments};
			if(docType == UPDATE) currentOperation = {update: namespace, updates: operationDocuments};
			if(docType == REMOVE) currentOperation = {delete: namespace, deletes: operationDocuments};

			// Create a new type
			currentOperation.continueOnError = continueOnError;
			currentOperation.writeConcern = writeConcern;
			
			// Set the batch Size
			batchSize = size;

			// Push the operation
			operationDocuments.push(document)
			
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
			// Set up the type of operation
			if(currentOperation == INSERT) currentOperation = {insert: namespace, documents: operationDocuments};
			if(currentOperation == UPDATE) currentOperation = {update: namespace, updates: operationDocuments};
			if(currentOperation == REMOVE) currentOperation = {delete: namespace, deletes: operationDocuments};

			// Create a new type
			currentOperation.continueOnError = continueOnError;
			currentOperation.writeConcern = writeConcern;
		}

		// Update the batchSize list
		batchSize += size;
		// Push the operation to the list
		operationDocuments.push(document);
		// Return for chaining
		return _self;
	}

	// 
	// All operations chained to a find
	//
	var findOperations = function(_self) {
		return {
			update: function(updateDocument) {
				// Set the top value for the update 0 = multi true, 1 = multi false
				var top = 0;
				var upsert = typeof _self.currentOp.upsert == 'boolean' ? _self.currentOp.upsert : false;
				
				// Establish the update command
				var document = {
						q: _self.currentOp.selector
					, u: updateDocument
					, top: top
					, upsert: upsert
				}

				// Clear out current Op
				_self.currentOp = null;
				// Add the update document to the list
				return addToOperationsList(_self, UPDATE, document);
			},

			upsert: function() {
				_self.currentOp.upsert = true;
				// Return the findOperations
				return findOperations;
			},

			removeOne: function() {		
				// Set the top value for the remove 0 = single false, 1 = single true
				var top = 1;

				// Establish the update command
				var document = {
						q: _self.currentOp.selector
					, top: top
				}

				// Clear out current Op
				_self.currentOp = null;
				// Add the remove document to the list
				return addToOperationsList(_self, REMOVE, document);
			}		
		}
	}

	// All find operations
	var allFindOperations = findOperations(currentOpContext);

	//
	// Find selector
	this.find = function(selector) {
		// Save a current selector
		currentOpContext.currentOp = {
			selector: selector
		}

		return allFindOperations;
	}

	//
	// Execute next write command in a chain
	var executeCommands = function(context, callback) {
		if(context.commands.length == 0) {
			return callback(context.errors, context.results);
		}

		// Ordered execution of the command
		var command = context.commands.shift();
		// Execute it
		db.command(command, function(err, result) {
			// Add the elements to the context
			if(err) context.errors.push(err);
			context.results.push(result);
			// Execute the next command in line
			executeCommands(context, callback);
		});
	}

	//
	// Merge all the documents together
	var mergeDocuments = function(results) {
		var finalResults = {
				ok: true
			,	n: 0
			, upserted: 0
		}

		// Iterate over all the errors
		for(var i = 0; i < results.length; i++) {
			var result = results[i];

			if(!result.ok) {
				finalResults.ok = result.ok;
				finalResults.errCode = result.errCode;
				finalResults.errMessage = result.errMessage;
				finalResults.errmsg = result.errmsg;
				if(finalResults.errDetails == null) finalResults.errDetails = [];

				// Get the starting index for any rewrites of index
				var startIndex = indexes[i];

				// Go through all the errors
				if(result.errDetails == null) {
					// Add the rewritten error
					finalResults.errDetails.push({
							index: startIndex
						,	errCode: result.errCode
						, errMessage: result.errMessage
					})					
				} else {
					for(var k = 0; k < result.errDetails.length; k++) {
						// Get the error
						var error = result.errDetails[k];
						// Add the rewritten error
						finalResults.errDetails.push({
								index: (startIndex + error.index)
							,	errCode: error.errCode
							, errMessage: error.errMessage
						})
					}					
				}
			}			

			// Add updated docs
			finalResults.n += result.n;
			finalResults.upserted += result.upserted;
		}

		// Return the final result
		return finalResults;
	}

	//
	// Execute the bulk operation
	this.execute = function(callback) {
		if(currentOperation != null) {
			bulkOperations.push(currentOperation);
			currentTotalIndex += operationDocuments.length;
			indexes.push(currentTotalIndex);
		}
		
		// Context for execution of all the commands
		var context = {
				commands: bulkOperations
			,	errors: []
			, results: []
		};

		// Execute all the commands
		executeCommands(context, function(errors, results) {
			if(errors.length > 0) return callback(errors, null);
			// Merge everything together
			callback(null, mergeDocuments(results));
		});
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
