import {
  BulkOperationBase,
  Batch,
  INSERT,
  UPDATE,
  REMOVE,
  BatchTypes,
  AnyOperationOptions,
  BulkOptions,
  BulkWriteResult
} from './common';
import * as BSON from '../bson';
import type { Topology } from '../sdam/topology';
import type { Callback } from '../utils';
import type { Collection } from '../collection';

/** Add to internal list of Operations */
export function addToOperationsList(
  bulkOperation: UnorderedBulkOperation,
  batchType: BatchTypes,
  document: Partial<AnyOperationOptions>
): UnorderedBulkOperation {
  // Get the bsonSize
  const bsonSize = BSON.calculateObjectSize(document, {
    checkKeys: false,

    // Since we don't know what the user selected for BSON options here,
    // err on the safe side, and check the size with ignoreUndefined: false.
    ignoreUndefined: false
    // TODO: remove BSON any types when BSON is typed
  } as any);
  // Throw error if the doc is bigger than the max BSON size
  if (bsonSize >= bulkOperation.s.maxBsonObjectSize) {
    throw new TypeError(
      `Document is larger than the maximum size ${bulkOperation.s.maxBsonObjectSize}`
    );
  }

  // Holds the current batch
  bulkOperation.s.currentBatch = null;
  // Get the right type of batch
  if (batchType === INSERT) {
    bulkOperation.s.currentBatch = bulkOperation.s.currentInsertBatch;
  } else if (batchType === UPDATE) {
    bulkOperation.s.currentBatch = bulkOperation.s.currentUpdateBatch;
  } else if (batchType === REMOVE) {
    bulkOperation.s.currentBatch = bulkOperation.s.currentRemoveBatch;
  }

  const maxKeySize = bulkOperation.s.maxKeySize;

  // Create a new batch object if we don't have a current one
  if (bulkOperation.s.currentBatch == null)
    bulkOperation.s.currentBatch = new Batch(batchType, bulkOperation.s.currentIndex);

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
    bulkOperation.s.currentBatch.batchType !== batchType
  ) {
    // Save the batch to the execution stack
    bulkOperation.s.batches.push(bulkOperation.s.currentBatch);

    // Create a new batch
    bulkOperation.s.currentBatch = new Batch(batchType, bulkOperation.s.currentIndex);
  }

  // We have an array of documents
  if (Array.isArray(document)) {
    throw new TypeError('Operation passed in cannot be an Array');
  }

  bulkOperation.s.currentBatch.operations.push(document);
  bulkOperation.s.currentBatch.originalIndexes.push(bulkOperation.s.currentIndex);
  bulkOperation.s.currentIndex = bulkOperation.s.currentIndex + 1;

  // Save back the current Batch to the right type
  if (batchType === INSERT && document._id) {
    bulkOperation.s.currentInsertBatch = bulkOperation.s.currentBatch;
    bulkOperation.s.bulkResult.insertedIds.push({
      index: bulkOperation.s.bulkResult.insertedIds.length,
      _id: document._id
    });
  } else if (batchType === UPDATE) {
    bulkOperation.s.currentUpdateBatch = bulkOperation.s.currentBatch;
  } else if (batchType === REMOVE) {
    bulkOperation.s.currentRemoveBatch = bulkOperation.s.currentBatch;
  }

  // Update current batch size
  bulkOperation.s.currentBatch.size += 1;
  bulkOperation.s.currentBatch.sizeBytes += maxKeySize + bsonSize;

  // Return bulkOperation
  return bulkOperation;
}

/**
 * @internal
 * Create a new UnorderedBulkOperation instance
 */
export class UnorderedBulkOperation extends BulkOperationBase {
  constructor(
    topology: Topology,
    collection: Collection,
    options: Omit<BulkOptions, 'addToOperationsList'>
  ) {
    super(topology, collection, { ...options, addToOperationsList }, false);
  }

  handleWriteError(callback: Callback, writeResult: BulkWriteResult): boolean | undefined {
    if (this.s.batches.length) {
      return false;
    }
    return super.handleWriteError(callback, writeResult);
  }
}
