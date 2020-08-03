import { AggregateOperation } from './aggregate';

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

  execute(server: any, callback: Function) {
    super.execute(server, (err?: any, result?: any) => {
      if (err) {
        callback(err, null);
        return;
      }

      // NOTE: We're avoiding creating a cursor here to reduce the callstack.
      const response = result.result;
      if (response.cursor == null || response.cursor.firstBatch == null) {
        callback(null, 0);
        return;
      }

      const docs = response.cursor.firstBatch;
      callback(null, docs.length ? docs[0].n : 0);
    });
  }
}
