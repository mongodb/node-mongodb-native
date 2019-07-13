'use strict';

const CommandOperationV2 = require('./command_v2');
const MongoError = require('../core').MongoError;
const maxWireVersion = require('../core/utils').maxWireVersion;
const ReadPreference = require('../core').ReadPreference;
const Aspect = require('./operation').Aspect;
const defineAspects = require('./operation').defineAspects;

const DB_AGGREGATE_COLLECTION = 1;
const MIN_WIRE_VERSION_$OUT_READ_CONCERN_SUPPORT = 8;

class AggregateOperation extends CommandOperationV2 {
  constructor(parent, pipeline, options) {
    super(parent, options);

    this.target =
      parent.s.namespace && parent.s.namespace.collection
        ? parent.s.namespace.collection
        : DB_AGGREGATE_COLLECTION;

    this.pipeline = pipeline;

    // determine if we have a write stage, override read preference if so
    this.hasWriteStage = false;
    if (typeof options.out === 'string') {
      this.pipeline = this.pipeline.concat({ $out: options.out });
      this.hasWriteStage = true;
    } else if (pipeline.length > 0) {
      const finalStage = pipeline[pipeline.length - 1];
      if (finalStage.$out || finalStage.$merge) {
        this.hasWriteStage = true;
      }
    }

    if (this.hasWriteStage) {
      this.readPreference = ReadPreference.primary;
    }
  }

  execute(server, callback) {
    const options = this.options;
    const serverWireVersion = maxWireVersion(server);

    const command = { aggregate: this.target, pipeline: this.pipeline };
    if (!this.hasWriteStage || serverWireVersion >= MIN_WIRE_VERSION_$OUT_READ_CONCERN_SUPPORT) {
      Object.assign(command, { readConcern: this.readConcern });
    }

    if (serverWireVersion >= 5) {
      if (this.hasWriteStage && this.writeConcern) {
        Object.assign(command, { writeConcern: this.writeConcern });
      }

      if (options.collation && typeof options.collation === 'object') {
        Object.assign(command, { collation: options.collation });
      }
    }

    if (options.bypassDocumentValidation === true) {
      command.bypassDocumentValidation = options.bypassDocumentValidation;
    }

    if (typeof options.allowDiskUse === 'boolean') {
      command.allowDiskUse = options.allowDiskUse;
    }

    if (typeof options.maxTimeMS === 'number') {
      command.maxTimeMS = options.maxTimeMS;
    }

    if (options.hint) {
      command.hint = options.hint;
    }

    if (options.explain) {
      if (command.readConcern || command.writeConcern) {
        callback(
          new MongoError(
            '"explain" cannot be used on an aggregate call with readConcern/writeConcern'
          )
        );

        return;
      }

      command.explain = options.explain;
    }

    if (typeof options.comment === 'string') {
      command.comment = options.comment;
    }

    // Validate that cursor options is valid
    if (options.cursor != null && typeof options.cursor !== 'object') {
      callback(new MongoError('cursor options must be an object'));
      return;
    }

    command.cursor = options.cursor || {};
    if (options.batchSize && !this.hasWriteStage) {
      command.cursor.batchSize = options.batchSize;
    }

    super.executeCommand(server, command, callback);
  }
}

defineAspects(AggregateOperation, [
  Aspect.READ_OPERATION,
  Aspect.RETRYABLE,
  Aspect.EXECUTE_WITH_SELECTION
]);

module.exports = AggregateOperation;
