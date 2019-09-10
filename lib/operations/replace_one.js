'use strict';

const OperationBase = require('./operation').OperationBase;
const updateDocuments = require('./common_functions').updateDocuments;

class ReplaceOneOperation extends OperationBase {
  constructor(collection, filter, doc, options) {
    super(options);

    this.collection = collection;
    this.filter = filter;
    this.doc = doc;
  }

  execute(callback) {
    const coll = this.collection;
    const filter = this.filter;
    const doc = this.doc;
    const options = this.options;

    // Set single document update
    options.multi = false;

    // Execute update
    updateDocuments(coll, filter, doc, options, (err, r) => replaceCallback(err, r, doc, callback));
  }
}

function replaceCallback(err, r, doc, callback) {
  if (callback == null) return;
  if (err && callback) return callback(err);
  if (r == null) return callback(null, { result: { ok: 1 } });

  r.modifiedCount = r.result.nModified != null ? r.result.nModified : r.result.n;
  r.upsertedId =
    Array.isArray(r.result.upserted) && r.result.upserted.length > 0
      ? r.result.upserted[0] // FIXME(major): should be `r.result.upserted[0]._id`
      : null;
  r.upsertedCount =
    Array.isArray(r.result.upserted) && r.result.upserted.length ? r.result.upserted.length : 0;
  r.matchedCount =
    Array.isArray(r.result.upserted) && r.result.upserted.length > 0 ? 0 : r.result.n;
  r.ops = [doc]; // TODO: Should we still have this?
  if (callback) callback(null, r);
}

module.exports = ReplaceOneOperation;
