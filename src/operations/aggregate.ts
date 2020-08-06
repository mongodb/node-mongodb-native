import { CommandOperation, CommandOperationOptions } from './command';
import { ReadPreference } from '../read_preference';
import { MongoError } from '../error';
import { maxWireVersion } from '../utils';
import { Aspect, defineAspects, Hint } from './operation';
import type { Callback, Document } from '../types';
import type { Server } from '../sdam/server';
import type { Collection } from '../collection';
import type { Db } from '../db';
import type { Cursor } from '../cursor';
import type { WriteConcern } from '../write_concern';
import type { ReadConcern } from '../read_concern';

const DB_AGGREGATE_COLLECTION = 1 as const;
const MIN_WIRE_VERSION_$OUT_READ_CONCERN_SUPPORT = 8 as const;

export interface AggregateOperationOptions extends CommandOperationOptions {
  bypassDocumentValidation: boolean;
  allowDiskUse: boolean;
  hint: Hint;
  full: boolean;
  batchSize: boolean;
  out?: string;
  explain?: ReadConcern | WriteConcern;
  cursor: Cursor;
}

export class AggregateOperation extends CommandOperation {
  target: string | typeof DB_AGGREGATE_COLLECTION;
  pipeline: Document[];
  hasWriteStage: boolean;

  constructor(parent: Collection | Db, pipeline: Document[], options: AggregateOperationOptions) {
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

  get canRetryRead(): boolean {
    return !this.hasWriteStage;
  }

  addToPipeline(stage: Document): void {
    this.pipeline.push(stage);
  }

  execute(server: Server, callback: Callback<Document>): void {
    const options: AggregateOperationOptions = this.options;
    const serverWireVersion = maxWireVersion(server);
    const command: Document = { aggregate: this.target, pipeline: this.pipeline };

    if (this.hasWriteStage && serverWireVersion < MIN_WIRE_VERSION_$OUT_READ_CONCERN_SUPPORT) {
      this.readConcern = undefined;
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
