import { OperationBase } from './operation';
import { BulkWriteOperation } from './bulk_write';
import { MongoError } from '../error';
import { prepareDocs } from './common_functions';
import type { Callback } from '../types';

export class InsertManyOperation extends OperationBase {
  collection: any;
  docs: any;

  constructor(collection: any, docs: any, options: any) {
    super(options);

    this.collection = collection;
    this.docs = docs;
  }

  execute(callback: Callback) {
    const coll = this.collection;
    let docs = this.docs;
    const options = this.options;

    if (!Array.isArray(docs)) {
      return callback(
        MongoError.create({ message: 'docs parameter must be an array of documents', driver: true })
      );
    }

    // If keep going set unordered
    options['serializeFunctions'] = options['serializeFunctions'] || coll.s.serializeFunctions;

    docs = prepareDocs(coll, docs, options);

    // Generate the bulk write operations
    const operations = [
      {
        insertMany: docs
      }
    ];

    const bulkWriteOperation = new BulkWriteOperation(coll, operations, options);

    bulkWriteOperation.execute((err, result) => {
      if (err) return callback(err, null);
      callback(undefined, mapInsertManyResults(docs, result));
    });
  }
}

function mapInsertManyResults(docs: any, r: any) {
  const finalResult = {
    result: { ok: 1, n: r.insertedCount },
    ops: docs,
    insertedCount: r.insertedCount,
    insertedIds: r.insertedIds
  } as any;

  if (r.getLastOp()) {
    finalResult.result.opTime = r.getLastOp();
  }

  return finalResult;
}
