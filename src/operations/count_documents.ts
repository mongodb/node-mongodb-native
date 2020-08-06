import { AggregateOperation, AggregateOperationOptions } from './aggregate';
import type { Callback, Document } from '../types';
import type { Server } from '../sdam/server';
import type { Collection } from '../collection';

export interface CountDocumentsOperationOptions extends AggregateOperationOptions {
  skip: number;
  limit: number;
}

export class CountDocumentsOperation extends AggregateOperation {
  constructor(collection: Collection, query: Document, options: CountDocumentsOperationOptions) {
    const pipeline = [];
    pipeline.push({ $match: query });

    if (typeof options.skip === 'number') {
      pipeline.push({ $skip: options.skip });
    }

    if (typeof options.limit === 'number') {
      pipeline.push({ $limit: options.limit });
    }

    pipeline.push({ $group: { _id: 1, n: { $sum: 1 } } });

    super(collection, pipeline, options);
  }

  execute(server: Server, callback: Callback): void {
    super.execute(server, (err, result) => {
      if (err || !result) {
        callback(err);
        return;
      }

      // NOTE: We're avoiding creating a cursor here to reduce the callstack.
      const response = result.result;
      if (response.cursor == null || response.cursor.firstBatch == null) {
        callback(undefined, 0);
        return;
      }

      const docs = response.cursor.firstBatch;
      callback(undefined, docs.length ? docs[0].n : 0);
    });
  }
}
