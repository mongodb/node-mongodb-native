'use strict';

const applyRetryableWrites = require('../utils').applyRetryableWrites;
const applyWriteConcern = require('../utils').applyWriteConcern;
const handleCallback = require('../utils').handleCallback;
const MongoError = require('mongodb-core').MongoError;
const OperationBase = require('../operation').OperationBase;
const prepareDocs = require('./common_functions').prepareDocs;
const toError = require('../utils').toError;
const Aspect = require('../operation').Aspect;
const defineAspects = require('../operation').defineAspects;

class InsertOneOperation extends OperationBase {
  constructor(collection, doc, options) {
    super(options);

    this.collection = collection;
    this.doc = doc;
  }

  execute(server, callback) {
    const coll = this.collection;
    const doc = this.doc;
    const options = this.options;

    if (Array.isArray(doc)) {
      return callback(
        MongoError.create({ message: 'doc parameter must be an object', driver: true })
      );
    }

    // Final options for retryable writes and write concern
    let finalOptions = Object.assign({}, options);
    finalOptions = applyRetryableWrites(finalOptions, coll.s.db);
    finalOptions = applyWriteConcern(finalOptions, { db: coll.s.db, collection: coll }, options);

    // If keep going set unordered
    if (finalOptions.keepGoing === true) finalOptions.ordered = false;
    finalOptions.serializeFunctions = options.serializeFunctions || coll.s.serializeFunctions;

    const docs = prepareDocs(coll, [doc], options);

    server.insert(coll.s.namespace, docs, finalOptions, (err, result) => {
      if (err) return handleCallback(callback, err);
      // Workaround for pre 2.6 servers
      if (result == null) return handleCallback(callback, null, { result: { ok: 1 } });
      if (result.result.code) return handleCallback(callback, toError(result.result));
      if (result.result.writeErrors) {
        return handleCallback(callback, toError(result.result.writeErrors[0]));
      }

      result.ops = docs;
      result.insertedCount = result.result.n;
      result.insertedId = doc._id;
      handleCallback(callback, null, result);
    });
  }
}

defineAspects(InsertOneOperation, [Aspect.EXECUTE_WITH_SELECTION]);
module.exports = InsertOneOperation;
