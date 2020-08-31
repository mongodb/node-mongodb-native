import { CommandOperation, CommandOperationOptions, OperationParent } from './command';
import { ReadPreference } from '../read_preference';
import { MongoError } from '../error';
import { maxWireVersion } from '../utils';
import { Aspect, defineAspects, Hint } from './operation';
import type { Callback } from '../utils';
import type { Document } from '../bson';
import type { Server } from '../sdam/server';
import type { CollationOptions } from '../cmap/wire_protocol/write_command';

/** @internal */
export const DB_AGGREGATE_COLLECTION = 1 as const;
const MIN_WIRE_VERSION_$OUT_READ_CONCERN_SUPPORT = 8 as const;

/** @public */
export interface AggregateOptions extends CommandOperationOptions {
  /** allowDiskUse lets the server know if it can use disk to store temporary results for the aggregation (requires mongodb 2.6 \>). */
  allowDiskUse?: boolean;
  /** The number of documents to return per batch. See [aggregation documentation](https://docs.mongodb.com/manual/reference/command/aggregate). */
  batchSize?: number;
  /** Allow driver to bypass schema validation in MongoDB 3.2 or higher. */
  bypassDocumentValidation?: boolean;
  /** Return the query as cursor, on 2.6 \> it returns as a real cursor on pre 2.6 it returns as an emulated cursor. */
  cursor?: Document;
  /** Explain returns the aggregation execution plan (requires mongodb 2.6 \>) */
  explain?: boolean;
  /** specifies a cumulative time limit in milliseconds for processing operations on the cursor. MongoDB interrupts the operation at the earliest following interrupt point. */
  maxTimeMS?: number;
  /** The maximum amount of time for the server to wait on new documents to satisfy a tailable cursor query. */
  maxAwaitTimeMS?: number;
  /** Specify collation. */
  collation?: CollationOptions;
  /** Add an index selection hint to an aggregation command */
  hint?: Hint;
  out?: string;
}

/** @internal */
export class AggregateOperation<T = Document> extends CommandOperation<AggregateOptions, T> {
  target: string | typeof DB_AGGREGATE_COLLECTION;
  pipeline: Document[];
  hasWriteStage: boolean;

  constructor(parent: OperationParent, pipeline: Document[], options?: AggregateOptions) {
    super(parent, options);

    this.target =
      parent.s.namespace && parent.s.namespace.collection
        ? parent.s.namespace.collection
        : DB_AGGREGATE_COLLECTION;

    this.pipeline = pipeline;

    // determine if we have a write stage, override read preference if so
    this.hasWriteStage = false;
    if (typeof options?.out === 'string') {
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

    if (options?.explain && (this.readConcern || this.writeConcern)) {
      throw new MongoError(
        '"explain" cannot be used on an aggregate call with readConcern/writeConcern'
      );
    }

    if (options?.cursor != null && typeof options.cursor !== 'object') {
      throw new MongoError('cursor options must be an object');
    }
  }

  get canRetryRead(): boolean {
    return !this.hasWriteStage;
  }

  addToPipeline(stage: Document): void {
    this.pipeline.push(stage);
  }

  execute(server: Server, callback: Callback<T>): void {
    const options: AggregateOptions = this.options;
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
      command.explain = options.explain;
    }

    command.cursor = options.cursor || {};
    if (options.batchSize && !this.hasWriteStage) {
      command.cursor.batchSize = options.batchSize;
    }

    super.executeCommand(server, command, callback);
  }
}

defineAspects(AggregateOperation, [Aspect.READ_OPERATION, Aspect.RETRYABLE]);
