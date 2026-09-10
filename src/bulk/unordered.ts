import type { Document } from '../bson';
import * as BSON from '../bson';
import type { Collection } from '../collection';
import { MongoInvalidArgumentError } from '../error';
import type { DeleteStatement } from '../operations/delete';
import type { UpdateStatement } from '../operations/update';
import {
  Batch,
  BatchType,
  BulkOperationBase,
  type BulkWriteOptions,
  type BulkWriteResult
} from './common';

/** @public */
export class UnorderedBulkOperation extends BulkOperationBase {
  /** @internal */
  constructor(collection: Collection, options: BulkWriteOptions) {
    super(collection, options, false);
  }

  override handleWriteError(writeResult: BulkWriteResult): void {
    if (this.s.batches.length) {
      return;
    }

    return super.handleWriteError(writeResult);
  }

  addToOperationsList(
    batchType: BatchType,
    document: Document | UpdateStatement | DeleteStatement
  ): this {
    // Serialize the operation once here and reuse the bytes for both the size
    // check/splitting and the wire message (via a DocumentSequence). Under
    // auto-encryption the command is sent as a BSON array rather than a
    // document sequence, so the buffer would never be reused; there we only
    // measure the size and leave `buffer` undefined so nothing is retained on
    // the batch.
    let buffer: Uint8Array | undefined;
    let bsonSize: number;
    if (this.s.usingAutoEncryption) {
      bsonSize = BSON.calculateObjectSize(document, {
        checkKeys: false,
        ignoreUndefined: false
      } as any);
    } else {
      const bson = this.s.bsonOptions;
      buffer = BSON.serialize(document, {
        checkKeys: this.s.checkKeys,
        ignoreUndefined: bson.ignoreUndefined,
        serializeFunctions: bson.serializeFunctions
      });
      bsonSize = buffer.length;
    }

    // Throw error if the doc is bigger than the max BSON size
    if (bsonSize >= this.s.maxBsonObjectSize) {
      // TODO(NODE-3483): Change this to MongoBSONError
      throw new MongoInvalidArgumentError(
        `Document is larger than the maximum size ${this.s.maxBsonObjectSize}`
      );
    }

    // Holds the current batch
    this.s.currentBatch = undefined;
    // Get the right type of batch
    if (batchType === BatchType.INSERT) {
      this.s.currentBatch = this.s.currentInsertBatch;
    } else if (batchType === BatchType.UPDATE) {
      this.s.currentBatch = this.s.currentUpdateBatch;
    } else if (batchType === BatchType.DELETE) {
      this.s.currentBatch = this.s.currentRemoveBatch;
    }

    const maxKeySize = this.s.maxKeySize;

    // Create a new batch object if we don't have a current one
    if (this.s.currentBatch == null) {
      this.s.currentBatch = new Batch(batchType, this.s.currentIndex);
    }

    // Check if we need to create a new batch
    if (
      // New batch if we exceed the max batch op size
      this.s.currentBatch.size + 1 >= this.s.maxWriteBatchSize ||
      // New batch if we exceed the maxBatchSizeBytes. Only matters if batch already has a doc,
      // since we can't sent an empty batch
      (this.s.currentBatch.size > 0 &&
        this.s.currentBatch.sizeBytes + maxKeySize + bsonSize >= this.s.maxBatchSizeBytes) ||
      // New batch if the new op does not have the same op type as the current batch
      this.s.currentBatch.batchType !== batchType
    ) {
      // Save the batch to the execution stack
      this.s.batches.push(this.s.currentBatch);

      // Create a new batch
      this.s.currentBatch = new Batch(batchType, this.s.currentIndex);
    }

    // We have an array of documents
    if (Array.isArray(document)) {
      throw new MongoInvalidArgumentError('Operation passed in cannot be an Array');
    }

    this.s.currentBatch.operations.push(document);
    if (buffer != null) this.s.currentBatch.serializedOperations.push(buffer);
    this.s.currentBatch.originalIndexes.push(this.s.currentIndex);
    this.s.currentIndex = this.s.currentIndex + 1;

    // Save back the current Batch to the right type
    if (batchType === BatchType.INSERT) {
      this.s.currentInsertBatch = this.s.currentBatch;
      this.s.bulkResult.insertedIds.push({
        index: this.s.currentIndex - 1,
        _id: (document as Document)._id
      });
    } else if (batchType === BatchType.UPDATE) {
      this.s.currentUpdateBatch = this.s.currentBatch;
    } else if (batchType === BatchType.DELETE) {
      this.s.currentRemoveBatch = this.s.currentBatch;
    }

    // Update current batch size
    this.s.currentBatch.size += 1;
    this.s.currentBatch.sizeBytes += maxKeySize + bsonSize;

    return this;
  }
}
