'use strict';

const OperationBase = require('./operation').OperationBase;
const updateDocuments = require('./common_functions').updateDocuments;
const hasAtomicOperators = require('../utils').hasAtomicOperators;

class UpdateOneOperation extends OperationBase {
  constructor(collection, filter, update, options) {
    super(options);

    if (!hasAtomicOperators(update)) {
      throw new TypeError('Update document requires atomic operators');
    }

    this.collection = collection;
    this.filter = filter;
    this.update = update;
  }

  execute(callback) {
    const coll = this.collection;
    const filter = this.filter;
    const update = this.update;
    const options = this.options;

    // Set single document update
    options.multi = false;
    // Execute update
    updateDocuments(coll, filter, update, options, (err, r) => updateCallback(err, r, callback));
  }
}

function updateCallback(err, r, callback) {
  if (callback == null) return;
  if (err) return callback(err);
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
  callback(null, r);
}

module.exports = UpdateOneOperation;
