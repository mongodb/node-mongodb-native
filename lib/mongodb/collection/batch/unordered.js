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
  var namespace = collection.collectionName;
  var maxTimeMS = options.maxTimeMS;
  var db = collection.db;

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

	// Handle to the BSON serializer, used to calculate running sizes
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

	var buildInsertCommand = function(docs) {
		// Return the finished command
		return {
				insert: namespace
			,	documents: mergeDocs(docs)
			, ordered: false
			, writeConcern: writeConcern
		}
	}

	var buildUpdateCommand = function(docs) {
		return {
				update: namespace
			, updates: mergeDocs(docs)
			, ordered: false
			, writeConcern: writeConcern
		}
	}

	var buildRemoveCommand = function(docs) {
		return {
				delete: namespace
			,	deletes: mergeDocs(docs)
			, ordered: false
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
				if(err) results.results.push(err);
				if(result) results.results.push(result)

				if(totalBatches == 0) {
					callback(results);
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
	var mergeResponses = function(results, callback) {
		// console.log("============================================= merge responses")
		// console.dir(results)
		// results.forEach(function(e) { console.dir(e)})
		// Final results
		var finalResults = {
				ok: 1
			, n: 0
		}

		// Process all the results
		for(var i = 0; i < results.length; i++) {			
			// Get the batch result
			var batchResult = results[i];
			
			// Walk all the results for this set of batches
			for(var j = 0; j < batchResult.results.length; j++) {
				var entryResult = batchResult.results[j];				

				// Merge in the n
				finalResults.n += entryResult.n;

				// We have an error
				if(entryResult.ok == 0) {
					// Set the top level error information
					if(finalResults.code == null) {
						finalResults.ok = entryResult.ok;
						finalResults.code = entryResult.code;
						finalResults.errmsg = entryResult.errmsg;
					}

					// Ensure the final Result has error details
					finalResults.errDetails = Array.isArray(finalResults.errDetails) ? finalResults.errDetails : [];
					// Get the right error code
					var errDetails = Array.isArray(entryResult.errDetails) 
						? entryResult.errDetails 
						: [{
									index: 0
								, code: entryResult.code
								, errmsg: entryResult.errmsg
							}]

					// Let's rewrite all the results
					for(var k = 0; k < errDetails.length; k++) {
						// Get the error
						var error = errDetails[k];
						// Locate original "user" provided index of the error
						var key = batchResult.type + "-" + j + "-" + error.index;
						// Look up the "original index"
						var originalIndex = originalIndexes[key];
						// Add the rewritten error
						finalResults.errDetails.push({
								index: originalIndex
							,	code: error.code
							, errmsg: error.errmsg
						});
					}
				}

				// Merge in all the upserted values rewriting the values
				if(entryResult && entryResult.upserted) {
					var upserted = Array.isArray(entryResult.upserted) ? entryResult.upserted : [entryResult.upserted];
					finalResults.upserted = Array.isArray(finalResults.upserted) ? finalResults.upserted : []

					// Add the upserts with rewritten indexes
					for(var i = 0; i < upserted.length; i++) {
						// Locate original "user" provided index of the error
						var key = batchResult.type + "-" + j + "-" + upserted[i].index;
						// Look up the "original index"
						var originalIndex = originalIndexes[key];

						// Add the rewritten upsert information
						finalResults.upserted.push({
								index: originalIndex
							,	_id: upserted[i]._id
						})
					}
				}
			}
		} 

		// Return the final results
		callback(null, finalResults);
	}

	/**
	 * Execute all the batches
	 */
	this.execute = function(callback) {
		// Total number of batches to execute
		var totalNumberToExecute = documents[INSERT][0].length == 0 ? 0 : documents[INSERT].length;
		totalNumberToExecute += documents[UPDATE][0].length == 0 ? 0 : documents[UPDATE].length;
		totalNumberToExecute += documents[REMOVE][0].length == 0 ? 0 : documents[REMOVE].length;
		
		// All the errors and results
		var errors = [];
		var results = [];

		// Handler callback
		var handler = function(docs) {
			return function(_errors, _results) {
				totalNumberToExecute = totalNumberToExecute - docs.length;
				// Add errors and results
				if(_errors) results.push(_errors);
				if(_results) results.push(_results); 

				// If we are done call back
				if(totalNumberToExecute == 0) {
					mergeResponses(results, callback);
				}				
			}
		}

		// Execute all batches in parallel
		if(documents[INSERT].length >= 1 && documents[INSERT][0].length > 0)
			executeOutOfOrderInserts(documents[INSERT], handler(documents[INSERT]));
	
		if(documents[UPDATE].length >= 1 && documents[UPDATE][0].length > 0)
			executeOutOfOrderUpdates(documents[UPDATE], handler(documents[UPDATE]));

		if(documents[REMOVE].length >= 1 && documents[REMOVE][0].length > 0)
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
