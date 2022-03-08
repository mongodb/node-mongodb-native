import type {
  AnyBulkWriteOperation,
  BulkOperationBase,
  BulkWriteOptions,
  BulkWriteResult
} from '../bulk/common';
import type { Collection } from '../collection';
import type { Server } from '../sdam/server';
import type { ClientSession } from '../sessions';
import type { Callback } from '../utils';
import { AbstractOperation, Aspect, defineAspects } from './operation';

/** @internal */
export class BulkWriteOperation extends AbstractOperation<BulkWriteResult> {
  override options: BulkWriteOptions;
  collection: Collection;
  operations: AnyBulkWriteOperation[];

  constructor(
    collection: Collection,
    operations: AnyBulkWriteOperation[],
    options: BulkWriteOptions
  ) {
    super(options);
    this.options = options;
    this.collection = collection;
    this.operations = operations;
  }

  override execute(
    server: Server,
    session: ClientSession | undefined,
    callback: Callback<BulkWriteResult>
  ): void {
    const coll = this.collection;
    const operations = this.operations;
    const options = { ...this.options, ...this.bsonOptions, readPreference: this.readPreference };

    // Create the bulk operation
    const bulk: BulkOperationBase =
      options.ordered === false
        ? coll.initializeUnorderedBulkOp(options)
        : coll.initializeOrderedBulkOp(options);

    // for each op go through and add to the bulk
    try {
      for (let i = 0; i < operations.length; i++) {
        bulk.raw(operations[i]);
      }
    } catch (err) {
      return callback(err);
    }

    // Execute the bulk
    bulk.execute({ ...options, session }, (err, r) => {
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
