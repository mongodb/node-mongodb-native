'use strict';

const AggregationCursor = require('../aggregation_cursor');
const applyWriteConcern = require('../utils').applyWriteConcern;
const decorateWithCollation = require('../utils').decorateWithCollation;
const decorateWithReadConcern = require('../utils').decorateWithReadConcern;
const handleCallback = require('../utils').handleCallback;
const MongoError = require('../core').MongoError;
const resolveReadPreference = require('../utils').resolveReadPreference;
const toError = require('../utils').toError;
const ReadPreference = require('../core').ReadPreference;

const DB_AGGREGATE_COLLECTION = 1;
const MIN_WIRE_VERSION_$OUT_READ_CONCERN_SUPPORT = 8;

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
  const isDbAggregate = typeof coll === 'string';
  const target = isDbAggregate ? db : coll;
  const topology = target.s.topology;
  let hasWriteStage = false;

  if (typeof options.out === 'string') {
    pipeline = pipeline.concat({ $out: options.out });
    hasWriteStage = true;
  } else if (pipeline.length > 0) {
    const finalStage = pipeline[pipeline.length - 1];
    if (finalStage.$out || finalStage.$merge) {
      hasWriteStage = true;
    }
  }

  let command;
  let namespace;
  let optionSources;

  if (isDbAggregate) {
    command = { aggregate: DB_AGGREGATE_COLLECTION, pipeline: pipeline };
    namespace = db.s.namespace.withCollection(DB_AGGREGATE_COLLECTION);

    optionSources = { db };
  } else {
    command = { aggregate: coll.collectionName, pipeline: pipeline };
    namespace = coll.s.namespace;

    optionSources = { db: coll.s.db, collection: coll };
  }

  const takesWriteConcern = topology.capabilities().commandsTakeWriteConcern;
  const ismaster = topology.lastIsMaster() || {};

  if (!hasWriteStage || ismaster.maxWireVersion >= MIN_WIRE_VERSION_$OUT_READ_CONCERN_SUPPORT) {
    decorateWithReadConcern(command, target, options);
  }

  if (hasWriteStage && takesWriteConcern) {
    applyWriteConcern(command, optionSources, options);
  }

  try {
    decorateWithCollation(command, target, options);
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
  options.readPreference = hasWriteStage
    ? ReadPreference.primary
    : resolveReadPreference(isDbAggregate ? db : coll, options);

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
  if (options.batchSize && !hasWriteStage) {
    options.cursor.batchSize = options.batchSize;
  }

  command.cursor = options.cursor;

  // promiseLibrary
  options.promiseLibrary = target.s.promiseLibrary;

  // Set the AggregationCursor constructor
  options.cursorFactory = AggregationCursor;

  if (typeof callback !== 'function') {
    if (!topology.capabilities()) {
      throw new MongoError('cannot connect to server');
    }

    return topology.cursor(namespace.toString(), command, options);
  }

  return handleCallback(callback, null, topology.cursor(namespace.toString(), command, options));
}

module.exports = {
  aggregate
};
