import { AggregateOperation } from './aggregate';
import type { Callback } from '../types';
import type { Server } from '../sdam/server';

export class CountDocumentsOperation extends AggregateOperation {
  constructor(collection: any, query: any, options: any) {
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

  execute(server: Server, callback: Callback) {
    super.execute(server, (err, result) => {
      if (err) {
        callback(err, null);
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
