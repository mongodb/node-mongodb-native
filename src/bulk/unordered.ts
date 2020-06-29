import { BSON } from '../deps';
import { BulkOperationBase, Batch, INSERT, UPDATE, REMOVE } from './common';
import { toError } from '../utils';

/**
 * Add to internal list of Operations
 *
 * @param {UnorderedBulkOperation} bulkOperation
 * @param {number} docType number indicating the document type
 * @param {any} document
 * @returns {UnorderedBulkOperation}
 */
function addToOperationsList(
  bulkOperation: UnorderedBulkOperation,
  docType: number,
  document: any
): UnorderedBulkOperation {
  // Get the bsonSize
  const bsonSize = BSON.calculateObjectSize(document, {
    checkKeys: false,

    // Since we don't know what the user selected for BSON options here,
    // err on the safe side, and check the size with ignoreUndefined: false.
    ignoreUndefined: false
  });
  // Throw error if the doc is bigger than the max BSON size
  if (bsonSize >= bulkOperation.s.maxBsonObjectSize)
    throw toError('document is larger than the maximum size ' + bulkOperation.s.maxBsonObjectSize);
  // Holds the current batch
  bulkOperation.s.currentBatch = null;
  // Get the right type of batch
  if (docType === INSERT) {
    bulkOperation.s.currentBatch = bulkOperation.s.currentInsertBatch;
  } else if (docType === UPDATE) {
    bulkOperation.s.currentBatch = bulkOperation.s.currentUpdateBatch;
  } else if (docType === REMOVE) {
    bulkOperation.s.currentBatch = bulkOperation.s.currentRemoveBatch;
  }

  const maxKeySize = bulkOperation.s.maxKeySize;

  // Create a new batch object if we don't have a current one
  if (bulkOperation.s.currentBatch == null)
    bulkOperation.s.currentBatch = new Batch(docType, bulkOperation.s.currentIndex);

  // Check if we need to create a new batch
  if (
    // New batch if we exceed the max batch op size
    bulkOperation.s.currentBatch.size + 1 >= bulkOperation.s.maxWriteBatchSize ||
    // New batch if we exceed the maxBatchSizeBytes. Only matters if batch already has a doc,
    // since we can't sent an empty batch
    (bulkOperation.s.currentBatch.size > 0 &&
      bulkOperation.s.currentBatch.sizeBytes + maxKeySize + bsonSize >=
        bulkOperation.s.maxBatchSizeBytes) ||
    // New batch if the new op does not have the same op type as the current batch
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
  if (docType === INSERT) {
    bulkOperation.s.currentInsertBatch = bulkOperation.s.currentBatch;
    bulkOperation.s.bulkResult.insertedIds.push({
      index: bulkOperation.s.bulkResult.insertedIds.length,
      _id: document._id
    });
  } else if (docType === UPDATE) {
    bulkOperation.s.currentUpdateBatch = bulkOperation.s.currentBatch;
  } else if (docType === REMOVE) {
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
 *
 * @class
 * @extends BulkOperationBase
 * @property {number} length Get the number of operations in the bulk.
 * @returns {UnorderedBulkOperation} a UnorderedBulkOperation instance.
 */
class UnorderedBulkOperation extends BulkOperationBase {
  s: any;

  constructor(topology: any, collection: any, options: any) {
    options = options || {};
    options = Object.assign(options, { addToOperationsList });

    super(topology, collection, options, false);
  }

  /**
   * @param {Function} callback
   * @param {any} writeResult
   * @returns {boolean|undefined}
   */
  handleWriteError(callback: Function, writeResult: any): boolean | undefined {
    if (this.s.batches.length) {
      return false;
    }

    return super.handleWriteError(callback, writeResult);
  }
}

/**
 * Returns an unordered batch object
 *
 * @param {any} topology
 * @param {any} collection
 * @param {any} options
 */
function initializeUnorderedBulkOp(topology: any, collection: any, options: any) {
  return new UnorderedBulkOperation(topology, collection, options);
}

export = initializeUnorderedBulkOp;
