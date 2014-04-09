var shared = require('../shared')
	, common = require('./common')
	, utils = require('../../utils')
  , hasWriteCommands = utils.hasWriteCommands
  , WriteError = common.WriteError
  , BatchWriteResult = common.BatchWriteResult
  , LegacyOp = common.LegacyOp
  , ObjectID = require('bson').ObjectID
  , Batch = common.Batch
  , mergeBatchResults = common.mergeBatchResults;

/**
 * Create a new OrderedBulkOperation instance (INTERNAL TYPE, do not instantiate directly)
 *
 * Options
 *  - **w**, {Number/String, > -1 || 'majority' || tag name} the write concern for the operation where < 1 is no acknowlegement of write and w >= 1, w = 'majority' or tag acknowledges the write
 *  - **wtimeout**, {Number, 0} set the timeout for waiting for write concern to finish (combines with w option)
 *  - **fsync**, (Boolean, default:false) write waits for fsync before returning, from MongoDB 2.6 on, fsync cannot be combined with journal
 *  - **j**, (Boolean, default:false) write waits for journal sync before returning
 *
 * @class Represents a OrderedBulkOperation
 * @param {Object} collection collection instance.
 * @param {Object} [options] additional options for the collection.
 * @return {Object} a ordered bulk operation instance.
 */
function OrderedBulkOperation (collection, options) {
	options = options == null ? {} : options;
	// TODO Bring from driver information in isMaster
	var self = this;
	var executed = false;
	
	// Current item
	var currentOp = null;

	// Handle to the bson serializer, used to calculate running sizes
  var db = collection.db;
	var bson = db.bson;

	// Namespace for the operation
  var namespace = collection.collectionName;  

  // Set max byte size
	var maxWriteBatchSize = db.serverConfig.checkoutWriter().maxWriteBatchSize || 1000;
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
  var bulkResult = {
  	  ok: 1
    , writeErrors: []
    , writeConcernErrors: []
    , nInserted: 0
    , nUpserted: 0
    , nMatched: 0
    , nModified: 0
    , nRemoved: 0
    , upserted: []
  };

  // Specify a full class so we can generate documentation correctly
	var FindOperators = function() {
		/**
		 * Add a single update document to the bulk operation
		 *
		 * @param {Object} doc update operations
		 * @return {OrderedBulkOperation}
		 * @api public
		 */
		this.update = function(updateDocument) {
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
		}	

		/**
		 * Add a single update one document to the bulk operation
		 *
		 * @param {Object} doc update operations
		 * @return {OrderedBulkOperation}
		 * @api public
		 */
		this.updateOne = function(updateDocument) {
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
		}

		/**
		 * Add a replace one operation to the bulk operation
		 *
		 * @param {Object} doc the new document to replace the existing one with
		 * @return {OrderedBulkOperation}
		 * @api public
		 */
		this.replaceOne = function(updateDocument) {
			this.updateOne(updateDocument);
		}

		/**
		 * Upsert modifier for update bulk operation
		 *
		 * @return {OrderedBulkOperation}
		 * @api public
		 */
		this.upsert = function() {
			currentOp.upsert = true;
			return this;
		}

		/**
		 * Add a remove one operation to the bulk operation
		 *
		 * @param {Object} doc selector for the removal of documents
		 * @return {OrderedBulkOperation}
		 * @api public
		 */
		this.removeOne = function() {		
			// Establish the update command
			var document = {
					q: currentOp.selector
				, limit: 1
			}

			// Clear out current Op
			currentOp = null;
			// Add the remove document to the list
			return addToOperationsList(self, common.REMOVE, document);
		}

		/**
		 * Add a remove operation to the bulk operation
		 *
		 * @param {Object} doc selector for the single document to remove
		 * @return {OrderedBulkOperation}
		 * @api public
		 */
		this.remove = function() {
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

	/**
	 * Add a single insert document to the bulk operation
	 *
	 * @param {Object} doc the document to insert
	 * @return {OrderedBulkOperation}
	 * @api public
	 */
	this.insert = function(document) {
		if(document._id == null) document._id = new ObjectID();
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
    
    // Check if we need to create a new batch
    if(((currentBatchSize + 1) >= maxWriteBatchSize)
      || ((currentBatchSizeBytes +  currentBatchSizeBytes) >= maxBatchSizeBytes)
      || (currentBatch.batchType != docType)) {
      // Save the batch to the execution stack
      batches.push(currentBatch);
      
      // Create a new batch
      currentBatch = new Batch(docType, currentIndex);
      
      // Reset the current size trackers
      currentBatchSize = 0;
      currentBatchSizeBytes = 0;
    } else {
	    // Update current batch size
	    currentBatchSize = currentBatchSize + 1;
	    currentBatchSizeBytes = currentBatchSizeBytes + bsonSize;
    }

    // We have an array of documents
    if(Array.isArray(document)) {
			throw utils.toError("operation passed in cannot be an Array");
    } else {
    	currentBatch.originalIndexes.push(currentIndex);
      currentBatch.operations.push(document)
      currentIndex = currentIndex + 1;
    }

    // Return self
		return _self;
	}

	/**
	 * Initiate a find operation for an update/updateOne/remove/removeOne/replaceOne
	 *
	 * @param {Object} doc
	 * @return {OrderedBulkOperation}
	 * @api public
	 */
	this.find = function(selector) {
		if (!selector) {
			throw utils.toError("Bulk find operation must specify a selector");
		}

		// Save a current selector
		currentOp = {
			selector: selector
		}

		return new FindOperators();
	}

	//
	// Execute next write command in a chain
	var executeCommands = function(callback) {
		if(batches.length == 0) {
			return callback(null, new BatchWriteResult(bulkResult));
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
			var mergeResult = mergeBatchResults(true, batch, bulkResult, err, result);
			if(mergeResult != null) {
				return callback(null, new BatchWriteResult(bulkResult));
			}

			// If we had a serious error
			if(bulkResult.ok == 0) {
				return callback(bulkResult.error, null);
			}

      // If we are ordered and have errors and they are 
      // not all replication errors terminate the operation          
      if(bulkResult.writeErrors.length > 0) {
        return callback(null, new BatchWriteResult(bulkResult));
      }

			// Execute the next command in line
			executeCommands(callback);
		});
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

		// Execute the update
		_collection.insert(document, options, function(err, r) {
			// If we have don't have w:0 merge the result
			if(options.w == null || options.w != 0) {
				// Merge the results in 
				var result = common.mergeLegacyResults(true, document, _batch, bulkResult, err || r, index);

				if(result == false) {
					return _callback(null, new BatchWriteResult(bulkResult));
				}				
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
		
		// Add any additional options
		if(update.multi) options.multi = update.multi;
		if(update.upsert) options.upsert = update.upsert;

		// Execute the update
		_collection.update(update.q, update.u, options, function(err, r, full) {
			// If we have don't have w:0 merge the result
			if(options.w == null || options.w != 0) {
				// Merge the results in 
				var result = common.mergeLegacyResults(true, update, _batch, bulkResult, err || full, index);
				if(result == false) {
					return _callback(null, new BatchWriteResult(bulkResult));
				}
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
		
		// Add any additional options
		options.single = remove.limit == 1 ? true : false;

		// Execute the update
		_collection.remove(remove.q, options, function(err, r) {
			// If we have don't have w:0 merge the result
			if(options.w == null || options.w != 0) {
				// Merge the results in 
				var result = common.mergeLegacyResults(true, remove, _batch, bulkResult, err || r, index);
				if(result == false) {
					return _callback(null, new BatchWriteResult(bulkResult));
				}
			}
			
			// Update the index
			_batch.currentIndex = _batch.currentIndex + 1;

			// Execute the next insert		
			executeRemoves(_collection, _batch, _result, _callback);
		});
	}

	//
	// Execute all operation in backwards compatible fashion
	var backwardsCompatibilityExecuteCommands = function(callback) {
		if(batches.length == 0) {
			return callback(null, new BatchWriteResult(bulkResult));
		}

		// Ordered execution of the command
		var batch = batches.shift();

		// Process the legacy operations
		var processLegacyOperations = function(err, results) {
			// If we have any errors stop executing
      if(bulkResult.writeErrors.length > 0) {
				return callback(null, new BatchWriteResult(bulkResult));
			}

			// If we have a top level error stop
			if(bulkResult.ok == 0) {
				return callback(bulkResult.error, null);
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

	/**
	 * Execute the ordered bulk operation
	 *
	 * Options
	 *  - **w**, {Number/String, > -1 || 'majority' || tag name} the write concern for the operation where < 1 is no acknowlegement of write and w >= 1, w = 'majority' or tag acknowledges the write
	 *  - **wtimeout**, {Number, 0} set the timeout for waiting for write concern to finish (combines with w option)
	 *  - **fsync**, (Boolean, default:false) write waits for fsync before returning, from MongoDB 2.6 on, fsync cannot be combined with journal
	 *  - **j**, (Boolean, default:false) write waits for journal sync before returning
	 *
	 * @param {Object} [options] additional options during update.
	 * @param {Function} callback this will be called after executing this method. The first parameter will contain the Error object if an error occured, or null otherwise. While the second parameter will contain the results from from the ordered bulk operation.
	 * @return {null}
	 * @api public
	 */
	this.execute = function(_writeConcern, callback) {
		if(executed) throw new utils.toError("batch cannot be re-executed");
		if(typeof _writeConcern == 'function') {
			callback = _writeConcern;
		} else {
			writeConcern = _writeConcern;
		}

    // If we have current batch
    if(currentBatch) batches.push(currentBatch);

		// If we have no operations in the bulk raise an error
		if(batches.length == 0) {
			throw utils.toError("Invalid Operation, No operations in bulk");
		}

		// Check if we support bulk commands, override if needed to use legacy ops
		if(hasWriteCommands(db.serverConfig.checkoutWriter()))
			return executeCommands(callback);

		// Set nModified to null as we don't support this field
		bulkResult.nModified = null;

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