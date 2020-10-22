import { applyRetryableWrites, applyWriteConcern, Callback } from '../utils';
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
  }

  execute(server: Server, callback: Callback<BulkWriteResult>): void {
    const coll = this.collection;
    const operations = this.operations;
    const options = { ...this.options, ...this.bsonOptions };

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
