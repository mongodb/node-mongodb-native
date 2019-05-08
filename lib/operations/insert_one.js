'use strict';

const applyRetryableWrites = require('../utils').applyRetryableWrites;
const applyWriteConcern = require('../utils').applyWriteConcern;
const handleCallback = require('../utils').handleCallback;
const MongoError = require('../core').MongoError;
const prepareDocs = require('./common_functions').prepareDocs;
const toError = require('../utils').toError;

const operation = require('./operation');
const OperationBase = operation.OperationBase;
const defineAspects = operation.defineAspects;
const Aspect = operation.Aspect;

class InsertOneOperation extends OperationBase {
  constructor(collection, doc, options) {
    let finalOptions = Object.assign({}, options);
    finalOptions = applyRetryableWrites(finalOptions, collection.s.db);
    finalOptions = applyWriteConcern(finalOptions, { db: collection.s.db, collection }, options);
    if (finalOptions.keepGoing === true) finalOptions.ordered = false;
    finalOptions.serializeFunctions = options.serializeFunctions || collection.s.serializeFunctions;
    super(finalOptions);

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

    const docs = prepareDocs(coll, [doc], options);

    server.insert(coll.s.namespace.toString(), docs, options, (err, result) => {
      if (err) return handleCallback(callback, err);

      // Workaround for pre 2.6 servers
      if (result == null) return handleCallback(callback, null, { result: { ok: 1 } });
      if (result.result.code) return handleCallback(callback, toError(result.result));
      if (result.result.writeErrors)
        return handleCallback(callback, toError(result.result.writeErrors[0]));
      // Add docs to the list
      result.ops = docs;
      result.insertedCount = result.result.n;
      result.insertedId = doc._id;

      // Return the results
      handleCallback(callback, null, result);
    });
  }
}

defineAspects(InsertOneOperation, [Aspect.EXECUTE_WITH_SELECTION, Aspect.RETRY]);

module.exports = InsertOneOperation;
