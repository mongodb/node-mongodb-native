'use strict';

const common = require('./common');
const BulkOperationBase = common.BulkOperationBase;
const utils = require('../utils');
const toError = utils.toError;
const handleCallback = utils.handleCallback;
const BulkWriteResult = common.BulkWriteResult;
const Batch = common.Batch;
const mergeBatchResults = common.mergeBatchResults;
const executeOperation = utils.executeOperation;
const MongoWriteConcernError = require('mongodb-core').MongoWriteConcernError;
const handleMongoWriteConcernError = require('./common').handleMongoWriteConcernError;
const bson = common.bson;

/**
 * Add to internal list of Operations
 *
 * @param {OrderedBulkOperation} bulkOperation
 * @param {number} docType number indicating the document type
 * @param {object} document
 * @return {OrderedBulkOperation}
 */
function addToOperationsList(bulkOperation, docType, document) {
  // Get the bsonSize
  const bsonSize = bson.calculateObjectSize(document, {
    checkKeys: false
  });

  // Throw error if the doc is bigger than the max BSON size
  if (bsonSize >= bulkOperation.s.maxBatchSizeBytes)
    throw toError('document is larger than the maximum size ' + bulkOperation.s.maxBatchSizeBytes);

  // Create a new batch object if we don't have a current one
  if (bulkOperation.s.currentBatch == null)
    bulkOperation.s.currentBatch = new Batch(docType, bulkOperation.s.currentIndex);

  // Check if we need to create a new batch
  if (
    bulkOperation.s.currentBatchSize + 1 >= bulkOperation.s.maxWriteBatchSize ||
    bulkOperation.s.currentBatchSizeBytes + bulkOperation.s.currentBatchSizeBytes >=
      bulkOperation.s.maxBatchSizeBytes ||
    bulkOperation.s.currentBatch.batchType !== docType
  ) {
    // Save the batch to the execution stack
    bulkOperation.s.batches.push(bulkOperation.s.currentBatch);

    // Create a new batch
    bulkOperation.s.currentBatch = new Batch(docType, bulkOperation.s.currentIndex);

    // Reset the current size trackers
    bulkOperation.s.currentBatchSize = 0;
    bulkOperation.s.currentBatchSizeBytes = 0;
  } else {
    // Update current batch size
    bulkOperation.s.currentBatchSize = bulkOperation.s.currentBatchSize + 1;
    bulkOperation.s.currentBatchSizeBytes = bulkOperation.s.currentBatchSizeBytes + bsonSize;
  }

  if (docType === common.INSERT) {
    bulkOperation.s.bulkResult.insertedIds.push({
      index: bulkOperation.s.currentIndex,
      _id: document._id
    });
  }

  // We have an array of documents
  if (Array.isArray(document)) {
    throw toError('operation passed in cannot be an Array');
  } else {
    bulkOperation.s.currentBatch.originalIndexes.push(bulkOperation.s.currentIndex);
    bulkOperation.s.currentBatch.operations.push(document);
    bulkOperation.s.currentBatchSizeBytes = bulkOperation.s.currentBatchSizeBytes + bsonSize;
    bulkOperation.s.currentIndex = bulkOperation.s.currentIndex + 1;
  }

  // Return bulkOperation
  return bulkOperation;
}

/**
 * Create a new OrderedBulkOperation instance (INTERNAL TYPE, do not instantiate directly)
 * @class
 * @property {number} length Get the number of operations in the bulk.
 * @return {OrderedBulkOperation} a OrderedBulkOperation instance.
 */

class OrderedBulkOperation extends BulkOperationBase {
  constructor(topology, collection, options) {
    options = options || {};
    options = Object.assign(options, { addToOperationsList });

    super(topology, collection, options, true);
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
   * @param {object} [options] Optional settings.
   * @param {(number|string)} [options.w] The write concern.
   * @param {number} [options.wtimeout] The write concern timeout.
   * @param {boolean} [options.j=false] Specify a journal write concern.
   * @param {boolean} [options.fsync=false] Specify a file sync write concern.
   * @param {OrderedBulkOperation~resultCallback} [callback] The result callback
   * @throws {MongoError}
   * @return {Promise} returns Promise if no callback passed
   */
  execute(_writeConcern, options, callback) {
    const ret = this.bulkExecute(_writeConcern, options, callback);
    options = ret.options;
    callback = ret.callback;

    return executeOperation(this.s.topology, executeCommands, [this, options, callback]);
  }
}

/**
 * Execute next write command in a chain
 *
 * @param {OrderedBulkOperation} bulkOperation
 * @param {object} options
 * @param {function} callback
 */
function executeCommands(bulkOperation, options, callback) {
  if (bulkOperation.s.batches.length === 0) {
    return handleCallback(callback, null, new BulkWriteResult(bulkOperation.s.bulkResult));
  }

  // Ordered execution of the command
  const batch = bulkOperation.s.batches.shift();

  function resultHandler(err, result) {
    // Error is a driver related error not a bulk op error, terminate
    if (((err && err.driver) || (err && err.message)) && !(err instanceof MongoWriteConcernError)) {
      return handleCallback(callback, err);
    }

    // If we have and error
    if (err) err.ok = 0;
    if (err instanceof MongoWriteConcernError) {
      return handleMongoWriteConcernError(batch, bulkOperation.s.bulkResult, true, err, callback);
    }

    // Merge the results together
    const writeResult = new BulkWriteResult(bulkOperation.s.bulkResult);
    const mergeResult = mergeBatchResults(true, batch, bulkOperation.s.bulkResult, err, result);
    if (mergeResult != null) {
      return handleCallback(callback, null, writeResult);
    }

    if (bulkOperation.handleWriteError(callback, writeResult)) return;

    // Execute the next command in line
    executeCommands(bulkOperation, options, callback);
  }

  bulkOperation.finalOptionsHandler({ options, batch, resultHandler }, callback);
}

/**
 * Returns an unordered batch object
 * @ignore
 */
function initializeOrderedBulkOp(topology, collection, options) {
  return new OrderedBulkOperation(topology, collection, options);
}

initializeOrderedBulkOp.OrderedBulkOperation = OrderedBulkOperation;
module.exports = initializeOrderedBulkOp;
module.exports.Bulk = OrderedBulkOperation;
