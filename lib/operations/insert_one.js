'use strict';

const MongoError = require('../core').MongoError;
const OperationBase = require('./operation').OperationBase;
const insertDocuments = require('./common_functions').insertDocuments;

class InsertOneOperation extends OperationBase {
  constructor(collection, doc, options) {
    super(options);

    this.collection = collection;
    this.doc = doc;
  }

  execute(callback) {
    const coll = this.collection;
    const doc = this.doc;
    const options = this.options;

    if (Array.isArray(doc)) {
      return callback(
        MongoError.create({ message: 'doc parameter must be an object', driver: true })
      );
    }

    insertDocuments(coll, [doc], options, (err, r) => {
      if (callback == null) return;
      if (err && callback) return callback(err);
      // Workaround for pre 2.6 servers
      if (r == null) return callback(null, { result: { ok: 1 } });
      // Add values to top level to ensure crud spec compatibility
      r.insertedCount = r.result.n;
      r.insertedId = doc._id;
      if (callback) callback(null, r);
    });
  }
}

module.exports = InsertOneOperation;
