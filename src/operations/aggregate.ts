import type { Document } from '../bson';
import { MongoInvalidArgumentError } from '../error';
import type { Server } from '../sdam/server';
import type { ClientSession } from '../sessions';
import { Callback, maxWireVersion, MongoDBNamespace } from '../utils';
import { CollationOptions, CommandOperation, CommandOperationOptions } from './command';
import { Aspect, defineAspects, Hint } from './operation';

/** @internal */
export const DB_AGGREGATE_COLLECTION = 1 as const;
const MIN_WIRE_VERSION_$OUT_READ_CONCERN_SUPPORT = 8 as const;

/** @public */
export interface AggregateOptions extends CommandOperationOptions {
  /** allowDiskUse lets the server know if it can use disk to store temporary results for the aggregation (requires mongodb 2.6 \>). */
  allowDiskUse?: boolean;
  /** The number of documents to return per batch. See [aggregation documentation](https://www.mongodb.com/docs/manual/reference/command/aggregate). */
  batchSize?: number;
  /** Allow driver to bypass schema validation in MongoDB 3.2 or higher. */
  bypassDocumentValidation?: boolean;
  /** Return the query as cursor, on 2.6 \> it returns as a real cursor on pre 2.6 it returns as an emulated cursor. */
  cursor?: Document;
  /** specifies a cumulative time limit in milliseconds for processing operations on the cursor. MongoDB interrupts the operation at the earliest following interrupt point. */
  maxTimeMS?: number;
  /** The maximum amount of time for the server to wait on new documents to satisfy a tailable cursor query. */
  maxAwaitTimeMS?: number;
  /** Specify collation. */
  collation?: CollationOptions;
  /** Add an index selection hint to an aggregation command */
  hint?: Hint;
  /** Map of parameter names and values that can be accessed using $$var (requires MongoDB 5.0). */
  let?: Document;

  out?: string;
}

/** @internal */
export class AggregateOperation<T = Document> extends CommandOperation<T> {
  override options: AggregateOptions;
  target: string | typeof DB_AGGREGATE_COLLECTION;
  pipeline: Document[];
  hasWriteStage: boolean;

  constructor(ns: MongoDBNamespace, pipeline: Document[], options?: AggregateOptions) {
    super(undefined, { ...options, dbName: ns.db });

    this.options = { ...options };

    // Covers when ns.collection is null, undefined or the empty string, use DB_AGGREGATE_COLLECTION
    this.target = ns.collection || DB_AGGREGATE_COLLECTION;

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
      this.trySecondaryWrite = true;
    } else {
      delete this.options.writeConcern;
    }

    if (this.explain && this.writeConcern) {
      throw new MongoInvalidArgumentError(
        'Option "explain" cannot be used on an aggregate call with writeConcern'
      );
    }

    if (options?.cursor != null && typeof options.cursor !== 'object') {
      throw new MongoInvalidArgumentError('Cursor options must be an object');
    }
  }

  override get canRetryRead(): boolean {
    return !this.hasWriteStage;
  }

  addToPipeline(stage: Document): void {
    this.pipeline.push(stage);
  }

  override execute(
    server: Server,
    session: ClientSession | undefined,
    callback: Callback<T>
  ): void {
    const options: AggregateOptions = this.options;
    const serverWireVersion = maxWireVersion(server);
    const command: Document = { aggregate: this.target, pipeline: this.pipeline };

    if (this.hasWriteStage && serverWireVersion < MIN_WIRE_VERSION_$OUT_READ_CONCERN_SUPPORT) {
      this.readConcern = undefined;
    }

    if (this.hasWriteStage && this.writeConcern) {
      Object.assign(command, { writeConcern: this.writeConcern });
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

    if (options.let) {
      command.let = options.let;
    }

    // we check for undefined specifically here to allow falsy values
    // eslint-disable-next-line no-restricted-syntax
    if (options.comment !== undefined) {
      command.comment = options.comment;
    }

    command.cursor = options.cursor || {};
    if (options.batchSize && !this.hasWriteStage) {
      command.cursor.batchSize = options.batchSize;
    }

    super.executeCommand(server, session, command, callback);
  }
}

defineAspects(AggregateOperation, [
  Aspect.READ_OPERATION,
  Aspect.RETRYABLE,
  Aspect.EXPLAINABLE,
  Aspect.CURSOR_CREATING
]);
