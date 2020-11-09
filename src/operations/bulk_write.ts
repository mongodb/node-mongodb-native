import { applyRetryableWrites, applyWriteConcern, Callback, deepFreeze } from '../utils';
import { OperationBase } from './operation';
import { resolveBSONOptions } from '../bson';
import { WriteConcern } from '../write_concern';
import type { Collection } from '../collection';
import type {
  BulkOperationBase,
  BulkWriteResult,
  BulkWriteOptions,
  AnyBulkWriteOperation
} from '../bulk/common';
import type { Server } from '../sdam/server';

/** @internal */
export class BulkWriteOperation extends OperationBase<BulkWriteOptions, BulkWriteResult> {
  collection: Collection;
  operations: AnyBulkWriteOperation[];
  protected bypassDocumentValidation;
  protected ordered;
  protected forceServerObjectId;

  getOptions(): Readonly<BulkWriteOptions> {
    return deepFreeze({
      ...super.getOptions(),
      bypassDocumentValidation: this.bypassDocumentValidation,
      ordered: this.ordered,
      forceServerObjectId: this.forceServerObjectId
    });
  }

  constructor(
    collection: Collection,
    operations: AnyBulkWriteOperation[],
    options: BulkWriteOptions
  ) {
    super(options);

    this.collection = collection;
    this.operations = operations;

    // Assign BSON serialize options to OperationBase, preferring options over collection options
    this.bsonOptions = resolveBSONOptions(options, collection);
    this.bypassDocumentValidation = options.bypassDocumentValidation;
    this.ordered = options.ordered;
    this.forceServerObjectId = options.forceServerObjectId;
  }

  execute(server: Server, callback: Callback<BulkWriteResult>): void {
    const coll = this.collection;
    const operations = this.operations;
    const options = this.getOptions();

    // Create the bulk operation
    const bulk: BulkOperationBase =
      options.ordered === true || options.ordered == null
        ? coll.initializeOrderedBulkOp(options)
        : coll.initializeUnorderedBulkOp(options);

    // for each op go through and add to the bulk
    try {
      for (let i = 0; i < operations.length; i++) {
        bulk.raw(operations[i]);
      }
    } catch (err) {
      return callback(err);
    }

    // Final options for retryable writes and write concern
    let finalOptions = Object.assign({}, options);
    finalOptions = applyRetryableWrites(finalOptions, coll.s.db);
    finalOptions = applyWriteConcern(finalOptions, { db: coll.s.db, collection: coll }, options);

    const writeCon = WriteConcern.fromOptions(finalOptions);

    // Execute the bulk
    bulk.execute(writeCon, finalOptions, (err, r) => {
      // We have connection level error
      if (!r && err) {
        return callback(err);
      }

      // Return the results
      callback(undefined, r);
    });
  }
}
