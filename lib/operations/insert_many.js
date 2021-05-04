'use strict';

const OperationBase = require('./operation').OperationBase;
const BulkWriteOperation = require('./bulk_write');
const MongoError = require('../core').MongoError;
const prepareDocs = require('./common_functions').prepareDocs;

class InsertManyOperation extends OperationBase {
  constructor(collection, docs, options) {
    super(options);

    this.collection = collection;
    this.docs = docs;
  }

  execute(callback) {
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
    const operations = docs.map(document => ({ insertOne: { document } }));

    const bulkWriteOperation = new BulkWriteOperation(coll, operations, options);

    bulkWriteOperation.execute((err, result) => {
      if (err) return callback(err, null);
      callback(null, mapInsertManyResults(docs, result));
    });
  }
}

function mapInsertManyResults(docs, r) {
  const finalResult = {
    result: { ok: 1, n: r.insertedCount },
    ops: docs,
    insertedCount: r.insertedCount,
    insertedIds: r.insertedIds
  };

  if (r.getLastOp()) {
    finalResult.result.opTime = r.getLastOp();
  }

  return finalResult;
}

module.exports = InsertManyOperation;
