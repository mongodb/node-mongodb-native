'use strict';

const AggregateOperation = require('./aggregate');

class CountDocumentsOperation extends AggregateOperation {
  constructor(collection, query, options) {
    const pipeline = [{ $match: query }];
    if (typeof options.skip === 'number') {
      pipeline.push({ $skip: options.skip });
    }

    if (typeof options.limit === 'number') {
      pipeline.push({ $limit: options.limit });
    }

    pipeline.push({ $group: { _id: 1, n: { $sum: 1 } } });

    super(collection, pipeline, options);
  }

  execute(server, callback) {
    super.execute(server, (err, result) => {
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

module.exports = CountDocumentsOperation;
