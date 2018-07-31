'use strict';

const buildCountCommand = require('./collection_ops').buildCountCommand;
const formattedOrderClause = require('../utils').formattedOrderClause;
const handleCallback = require('../utils').handleCallback;
const MongoError = require('mongodb-core').MongoError;
const push = Array.prototype.push;

/**
 * Get the count of documents for this cursor.
 *
 * @method
 * @param {Cursor} cursor The Cursor instance on which to count.
 * @param {boolean} [applySkipLimit=true] Specifies whether the count command apply limit and skip settings should be applied on the cursor or in the provided options.
 * @param {object} [options] Optional settings. See Cursor.prototype.count for a list of options.
 * @param {Cursor~countResultCallback} [callback] The result callback.
 */
function count(cursor, applySkipLimit, opts, callback) {
  if (applySkipLimit) {
    if (typeof cursor.cursorSkip() === 'number') opts.skip = cursor.cursorSkip();
    if (typeof cursor.cursorLimit() === 'number') opts.limit = cursor.cursorLimit();
  }

  // Ensure we have the right read preference inheritance
  if (opts.readPreference) {
    cursor.setReadPreference(opts.readPreference);
  }

  if (
    typeof opts.maxTimeMS !== 'number' &&
    cursor.s.cmd &&
    typeof cursor.s.cmd.maxTimeMS === 'number'
  ) {
    opts.maxTimeMS = cursor.s.cmd.maxTimeMS;
  }

  let options = {};
  options.skip = opts.skip;
  options.limit = opts.limit;
  options.hint = opts.hint;
  options.maxTimeMS = opts.maxTimeMS;

  // Command
  const delimiter = cursor.s.ns.indexOf('.');
  options.collectionName = cursor.s.ns.substr(delimiter + 1);

  const command = buildCountCommand(cursor, cursor.s.cmd.query, options);

  // Set cursor server to the same as the topology
  cursor.server = cursor.topology.s.coreTopology;

  // Execute the command
  cursor.s.topology.command(
    `${cursor.s.ns.substr(0, delimiter)}.$cmd`,
    command,
    cursor.s.options,
    (err, result) => {
      callback(err, result ? result.result.n : null);
    }
  );
}

/**
 * Iterates over all the documents for this cursor. See Cursor.prototype.each for more information.
 *
 * @method
 * @deprecated
 * @param {Cursor} cursor The Cursor instance on which to run.
 * @param {Cursor~resultCallback} callback The result callback.
 */
function each(cursor, callback) {
  const Cursor = require('../cursor');

  if (!callback) throw MongoError.create({ message: 'callback is mandatory', driver: true });
  if (cursor.isNotified()) return;
  if (cursor.s.state === Cursor.CLOSED || cursor.isDead()) {
    return handleCallback(
      callback,
      MongoError.create({ message: 'Cursor is closed', driver: true })
    );
  }

  if (cursor.s.state === Cursor.INIT) cursor.s.state = Cursor.OPEN;

  // Define function to avoid global scope escape
  let fn = null;
  // Trampoline all the entries
  if (cursor.bufferedCount() > 0) {
    while ((fn = loop(cursor, callback))) fn(cursor, callback);
    each(cursor, callback);
  } else {
    cursor.next((err, item) => {
      if (err) return handleCallback(callback, err);
      if (item == null) {
        return cursor.close({ skipKillCursors: true }, () => handleCallback(callback, null, null));
      }

      if (handleCallback(callback, null, item) === false) return;
      each(cursor, callback);
    });
  }
}

/**
 * Check if there is any document still available in the cursor.
 *
 * @method
 * @param {Cursor} cursor The Cursor instance on which to run.
 * @param {Cursor~resultCallback} [callback] The result callback.
 */
function hasNext(cursor, callback) {
  const Cursor = require('../cursor');

  if (cursor.s.currentDoc) {
    return callback(null, true);
  }

  if (cursor.isNotified()) {
    return callback(null, false);
  }

  nextObject(cursor, (err, doc) => {
    if (err) return callback(err, null);
    if (cursor.s.state === Cursor.CLOSED || cursor.isDead()) return callback(null, false);
    if (!doc) return callback(null, false);
    cursor.s.currentDoc = doc;
    callback(null, true);
  });
}

// Trampoline emptying the number of retrieved items
// without incurring a nextTick operation
function loop(cursor, callback) {
  // No more items we are done
  if (cursor.bufferedCount() === 0) return;
  // Get the next document
  cursor._next(callback);
  // Loop
  return loop;
}

/**
 * Get the next available document from the cursor. Returns null if no more documents are available.
 *
 * @method
 * @param {Cursor} cursor The Cursor instance from which to get the next document.
 * @param {Cursor~resultCallback} [callback] The result callback.
 */
function next(cursor, callback) {
  // Return the currentDoc if someone called hasNext first
  if (cursor.s.currentDoc) {
    const doc = cursor.s.currentDoc;
    cursor.s.currentDoc = null;
    return callback(null, doc);
  }

  // Return the next object
  nextObject(cursor, callback);
}

// Get the next available document from the cursor, returns null if no more documents are available.
function nextObject(cursor, callback) {
  const Cursor = require('../cursor');

  if (cursor.s.state === Cursor.CLOSED || (cursor.isDead && cursor.isDead()))
    return handleCallback(
      callback,
      MongoError.create({ message: 'Cursor is closed', driver: true })
    );
  if (cursor.s.state === Cursor.INIT && cursor.s.cmd.sort) {
    try {
      cursor.s.cmd.sort = formattedOrderClause(cursor.s.cmd.sort);
    } catch (err) {
      return handleCallback(callback, err);
    }
  }

  // Get the next object
  cursor._next((err, doc) => {
    cursor.s.state = Cursor.OPEN;
    if (err) return handleCallback(callback, err);
    handleCallback(callback, null, doc);
  });
}

/**
 * Returns an array of documents. See Cursor.prototype.toArray for more information.
 *
 * @method
 * @param {Cursor} cursor The Cursor instance from which to get the next document.
 * @param {Cursor~toArrayResultCallback} [callback] The result callback.
 */
function toArray(cursor, callback) {
  const Cursor = require('../cursor');

  const items = [];

  // Reset cursor
  cursor.rewind();
  cursor.s.state = Cursor.INIT;

  // Fetch all the documents
  const fetchDocs = () => {
    cursor._next((err, doc) => {
      if (err) {
        return cursor._endSession
          ? cursor._endSession(() => handleCallback(callback, err))
          : handleCallback(callback, err);
      }
      if (doc == null) {
        return cursor.close({ skipKillCursors: true }, () => handleCallback(callback, null, items));
      }

      // Add doc to items
      items.push(doc);

      // Get all buffered objects
      if (cursor.bufferedCount() > 0) {
        let docs = cursor.readBufferedDocuments(cursor.bufferedCount());

        // Transform the doc if transform method added
        if (cursor.s.transforms && typeof cursor.s.transforms.doc === 'function') {
          docs = docs.map(cursor.s.transforms.doc);
        }

        push.apply(items, docs);
      }

      // Attempt a fetch
      fetchDocs();
    });
  };

  fetchDocs();
}

module.exports = { count, each, hasNext, next, toArray };
