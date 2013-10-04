var shared = require('./shared');

// Insert types
var NONE = 0;
var INSERT = 1;
var UPDATE = 2;
var REMOVE = 3

/**
 * Wraps the operations done for the batch
 */
var UnorderedWriteOperationBatch = function(collection, options) {	
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
		// originalIndexes[documentInsertCount] = {
		// 		type: docType
		// 	, batch: currentOpIndex
		// 	, index: currentBatch.length - 1
		// }
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

	this.update = function(selector, updateDocument, options) {
		options = options == null ? {} : options
		// Set the top value for the update 0 = multi true, 1 = multi false
		var top = options.multi == true ? 0 : 1;
		var upsert = typeof options.upsert == 'boolean' ? options.upsert : false;
		
		// Establish the update command
		var document = {
				q: selector
			, u: updateDocument
			, top: top
			, upsert: upsert
		}

		// Add the update document to the list
		return addToOperationsList(UPDATE, document);
	}

	this.remove = function(selector, options) {		
		options = options == null ? {} : options
		// Set the top value for the remove 0 = single false, 1 = single true
		var top = options.single == true ? 1 : 0;

		// Establish the update command
		var document = {
				q: selector
			, top: top
		}

		// Add the remove document to the list
		return addToOperationsList(REMOVE, document);
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

					// Go through all the errors
					for(var k = 0; k < entryResult.errDetails.length; k++) {
						// Get the error
						var error = entryResult.errDetails[k];
						// console.dir(error)
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
				console.log("=================================================")
				console.dir(_errors)
				console.dir(_results)

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

	// var allDocuments = [];
	// var allSizes = [0];
	// var currentIndex = 0;
	// var currentDocuments = [];
	// var currentInsertType = NONE;
	// var self = this;

	// // Handle to the bson serializer, used to calculate running sizes
	// var bson = collection.db.bson;

	// // Add to internal list of documents
	// var addToOperationsList = function(docType, document) {
	// 	if(currentDocuments.length >= 0 && currentInsertType == docType) {
	// 		currentDocuments.push(document);
	// 		allSizes[currentIndex] += bson.calculateObjectSize(document, false);
	// 		return self;
	// 	}

	// 	if(currentDocuments.length == 0 && currentInsertType != docType) {
	// 		currentDocuments.push(document);
	// 		allSizes[currentIndex] += bson.calculateObjectSize(document, false);
	// 		currentInsertType = docType;
	// 		return self;
	// 	}

	// 	// Reset for new switch in types
	// 	allDocuments.push(currentDocuments);
	// 	allSizes.push(0);
	// 	currentDocuments = [document];
	// 	currentIndex = currentIndex + 1;
	// 	currentInsertType = docType;
	// 	return self;		
	// }

	// // Add the insert document
	// this.insert = function(document) {
	// 	return addToOperationsList(INSERT, document);
	// }

	// this.update = function(selector, updateDocument, options) {
	// 	options = options == null ? {} : options
	// 	// Set the top value for the update 0 = multi true, 1 = multi false
	// 	var top = options.multi == true ? 0 : 1;
	// 	var upsert = typeof options.upsert == 'boolean' ? options.upsert : false;
		
	// 	// Establish the update command
	// 	var document = {
	// 			q: selector
	// 		, u: updateDocument
	// 		, top: top
	// 		, upsert: upsert
	// 	}

	// 	// Add the update document to the list
	// 	return addToOperationsList(UPDATE, document);
	// }

	// this.remove = function(selector, options) {		
	// 	options = options == null ? {} : options
	// 	// Set the top value for the remove 0 = single false, 1 = single true
	// 	var top = options.single == true ? 1 : 0;

	// 	// Establish the update command
	// 	var document = {
	// 			q: selector
	// 		, top: top
	// 	}

	// 	// Add the remove document to the list
	// 	return addToOperationsList(REMOVE, document);
	// }

	// this.execute = function(callback) {
	// 	console.log("========================================================")
	// 	console.dir(allSizes)
	// 	console.dir(allDocuments)
	// 	callback(null, null);
	// }


/**
 * Returns an unordered batch object
 *
 */
var initializeUnorderedBatch = function(options) {
	return new UnorderedWriteOperationBatch(this, options);
}

exports.initializeUnorderedBatch = initializeUnorderedBatch;
