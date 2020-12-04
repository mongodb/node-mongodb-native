import { defineAspects, Aspect, AbstractOperation } from './operation';
import { updateDocuments } from './common_functions';
import { hasAtomicOperators, MongoDBNamespace, Callback } from '../utils';
import { CommandOperation, CommandOperationOptions } from './command';
import type { Server } from '../sdam/server';
import type { Collection } from '../collection';
import type { CollationOptions, WriteCommandOptions } from '../cmap/wire_protocol/write_command';
import type { ObjectId, Document } from '../bson';
import type { ClientSession } from '../sessions';

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
  /** Indicates whether this write result was acknowledged. If not, then all other members of this result will be undefined */
  acknowledged: boolean;
  /** The number of documents that matched the filter */
  matchedCount: number;
  /** The number of documents that were modified */
  modifiedCount: number;
  /** The number of documents that were upserted */
  upsertedCount: number;
  /** The identifier of the inserted document if an upsert took place */
  upsertedId: ObjectId;
}

/** @internal */
export class UpdateOperation extends AbstractOperation<Document> {
  options: UpdateOptions;
  operations: Document[];

  constructor(ns: MongoDBNamespace, ops: Document[], options: UpdateOptions) {
    super(options);
    this.options = options;
    this.ns = ns;
    this.operations = ops;
  }

  get canRetryWrite(): boolean {
    return this.operations.every(op => op.multi == null || op.multi === false);
  }

  execute(server: Server, session: ClientSession, callback: Callback<Document>): void {
    server.update(
      this.ns.toString(),
      this.operations,
      { ...this.options, readPreference: this.readPreference, session } as WriteCommandOptions,
      callback
    );
  }
}

/** @internal */
export class UpdateOneOperation extends CommandOperation<UpdateResult> {
  options: UpdateOptions;
  collection: Collection;
  filter: Document;
  update: Document;

  constructor(collection: Collection, filter: Document, update: Document, options: UpdateOptions) {
    super(collection, options);

    if (!hasAtomicOperators(update)) {
      throw new TypeError('Update document requires atomic operators');
    }

    this.options = options;
    this.collection = collection;
    this.filter = filter;
    this.update = update;
  }

  execute(server: Server, session: ClientSession, callback: Callback<UpdateResult>): void {
    const coll = this.collection;
    const filter = this.filter;
    const update = this.update;
    const options = { ...this.options, ...this.bsonOptions, session, multi: false };

    updateDocuments(server, coll, filter, update, options, (err, r) => {
      if (err || !r) return callback(err);
      if (typeof this.explain !== 'undefined') return callback(undefined, r);
      callback(undefined, {
        acknowledged: this.writeConcern?.w !== 0 ?? true,
        modifiedCount: r.nModified != null ? r.nModified : r.n,
        upsertedId: Array.isArray(r.upserted) && r.upserted.length > 0 ? r.upserted[0]._id : null,
        upsertedCount: Array.isArray(r.upserted) && r.upserted.length ? r.upserted.length : 0,
        matchedCount: Array.isArray(r.upserted) && r.upserted.length > 0 ? 0 : r.n
      });
    });
  }
}

/** @internal */
export class UpdateManyOperation extends CommandOperation<UpdateResult> {
  options: UpdateOptions;
  collection: Collection;
  filter: Document;
  update: Document;

  constructor(collection: Collection, filter: Document, update: Document, options: UpdateOptions) {
    super(collection, options);

    this.options = options;
    this.collection = collection;
    this.filter = filter;
    this.update = update;
  }

  execute(server: Server, session: ClientSession, callback: Callback<UpdateResult>): void {
    const coll = this.collection;
    const filter = this.filter;
    const update = this.update;
    const options = { ...this.options, ...this.bsonOptions, session, multi: true };

    updateDocuments(server, coll, filter, update, options, (err, r) => {
      if (err || !r) return callback(err);
      if (typeof this.explain !== 'undefined') return callback(undefined, r);
      callback(undefined, {
        acknowledged: this.writeConcern?.w !== 0 ?? true,
        modifiedCount: r.nModified != null ? r.nModified : r.n,
        upsertedId: Array.isArray(r.upserted) && r.upserted.length > 0 ? r.upserted[0]._id : null,
        upsertedCount: Array.isArray(r.upserted) && r.upserted.length ? r.upserted.length : 0,
        matchedCount: Array.isArray(r.upserted) && r.upserted.length > 0 ? 0 : r.n
      });
    });
  }
}

defineAspects(UpdateOperation, [Aspect.RETRYABLE, Aspect.WRITE_OPERATION]);
defineAspects(UpdateOneOperation, [Aspect.RETRYABLE, Aspect.WRITE_OPERATION, Aspect.EXPLAINABLE]);
defineAspects(UpdateManyOperation, [Aspect.WRITE_OPERATION, Aspect.EXPLAINABLE]);
