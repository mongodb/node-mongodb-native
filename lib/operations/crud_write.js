'use strict';

const operation = require('./operation');
const { Aspect, defineAspects, OperationBase } = operation;
const applyRetryableWrites = require('../utils').applyRetryableWrites;
const applyWriteConcern = require('../utils').applyWriteConcern;
const handleCallback = require('../utils').handleCallback;
const decorateWithCollation = require('../utils').decorateWithCollation;
const toError = require('../utils').toError;

const INSERT = 'insert';
const UPDATE = 'update';
const REMOVE = 'remove';

const RETRYABLE_WIRE_VERSION = 6;

function isSingleServer(topology) {
  if (topology.type && topology.type === 'server') {
    return true;
  }

  if (topology.description && topology.description.type === 'Single') {
    return true;
  }

  return false;
}

function isRetryabilitySupported(topology) {
  if (isSingleServer(topology)) {
    return false;
  }

  const maxWireVersion = topology.lastIsMaster().maxWireVersion;
  if (maxWireVersion < RETRYABLE_WIRE_VERSION) {
    return false;
  }

  if (!topology.logicalSessionTimeoutMinutes) {
    return false;
  }

  return true;
}

class CrudWriteOperation extends OperationBase {
  constructor(model) {
    super(model.options);
    this.model = model;
  }

  canRetry(server, topology) {
    return (
      this.options.retryWrites &&
      this.session &&
      !this.session.inTransaction() &&
      isRetryabilitySupported(topology) &&
      this.model.canRetry()
    );
  }

  enableRetry() {
    this.model.options.willRetryWrite = true;
    this.session.incrementTransactionNumber();
  }

  execute(server, callback) {
    return this.model.execute(server, this.options, callback);
  }
}

class CrudModel {
  constructor(collection, options) {
    options = applyRetryableWrites(options, collection.s.db);
    options = applyWriteConcern(options, { db: collection.s.db, collection }, options);
    options.serializeFunctions = options.serializeFunctions || collection.s.serializeFunctions;
    if (collection.s.options.ignoreUndefined) {
      options.ignoreUndefined = collection.s.options.ignoreUndefined;
    }

    this.options = options;
    this.namespace = collection.s.namespace;
  }

  execute(server, options, callback) {
    if (!this.type || !this.operations) {
      // TODO: Throw something?
    }
    server[this.type](this.namespace.toString(), this.operations, this.options, (err, result) => {
      if (callback == null) return;
      if (err) return handleCallback(callback, err, null);
      if (result == null) return handleCallback(callback, null, null);
      if (result.result.code) return handleCallback(callback, toError(result.result));
      if (result.result.writeErrors)
        return handleCallback(callback, toError(result.result.writeErrors[0]));
      // Return the results
      handleCallback(callback, null, result);
    });
  }
}

defineAspects(CrudWriteOperation, [Aspect.EXECUTE_WITH_SELECTION, Aspect.RETRY]);

class BulkInsertModel extends CrudModel {
  constructor(collection, options) {
    super(collection, options);
    this.type = INSERT;
  }

  canRetry() {
    return true;
  }
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

function insertOneCallback(err, result, docs, callback) {
  if (err) return handleCallback(callback, err);

  // Workaround for pre 2.6 servers
  if (result == null) return handleCallback(callback, null, { result: { ok: 1 } });

  // Add docs to the list
  result.ops = docs;
  result.insertedCount = result.result.n;
  result.insertedId = docs[0]._id;

  // Return the results
  handleCallback(callback, null, result);
}

class InsertOneModel extends BulkInsertModel {
  constructor(args) {
    // TODO: Destructure
    const collection = args.collection;
    const doc = args.doc;
    const options = args.options;

    super(collection, options);
    if (this.options.keepGoing) {
      this.options.ordered = false;
    }

    this.operations = prepareDocs(collection, [doc], options);
  }

  execute(server, options, callback) {
    return super.execute(server, options, (err, r) =>
      insertOneCallback(err, r, this.operations, callback)
    );
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

class BulkUpdateModel extends CrudModel {
  constructor(collection, options) {
    super(collection, options);
    this.type = UPDATE;
  }

  canRetry() {
    return !this.operations.some(op => op.multi);
  }
}

class UpdateModel extends BulkUpdateModel {
  constructor(args) {
    // TODO: Destructure
    const collection = args.collection;
    const selector = args.selector;
    const update = args.update;
    const options = args.options;
    const multi = args.multi;

    super(collection, options);
    this.options.multi = multi;

    const op = { q: selector, u: update };

    op.upsert = this.options.upsert !== void 0 ? !!this.options.upsert : false;
    op.multi = this.options.multi !== void 0 ? !!this.options.multi : false;

    if (options.arrayFilters) {
      op.arrayFilters = options.arrayFilters;
      delete this.options.arrayFilters;
    }

    decorateWithCollation(this.options, collection, options);
    this.operations = [op];
  }

  execute(server, options, callback) {
    return super.execute(server, options, (err, r) => updateCallback(err, r, callback));
  }
}

class ReplaceModel extends UpdateModel {
  execute(server, options, callback) {
    return super.execute(server, options, (err, r) => {
      if (err) return callback(err, null);
      r.ops = this.operations;
      callback(null, r);
    });
  }
}

function deleteCallback(err, r, callback) {
  if (callback == null) return;
  if (err && callback) return callback(err);
  if (r == null) return callback(null, { result: { ok: 1 } });
  r.deletedCount = r.result.n;
  if (callback) callback(null, r);
}

class BulkRemoveModel extends CrudModel {
  constructor(collection, options) {
    super(collection, options);
    this.type = REMOVE;
  }

  canRetry() {
    return !this.operations.some(op => op.limit === 0);
  }
}

class RemoveModel extends BulkRemoveModel {
  constructor(args) {
    // TODO: Destructure
    const collection = args.collection;
    const filter = args.filter;
    const options = args.options;
    const single = args.single;

    super(collection, options);
    this.options.single = single;

    const op = { q: filter, limit: 0 };
    if (this.options.single) {
      op.limit = 1;
    }
    this.operations = [op];

    decorateWithCollation(this.options, collection, this.options);
  }

  execute(server, options, callback) {
    return super.execute(server, options, (err, r) => deleteCallback(err, r, callback));
  }
}

module.exports = { CrudWriteOperation, InsertOneModel, UpdateModel, ReplaceModel, RemoveModel };
