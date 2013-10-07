var shared = require('../shared');

// Insert types
var NONE = 0;
var INSERT = 1;
var UPDATE = 2;
var REMOVE = 3

/**
 * Wraps the operations done for the batch
 */
var UnorderedBulkOperation = function(collection, options) {	
	options = options == null ? {} : options;
	// TODO Bring from driver information in isMaster
	var maxBatchSizeBytes = 1024 * 1024 * 16;
	var maxBatchSizeDocuments = 10000;

	// Namespace for the operation
  var namespace = collection.db.databaseName + "." + collection.collectionName;
  var continueOnError = typeof options.continueOnError == 'boolean' ? options.continueOnError : true;
  var maxTimeMS = options.maxTimeMS;
  var db = collection.db;
  // Do we merge the results or not
  var merge = typeof options.merge == 'boolean' ? options.merge : true;

  // Get the write concern
  var writeConcern = shared._getWriteConcern(collection, options);

	// Stores all batches by type
	var documents = {
		1: [[]], 2: [[]], 3: [[]]
	}

	// Store calculated batch sizes for each type
	var batchSizes = {		
		1: [0], 2: [0], 3: [0]
	}

	// Current indexes for each type
	var currentIndexes = {
		1: 0, 2: 0, 3: 0
	}

	// Original index of a document
	var originalIndexes = [];
	var documentInsertCount = 0;

	// Handle to the bson serializer, used to calculate running sizes
	var bson = db.bson;
	var self = this;

	// Current item
	var currentOp = null;

	// Add to internal list of documents
	var addToOperationsList = function(docType, document) {
		// Validate if we need to create a new "batch" for the operation
		var size = bson.calculateObjectSize(document, false);
		// Get current batch operation index
		var currentOpIndex = currentIndexes[docType];
		// Get the current batch array
		var currentBatch = documents[docType][currentOpIndex];
		// Get the current binary batch size
		var batchSize = batchSizes[docType][currentOpIndex];

		// If we are over the allowed max, adjust the docs and create a new batch document
		if((currentBatch.length > maxBatchSizeDocuments) 
			|| (batchSize + size > maxBatchSizeBytes)) {
			// Adjust the current type Batch Index
			currentIndexes[docType] += 1;
			currentOpIndex = currentIndexes[docType];
			// Add a new empty batch
			documents[docType][currentOpIndex] = [];
			currentBatch = documents[docType][currentOpIndex];
			// Add a new empty batch size
			batchSizes[docType][currentOpIndex] = 0;
		}

		// Add the document to the batch
		currentBatch.push(document);
		batchSizes[docType][currentOpIndex] += size;

		// Ensure we keep the original index position in the batch
		originalIndexes[docType 
			+ "-" 
			+ currentOpIndex 
			+ "-" 
			+ (currentBatch.length - 1)] = documentInsertCount;

		// Update the original write op index
		documentInsertCount = documentInsertCount + 1;
		// Return for chaining
		return self;
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
			var top = 0;
			var upsert = typeof currentOp.upsert == 'boolean' ? currentOp.upsert : false;
			
			// Establish the update command
			var document = {
					q: currentOp.selector
				, u: updateDocument
				, top: top
				, upsert: upsert
			}

			// Clear out current Op
			currentOp = null;
			// Add the update document to the list
			return addToOperationsList(UPDATE, document);
		},

		upsert: function() {
			currentOp.upsert = true;
			// Return the findOperations
			return findOperations;
		},

		removeOne: function() {		
			// Set the top value for the remove 0 = single false, 1 = single true
			var top = 1;

			// Establish the update command
			var document = {
					q: currentOp.selector
				, top: top
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

	var buildInsertCommand = function(docs) {
		return {
					insert: namespace
				,	documents: docs
				, continueOnError: continueOnError
				, writeConcern: writeConcern
		}
	}

	var buildUpdateCommand = function(docs) {
		return {
				update: namespace
			, updates: docs
			, continueOnError: continueOnError
			, writeConcern: writeConcern
		}
	}

	var buildRemoveCommand = function(docs) {
		return {
				delete: namespace
			,	deletes: docs
			, continueOnError: continueOnError
			, writeConcern: writeConcern
		}
	}

	var executeOutOfOrderWriteCommands = function(docType, docs, commandBuilder, callback) {
		var totalBatches = docs.length;
		var errors = [];
		var results = {type: docType, results: []};

		// Execute all the batches
		for(var i = 0; i < docs.length; i++) {
			// Build the command
			var command = commandBuilder(docs[i]);
			// Set up the options for the command
			var _options = maxTimeMS != null ? {maxTimeMS : maxTimeMS} : {};

			// Checkout a write connection
			var connection = db.serverConfig.checkoutWriter();
			
			// Execute the command with the writer
			db.command(command, _options, function(err, result) {
				totalBatches = totalBatches - 1;
				if(err) errors.push(err);
				if(result) results.results.push(result)

				if(totalBatches == 0) {
					callback(errors, results);
				}
			});
		}		
	}

	var executeOutOfOrderInserts = function(docs, callback) {
		executeOutOfOrderWriteCommands(INSERT, docs, buildInsertCommand, callback);
	}

	var executeOutOfOrderUpdates = function(docs, callback) {
		executeOutOfOrderWriteCommands(UPDATE, docs, buildUpdateCommand, callback);
	}

	var executeOutOfOrderRemoves = function(docs, callback) {
		executeOutOfOrderWriteCommands(REMOVE, docs, buildRemoveCommand, callback);
	}

	// Two implementations for results
	// One merge results, and another raw responses
	var mergeResponses = function(errors, results, callback) {
		// Final results
		var finalResults = {
				ok: true
			, n: 0
			, upserted: 0
		}

		// Merge all the errors
		var finalErrors = [];
		for(var i = 0; i < errors.length; i++) {
			finalErrors = finalErrors.concat(errors[i])
		}

		// Process all the results
		for(var i = 0; i < results.length; i++) {			
			// Get the batch result
			var batchResult = results[i];
			
			// Walk all the results for this set of batches
			for(var j = 0; j < batchResult.results.length; j++) {
				var entryResult = batchResult.results[j];				

				// Is it an error, let's make sure we set the expected error
				// on the merged results
				if(!entryResult.ok) {
					// Ensure we mark the batch result with error
					finalResults.ok = entryResult.ok;
					finalResults.errCode = entryResult.errCode;
					finalResults.errMessage = entryResult.errMessage;
					finalResults.errmsg = entryResult.errmsg;
					finalResults.n += entryResult.n;
					finalResults.upserted += entryResult.upserted
					if(finalResults.errDetails == null) finalResults.errDetails = [];

					// Single error returned
					if(entryResult.errDetails == null) {
						// Locate original "user" provided index of the error
						var key = batchResult.type + "-" + j + "-" + 0;
						// Look up the "original index"
						var originalIndex = originalIndexes[key];
						// Genereate error
						finalResults.errDetails.push({
								index: originalIndex
							,	errCode: entryResult.errCode
							, errMessage: entryResult.errMessage
						})
					} else {
						// Go through all the errors
						for(var k = 0; k < entryResult.errDetails.length; k++) {
							// Get the error
							var error = entryResult.errDetails[k];
							// Locate original "user" provided index of the error
							var key = batchResult.type + "-" + j + "-" + error.index;
							// Look up the "original index"
							var originalIndex = originalIndexes[key];
							// Add the rewritten error
							finalResults.errDetails.push({
									index: originalIndex
								,	errCode: error.errCode
								, errMessage: error.errMessage
							})
						}						
					}
				} else {
					finalResults.n += entryResult.n;
					finalResults.upserted += entryResult.upserted;
				}
			}
		} 

		// Return the final results
		callback(finalErrors.length == 0 ? null : finalErrors, finalResults);
	}

	// Do not merge the responses
	var doNotMergeResponses = function(errors, results, callback) {
		callback(errors.length == 0 ? null : errors, results);
	}

	/**
	 * Execute all the batches
	 */
	this.execute = function(callback) {
		// Total number of batches to execute
		var totalNumberToExecute = documents[INSERT].length 
			+ documents[UPDATE].length
			+ documents[REMOVE].length;				
		
		// All the errors and results
		var errors = [];
		var results = [];

		// Handler callback
		var handler = function(docs) {
			return function(_errors, _results) {
				totalNumberToExecute = totalNumberToExecute - docs.length;
				// Add errors and results
				if(_errors) errors.push(_errors);
				if(_results) results.push(_results); 

				// If we are done call back
				if(totalNumberToExecute == 0) {
					if(merge) return mergeResponses(errors, results, callback);
					doNotMergeResponses(errors, results, callback);
				}				
			}
		}

		// Execute all batches in parallel
		executeOutOfOrderInserts(documents[INSERT], handler(documents[INSERT]));
		executeOutOfOrderUpdates(documents[UPDATE], handler(documents[UPDATE]));
		executeOutOfOrderRemoves(documents[REMOVE], handler(documents[REMOVE]));
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
