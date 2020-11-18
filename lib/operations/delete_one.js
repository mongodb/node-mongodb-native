'use strict';

const OperationBase = require('./operation').OperationBase;
const removeDocuments = require('./common_functions').removeDocuments;
const Aspect = require('./operation').Aspect;
const defineAspects = require('./operation').defineAspects;

class DeleteOneOperation extends OperationBase {
  constructor(collection, filter, options) {
    super(options);

    this.collection = collection;
    this.filter = filter;
  }

  execute(callback) {
    const coll = this.collection;
    const filter = this.filter;
    const options = this.options;

    options.single = true;
    removeDocuments(coll, filter, options, (err, r) => {
      if (callback == null) return;
      if (err && callback) return callback(err);
      if (r == null) return callback(null, { result: { ok: 1 } });

      // If an explain operation was executed, don't process the server results
      if (this.explain) return callback(undefined, r.result);

      r.deletedCount = r.result.n;
      callback(null, r);
    });
  }
}

defineAspects(DeleteOneOperation, [Aspect.EXPLAINABLE]);

module.exports = DeleteOneOperation;
