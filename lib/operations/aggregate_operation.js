'use strict';

const OperationBase = require('./operation').OperationBase;
const AggregationCursor = require('../aggregation_cursor');
const applyWriteConcern = require('../utils').applyWriteConcern;
const decorateWithCollation = require('../utils').decorateWithCollation;
const decorateWithReadConcern = require('../utils').decorateWithReadConcern;
const handleCallback = require('../utils').handleCallback;
const MongoError = require('../core').MongoError;
const resolveReadPreference = require('../utils').resolveReadPreference;
const toError = require('../utils').toError;

const DB_AGGREGATE_COLLECTION = 1;

class AggregateOperation extends OperationBase {
  constructor(db, collection, pipeline, options) {
    super(options);

    this.db = db;
    this.collection = collection;
    this.pipeline = pipeline;
  }

  execute(callback) {
    const db = this.db;
    const coll = this.collection;
    let pipeline = this.pipeline;
    let options = this.options;

    const isDbAggregate = typeof coll === 'string';
    const target = isDbAggregate ? db : coll;
    const topology = target.s.topology;
    let hasOutStage = false;

    if (typeof options.out === 'string') {
      pipeline = pipeline.concat({ $out: options.out });
      hasOutStage = true;
    } else if (pipeline.length > 0 && pipeline[pipeline.length - 1]['$out']) {
      hasOutStage = true;
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

    if (!hasOutStage) {
      decorateWithReadConcern(command, target, options);
    }

    if (pipeline.length > 0 && pipeline[pipeline.length - 1]['$out'] && takesWriteConcern) {
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
    options.readPreference = resolveReadPreference(options, optionSources);

    if (options.explain) {
      if (command.readConcern || command.writeConcern) {
        throw toError(
          '"explain" cannot be used on an aggregate call with readConcern/writeConcern'
        );
      }
      command.explain = options.explain;
    }

    if (typeof options.comment === 'string') command.comment = options.comment;

    // Validate that cursor options is valid
    if (options.cursor != null && typeof options.cursor !== 'object') {
      throw toError('cursor options must be an object');
    }

    options.cursor = options.cursor || {};
    if (options.batchSize && !hasOutStage) options.cursor.batchSize = options.batchSize;
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
}

module.exports = AggregateOperation;
