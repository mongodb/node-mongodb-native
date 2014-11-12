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

// Specify a full class so we can generate documentation correctly
var FindOperators = function(self) {
  // Keep the internal state
  this.s = self.s;
}

/**
 * Add a single update document to the bulk operation
 *
 * @method
 * @param {object} doc update operations
 * @throws {MongoError}
 * @return {OrderedBulkOperation}
 */
FindOperators.prototype.update = function(updateDocument) {
  // Perform upsert
  var upsert = typeof this.s.currentOp.upsert == 'boolean' ? this.s.currentOp.upsert : false;
  
  // Establish the update command
  var document = {
      q: this.s.currentOp.selector
    , u: updateDocument
    , multi: true
    , upsert: upsert
  }

  // Clear out current Op
  this.s.currentOp = null;
  // Add the update document to the list
  return addToOperationsList(this, common.UPDATE, document);
} 

/**
 * Add a single update one document to the bulk operation
 *
 * @method
 * @param {object} doc update operations
 * @throws {MongoError}
 * @return {OrderedBulkOperation}
 */
FindOperators.prototype.updateOne = function(updateDocument) {
  // Perform upsert
  var upsert = typeof this.s.currentOp.upsert == 'boolean' ? this.s.currentOp.upsert : false;
  
  // Establish the update command
  var document = {
      q: this.s.currentOp.selector
    , u: updateDocument
    , multi: false
    , upsert: upsert
  }

  // Clear out current Op
  this.s.currentOp = null;
  // Add the update document to the list
  return addToOperationsList(this, common.UPDATE, document);
}

/**
 * Add a replace one operation to the bulk operation
 *
 * @method
 * @param {object} doc the new document to replace the existing one with
 * @throws {MongoError}
 * @return {OrderedBulkOperation}
 */
FindOperators.prototype.replaceOne = function(updateDocument) {
  this.updateOne(updateDocument);
}

/**
 * Upsert modifier for update bulk operation
 *
 * @method
 * @throws {MongoError}
 * @return {OrderedBulkOperation}
 */
FindOperators.prototype.upsert = function() {
  this.s.currentOp.upsert = true;
  return this;
}

/**
 * Add a remove one operation to the bulk operation
 *
 * @method
 * @throws {MongoError}
 * @return {OrderedBulkOperation}
 */
FindOperators.prototype.removeOne = function() {   
  // Establish the update command
  var document = {
      q: this.s.currentOp.selector
    , limit: 1
  }

  // Clear out current Op
  this.s.currentOp = null;
  // Add the remove document to the list
  return addToOperationsList(this, common.REMOVE, document);
}

/**
 * Add a remove operation to the bulk operation
 *
 * @method
 * @throws {MongoError}
 * @return {OrderedBulkOperation}
 */
FindOperators.prototype.remove = function() {
  // Establish the update command
  var document = {
      q: this.s.currentOp.selector
    , limit: 0
  }

  // Clear out current Op
  this.s.currentOp = null;
  // Add the remove document to the list
  return addToOperationsList(this, common.REMOVE, document);        
}

// 
// Add to the operations list
//
var addToOperationsList = function(_self, docType, document) {
  // Get the bsonSize
  var bsonSize = _self.s.bson.calculateObjectSize(document, false);
  // Throw error if the doc is bigger than the max BSON size
  if(bsonSize >= _self.s.maxBatchSizeBytes) throw utils.toError("document is larger than the maximum size " + _self.s.maxBatchSizeBytes);
  // Holds the current batch
  _self.s.currentBatch = null;
  // Get the right type of batch
  if(docType == common.INSERT) {
    _self.s.currentBatch = _self.s.currentInsertBatch;
  } else if(docType == common.UPDATE) {
    _self.s.currentBatch = _self.s.currentUpdateBatch;
  } else if(docType == common.REMOVE) {
    _self.s.currentBatch = _self.s.currentRemoveBatch;
  }

  // Create a new batch object if we don't have a current one
  if(_self.s.currentBatch == null) _self.s.currentBatch = new Batch(docType, _self.s.currentIndex);
  
  // Check if we need to switch batch type
  if(_self.s.currentBatch.batchType != docType) {
    // Save current batch
    _self.s.batches.push(_self.s.currentBatch);
    // Create a new batch
    _self.s.currentBatch = new Batch(docType, _self.s.currentIndex);  

    // Reset the current size trackers
    _self.s.currentBatchSize = 0;
    _self.s.currentBatchSizeBytes = 0;
  }

  // Check if we need to create a new batch
  if(((_self.s.currentBatchSize + 1) >= _self.s.maxWriteBatchSize)
    || ((_self.s.currentBatchSizeBytes + _self.s.currentBatchSizeBytes) >= _self.s.maxBatchSizeBytes)
    || (_self.s.currentBatch.batchType != docType)) {
    // Save the batch to the execution stack
    _self.s.batches.push(_self.s.currentBatch);
    
    // Create a new batch
    _self.s.currentBatch = new Batch(docType, _self.s.currentIndex);
    
    // Reset the current size trackers
    _self.s.currentBatchSize = 0;
    _self.s.currentBatchSizeBytes = 0;
  } else {
    // Update current batch size
    _self.s.currentBatchSize = _self.s.currentBatchSize + 1;
    _self.s.currentBatchSizeBytes = _self.s.currentBatchSizeBytes + bsonSize;
  }

  // We have an array of documents
  if(Array.isArray(document)) {
    throw utils.toError("operation passed in cannot be an Array");
  } else {
    _self.s.currentBatch.operations.push(document);
    _self.s.currentBatch.originalIndexes.push(_self.s.currentIndex);
    _self.s.currentIndex = _self.s.currentIndex + 1;
  }

  // Save back the current Batch to the right type
  if(docType == common.INSERT) {
    _self.s.currentInsertBatch = _self.s.currentBatch;
  } else if(docType == common.UPDATE) {
    _self.s.currentUpdateBatch = _self.s.currentBatch;
  } else if(docType == common.REMOVE) {
    _self.s.currentRemoveBatch = _self.s.currentBatch;
  }

  // Update current batch size
  _self.s.currentBatchSize = _self.s.currentBatchSize + 1;
  _self.s.currentBatchSizeBytes = _self.s.currentBatchSizeBytes + bsonSize;

  // Return self
  return _self;
}

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

  // Internal state
  this.s = {
    // Final result
      bulkResult: bulkResult
    // Current batch state
    , currentInsertBatch: null
    , currentUpdateBatch: null
    , currentRemoveBatch: null
    , currentBatch: null
    , currentIndex: 0
    , currentBatchSize: 0
    , currentBatchSizeBytes: 0
    , batches: []
    // Write concern
    , writeConcern: writeConcern
    // Capabilities
    , capabilities: capabilities
    // Max batch size options
    , maxBatchSizeBytes: maxBatchSizeBytes
    , maxWriteBatchSize: maxWriteBatchSize
    // Namespace
    , namespace: namespace
    // BSON
    , bson: bson
    // Topology
    , topology: topology
    // Options
    , options: options
    // Current operation
    , currentOp: currentOp
    // Executed
    , executed: executed
    // Collection
    , collection: collection
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
		return addToOperationsList(this, common.INSERT, document);
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
		this.s.currentOp = {
			selector: selector
		}

		return new FindOperators(this);
	}	

  this.raw = function(op) {
    var key = Object.keys(op)[0];

    // Update operations
    if(op.updateOne || op.updateMany || op.replaceOne) {      
      op[key].multi = op.updateOne || op.replaceOne ? false : true;
      return addToOperationsList(this, common.UPDATE, op[key]);      
    }

    // Remove operations
    if(op.removeOne || op.removeMany) {
      op[key].limit = op.removeOne ? 1 : 0;
      return addToOperationsList(this, common.REMOVE, op[key]);
    }

    // Insert operations
    if(op.insertOne) {
      return addToOperationsList(this, common.INSERT, op.insertOne);
    }
    
    if(op.insertMany) {
      for(var i = 0; i < op.insertMany.length; i++) {        
        addToOperationsList(this, common.INSERT, op.insertMany[i]);
      }

      return;
    }

    // No valid type of operation
    throw new MongoError("bulkWrite only supports insertOne, insertMany, updateOne, updateMany, removeOne, removeMany");
  }

	//
	// Execute the command
	var executeBatch = function(self, batch, callback) {
    var finalOptions = {ordered: false}
    if(writeConcern != null) {
      finalOptions.writeConcern = self.s.writeConcern;
    }

    var resultHandler = function(err, result) {
      // If we have and error
      if(err) err.ok = 0;
      callback(null, mergeBatchResults(false, batch, self.s.bulkResult, err, result));
    }

    if(batch.batchType == common.INSERT) {
      self.s.topology.insert(self.s.collection.namespace, batch.operations, finalOptions, resultHandler);
    } else if(batch.batchType == common.UPDATE) {
      self.s.topology.update(self.s.collection.namespace, batch.operations, finalOptions, resultHandler);
    } else if(batch.batchType == common.REMOVE) {
      self.s.topology.remove(self.s.collection.namespace, batch.operations, finalOptions, resultHandler);
    }
	}

	//
	// Execute all the commands
	var executeBatches = function(self, callback) {
		var numberOfCommandsToExecute = self.s.batches.length;
		// Execute over all the batches
		for(var i = 0; i < self.s.batches.length; i++) {
			executeBatch(self, self.s.batches[i], function(err, result) {
				numberOfCommandsToExecute = numberOfCommandsToExecute - 1;

				// Execute
				if(numberOfCommandsToExecute == 0) {
          var error = self.s.bulkResult.writeErrors.length > 0 ? self.s.bulkResult.writeErrors[0] : null;
					callback(error, new BulkWriteResult(self.s.bulkResult));
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
		if(this.s.executed) throw utils.toError("batch cannot be re-executed");
		if(typeof _writeConcern == 'function') {
			callback = _writeConcern;
		} else {
			this.s.writeConcern = _writeConcern;
		}

    // If we have current batch
    if(this.s.currentInsertBatch) this.s.batches.push(this.s.currentInsertBatch);
    if(this.s.currentUpdateBatch) this.s.batches.push(this.s.currentUpdateBatch);
    if(this.s.currentRemoveBatch) this.s.batches.push(this.s.currentRemoveBatch);

		// If we have no operations in the bulk raise an error
		if(this.s.batches.length == 0) {
			throw utils.toError("Invalid Operation, No operations in bulk");
		}

    // Execute batches
		return executeBatches(this, function(err, result) {
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