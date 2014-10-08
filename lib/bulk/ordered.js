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
 * Create a new OrderedBulkOperation instance (INTERNAL TYPE, do not instantiate directly)
 * @class
 * @return {OrderedBulkOperation} a OrderedBulkOperation instance.
 */
function OrderedBulkOperation(topology, collection, options) {
	options = options == null ? {} : options;
	// TODO Bring from driver information in isMaster
	var self = this;
	var executed = false;
	
	// Current item
	var currentOp = null;

	// Handle to the bson serializer, used to calculate running sizes
	var bson = topology.bson;

	// Namespace for the operation
  var namespace = collection.collectionName;  

  // Set max byte size
	var maxBatchSizeBytes = topology.isMasterDoc.maxBsonObjectSize;
	var maxWriteBatchSize = topology.isMasterDoc.maxWriteBatchSize || 1000;

	// Get the capabilities
	var capabilities = topology.capabilities();

  // Get the write concern
  var writeConcern = common.writeConcern(shallowClone(options), collection, options);
	
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
     * @method
		 * @param {object} doc update operations
     * @throws {MongoError}
		 * @return {OrderedBulkOperation}
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
		 * @return {OrderedBulkOperation}
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
		 * @return {OrderedBulkOperation}
		 */
		this.replaceOne = function(updateDocument) {
			this.updateOne(updateDocument);
		}

		/**
		 * Upsert modifier for update bulk operation
		 *
     * @method
     * @throws {MongoError}
		 * @return {OrderedBulkOperation}
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
		 * @return {OrderedBulkOperation}
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
		 * @return {OrderedBulkOperation}
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

  /**
   * Add a single insert document to the bulk operation
   *
   * @param {object} doc the document to insert
   * @throws {MongoError}
   * @return {OrderedBulkOperation}
   */
	this.insert = function(document) {
		if(document._id == null) document._id = new ObjectID();
		return addToOperationsList(self, common.INSERT, document);
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
   * @method
	 * @param {object} selector The selector for the bulk operation.
   * @throws {MongoError}
	 * @return {OrderedBulkOperation}
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
			return callback(null, new BulkWriteResult(bulkResult));
		}

		// Ordered execution of the command
		var batch = batches.shift();
		
    var resultHandler = function(err, result) {
    	// If we have and error
    	if(err) err.ok = 0;
			// Merge the results together
			var mergeResult = mergeBatchResults(true, batch, bulkResult, err, result);
			if(mergeResult != null) {
				return callback(null, new BulkWriteResult(bulkResult));
			}

      // If we are ordered and have errors and they are 
      // not all replication errors terminate the operation          
      if(bulkResult.writeErrors.length > 0) {
        return callback(bulkResult.writeErrors[0], new BulkWriteResult(bulkResult));
      }

			// Execute the next command in line
			executeCommands(callback);
    }

    var finalOptions = {ordered: true}
    if(writeConcern != null) {
      finalOptions.writeConcern = writeConcern;
    }

   	if(batch.batchType == common.INSERT) {
   		topology.insert(collection.namespace, batch.operations, finalOptions, resultHandler);
   	} else if(batch.batchType == common.UPDATE) {
   		topology.update(collection.namespace, batch.operations, finalOptions, resultHandler);
   	} else if(batch.batchType == common.REMOVE) {
   		topology.remove(collection.namespace, batch.operations, finalOptions, resultHandler);
   	}
	}

  /**
   * The callback format for results
   * @callback OrderedBulkOperation~resultCallback
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
   * @param {OrderedBulkOperation~resultCallback} callback The result callback
   * @throws {MongoError}
   * @return {null}
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

		// Execute the commands
		return executeCommands(callback);
	}
}

/**
 * Returns an unordered batch object
 * @ignore
 */
var initializeOrderedBulkOp = function(topology, collection, options) {
	return new OrderedBulkOperation(topology, collection, options);
}

module.exports = initializeOrderedBulkOp;