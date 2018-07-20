'use strict';

const common = require('./common');
const BulkOperationBase = common.BulkOperationBase;
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
 * Create a FindOperatorsUnordered instance (INTERNAL TYPE, do not instantiate directly)
 * @class
 * @property {number} length Get the number of operations in the bulk.
 * @return {FindOperatorsUnordered} a FindOperatorsUnordered instance.
 */
class FindOperatorsUnordered extends BulkOperationBase {
  constructor(self) {
    super();
    this.s = self.s;
  }
  /**
   * Add a single update document to the bulk operation
   *
   * @method
   * @param {object} updateDocument update operations
   * @throws {MongoError}
   * @return {FindOperatorsUnordered}
   */
  update(updateDocument) {
    return this.bulkUpdate(updateDocument, this);
  }

  /**
   * Add a single update one document to the bulk operation
   *
   * @method
   * @param {object} updateDocument update operations
   * @throws {MongoError}
   * @return {FindOperatorsUnordered}
   */
  updateOne(updateDocument) {
    return this.bulkUpdateOne(updateDocument, this);
  }

  /**
   * Add a replace one operation to the bulk operation
   *
   * @method
   * @param {object} updateDocument the new document to replace the existing one with
   * @throws {MongoError}
   * @return {FindOperatorsUnordered}
   */
  replaceOne(updateDocument) {
    this.updateOne(updateDocument);
  }

  /**
   * Upsert modifier for update bulk operation
   *
   * @method
   * @throws {MongoError}
   * @return {FindOperatorsUnordered}
   */
  upsert() {
    return this.bulkUpsert(this);
  }

  /**
   * Add a remove one operation to the bulk operation
   *
   * @method
   * @throws {MongoError}
   * @return {FindOperatorsUnordered}
   */
  deleteOne() {
    return this.bulkDeleteOne(this);
  }

  /**
   * Add a remove operation to the bulk operation
   *
   * @method
   * @throws {MongoError}
   * @return {FindOperatorsUnordered}
   */
  delete() {
    return this.bulkDelete(this);
  }
}

// Backward compatibility
FindOperatorsUnordered.prototype.removeOne = FindOperatorsUnordered.prototype.deleteOne;
FindOperatorsUnordered.prototype.remove = FindOperatorsUnordered.prototype.delete;

//
// Add to the operations list
//
var addToOperationsList = function(_self, docType, document) {
  // Get the bsonSize
  var bsonSize = bson.calculateObjectSize(document, {
    checkKeys: false
  });
  // Throw error if the doc is bigger than the max BSON size
  if (bsonSize >= _self.s.maxBatchSizeBytes)
    throw toError('document is larger than the maximum size ' + _self.s.maxBatchSizeBytes);
  // Holds the current batch
  _self.s.currentBatch = null;
  // Get the right type of batch
  if (docType === common.INSERT) {
    _self.s.currentBatch = _self.s.currentInsertBatch;
  } else if (docType === common.UPDATE) {
    _self.s.currentBatch = _self.s.currentUpdateBatch;
  } else if (docType === common.REMOVE) {
    _self.s.currentBatch = _self.s.currentRemoveBatch;
  }

  // Create a new batch object if we don't have a current one
  if (_self.s.currentBatch == null) _self.s.currentBatch = new Batch(docType, _self.s.currentIndex);

  // Check if we need to create a new batch
  if (
    _self.s.currentBatch.size + 1 >= _self.s.maxWriteBatchSize ||
    _self.s.currentBatch.sizeBytes + bsonSize >= _self.s.maxBatchSizeBytes ||
    _self.s.currentBatch.batchType !== docType
  ) {
    // Save the batch to the execution stack
    _self.s.batches.push(_self.s.currentBatch);

    // Create a new batch
    _self.s.currentBatch = new Batch(docType, _self.s.currentIndex);
  }

  // We have an array of documents
  if (Array.isArray(document)) {
    throw toError('operation passed in cannot be an Array');
  } else {
    _self.s.currentBatch.operations.push(document);
    _self.s.currentBatch.originalIndexes.push(_self.s.currentIndex);
    _self.s.currentIndex = _self.s.currentIndex + 1;
  }

  // Save back the current Batch to the right type
  if (docType === common.INSERT) {
    _self.s.currentInsertBatch = _self.s.currentBatch;
    _self.s.bulkResult.insertedIds.push({
      index: _self.s.bulkResult.insertedIds.length,
      _id: document._id
    });
  } else if (docType === common.UPDATE) {
    _self.s.currentUpdateBatch = _self.s.currentBatch;
  } else if (docType === common.REMOVE) {
    _self.s.currentRemoveBatch = _self.s.currentBatch;
  }

  // Update current batch size
  _self.s.currentBatch.size = _self.s.currentBatch.size + 1;
  _self.s.currentBatch.sizeBytes = _self.s.currentBatch.sizeBytes + bsonSize;

  // Return self
  return _self;
};

/**
 * Create a new UnorderedBulkOperation instance (INTERNAL TYPE, do not instantiate directly)
 * @class
 * @property {number} length Get the number of operations in the bulk.
 * @return {UnorderedBulkOperation} a UnorderedBulkOperation instance.
 */
class UnorderedBulkOperation extends BulkOperationBase {
  constructor(topology, collection, options) {
    super();
    this.bulkOperation(topology, collection, options, this);
  }

  /**
   * Add a single insert document to the bulk operation
   *
   * @param {object} document the document to insert
   * @throws {MongoError}
   * @return {UnorderedBulkOperation}
   */
  insert(document) {
    return this.bulkInsert(document, this);
  }

  /**
   * Initiate a find operation for an update/updateOne/remove/removeOne/replaceOne
   *
   * @method
   * @param {object} selector The selector for the bulk operation.
   * @throws {MongoError}
   * @return {FindOperatorsUnordered}
   */
  find(selector) {
    this.bulkFind(selector, this);
    return new FindOperatorsUnordered(this);
  }

  raw(op) {
    this.bulkRaw(op, this);
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
   * @param {object} [options] Optional settings.
   * @param {(number|string)} [options.w] The write concern.
   * @param {number} [options.wtimeout] The write concern timeout.
   * @param {boolean} [options.j=false] Specify a journal write concern.
   * @param {boolean} [options.fsync=false] Specify a file sync write concern.
   * @param {UnorderedBulkOperation~resultCallback} [callback] The result callback
   * @throws {MongoError}
   * @return {Promise} returns Promise if no callback passed
   */
  execute(_writeConcern, options, callback) {
    const ret = this.bulkExecute(_writeConcern, options, callback, this);
    options = ret.options;
    callback = ret.callback;

    return executeOperation(this.s.topology, executeBatches, [this, options, callback]);
  }
}

Object.defineProperty(UnorderedBulkOperation.prototype, 'length', {
  enumerable: true,
  get: function() {
    return this.s.currentIndex;
  }
});

// Execute the command
var executeBatch = function(self, batch, options, callback) {
  var resultHandler = function(err, result) {
    // Error is a driver related error not a bulk op error, terminate
    if (((err && err.driver) || (err && err.message)) && !(err instanceof MongoWriteConcernError)) {
      return handleCallback(callback, err);
    }

    // If we have and error
    if (err) err.ok = 0;
    if (err instanceof MongoWriteConcernError) {
      return handleMongoWriteConcernError(batch, self.s.bulkResult, false, err, callback);
    }
    handleCallback(callback, null, mergeBatchResults(false, batch, self.s.bulkResult, err, result));
  };

  common.finalOptionsHandler({ options, batch, resultHandler }, self, callback);
};

//
// Execute all the commands
var executeBatches = function(self, options, callback) {
  var numberOfCommandsToExecute = self.s.batches.length;
  // Execute over all the batches
  for (var i = 0; i < self.s.batches.length; i++) {
    executeBatch(self, self.s.batches[i], options, function(err) {
      // Count down the number of commands left to execute
      numberOfCommandsToExecute = numberOfCommandsToExecute - 1;

      // Execute
      if (numberOfCommandsToExecute === 0) {
        // Driver level error
        if (err) return handleCallback(callback, err);

        const writeResult = new BulkWriteResult(self.s.bulkResult);
        if (common.handleWriteError(callback, writeResult, self)) return;

        return handleCallback(callback, null, writeResult);
      }
    });
  }
};

FindOperatorsUnordered.prototype.addToOperationsList = addToOperationsList;
UnorderedBulkOperation.prototype.addToOperationsList = addToOperationsList;

const isOrdered = function() {
  return false;
};

FindOperatorsUnordered.prototype.isOrdered = isOrdered;
UnorderedBulkOperation.prototype.isOrdered = isOrdered;

/**
 * Returns an unordered batch object
 * @ignore
 */
var initializeUnorderedBulkOp = function(topology, collection, options) {
  return new UnorderedBulkOperation(topology, collection, options);
};

initializeUnorderedBulkOp.UnorderedBulkOperation = UnorderedBulkOperation;
module.exports = initializeUnorderedBulkOp;
module.exports.Bulk = UnorderedBulkOperation;
