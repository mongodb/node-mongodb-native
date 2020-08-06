import { MongoError } from '../error';
import { CursorState, Cursor } from '../cursor';
import {
  applyRetryableWrites,
  applyWriteConcern,
  decorateWithCollation,
  formattedOrderClause,
  handleCallback,
  toError
} from '../utils';
import type { Callback, Document, AnyError } from '../types';
import type { Db } from '../db';
import type { ClientSession } from '../sessions';
import type { Server } from '../sdam/server';
import type { ReadPreference } from '../read_preference';
import type { Collection } from '../collection';
import type { UpdateOpOptions } from './update';

export function deleteCallback(err: any, r: any, callback: Callback): void {
  if (callback == null) return;
  if (err && callback) return callback(err);
  if (r == null) return callback(undefined, { result: { ok: 1 } });
  r.deletedCount = r.result.n;
  if (callback) callback(undefined, r);
}

export interface IndexInformationOptions {
  full?: boolean;
  readPreference?: ReadPreference;
  session?: ClientSession;
}
/**
 * Retrieves this collections index info.
 *
 * @param db The Db instance on which to retrieve the index info.
 * @param name The name of the collection.
 * @param [options] Optional settings. See Db.prototype.indexInformation for a list of options.
 * @param [callback] The command result callback
 */
export function indexInformation(db: Db, name: string, callback: Callback): void;
export function indexInformation(
  db: Db,
  name: string,
  options: IndexInformationOptions,
  callback?: Callback
): void;
export function indexInformation(
  db: Db,
  name: string,
  _optionsOrCallback: IndexInformationOptions | Callback,
  _callback?: Callback
): void {
  let options = _optionsOrCallback as IndexInformationOptions;
  let callback = _callback as Callback;
  if ('function' === typeof _optionsOrCallback) {
    callback = _optionsOrCallback as Callback;
    options = {};
  }
  // If we specified full information
  const full = options.full == null ? false : options.full;

  // Did the user destroy the topology
  if (db.serverConfig && db.serverConfig.isDestroyed())
    return callback(new MongoError('topology was destroyed'));
  // Process all the results from the index command and collection
  function processResults(indexes: any) {
    // Contains all the information
    const info: any = {};
    // Process all the indexes
    for (let i = 0; i < indexes.length; i++) {
      const index = indexes[i];
      // Let's unpack the object
      info[index.name] = [];
      for (const name in index.key) {
        info[index.name].push([name, index.key[name]]);
      }
    }

    return info;
  }

  // Get the list of indexes of the specified collection
  db.collection(name)
    .listIndexes(options)
    .toArray((err?: any, indexes?: any) => {
      if (err) return callback(toError(err));
      if (!Array.isArray(indexes)) return handleCallback(callback, null, []);
      if (full) return handleCallback(callback, null, indexes);
      handleCallback(callback, null, processResults(indexes));
    });
}

export function prepareDocs(coll: any, docs: any, options: any) {
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
export function nextObject(cursor: Cursor, callback: Callback) {
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
  cursor._next((err, doc) => {
    cursor.s.state = CursorState.OPEN;
    if (err) return handleCallback(callback, err);
    handleCallback(callback, null, doc);
  });
}

export function removeDocuments(
  server: Server,
  coll: Collection,
  selector: any,
  options: any,
  callback: Callback
): void {
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
  server.remove(coll.s.namespace.toString(), [op], finalOptions, (err, result) => {
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

export function updateDocuments(
  server: Server,
  coll: Collection,
  selector: Document,
  document: Document,
  callback: Callback
): void;
export function updateDocuments(
  server: Server,
  coll: Collection,
  selector: Document,
  document: Document,
  options: UpdateOpOptions,
  callback: Callback
): void;
export function updateDocuments(
  server: Server,
  coll: Collection,
  selector: Document,
  document: Document,
  _options: UpdateOpOptions | Callback,
  _callback?: Callback
): void {
  let options = _options as UpdateOpOptions;
  let callback = _callback as Callback;
  if ('function' === typeof options) {
    callback = options;
    options = {};
  }

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
  const op: Document = { q: selector, u: document };
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
    return callback(err, null);
  }

  // Update options
  server.update(coll.s.namespace.toString(), [op], finalOptions, (err, result) => {
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

export function updateCallback(err?: AnyError, r?: Document, callback?: Callback): void {
  if (!callback) return;
  if (err) return callback(err);
  if (!r) return callback(undefined, { result: { ok: 1 } });
  r.modifiedCount = r.result.nModified != null ? r.result.nModified : r.result.n;
  r.upsertedId =
    Array.isArray(r.result.upserted) && r.result.upserted.length > 0
      ? r.result.upserted[0] // FIXME(major): should be `r.result.upserted[0]._id`
      : null;
  r.upsertedCount =
    Array.isArray(r.result.upserted) && r.result.upserted.length ? r.result.upserted.length : 0;
  r.matchedCount =
    Array.isArray(r.result.upserted) && r.result.upserted.length > 0 ? 0 : r.result.n;
  callback(undefined, r);
}
