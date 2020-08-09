import * as BSON from '../bson';
import { BulkOperationBase, Batch, INSERT } from './common';

/**
 * Add to internal list of Operations
 *
 * @param {OrderedBulkOperation} bulkOperation
 * @param {number} docType number indicating the document type
 * @param {any} document
 * @returns {OrderedBulkOperation}
 */
function addToOperationsList(
  bulkOperation: OrderedBulkOperation,
  docType: number,
  document: any
): OrderedBulkOperation {
  // Get the bsonSize
  const bsonSize = BSON.calculateObjectSize(document, {
    checkKeys: false,
    // Since we don't know what the user selected for BSON options here,
    // err on the safe side, and check the size with ignoreUndefined: false.
    ignoreUndefined: false
  } as any);

  // Throw error if the doc is bigger than the max BSON size
  if (bsonSize >= bulkOperation.s.maxBsonObjectSize)
    throw new TypeError(
      `Document is larger than the maximum size ${bulkOperation.s.maxBsonObjectSize}`
    );

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

  if (docType === INSERT) {
    bulkOperation.s.bulkResult.insertedIds.push({
      index: bulkOperation.s.currentIndex,
      _id: document._id
    });
  }

  // We have an array of documents
  if (Array.isArray(document)) {
    throw new TypeError('Operation passed in cannot be an Array');
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
 *
 * @class
 * @extends BulkOperationBase
 * @property {number} length Get the number of operations in the bulk.
 * @returns {OrderedBulkOperation} a OrderedBulkOperation instance.
 */
export class OrderedBulkOperation extends BulkOperationBase {
  constructor(topology: any, collection: any, options: any) {
    options = options || {};
    options = Object.assign(options, { addToOperationsList });

    super(topology, collection, options, true);
  }
}

/**
 * Returns an unordered batch object
 *
 * @param {any} topology
 * @param {any} collection
 * @param {any} options
 */
export function initializeOrderedBulkOp(topology: any, collection: any, options: any) {
  return new OrderedBulkOperation(topology, collection, options);
}
