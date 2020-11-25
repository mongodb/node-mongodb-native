import { applyRetryableWrites, Callback } from '../utils';
import { Aspect, defineAspects, OperationBase } from './operation';
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

    let finalOptions = Object.assign({}, options);
    finalOptions = applyRetryableWrites(finalOptions, coll.s.db);

    // Execute the bulk
    bulk.execute(finalOptions, (err, r) => {
      // We have connection level error
      if (!r && err) {
        return callback(err);
      }

      // Return the results
      callback(undefined, r);
    });
  }
}

defineAspects(BulkWriteOperation, [Aspect.WRITE_OPERATION]);
