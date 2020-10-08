import {
  applyRetryableWrites,
  applyWriteConcern,
  Callback,
  HasRetryableWrites,
  HasWriteConcern
} from '../utils';
import { OperationBase } from './operation';
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
export class BulkWriteOperation
  extends OperationBase<BulkWriteResult>
  implements BulkWriteOptions, HasRetryableWrites, HasWriteConcern {
  collection: Collection;
  operations: AnyBulkWriteOperation[];
  bypassDocumentValidation?: boolean;
  ordered?: boolean;
  forceServerObjectId?: boolean;
  ignoreUndefined?: boolean;
  retryWrites?: boolean;
  writeConcern?: WriteConcern;

  /** @deprecated use `ordered` instead */
  keepGoing?: boolean;

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

    // Add ignoreUndefined
    if (typeof coll.s.options.ignoreUndefined === 'boolean') {
      this.ignoreUndefined = coll.s.options.ignoreUndefined;
    }

    // Create the bulk operation
    const bulk: BulkOperationBase =
      this.ordered === true || this.ordered == null
        ? coll.initializeOrderedBulkOp(this)
        : coll.initializeUnorderedBulkOp(this);

    // for each op go through and add to the bulk
    try {
      for (let i = 0; i < operations.length; i++) {
        bulk.raw(operations[i]);
      }
    } catch (err) {
      return callback(err);
    }

    // Final options for retryable writes and write concern
    applyRetryableWrites(this, coll.s.db);
    applyWriteConcern(this, { db: coll.s.db, collection: coll }, this);

    const writeCon = WriteConcern.fromOptions(this);

    // Execute the bulk
    bulk.execute(writeCon, this, (err, r) => {
      // We have connection level error
      if (!r && err) {
        return callback(err);
      }

      // Return the results
      callback(undefined, r);
    });
  }
}
