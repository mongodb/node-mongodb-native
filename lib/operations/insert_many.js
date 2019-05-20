'use strict';

const OperationBase = require('./operation').OperationBase;
const defineAspects = require('./operation').defineAspects;
const Aspect = require('./operation').Aspect;
const MongoError = require('../core').MongoError;

class InsertManyOperation extends OperationBase {
  constructor(collection, docs, options) {
    super(options);
    this.collection = collection;
    this.docs = docs;
  }

  execute(callback) {
    const docs = this.docs;

    if (!Array.isArray(docs)) {
      return callback(
        MongoError.create({ message: 'docs parameter must be an array of documents', driver: true })
      );
    }

    const collection = this.collection;
    const options = this.options;

    // Create the bulk operation
    const bulk =
      options.ordered === true || options.ordered == null
        ? collection.initializeOrderedBulkOp(options)
        : collection.initializeUnorderedBulkOp(options);

    bulk.raw({ insertMany: docs });

    bulk.execute(undefined, options, (err, result) => {
      if (err) return callback(err, null);
      callback(null, mapInsertManyResults(docs, result));
    });
  }
}

function mapInsertManyResults(docs, r) {
  const finalResult = {
    result: { ok: 1, n: r.nInserted },
    ops: docs,
    insertedCount: r.nInserted,
    insertedIds: {}
  };

  if (r.getLastOp()) {
    finalResult.result.opTime = r.getLastOp();
  }

  const inserted = r.getInsertedIds();
  for (let i = 0; i < inserted.length; i++) {
    finalResult.insertedIds[inserted[i].index] = inserted[i]._id;
  }

  return finalResult;
}

defineAspects(InsertManyOperation, [Aspect.META_OPERATION]);

module.exports = InsertManyOperation;
