'use strict';

const common = require('./common');
const BulkOperationBase = common.BulkOperationBase;
const Batch = common.Batch;
const bson = common.bson;
const utils = require('../utils');
const toError = utils.toError;

/**
 * Add to internal list of Operations
 *
 * @ignore
 * @param {OrderedBulkOperation} bulkOperation
 * @param {number} docType number indicating the document type
 * @param {object} document
 * @return {OrderedBulkOperation}
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
  if (bsonSize >= bulkOperation.s.maxBsonObjectSize)
    throw toError('document is larger than the maximum size ' + bulkOperation.s.maxBsonObjectSize);

  // Create a new batch object if we don't have a current one
  if (bulkOperation.s.currentBatch == null)
    bulkOperation.s.currentBatch = new Batch(docType, bulkOperation.s.currentIndex);

  const maxKeySize = bulkOperation.s.maxKeySize;

  // Check if we need to create a new batch
  if (
    // New batch if we exceed the max batch op size
    bulkOperation.s.currentBatchSize + 1 >= bulkOperation.s.maxWriteBatchSize ||
    // New batch if we exceed the maxBatchSizeBytes. Only matters if batch already has a doc,
    // since we can't sent an empty batch
    (bulkOperation.s.currentBatchSize > 0 &&
      bulkOperation.s.currentBatchSizeBytes + maxKeySize + bsonSize >=
        bulkOperation.s.maxBatchSizeBytes) ||
    // New batch if the new op does not have the same op type as the current batch
    bulkOperation.s.currentBatch.batchType !== docType
  ) {
    // Save the batch to the execution stack
    bulkOperation.s.batches.push(bulkOperation.s.currentBatch);

    // Create a new batch
    bulkOperation.s.currentBatch = new Batch(docType, bulkOperation.s.currentIndex);

    // Reset the current size trackers
    bulkOperation.s.currentBatchSize = 0;
    bulkOperation.s.currentBatchSizeBytes = 0;
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
  }

  bulkOperation.s.currentBatch.originalIndexes.push(bulkOperation.s.currentIndex);
  bulkOperation.s.currentBatch.operations.push(document);
  bulkOperation.s.currentBatchSize += 1;
  bulkOperation.s.currentBatchSizeBytes += maxKeySize + bsonSize;
  bulkOperation.s.currentIndex += 1;

  // Return bulkOperation
  return bulkOperation;
}

/**
 * Create a new OrderedBulkOperation instance (INTERNAL TYPE, do not instantiate directly)
 * @class
 * @extends BulkOperationBase
 * @property {number} length Get the number of operations in the bulk.
 * @return {OrderedBulkOperation} a OrderedBulkOperation instance.
 */
class OrderedBulkOperation extends BulkOperationBase {
  constructor(topology, collection, options) {
    options = options || {};
    options = Object.assign(options, { addToOperationsList });

    super(topology, collection, options, true);
  }
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
