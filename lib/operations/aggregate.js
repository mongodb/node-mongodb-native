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
    super(parent, options, { fullResponse: true });

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

    if (options.explain && (this.readConcern || this.writeConcern)) {
      throw new MongoError(
        '"explain" cannot be used on an aggregate call with readConcern/writeConcern'
      );
    }

    if (options.cursor != null && typeof options.cursor !== 'object') {
      throw new MongoError('cursor options must be an object');
    }
  }

  get canRetryRead() {
    return !this.hasWriteStage;
  }

  addToPipeline(stage) {
    this.pipeline.push(stage);
  }

  execute(server, callback) {
    const options = this.options;
    const serverWireVersion = maxWireVersion(server);
    const command = { aggregate: this.target, pipeline: this.pipeline };

    if (this.hasWriteStage && serverWireVersion < MIN_WIRE_VERSION_$OUT_READ_CONCERN_SUPPORT) {
      this.readConcern = null;
    }

    if (serverWireVersion >= 5) {
      if (this.hasWriteStage && this.writeConcern) {
        Object.assign(command, { writeConcern: this.writeConcern });
      }
    }

    if (options.bypassDocumentValidation === true) {
      command.bypassDocumentValidation = options.bypassDocumentValidation;
    }

    if (typeof options.allowDiskUse === 'boolean') {
      command.allowDiskUse = options.allowDiskUse;
    }

    if (options.hint) {
      command.hint = options.hint;
    }

    if (options.explain) {
      options.full = false;
      command.explain = options.explain;
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
