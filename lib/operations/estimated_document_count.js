'use strict';

const OperationBase = require('./operation').OperationBase;
const decorateWithCollation = require('../utils').decorateWithCollation;
const decorateWithReadConcern = require('../utils').decorateWithReadConcern;
const executeCommand = require('./db_ops').executeCommand;
const handleCallback = require('../utils').handleCallback;
const resolveReadPreference = require('../utils').resolveReadPreference;

class EstimatedDocumentCountOperation extends OperationBase {
  constructor(collection, options) {
    super(options);

    this.collection = collection;
  }

  execute(callback) {
    const coll = this.collection;
    let options = this.options;

    options = Object.assign({}, options);
    options.collectionName = coll.s.name;

    options.readPreference = resolveReadPreference(options, {
      db: coll.s.db,
      collection: coll
    });

    let cmd;
    try {
      cmd = buildCountCommand(coll, null, options);
    } catch (err) {
      return callback(err);
    }

    executeCommand(coll.s.db, cmd, options, (err, result) => {
      if (err) return handleCallback(callback, err);
      handleCallback(callback, null, result.n);
    });
  }
}

/**
 * Build the count command.
 *
 * @method
 * @param {collectionOrCursor} an instance of a collection or cursor
 * @param {object} query The query for the count.
 * @param {object} [options] Optional settings. See Collection.prototype.count and Cursor.prototype.count for a list of options.
 */
function buildCountCommand(collectionOrCursor, query, options) {
  const skip = options.skip;
  const limit = options.limit;
  let hint = options.hint;
  const maxTimeMS = options.maxTimeMS;
  query = query || {};

  // Final query
  const cmd = {
    count: options.collectionName,
    query: query
  };

  // check if collectionOrCursor is a cursor by using cursor.s.numberOfRetries
  if (collectionOrCursor.s.numberOfRetries) {
    if (collectionOrCursor.s.options.hint) {
      hint = collectionOrCursor.s.options.hint;
    } else if (collectionOrCursor.s.cmd.hint) {
      hint = collectionOrCursor.s.cmd.hint;
    }
    decorateWithCollation(cmd, collectionOrCursor, collectionOrCursor.s.cmd);
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

module.exports = EstimatedDocumentCountOperation;
