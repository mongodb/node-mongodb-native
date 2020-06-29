'use strict';
import ReadPreference = require('../read_preference');
import { executeCommand } from './db_ops';
import { MongoError } from '../error';
import { CursorState } from '../cursor';
import {
  applyRetryableWrites,
  applyWriteConcern,
  decorateWithCollation,
  decorateWithReadConcern,
  formattedOrderClause,
  handleCallback,
  toError
} from '../utils';

/**
 * Build the count command.
 *
 * @function
 * @param {Collection|Cursor} collectionOrCursor an instance of a collection or cursor
 * @param {any} query The query for the count.
 * @param {any} [options] Optional settings. See Collection.prototype.count and Cursor.prototype.count for a list of options.
 */
function buildCountCommand(collectionOrCursor: any, query: any, options?: any) {
  const skip = options.skip;
  const limit = options.limit;
  let hint = options.hint;
  const maxTimeMS = options.maxTimeMS;
  query = query || {};

  // Final query
  const cmd = {
    count: options.collectionName,
    query: query
  } as any;

  if (collectionOrCursor.s.numberOfRetries) {
    // collectionOrCursor is a cursor
    if (collectionOrCursor.options.hint) {
      hint = collectionOrCursor.options.hint;
    } else if (collectionOrCursor.cmd.hint) {
      hint = collectionOrCursor.cmd.hint;
    }
    decorateWithCollation(cmd, collectionOrCursor, collectionOrCursor.cmd);
  } else {
    decorateWithCollation(cmd, collectionOrCursor, options);
  }

  // Add limit, skip and maxTimeMS if defined
  if (typeof skip === 'number') cmd.skip = skip;
  if (typeof limit === 'number') cmd.limit = limit;
  if (typeof maxTimeMS === 'number') cmd.maxTimeMS = maxTimeMS;
  if (hint) cmd.hint = hint;

  // Do we have a readConcern specified
  decorateWithReadConcern(cmd, collectionOrCursor);

  return cmd;
}

function deleteCallback(err: any, r: any, callback: Function) {
  if (callback == null) return;
  if (err && callback) return callback(err);
  if (r == null) return callback(null, { result: { ok: 1 } });
  r.deletedCount = r.result.n;
  if (callback) callback(null, r);
}

/**
 * Find and update a document.
 *
 * @function
 * @param {Collection} coll Collection instance.
 * @param {object} query Query object to locate the object to modify.
 * @param {any} sort If multiple docs match, choose the first one in the specified sort order as the object to manipulate.
 * @param {object} doc The fields/vals to be updated.
 * @param {any} [options] Optional settings. See Collection.prototype.findAndModify for a list of options.
 * @param {Collection~findAndModifyCallback} [callback] The command result callback
 * @deprecated use findOneAndUpdate, findOneAndReplace or findOneAndDelete instead
 */
function findAndModify(
  coll: any,
  query: object,
  sort: any,
  doc: object,
  options?: any,
  callback?: Function
) {
  // Create findAndModify command object
  const queryObject = {
    findAndModify: coll.collectionName,
    query: query
  } as any;

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
    return callback!(err, null);
  }

  // Execute the command
  executeCommand(coll.s.db, queryObject, finalOptions, (err?: any, result?: any) => {
    if (err) return handleCallback(callback!, err, null);

    return handleCallback(callback!, null, result);
  });
}

/**
 * Retrieves this collections index info.
 *
 * @function
 * @param {Db} db The Db instance on which to retrieve the index info.
 * @param {string} name The name of the collection.
 * @param {object} [options] Optional settings. See Db.prototype.indexInformation for a list of options.
 * @param {Db~resultCallback} [callback] The command result callback
 */
function indexInformation(db: any, name: string, options?: any, callback?: Function) {
  // If we specified full information
  const full = options['full'] == null ? false : options['full'];

  // Did the user destroy the topology
  if (db.serverConfig && db.serverConfig.isDestroyed())
    return callback!(new MongoError('topology was destroyed'));
  // Process all the results from the index command and collection
  function processResults(indexes: any) {
    // Contains all the information
    let info: any = {};
    // Process all the indexes
    for (let i = 0; i < indexes.length; i++) {
      const index = indexes[i];
      // Let's unpack the object
      info[index.name] = [];
      for (let name in index.key) {
        info[index.name].push([name, index.key[name]]);
      }
    }

    return info;
  }

  // Get the list of indexes of the specified collection
  db.collection(name)
    .listIndexes(options)
    .toArray((err?: any, indexes?: any) => {
      if (err) return callback!(toError(err));
      if (!Array.isArray(indexes)) return handleCallback(callback!, null, []);
      if (full) return handleCallback(callback!, null, indexes);
      handleCallback(callback!, null, processResults(indexes));
    });
}

function prepareDocs(coll: any, docs: any, options: any) {
  const forceServerObjectId =
    typeof options.forceServerObjectId === 'boolean'
      ? options.forceServerObjectId
      : coll.s.db.options.forceServerObjectId;

  // no need to modify the docs if server sets the ObjectId
  if (forceServerObjectId === true) {
    return docs;
  }

  return docs.map((doc: any) => {
    if (forceServerObjectId !== true && doc._id == null) {
      doc._id = coll.s.pkFactory.createPk();
    }

    return doc;
  });
}

// Get the next available document from the cursor, returns null if no more documents are available.
function nextObject(cursor: any, callback: Function) {
  if (cursor.s.state === CursorState.CLOSED || (cursor.isDead && cursor.isDead())) {
    return handleCallback(
      callback,
      MongoError.create({ message: 'Cursor is closed', driver: true })
    );
  }

  if (cursor.s.state === CursorState.INIT && cursor.cmd && cursor.cmd.sort) {
    try {
      cursor.cmd.sort = formattedOrderClause(cursor.cmd.sort);
    } catch (err) {
      return handleCallback(callback, err);
    }
  }

  // Get the next object
  cursor._next((err?: any, doc?: any) => {
    cursor.s.state = CursorState.OPEN;
    if (err) return handleCallback(callback, err);
    handleCallback(callback, null, doc);
  });
}

function insertDocuments(coll: any, docs: any, options: any, callback: Function) {
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
  coll.s.topology.insert(coll.s.namespace, docs, finalOptions, (err?: any, result?: any) => {
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

function removeDocuments(coll: any, selector: any, options: any, callback: Function) {
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
  const op = { q: selector, limit: 0 } as any;
  if (options.single) {
    op.limit = 1;
  } else if (finalOptions.retryWrites) {
    finalOptions.retryWrites = false;
  }
  if (options.hint) {
    op.hint = options.hint;
  }

  // Have we specified collation
  try {
    decorateWithCollation(finalOptions, coll, options);
  } catch (err) {
    return callback(err, null);
  }

  // Execute the remove
  coll.s.topology.remove(coll.s.namespace, [op], finalOptions, (err?: any, result?: any) => {
    if (callback == null) return;
    if (err) return handleCallback(callback, err, null);
    if (result == null) return handleCallback(callback, null, null);
    if (result.result.code) return handleCallback(callback, toError(result.result));
    if (result.result.writeErrors) {
      return handleCallback(callback, toError(result.result.writeErrors[0]));
    }

    // Return the results
    handleCallback(callback, null, result);
  });
}

function updateDocuments(
  coll: any,
  selector: any,
  document: any,
  options: any,
  callback?: Function
) {
  if ('function' === typeof options) (callback = options), (options = null);
  if (options == null) options = {};
  if (!('function' === typeof callback)) callback = undefined;

  // If we are not providing a selector or document throw
  if (selector == null || typeof selector !== 'object')
    return callback!(toError('selector must be a valid JavaScript object'));
  if (document == null || typeof document !== 'object')
    return callback!(toError('document must be a valid JavaScript object'));

  // Final options for retryable writes and write concern
  let finalOptions = Object.assign({}, options);
  finalOptions = applyRetryableWrites(finalOptions, coll.s.db);
  finalOptions = applyWriteConcern(finalOptions, { db: coll.s.db, collection: coll }, options);

  // Do we return the actual result document
  // Either use override on the function, or go back to default on either the collection
  // level or db
  finalOptions.serializeFunctions = options.serializeFunctions || coll.s.serializeFunctions;

  // Execute the operation
  const op = { q: selector, u: document } as any;
  op.upsert = options.upsert !== void 0 ? !!options.upsert : false;
  op.multi = options.multi !== void 0 ? !!options.multi : false;

  if (options.hint) {
    op.hint = options.hint;
  }

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
    return callback!(err, null);
  }

  // Update options
  coll.s.topology.update(coll.s.namespace, [op], finalOptions, (err?: any, result?: any) => {
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

function updateCallback(err: any, r: any, callback: Function) {
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

export {
  buildCountCommand,
  deleteCallback,
  findAndModify,
  indexInformation,
  nextObject,
  prepareDocs,
  insertDocuments,
  removeDocuments,
  updateDocuments,
  updateCallback
};
