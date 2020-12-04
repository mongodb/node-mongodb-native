import { Aspect, defineAspects, AbstractOperation } from './operation';
import { BulkWriteOperation } from './bulk_write';
import { prepareDocs } from './common_functions';
import type { Callback } from '../utils';
import type { Collection } from '../collection';
import type { ObjectId, Document } from '../bson';
import type { BulkWriteOptions } from '../bulk/common';
import type { Server } from '../sdam/server';
import { WriteConcern } from '../write_concern';
import type { ClientSession } from '../sessions';

/** @public */
export interface InsertManyResult {
  /** Indicates whether this write result was acknowledged. If not, then all other members of this result will be undefined */
  acknowledged: boolean;
  /** The number of inserted documents for this operations */
  insertedCount: number;
  /** Map of the index of the inserted document to the id of the inserted document */
  insertedIds: { [key: number]: ObjectId };
}

/** @internal */
export class InsertManyOperation extends AbstractOperation<InsertManyResult> {
  options: BulkWriteOptions;
  collection: Collection;
  docs: Document[];

  constructor(collection: Collection, docs: Document[], options: BulkWriteOptions) {
    super(options);

    if (!Array.isArray(docs)) {
      throw new TypeError('docs parameter must be an array of documents');
    }

    this.options = options;
    this.collection = collection;
    this.docs = docs;
  }

  execute(server: Server, session: ClientSession, callback: Callback<InsertManyResult>): void {
    const coll = this.collection;
    const options = { ...this.options, ...this.bsonOptions, readPreference: this.readPreference };
    const writeConcern = WriteConcern.fromOptions(options);
    const bulkWriteOperation = new BulkWriteOperation(
      coll,
      [{ insertMany: prepareDocs(coll, this.docs, options) }],
      options
    );

    bulkWriteOperation.execute(server, session, (err, res) => {
      if (err || res == null) return callback(err);
      callback(undefined, {
        acknowledged: writeConcern?.w !== 0 ?? true,
        insertedCount: res.insertedCount,
        insertedIds: res.insertedIds
      });
    });
  }
}

defineAspects(InsertManyOperation, [Aspect.WRITE_OPERATION]);
