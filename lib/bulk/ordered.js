'use strict';

const common = require('./common');
const utils = require('../utils');
const toError = require('../utils').toError;
const handleCallback = require('../utils').handleCallback;
const BulkWriteResult = common.BulkWriteResult;
const BSON = require('mongodb-core').BSON;
const Batch = common.Batch;
const mergeBatchResults = common.mergeBatchResults;
const executeOperation = utils.executeOperation;
const MongoWriteConcernError = require('mongodb-core').MongoWriteConcernError;
const handleMongoWriteConcernError = require('./common').handleMongoWriteConcernError;

var bson = new BSON([
  BSON.Binary,
  BSON.Code,
  BSON.DBRef,
  BSON.Decimal128,
  BSON.Double,
  BSON.Int32,
  BSON.Long,
  BSON.Map,
  BSON.MaxKey,
  BSON.MinKey,
  BSON.ObjectId,
  BSON.BSONRegExp,
  BSON.Symbol,
  BSON.Timestamp
]);

/**
 * Create a FindOperatorsOrdered instance (INTERNAL TYPE, do not instantiate directly)
 * @class
 * @return {FindOperatorsOrdered} a FindOperatorsOrdered instance.
 */
var FindOperatorsOrdered = function(self) {
  this.s = self.s;
};

/**
 * Add a single update document to the bulk operation
 *
 * @method
 * @param {object} updateDocument update operations
 * @throws {MongoError}
 * @return {OrderedBulkOperation}
 */
FindOperatorsOrdered.prototype.update = function(updateDocument) {
  return common.Update(updateDocument, this);
};

/**
 * Add a single update one document to the bulk operation
 *
 * @method
 * @param {object} updateDocument update operations
 * @throws {MongoError}
 * @return {OrderedBulkOperation}
 */
FindOperatorsOrdered.prototype.updateOne = function(updateDocument) {
  return common.UpdateOne(updateDocument, this);
};

/**
 * Add a replace one operation to the bulk operation
 *
 * @method
 * @param {object} updateDocument the new document to replace the existing one with
 * @throws {MongoError}
 * @return {OrderedBulkOperation}
 */
FindOperatorsOrdered.prototype.replaceOne = function(updateDocument) {
  this.updateOne(updateDocument);
};

/**
 * Upsert modifier for update bulk operation
 *
 * @method
 * @throws {MongoError}
 * @return {FindOperatorsOrdered}
 */
FindOperatorsOrdered.prototype.upsert = function() {
  return common.Upsert(this);
};

/**
 * Add a remove one operation to the bulk operation
 *
 * @method
 * @throws {MongoError}
 * @return {OrderedBulkOperation}
 */
FindOperatorsOrdered.prototype.deleteOne = function() {
  return common.DeleteOne(this);
};

// Backward compatibility
FindOperatorsOrdered.prototype.removeOne = FindOperatorsOrdered.prototype.deleteOne;

/**
 * Add a remove operation to the bulk operation
 *
 * @method
 * @throws {MongoError}
 * @return {OrderedBulkOperation}
 */
FindOperatorsOrdered.prototype.delete = function() {
  return common.Delete(this);
};

// Backward compatibility
FindOperatorsOrdered.prototype.remove = FindOperatorsOrdered.prototype.delete;

// Add to internal list of documents
var addToOperationsList = function(_self, docType, document) {
  // Get the bsonSize
  var bsonSize = bson.calculateObjectSize(document, {
    checkKeys: false
  });

  // Throw error if the doc is bigger than the max BSON size
  if (bsonSize >= _self.s.maxBatchSizeBytes) {
    throw toError('document is larger than the maximum size ' + _self.s.maxBatchSizeBytes);
  }

  // Create a new batch object if we don't have a current one
  if (_self.s.currentBatch == null) _self.s.currentBatch = new Batch(docType, _self.s.currentIndex);

  // Check if we need to create a new batch
  if (
    _self.s.currentBatchSize + 1 >= _self.s.maxWriteBatchSize ||
    _self.s.currentBatchSizeBytes + _self.s.currentBatchSizeBytes >= _self.s.maxBatchSizeBytes ||
    _self.s.currentBatch.batchType !== docType
  ) {
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

  if (docType === common.INSERT) {
    _self.s.bulkResult.insertedIds.push({ index: _self.s.currentIndex, _id: document._id });
  }

  // We have an array of documents
  if (Array.isArray(document)) {
    throw toError('operation passed in cannot be an Array');
  } else {
    _self.s.currentBatch.originalIndexes.push(_self.s.currentIndex);
    _self.s.currentBatch.operations.push(document);
    _self.s.currentBatchSizeBytes = _self.s.currentBatchSizeBytes + bsonSize;
    _self.s.currentIndex = _self.s.currentIndex + 1;
  }

  // Return self
  return _self;
};

/**
 * Create a new OrderedBulkOperation instance (INTERNAL TYPE, do not instantiate directly)
 * @class
 * @property {number} length Get the number of operations in the bulk.
 * @return {OrderedBulkOperation} a OrderedBulkOperation instance.
 */
const OrderedBulkOperation = function(topology, collection, options) {
  common.BulkOperation(topology, collection, options, this);
};

/**
 * Add a single insert document to the bulk operation
 *
 * @param {object} document the document to insert
 * @throws {MongoError}
 * @return {OrderedBulkOperation}
 */
OrderedBulkOperation.prototype.insert = function(document) {
  return common.Insert(document, this);
};

/**
 * Initiate a find operation for an update/updateOne/remove/removeOne/replaceOne
 *
 * @method
 * @param {object} selector The selector for the bulk operation.
 * @throws {MongoError}
 * @return {FindOperatorsOrdered}
 */
OrderedBulkOperation.prototype.find = function(selector) {
  common.Find(selector, this);
  return new FindOperatorsOrdered(this);
};

Object.defineProperty(OrderedBulkOperation.prototype, 'length', {
  enumerable: true,
  get: function() {
    return this.s.currentIndex;
  }
});

OrderedBulkOperation.prototype.raw = function(op) {
  common.Raw(op, this);
};

//
// Execute next write command in a chain
var executeCommands = function(self, options, callback) {
  if (self.s.batches.length === 0) {
    return handleCallback(callback, null, new BulkWriteResult(self.s.bulkResult));
  }

  // Ordered execution of the command
  var batch = self.s.batches.shift();

  var resultHandler = function(err, result) {
    // Error is a driver related error not a bulk op error, terminate
    if (((err && err.driver) || (err && err.message)) && !(err instanceof MongoWriteConcernError)) {
      return handleCallback(callback, err);
    }

    // If we have and error
    if (err) err.ok = 0;
    if (err instanceof MongoWriteConcernError) {
      return handleMongoWriteConcernError(batch, self.s.bulkResult, true, err, callback);
    }

    // Merge the results together
    const writeResult = new BulkWriteResult(self.s.bulkResult);
    const mergeResult = mergeBatchResults(true, batch, self.s.bulkResult, err, result);
    if (mergeResult != null) {
      return handleCallback(callback, null, writeResult);
    }

    if (common.HandleWriteError(callback, writeResult, self)) return;

    // Execute the next command in line
    executeCommands(self, options, callback);
  };

  common.FinalOptionsManagement(true, options, batch, resultHandler, callback, self);
};

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
 * @param {object} [options] Optional settings.
 * @param {(number|string)} [options.w] The write concern.
 * @param {number} [options.wtimeout] The write concern timeout.
 * @param {boolean} [options.j=false] Specify a journal write concern.
 * @param {boolean} [options.fsync=false] Specify a file sync write concern.
 * @param {OrderedBulkOperation~resultCallback} [callback] The result callback
 * @throws {MongoError}
 * @return {Promise} returns Promise if no callback passed
 */
OrderedBulkOperation.prototype.execute = function(_writeConcern, options, callback) {
  const ret = common.Execute(_writeConcern, options, callback, this);
  options = ret.options;
  callback = ret.callback;

  return executeOperation(this.s.topology, executeCommands, [this, options, callback]);
};

FindOperatorsOrdered.prototype.addToOperationsList = addToOperationsList;
OrderedBulkOperation.prototype.addToOperationsList = addToOperationsList;

const isOrdered = function() {
  return true;
};

FindOperatorsOrdered.prototype.isOrdered = isOrdered;
OrderedBulkOperation.prototype.isOrdered = isOrdered;

/**
 * Returns an unordered batch object
 * @ignore
 */
var initializeOrderedBulkOp = function(topology, collection, options) {
  return new OrderedBulkOperation(topology, collection, options);
};

initializeOrderedBulkOp.OrderedBulkOperation = OrderedBulkOperation;
module.exports = initializeOrderedBulkOp;
module.exports.Bulk = OrderedBulkOperation;
