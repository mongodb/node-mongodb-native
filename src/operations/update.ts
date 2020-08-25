import { defineAspects, Aspect, OperationBase } from './operation';
import { updateDocuments } from './common_functions';
import { hasAtomicOperators, MongoDBNamespace, Callback } from '../utils';
import { CommandOperation, CommandOperationOptions } from './command';
import type { Server } from '../sdam/server';
import type { Collection } from '../collection';
import type { CollationOptions, WriteCommandOptions } from '../cmap/wire_protocol/write_command';
import type { ObjectId, Document } from '../bson';

/** @public */
export interface UpdateOptions extends CommandOperationOptions {
  /** A set of filters specifying to which array elements an update should apply */
  arrayFilters?: Document[];
  /** If true, allows the write to opt-out of document level validation */
  bypassDocumentValidation?: boolean;
  /** Specifies a collation */
  collation?: CollationOptions;
  /** Specify that the update query should only consider plans using the hinted index */
  hint?: string | Document;
  /** When true, creates a new document if no document matches the query */
  upsert?: boolean;

  // non-standard options
  retryWrites?: boolean;
  multi?: boolean;
}

/** @public */
export interface UpdateResult {
  /** The number of documents that matched the filter */
  matchedCount: number;
  /** The number of documents that were modified */
  modifiedCount: number;
  /** The number of documents upserted */
  upsertedCount: number;
  /** The upserted id */
  upsertedId: ObjectId;

  // FIXME: remove
  result: Document;
}

/** @internal */
export class UpdateOperation extends OperationBase<UpdateOptions, Document> {
  operations: Document[];

  constructor(ns: MongoDBNamespace, ops: Document[], options: UpdateOptions) {
    super(options);
    this.ns = ns;
    this.operations = ops;
  }

  get canRetryWrite(): boolean {
    return this.operations.every(op => op.multi == null || op.multi === false);
  }

  execute(server: Server, callback: Callback<Document>): void {
    server.update(
      this.ns.toString(),
      this.operations,
      this.options as WriteCommandOptions,
      callback
    );
  }
}

/** @internal */
export class UpdateOneOperation extends CommandOperation<UpdateOptions, UpdateResult> {
  collection: Collection;
  filter: Document;
  update: Document;

  constructor(collection: Collection, filter: Document, update: Document, options: UpdateOptions) {
    super(collection, options);

    if (!hasAtomicOperators(update)) {
      throw new TypeError('Update document requires atomic operators');
    }

    this.collection = collection;
    this.filter = filter;
    this.update = update;
  }

  execute(server: Server, callback: Callback<UpdateResult>): void {
    const coll = this.collection;
    const filter = this.filter;
    const update = this.update;
    const options = this.options;

    // Set single document update
    options.multi = false;
    // Execute update
    updateDocuments(server, coll, filter, update, options, (err, r) => {
      if (err || !r) return callback(err);

      const result: UpdateResult = {
        modifiedCount: r.result.nModified != null ? r.result.nModified : r.result.n,
        upsertedId:
          Array.isArray(r.result.upserted) && r.result.upserted.length > 0
            ? r.result.upserted[0] // FIXME(major): should be `r.result.upserted[0]._id`
            : null,
        upsertedCount:
          Array.isArray(r.result.upserted) && r.result.upserted.length
            ? r.result.upserted.length
            : 0,
        matchedCount:
          Array.isArray(r.result.upserted) && r.result.upserted.length > 0 ? 0 : r.result.n,
        result: r.result
      };

      callback(undefined, result);
    });
  }
}

/** @internal */
export class UpdateManyOperation extends CommandOperation<UpdateOptions, UpdateResult> {
  collection: Collection;
  filter: Document;
  update: Document;

  constructor(collection: Collection, filter: Document, update: Document, options: UpdateOptions) {
    super(collection, options);

    this.collection = collection;
    this.filter = filter;
    this.update = update;
  }

  execute(server: Server, callback: Callback<UpdateResult>): void {
    const coll = this.collection;
    const filter = this.filter;
    const update = this.update;
    const options = this.options;

    // Set single document update
    options.multi = true;
    // Execute update
    updateDocuments(server, coll, filter, update, options, (err, r) => {
      if (err || !r) return callback(err);

      const result: UpdateResult = {
        modifiedCount: r.result.nModified != null ? r.result.nModified : r.result.n,
        upsertedId:
          Array.isArray(r.result.upserted) && r.result.upserted.length > 0
            ? r.result.upserted[0] // FIXME(major): should be `r.result.upserted[0]._id`
            : null,
        upsertedCount:
          Array.isArray(r.result.upserted) && r.result.upserted.length
            ? r.result.upserted.length
            : 0,
        matchedCount:
          Array.isArray(r.result.upserted) && r.result.upserted.length > 0 ? 0 : r.result.n,
        result: r.result
      };

      callback(undefined, result);
    });
  }
}

defineAspects(UpdateOperation, [Aspect.RETRYABLE, Aspect.WRITE_OPERATION]);
defineAspects(UpdateOneOperation, [Aspect.RETRYABLE, Aspect.WRITE_OPERATION]);
defineAspects(UpdateManyOperation, [Aspect.WRITE_OPERATION]);
