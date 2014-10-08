var common = require('./common')
	, utils = require('../utils')
  , f = require('util').format
  , shallowClone = utils.shallowClone
  , WriteError = common.WriteError
  , BulkWriteResult = common.BulkWriteResult
  , LegacyOp = common.LegacyOp
  , ObjectID = require('mongodb-core').BSON.ObjectID
  , Batch = common.Batch
  , mergeBatchResults = common.mergeBatchResults;

/**
 * Create a new UnorderedBulkOperation instance (INTERNAL TYPE, do not instantiate directly)
 * @class
 * @return {UnorderedBulkOperation} a UnorderedBulkOperation instance.
 */
var UnorderedBulkOperation = function(topology, collection, options) {
	options = options == null ? {} : options;

	// Contains reference to self
	var self = this;
	// Get the namesspace for the write operations
  var namespace = collection.collectionName;
  // Used to mark operation as executed
  var executed = false;

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
	var bson = topology.bson;

  // Get the capabilities
  var capabilities = topology.capabilities();

  // Set max byte size
	var maxBatchSizeBytes = topology.isMasterDoc.maxBsonObjectSize;
	var maxWriteBatchSize = topology.isMasterDoc.maxWriteBatchSize || 1000;

  // Get the write concern
  var writeConcern = common.writeConcern(shallowClone(options), collection, options);

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
     * @method
     * @param {object} doc update operations
     * @throws {MongoError}
     * @return {UnorderedBulkOperation}
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
     * @method
     * @param {object} doc update operations
     * @throws {MongoError}
     * @return {UnorderedBulkOperation}
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
     * @method
     * @param {object} doc the new document to replace the existing one with
     * @throws {MongoError}
     * @return {UnorderedBulkOperation}
     */
		this.replaceOne = function(updateDocument) {
			this.updateOne(updateDocument);
		}

    /**
     * Upsert modifier for update bulk operation
     *
     * @method
     * @throws {MongoError}
     * @return {UnorderedBulkOperation}
     */
		this.upsert = function() {
			currentOp.upsert = true;
			return this;
		}

    /**
     * Add a remove one operation to the bulk operation
     *
     * @method
     * @throws {MongoError}
     * @return {UnorderedBulkOperation}
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
     * @method
     * @throws {MongoError}
     * @return {UnorderedBulkOperation}
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

      // Reset the current size trackers
      currentBatchSize = 0;
      currentBatchSizeBytes = 0;
    }

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

    // Update current batch size
    currentBatchSize = currentBatchSize + 1;
    currentBatchSizeBytes = currentBatchSizeBytes + bsonSize;

    // Return self
		return _self;
	}

	/**
	 * Add a single insert document to the bulk operation
	 *
	 * @param {object} doc the document to insert
   * @throws {MongoError}
	 * @return {UnorderedBulkOperation}
	 */
	this.insert = function(document) {
    if(document._id == null) document._id = new ObjectID();
		return addToOperationsList(self, common.INSERT, document);
	}

  /**
   * Initiate a find operation for an update/updateOne/remove/removeOne/replaceOne
   *
   * @method
   * @param {object} selector The selector for the bulk operation.
   * @throws {MongoError}
   * @return {UnorderedBulkOperation}
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

  this.raw = function(op) {
    var key = Object.keys(op)[0];

    // Update operations
    if(op.updateOne || op.updateMany || op.replaceOne) {      
      op[key].multi = op.updateOne || op.replaceOne ? false : true;
      return addToOperationsList(self, common.UPDATE, op[key]);      
    }

    // Remove operations
    if(op.removeOne || op.removeMany) {
      op[key].limit = op.removeOne ? 1 : 0;
      return addToOperationsList(self, common.REMOVE, op[key]);
    }

    // Insert operations
    if(op.insertOne) {
      return addToOperationsList(self, common.INSERT, op.insertOne);
    }
    
    if(op.insertMany) {
      for(var i = 0; i < op.insertMany.length; i++) {        
        addToOperationsList(self, common.INSERT, op.insertMany[i]);
      }

      return;
    }

    // No valid type of operation
    throw new MongoError("bulkWrite only supports insertOne, insertMany, updateOne, updateMany, removeOne, removeMany");
  }

	//
	// Execute the command
	var executeBatch = function(batch, callback) {
    var finalOptions = {ordered: false}
    if(writeConcern != null) {
      finalOptions.writeConcern = writeConcern;
    }

    var resultHandler = function(err, result) {
      // If we have and error
      if(err) err.ok = 0;
      callback(null, mergeBatchResults(false, batch, bulkResult, err, result));
    }

    if(batch.batchType == common.INSERT) {
      topology.insert(collection.namespace, batch.operations, finalOptions, resultHandler);
    } else if(batch.batchType == common.UPDATE) {
      topology.update(collection.namespace, batch.operations, finalOptions, resultHandler);
    } else if(batch.batchType == common.REMOVE) {
      topology.remove(collection.namespace, batch.operations, finalOptions, resultHandler);
    }
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
          var error = bulkResult.writeErrors.length > 0 ? bulkResult.writeErrors[0] : null;
					callback(error, new BulkWriteResult(bulkResult));
				}
			});
		}
	}
  
  /**
   * The callback format for results
   * @callback UnorderedBulkOperation~resultCallback
   * @param {MongoError} error An error instance representing the error during the execution.
   * @param {BulkWriteResult} result The bulk write result.
   */

  /**
   * Execute the ordered bulk operation
   *
   * @method
   * @param {object} [options=null] Optional settings.
   * @param {(number|string)} [options.w=null] The write concern.
   * @param {number} [options.wtimeout=null] The write concern timeout.
   * @param {boolean} [options.j=false] Specify a journal write concern.
   * @param {boolean} [options.fsync=false] Specify a file sync write concern.
   * @param {UnorderedBulkOperation~resultCallback} callback The result callback
   * @throws {MongoError}
   * @return {null}
   */
	this.execute = function(_writeConcern, callback) {
		if(executed) throw utils.toError("batch cannot be re-executed");
		if(typeof _writeConcern == 'function') {
			callback = _writeConcern;
		} else {
			writeConcern = _writeConcern;
		}

    // If we have current batch
    if(currentInsertBatch) batches.push(currentInsertBatch);
    if(currentUpdateBatch) batches.push(currentUpdateBatch);
    if(currentRemoveBatch) batches.push(currentRemoveBatch);

		// If we have no operations in the bulk raise an error
		if(batches.length == 0) {
			throw utils.toError("Invalid Operation, No operations in bulk");
		}

    // Execute batches
		return executeBatches(function(err, result) {
			callback(err, result);
		});
	}
}

/**
 * Returns an unordered batch object
 * @ignore
 */
var initializeUnorderedBulkOp = function(topology, collection, options) {
	return new UnorderedBulkOperation(topology, collection, options);
}

module.exports = initializeUnorderedBulkOp;