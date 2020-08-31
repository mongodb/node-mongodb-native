import { MongoError } from '../error';
import { CursorState, Cursor } from '../cursor';
import {
  applyRetryableWrites,
  applyWriteConcern,
  decorateWithCollation,
  formattedOrderClause,
  Callback
} from '../utils';
import type { Document } from '../bson';
import type { Db } from '../db';
import type { ClientSession } from '../sessions';
import type { Server } from '../sdam/server';
import type { ReadPreference } from '../read_preference';
import type { Collection } from '../collection';
import type { UpdateOptions } from './update';
import type { WriteCommandOptions } from '../cmap/wire_protocol/write_command';

/** @internal */
export interface IndexInformationOptions {
  full?: boolean;
  readPreference?: ReadPreference;
  session?: ClientSession;
}
/**
 * Retrieves this collections index info.
 *
 * @param db - The Db instance on which to retrieve the index info.
 * @param name - The name of the collection.
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
  if (db.s.topology && db.s.topology.isDestroyed())
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
      if (err) return callback(new MongoError(err));
      if (!Array.isArray(indexes)) return callback(undefined, []);
      if (full) return callback(undefined, indexes);
      callback(undefined, processResults(indexes));
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
    return callback(MongoError.create({ message: 'Cursor is closed', driver: true }));
  }

  if (cursor.s.state === CursorState.INIT && cursor.cmd && cursor.cmd.sort) {
    try {
      cursor.cmd.sort = formattedOrderClause(cursor.cmd.sort);
    } catch (err) {
      return callback(err);
    }
  }

  // Get the next object
  cursor._next((err, doc) => {
    cursor.s.state = CursorState.OPEN;
    if (err) return callback(err);
    callback(undefined, doc);
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
    if (err) return callback(err);
    if (result == null) return callback();
    if (result.code) return callback(new MongoError(result));
    if (result.writeErrors) {
      return callback(new MongoError(result.writeErrors[0]));
    }

    // Return the results
    callback(undefined, result);
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
  options: UpdateOptions,
  callback: Callback
): void;
export function updateDocuments(
  server: Server,
  coll: Collection,
  selector: Document,
  document: Document,
  _options: UpdateOptions | Callback,
  _callback?: Callback
): void {
  let options = _options as UpdateOptions;
  let callback = _callback as Callback;
  if ('function' === typeof options) {
    callback = options;
    options = {};
  }

  // If we are not providing a selector or document throw
  if (selector == null || typeof selector !== 'object')
    return callback(new TypeError('selector must be a valid JavaScript object'));
  if (document == null || typeof document !== 'object')
    return callback(new TypeError('document must be a valid JavaScript object'));

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
  server.update(
    coll.s.namespace.toString(),
    [op],
    finalOptions as WriteCommandOptions,
    (err, result) => {
      if (callback == null) return;
      if (err) return callback(err);
      if (result == null) return callback();
      if (result.code) return callback(new MongoError(result));
      if (result.writeErrors) return callback(new MongoError(result.writeErrors[0]));
      // Return the results
      callback(undefined, result);
    }
  );
}
