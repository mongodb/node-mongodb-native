'use strict';

const OperationBase = require('./operation').OperationBase;
const handleCallback = require('../utils').handleCallback;

class CountDocumentsOperation extends OperationBase {
  constructor(collection, query, options) {
    super(options);

    this.collection = collection;
    this.query = query;
  }

  execute(callback) {
    const coll = this.collection;
    const query = this.query;
    let options = this.options;

    const skip = options.skip;
    const limit = options.limit;
    options = Object.assign({}, options);

    const pipeline = [{ $match: query }];

    // Add skip and limit if defined
    if (typeof skip === 'number') {
      pipeline.push({ $skip: skip });
    }

    if (typeof limit === 'number') {
      pipeline.push({ $limit: limit });
    }

    pipeline.push({ $group: { _id: 1, n: { $sum: 1 } } });

    delete options.limit;
    delete options.skip;

    coll.aggregate(pipeline, options).toArray((err, docs) => {
      if (err) return handleCallback(callback, err);
      handleCallback(callback, null, docs.length ? docs[0].n : 0);
    });
  }
}

module.exports = CountDocumentsOperation;
