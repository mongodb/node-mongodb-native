var common = require('./common')
	, utils = require('../utils')
  , toError = require('../utils').toError
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

// Add to internal list of documents
var addToOperationsList = function(_self, docType, document) {
  // Get the bsonSize
  var bsonSize = _self.s.bson.calculateObjectSize(document, false);

  // Throw error if the doc is bigger than the max BSON size
  if(bsonSize >= _self.s.maxBatchSizeBytes) throw toError("document is larger than the maximum size " + _self.s.maxBatchSizeBytes);
  // Create a new batch object if we don't have a current one
  if(_self.s.currentBatch == null) _self.s.currentBatch = new Batch(docType, _self.s.currentIndex);
  
  // Check if we need to create a new batch
  if(((_self.s.currentBatchSize + 1) >= _self.s.maxWriteBatchSize)
    || ((_self.s.currentBatchSizeBytes +  _self.s.currentBatchSizeBytes) >= _self.s.maxBatchSizeBytes)
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

  if(docType == common.INSERT) {
    _self.s.bulkResult.insertedIds.push({index: _self.s.currentIndex, _id: document._id});
  }

  // We have an array of documents
  if(Array.isArray(document)) {
    throw toError("operation passed in cannot be an Array");
  } else {
    _self.s.currentBatch.originalIndexes.push(_self.s.currentIndex);
    _self.s.currentBatch.operations.push(document)
    _self.s.currentIndex = _self.s.currentIndex + 1;
  }

  // Return self
  return _self;
}

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
    , insertedIds: []
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
}

OrderedBulkOperation.prototype.raw = function(op) {
  var key = Object.keys(op)[0];

  // Update operations
  if((op.updateOne && op.updateOne.q) 
    || (op.updateMany && op.updateMany.q) 
    || (op.replaceOne && op.replaceOne.q)) {      
    op[key].multi = op.updateOne || op.replaceOne ? false : true;
    return addToOperationsList(this, common.UPDATE, op[key]);      
  }

  // Crud spec update format
  if(op.updateOne || op.updateMany || op.replaceOne) {
    var multi = op.updateOne || op.replaceOne ? false : true;
    var operation = {q: op[key].filter, u: op[key].update || op[key].replacement, multi: multi}
    if(op[key].upsert) operation.upsert = true;
    return addToOperationsList(this, common.UPDATE, operation);
  }

  // Remove operations
  if(op.removeOne || op.removeMany || (op.deleteOne && op.deleteOne.q) || op.deleteMany && op.deleteMany.q) {
    op[key].limit = op.removeOne ? 1 : 0;
    return addToOperationsList(this, common.REMOVE, op[key]);
  }

  // Crud spec delete operations, less efficient
  if(op.deleteOne || op.deleteMany) {
    var limit = op.deleteOne ? 1 : 0;
    var operation = {q: op[key].filter, limit: limit}
    return addToOperationsList(this, common.REMOVE, operation); 
  }

  // Insert operations
  if(op.insertOne && op.insertOne.document == null) {
    if(op.insertOne._id == null) op.insertOne._id = new ObjectID();
    return addToOperationsList(this, common.INSERT, op.insertOne);
  } else if(op.insertOne && op.insertOne.document) {
    if(op.insertOne.document._id == null) op.insertOne.document._id = new ObjectID();
    return addToOperationsList(this, common.INSERT, op.insertOne.document);
  }
  
  if(op.insertMany) {
    for(var i = 0; i < op.insertMany.length; i++) {        
      if(op.insertMany[i]._id == null) op.insertMany[i]._id = new ObjectID();
      addToOperationsList(this, common.INSERT, op.insertMany[i]);
    }

    return;
  }

  // No valid type of operation
  throw toError("bulkWrite only supports insertOne, insertMany, updateOne, updateMany, removeOne, removeMany, deleteOne, deleteMany");
}

/**
 * Add a single insert document to the bulk operation
 *
 * @param {object} doc the document to insert
 * @throws {MongoError}
 * @return {OrderedBulkOperation}
 */
OrderedBulkOperation.prototype.insert = function(document) {
  if(document._id == null) document._id = new ObjectID();
  return addToOperationsList(this, common.INSERT, document);
}

/**
 * Initiate a find operation for an update/updateOne/remove/removeOne/replaceOne
 *
 * @method
 * @param {object} selector The selector for the bulk operation.
 * @throws {MongoError}
 * @return {OrderedBulkOperation}
 */
OrderedBulkOperation.prototype.find = function(selector) {
  if (!selector) {
    throw toError("Bulk find operation must specify a selector");
  }

  // Save a current selector
  this.s.currentOp = {
    selector: selector
  }

  return new FindOperators(this);
}

//
// Execute next write command in a chain
var executeCommands = function(self, callback) {
  if(self.s.batches.length == 0) {
    return callback(null, new BulkWriteResult(self.s.bulkResult));
  }

  // Ordered execution of the command
  var batch = self.s.batches.shift();
  
  var resultHandler = function(err, result) {
    // If we have and error
    if(err) err.ok = 0;
    // Merge the results together
    var mergeResult = mergeBatchResults(true, batch, self.s.bulkResult, err, result);
    if(mergeResult != null) {
      return callback(null, new BulkWriteResult(self.s.bulkResult));
    }

    // If we are ordered and have errors and they are 
    // not all replication errors terminate the operation          
    if(self.s.bulkResult.writeErrors.length > 0) {
      return callback(self.s.bulkResult.writeErrors[0], new BulkWriteResult(self.s.bulkResult));
    }

    // Execute the next command in line
    executeCommands(self, callback);
  }

  var finalOptions = {ordered: true}
  if(self.s.writeConcern != null) {
    finalOptions.writeConcern = self.s.writeConcern;
  }

  if(batch.batchType == common.INSERT) {
    self.s.topology.insert(self.s.collection.namespace, batch.operations, finalOptions, resultHandler);
  } else if(batch.batchType == common.UPDATE) {
    self.s.topology.update(self.s.collection.namespace, batch.operations, finalOptions, resultHandler);
  } else if(batch.batchType == common.REMOVE) {
    self.s.topology.remove(self.s.collection.namespace, batch.operations, finalOptions, resultHandler);
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
OrderedBulkOperation.prototype.execute = function(_writeConcern, callback) {
  if(this.s.executed) throw new toError("batch cannot be re-executed");
  if(typeof _writeConcern == 'function') {
    callback = _writeConcern;
  } else {
    this.s.writeConcern = _writeConcern;
  }

  // If we have current batch
  if(this.s.currentBatch) this.s.batches.push(this.s.currentBatch);

  // If we have no operations in the bulk raise an error
  if(this.s.batches.length == 0) {
    throw toError("Invalid Operation, No operations in bulk");
  }

  // Execute the commands
  return executeCommands(this, callback);
}

/**
 * Returns an unordered batch object
 * @ignore
 */
var initializeOrderedBulkOp = function(topology, collection, options) {
	return new OrderedBulkOperation(topology, collection, options);
}

module.exports = initializeOrderedBulkOp;