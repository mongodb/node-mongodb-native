'use strict';

const applyRetryableWrites = require('../utils').applyRetryableWrites;
const applyWriteConcern = require('../utils').applyWriteConcern;
const decorateWithCollation = require('../utils').decorateWithCollation;
const executeCommand = require('./db_ops').executeCommand;
const formattedOrderClause = require('../utils').formattedOrderClause;
const handleCallback = require('../utils').handleCallback;
const ReadPreference = require('mongodb-core').ReadPreference;
const toError = require('../utils').toError;

function deleteCallback(err, r, callback) {
  if (callback == null) return;
  if (err && callback) return callback(err);
  if (r == null) return callback(null, { result: { ok: 1 } });
  r.deletedCount = r.result.n;
  if (callback) callback(null, r);
}

/**
 * Find and update a document.
 *
 * @method
 * @param {Collection} a Collection instance.
 * @param {object} query Query object to locate the object to modify.
 * @param {array} sort If multiple docs match, choose the first one in the specified sort order as the object to manipulate.
 * @param {object} doc The fields/vals to be updated.
 * @param {object} [options] Optional settings. See Collection.prototype.findAndModify for a list of options.
 * @param {Collection~findAndModifyCallback} [callback] The command result callback
 * @deprecated use findOneAndUpdate, findOneAndReplace or findOneAndDelete instead
 */
function findAndModify(coll, query, sort, doc, options, callback) {
  // Create findAndModify command object
  const queryObject = {
    findAndModify: coll.s.name,
    query: query
  };

  sort = formattedOrderClause(sort);
  if (sort) {
    queryObject.sort = sort;
  }

  queryObject.new = options.new ? true : false;
  queryObject.remove = options.remove ? true : false;
  queryObject.upsert = options.upsert ? true : false;

  const projection = options.projection || options.fields;

  if (projection) {
    queryObject.fields = projection;
  }

  if (options.arrayFilters) {
    queryObject.arrayFilters = options.arrayFilters;
    delete options.arrayFilters;
  }

  if (doc && !options.remove) {
    queryObject.update = doc;
  }

  if (options.maxTimeMS) queryObject.maxTimeMS = options.maxTimeMS;

  // Either use override on the function, or go back to default on either the collection
  // level or db
  options.serializeFunctions = options.serializeFunctions || coll.s.serializeFunctions;

  // No check on the documents
  options.checkKeys = false;

  // Final options for retryable writes and write concern
  let finalOptions = Object.assign({}, options);
  finalOptions = applyRetryableWrites(finalOptions, coll.s.db);
  finalOptions = applyWriteConcern(finalOptions, { db: coll.s.db, collection: coll }, options);

  // Decorate the findAndModify command with the write Concern
  if (finalOptions.writeConcern) {
    queryObject.writeConcern = finalOptions.writeConcern;
  }

  // Have we specified bypassDocumentValidation
  if (finalOptions.bypassDocumentValidation === true) {
    queryObject.bypassDocumentValidation = finalOptions.bypassDocumentValidation;
  }

  finalOptions.readPreference = ReadPreference.primary;

  // Have we specified collation
  try {
    decorateWithCollation(queryObject, coll, finalOptions);
  } catch (err) {
    return callback(err, null);
  }

  // Execute the command
  executeCommand(coll.s.db, queryObject, finalOptions, (err, result) => {
    if (err) return handleCallback(callback, err, null);

    return handleCallback(callback, null, result);
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

function removeDocuments(coll, selector, options, callback) {
  if (typeof options === 'function') {
    (callback = options), (options = {});
  } else if (typeof selector === 'function') {
    callback = selector;
    options = {};
    selector = {};
  }

  // Create an empty options object if the provided one is null
  options = options || {};

  // Final options for retryable writes and write concern
  let finalOptions = Object.assign({}, options);
  finalOptions = applyRetryableWrites(finalOptions, coll.s.db);
  finalOptions = applyWriteConcern(finalOptions, { db: coll.s.db, collection: coll }, options);

  // If selector is null set empty
  if (selector == null) selector = {};

  // Build the op
  const op = { q: selector, limit: 0 };
  if (options.single) {
    op.limit = 1;
  } else if (finalOptions.retryWrites) {
    finalOptions.retryWrites = false;
  }

  // Have we specified collation
  try {
    decorateWithCollation(finalOptions, coll, options);
  } catch (err) {
    return callback(err, null);
  }

  // Execute the remove
  coll.s.topology.remove(coll.s.namespace, [op], finalOptions, (err, result) => {
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

function updateDocuments(coll, selector, document, options, callback) {
  if ('function' === typeof options) (callback = options), (options = null);
  if (options == null) options = {};
  if (!('function' === typeof callback)) callback = null;

  // If we are not providing a selector or document throw
  if (selector == null || typeof selector !== 'object')
    return callback(toError('selector must be a valid JavaScript object'));
  if (document == null || typeof document !== 'object')
    return callback(toError('document must be a valid JavaScript object'));

  // Final options for retryable writes and write concern
  let finalOptions = Object.assign({}, options);
  finalOptions = applyRetryableWrites(finalOptions, coll.s.db);
  finalOptions = applyWriteConcern(finalOptions, { db: coll.s.db, collection: coll }, options);

  // Do we return the actual result document
  // Either use override on the function, or go back to default on either the collection
  // level or db
  finalOptions.serializeFunctions = options.serializeFunctions || coll.s.serializeFunctions;

  // Execute the operation
  const op = { q: selector, u: document };
  op.upsert = options.upsert !== void 0 ? !!options.upsert : false;
  op.multi = options.multi !== void 0 ? !!options.multi : false;

  if (finalOptions.arrayFilters) {
    op.arrayFilters = finalOptions.arrayFilters;
    delete finalOptions.arrayFilters;
  }

  if (finalOptions.retryWrites && op.multi) {
    finalOptions.retryWrites = false;
  }

  // Have we specified collation
  try {
    decorateWithCollation(finalOptions, coll, options);
  } catch (err) {
    return callback(err, null);
  }

  // Update options
  coll.s.topology.update(coll.s.namespace, [op], finalOptions, (err, result) => {
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

module.exports = {
  deleteCallback,
  findAndModify,
  prepareDocs,
  removeDocuments,
  updateDocuments,
  updateCallback
};
