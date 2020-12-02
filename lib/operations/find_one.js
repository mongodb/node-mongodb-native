'use strict';

const handleCallback = require('../utils').handleCallback;
const OperationBase = require('./operation').OperationBase;
const toError = require('../utils').toError;
const Aspect = require('./operation').Aspect;
const defineAspects = require('./operation').defineAspects;

class FindOneOperation extends OperationBase {
  constructor(collection, query, options) {
    super(options);

    this.collection = collection;
    this.query = query;
  }

  execute(callback) {
    const coll = this.collection;
    const query = this.query;
    const options = this.options;

    try {
      const cursor = coll
        .find(query, options)
        .limit(-1)
        .batchSize(1);

      // Return the item
      cursor.next((err, item) => {
        if (err != null) return handleCallback(callback, toError(err), null);
        handleCallback(callback, null, item);
      });
    } catch (e) {
      callback(e);
    }
  }
}

defineAspects(FindOneOperation, [Aspect.EXPLAINABLE]);

module.exports = FindOneOperation;
