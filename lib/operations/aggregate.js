'use strict';

const AggregationCursor = require('../aggregation_cursor');
const applyWriteConcern = require('../utils').applyWriteConcern;
const decorateWithCollation = require('../utils').decorateWithCollation;
const decorateWithReadConcern = require('../utils').decorateWithReadConcern;
const handleCallback = require('../utils').handleCallback;
const MongoError = require('mongodb-core').MongoError;
const resolveReadPreference = require('../utils').resolveReadPreference;
const toError = require('../utils').toError;

/**
 * Perform an aggregate operation. See Collection.prototype.aggregate or Db.prototype.aggregate for more information.
 *
 * @method
 * @param {Db} db A Db instance.
 * @param {Collection|string} coll A collection instance or the string '1', used for db.aggregate.
 * @param {object} [pipeline=[]] Array containing all the aggregation framework commands for the execution.
 * @param {object} [options] Optional settings. See Collection.prototype.aggregate or Db.prototype.aggregate for a list of options.
 * @param {Db~aggregationCallback|Collection~aggregationCallback} callback The command result callback
 */
function aggregate(db, coll, pipeline, options, callback) {
  let ignoreReadConcern = false;

  if (typeof options.out === 'string') {
    pipeline.push({ $out: options.out });
    ignoreReadConcern = true;
  } else if (pipeline.length > 0 && pipeline[pipeline.length - 1]['$out']) {
    ignoreReadConcern = true;
  }

  let command;
  let namespace;
  let takesWriteConcern;
  let optionSources;

  if (typeof coll === 'string') {
    command = { aggregate: 1, pipeline: pipeline };
    namespace = `${db.s.databaseName}.1`;

    optionSources = { db };
    takesWriteConcern = db.s.topology.capabilities().commandsTakeWriteConcern;

    if (!ignoreReadConcern) {
      decorateWithReadConcern(command, db, options);
    }
  } else {
    command = { aggregate: coll.s.name, pipeline: pipeline };
    namespace = coll.s.namespace;

    optionSources = { db: coll.s.db, collection: coll };
    takesWriteConcern = coll.s.topology.capabilities().commandsTakeWriteConcern;

    if (!ignoreReadConcern) {
      decorateWithReadConcern(command, coll, options);
    }
  }

  if (pipeline.length > 0 && pipeline[pipeline.length - 1]['$out'] && takesWriteConcern) {
    applyWriteConcern(command, optionSources, options);
  }

  try {
    if (typeof coll === 'string') {
      decorateWithCollation(command, db, options);
    } else {
      decorateWithCollation(command, coll, options);
    }
  } catch (err) {
    if (typeof callback === 'function') return callback(err, null);
    throw err;
  }

  if (options.bypassDocumentValidation === true) {
    command.bypassDocumentValidation = options.bypassDocumentValidation;
  }

  if (typeof options.allowDiskUse === 'boolean') command.allowDiskUse = options.allowDiskUse;
  if (typeof options.maxTimeMS === 'number') command.maxTimeMS = options.maxTimeMS;

  if (options.hint) command.hint = options.hint;

  options = Object.assign({}, options);

  // Ensure we have the right read preference inheritance
  options.readPreference = resolveReadPreference(options, optionSources);

  if (options.explain) {
    if (command.readConcern || command.writeConcern) {
      throw toError('"explain" cannot be used on an aggregate call with readConcern/writeConcern');
    }
    command.explain = options.explain;
  }

  if (typeof options.comment === 'string') command.comment = options.comment;

  // Validate that cursor options is valid
  if (options.cursor != null && typeof options.cursor !== 'object') {
    throw toError('cursor options must be an object');
  }

  options.cursor = options.cursor || {};
  if (options.batchSize) options.cursor.batchSize = options.batchSize;
  command.cursor = options.cursor;

  // promiseLibrary
  options.promiseLibrary = typeof coll === 'string' ? db.s.promiseLibrary : coll.s.promiseLibrary;

  // Set the AggregationCursor constructor
  options.cursorFactory = AggregationCursor;

  if (typeof callback !== 'function') {
    if (typeof coll === 'string' && !db.s.topology.capabilities()) {
      throw new MongoError('cannot connect to server');
    } else if (typeof coll !== 'string' && !coll.s.topology.capabilities()) {
      throw new MongoError('cannot connect to server');
    }

    if (typeof coll === 'string') {
      return db.s.topology.cursor(namespace, command, options);
    }
    return coll.s.topology.cursor(namespace, command, options);
  }

  if (typeof coll === 'string') {
    return handleCallback(callback, null, db.s.topology.cursor(namespace, command, options));
  }
  return handleCallback(callback, null, coll.s.topology.cursor(namespace, command, options));
}

module.exports = {
  aggregate
};
