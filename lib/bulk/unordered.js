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
const isPromiseLike = require('../utils').isPromiseLike;

/**
 * Add to internal list of Operations
 *
 * @param {UnorderedBulkOperation} bulkOperation
 * @param {number} docType number indicating the document type
 * @param {object} document
 * @return {UnorderedBulkOperation}
 */
function addToOperationsList(bulkOperation, docType, document) {
  // Get the bsonSize
  const bsonSize = bson.calculateObjectSize(document, {
    checkKeys: false,

    // Since we don't know what the user selected for BSON options here,
    // err on the safe side, and check the size with ignoreUndefined: false.
    ignoreUndefined: false
  });
  // Throw error if the doc is bigger than the max BSON size
  if (bsonSize >= bulkOperation.s.maxBatchSizeBytes)
    throw toError('document is larger than the maximum size ' + bulkOperation.s.maxBatchSizeBytes);
  // Holds the current batch
  bulkOperation.s.currentBatch = null;
  // Get the right type of batch
  if (docType === common.INSERT) {
    bulkOperation.s.currentBatch = bulkOperation.s.currentInsertBatch;
  } else if (docType === common.UPDATE) {
    bulkOperation.s.currentBatch = bulkOperation.s.currentUpdateBatch;
  } else if (docType === common.REMOVE) {
    bulkOperation.s.currentBatch = bulkOperation.s.currentRemoveBatch;
  }

  const maxKeySize = bulkOperation.s.maxKeySize;

  // Create a new batch object if we don't have a current one
  if (bulkOperation.s.currentBatch == null)
    bulkOperation.s.currentBatch = new Batch(docType, bulkOperation.s.currentIndex);

  // Check if we need to create a new batch
  if (
    bulkOperation.s.currentBatch.size + 1 >= bulkOperation.s.maxWriteBatchSize ||
    bulkOperation.s.currentBatch.sizeBytes + maxKeySize + bsonSize >=
      bulkOperation.s.maxBatchSizeBytes ||
    bulkOperation.s.currentBatch.batchType !== docType
  ) {
    // Save the batch to the execution stack
    bulkOperation.s.batches.push(bulkOperation.s.currentBatch);

    // Create a new batch
    bulkOperation.s.currentBatch = new Batch(docType, bulkOperation.s.currentIndex);
  }

  // We have an array of documents
  if (Array.isArray(document)) {
    throw toError('operation passed in cannot be an Array');
  }

  bulkOperation.s.currentBatch.operations.push(document);
  bulkOperation.s.currentBatch.originalIndexes.push(bulkOperation.s.currentIndex);
  bulkOperation.s.currentIndex = bulkOperation.s.currentIndex + 1;

  // Save back the current Batch to the right type
  if (docType === common.INSERT) {
    bulkOperation.s.currentInsertBatch = bulkOperation.s.currentBatch;
    bulkOperation.s.bulkResult.insertedIds.push({
      index: bulkOperation.s.bulkResult.insertedIds.length,
      _id: document._id
    });
  } else if (docType === common.UPDATE) {
    bulkOperation.s.currentUpdateBatch = bulkOperation.s.currentBatch;
  } else if (docType === common.REMOVE) {
    bulkOperation.s.currentRemoveBatch = bulkOperation.s.currentBatch;
  }

  // Update current batch size
  bulkOperation.s.currentBatch.size += 1;
  bulkOperation.s.currentBatch.sizeBytes += maxKeySize + bsonSize;

  // Return bulkOperation
  return bulkOperation;
}

/**
 * Create a new UnorderedBulkOperation instance (INTERNAL TYPE, do not instantiate directly)
 * @class
 * @property {number} length Get the number of operations in the bulk.
 * @return {UnorderedBulkOperation} a UnorderedBulkOperation instance.
 */
class UnorderedBulkOperation extends BulkOperationBase {
  constructor(topology, collection, options) {
    options = options || {};
    options = Object.assign(options, { addToOperationsList });

    super(topology, collection, options, false);
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
    const ret = this.bulkExecute(_writeConcern, options, callback);
    if (!ret || isPromiseLike(ret)) {
      return ret;
    }

    options = ret.options;
    callback = ret.callback;

    return executeOperation(this.s.topology, executeBatches, [this, options, callback]);
  }
}

/**
 * Execute the command
 *
 * @param {UnorderedBulkOperation} bulkOperation
 * @param {object} batch
 * @param {object} options
 * @param {function} callback
 */
function executeBatch(bulkOperation, batch, options, callback) {
  function resultHandler(err, result) {
    // Error is a driver related error not a bulk op error, terminate
    if (((err && err.driver) || (err && err.message)) && !(err instanceof MongoWriteConcernError)) {
      return handleCallback(callback, err);
    }

    // If we have and error
    if (err) err.ok = 0;
    if (err instanceof MongoWriteConcernError) {
      return handleMongoWriteConcernError(batch, bulkOperation.s.bulkResult, false, err, callback);
    }
    handleCallback(
      callback,
      null,
      mergeBatchResults(false, batch, bulkOperation.s.bulkResult, err, result)
    );
  }

  bulkOperation.finalOptionsHandler({ options, batch, resultHandler }, callback);
}

/**
 * Execute all the commands
 *
 * @param {UnorderedBulkOperation} bulkOperation
 * @param {object} options
 * @param {function} callback
 */
function executeBatches(bulkOperation, options, callback) {
  let numberOfCommandsToExecute = bulkOperation.s.batches.length;
  let hasErrored = false;
  // Execute over all the batches
  for (let i = 0; i < bulkOperation.s.batches.length; i++) {
    executeBatch(bulkOperation, bulkOperation.s.batches[i], options, function(err) {
      if (hasErrored) {
        return;
      }

      if (err) {
        hasErrored = true;
        return handleCallback(callback, err);
      }
      // Count down the number of commands left to execute
      numberOfCommandsToExecute = numberOfCommandsToExecute - 1;

      // Execute
      if (numberOfCommandsToExecute === 0) {
        // Driver level error
        if (err) return handleCallback(callback, err);

        const writeResult = new BulkWriteResult(bulkOperation.s.bulkResult);
        if (bulkOperation.handleWriteError(callback, writeResult)) return;

        return handleCallback(callback, null, writeResult);
      }
    });
  }
}

/**
 * Returns an unordered batch object
 * @ignore
 */
function initializeUnorderedBulkOp(topology, collection, options) {
  return new UnorderedBulkOperation(topology, collection, options);
}

initializeUnorderedBulkOp.UnorderedBulkOperation = UnorderedBulkOperation;
module.exports = initializeUnorderedBulkOp;
module.exports.Bulk = UnorderedBulkOperation;
