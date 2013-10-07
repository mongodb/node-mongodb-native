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
			if(currentOperation != null) bulkOperations.push(currentOperation);
			
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
	// Execute the bulk operation
	this.execute = function(callback) {
		if(currentOperation != null) bulkOperations.push(currentOperation);
		
		// Context for execution of all the commands
		var context = {
				commands: bulkOperations
			,	errors: []
			, results: []
		};

		// Execute all the commands
		executeCommands(context, function(errors, results) {
			console.log("-------------------------------------------------")
			console.dir(errors)
			console.dir(results)
			callback(null, null);
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
