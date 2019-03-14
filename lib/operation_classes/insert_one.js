'use strict';

const applyRetryableWrites = require('../utils').applyRetryableWrites;
const applyWriteConcern = require('../utils').applyWriteConcern;
const handleCallback = require('../utils').handleCallback;
const MongoError = require('mongodb-core').MongoError;
const Operation = require('./operation').Operation;
const toError = require('../utils').toError;

class InsertOneOperation extends Operation {
  constructor(collection, doc, options) {
    super(options);

    this.collection = collection;
    this.doc = doc;
    this.options = options;
  }

  static get aspects() {
    return new Set([]);
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

function insertDocuments(coll, docs, options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = options || {};
  // Ensure we are operating on an array op docs
  docs = Array.isArray(docs) ? docs : [docs];

  // Final options for retryable writes and write concern
  let finalOptions = Object.assign({}, options);
  finalOptions = applyRetryableWrites(finalOptions, coll.s.db);
  finalOptions = applyWriteConcern(finalOptions, { db: coll.s.db, collection: coll }, options);

  // If keep going set unordered
  if (finalOptions.keepGoing === true) finalOptions.ordered = false;
  finalOptions.serializeFunctions = options.serializeFunctions || coll.s.serializeFunctions;

  docs = prepareDocs(coll, docs, options);

  // File inserts
  coll.s.topology.insert(coll.s.namespace, docs, finalOptions, (err, result) => {
    if (callback == null) return;
    if (err) return handleCallback(callback, err);
    if (result == null) return handleCallback(callback, null, null);
    if (result.result.code) return handleCallback(callback, toError(result.result));
    if (result.result.writeErrors)
      return handleCallback(callback, toError(result.result.writeErrors[0]));
    // Add docs to the list
    result.ops = docs;
    // Return the results
    handleCallback(callback, null, result);
  });
}

function prepareDocs(coll, docs, options) {
  const forceServerObjectId =
    typeof options.forceServerObjectId === 'boolean'
      ? options.forceServerObjectId
      : coll.s.db.options.forceServerObjectId;

  // no need to modify the docs if server sets the ObjectId
  if (forceServerObjectId === true) {
    return docs;
  }

  return docs.map(doc => {
    if (forceServerObjectId !== true && doc._id == null) {
      doc._id = coll.s.pkFactory.createPk();
    }

    return doc;
  });
}

module.exports = InsertOneOperation;
