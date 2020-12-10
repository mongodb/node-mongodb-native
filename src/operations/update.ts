import { defineAspects, Aspect } from './operation';
import {
  hasAtomicOperators,
  MongoDBNamespace,
  Callback,
  collationNotSupported,
  maxWireVersion
} from '../utils';
import { CommandOperation, CommandOperationOptions, CollationOptions } from './command';
import type { Server } from '../sdam/server';
import type { Collection } from '../collection';
import type { ObjectId, Document } from '../bson';
import type { ClientSession } from '../sessions';
import { MongoError } from '../error';

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
export class UpdateOperation extends CommandOperation<Document> {
  options: UpdateOptions & { ordered?: boolean };
  operations: Document[];

  constructor(
    ns: MongoDBNamespace,
    ops: Document[],
    options: UpdateOptions & { ordered?: boolean }
  ) {
    super(undefined, options);
    this.options = options;
    this.ns = ns;

    this.operations = ops;
  }

  get canRetryWrite(): boolean {
    if (super.canRetryWrite === false) {
      return false;
    }

    return this.operations.every(op => op.multi == null || op.multi === false);
  }

  execute(server: Server, session: ClientSession, callback: Callback<Document>): void {
    const options = this.options ?? {};
    const ordered = typeof options.ordered === 'boolean' ? options.ordered : true;
    const command: Document = {
      update: this.ns.collection,
      updates: this.operations,
      ordered
    };

    if (typeof options.bypassDocumentValidation === 'boolean') {
      command.bypassDocumentValidation = options.bypassDocumentValidation;
    }

    if (collationNotSupported(server, options)) {
      callback(new MongoError(`server ${server.name} does not support collation`));
      return;
    }

    const unacknowledgedWrite = this.writeConcern && this.writeConcern.w === 0;
    if (unacknowledgedWrite || maxWireVersion(server) < 5) {
      if (this.operations.find((o: Document) => o.hint)) {
        callback(new MongoError(`servers < 3.4 do not support hint on update`));
        return;
      }
    }

    if (this.explain && maxWireVersion(server) < 3) {
      callback(new MongoError(`server ${server.name} does not support explain on update`));
      return;
    }

    super.executeCommand(server, session, command, callback);
  }
}

/** @internal */
export class UpdateOneOperation extends UpdateOperation {
  constructor(collection: Collection, filter: Document, update: Document, options: UpdateOptions) {
    super(
      collection.s.namespace,
      [makeUpdateOperation(filter, update, { ...options, multi: false })],
      options
    );

    if (!hasAtomicOperators(update)) {
      throw new TypeError('Update document requires atomic operators');
    }
  }

  execute(
    server: Server,
    session: ClientSession,
    callback: Callback<UpdateResult | Document>
  ): void {
    super.execute(server, session, (err, res) => {
      if (err || !res) return callback(err);
      if (typeof this.explain !== 'undefined') return callback(undefined, res);
      if (res.code) return callback(new MongoError(res));
      if (res.writeErrors) return callback(new MongoError(res.writeErrors[0]));

      callback(undefined, {
        acknowledged: this.writeConcern?.w !== 0 ?? true,
        modifiedCount: res.nModified != null ? res.nModified : res.n,
        upsertedId:
          Array.isArray(res.upserted) && res.upserted.length > 0 ? res.upserted[0]._id : null,
        upsertedCount: Array.isArray(res.upserted) && res.upserted.length ? res.upserted.length : 0,
        matchedCount: Array.isArray(res.upserted) && res.upserted.length > 0 ? 0 : res.n
      });
    });
  }
}

/** @internal */
export class UpdateManyOperation extends UpdateOperation {
  constructor(collection: Collection, filter: Document, update: Document, options: UpdateOptions) {
    super(
      collection.s.namespace,
      [makeUpdateOperation(filter, update, { ...options, multi: true })],
      options
    );

    if (!hasAtomicOperators(update)) {
      throw new TypeError('Update document requires atomic operators');
    }
  }

  execute(
    server: Server,
    session: ClientSession,
    callback: Callback<UpdateResult | Document>
  ): void {
    super.execute(server, session, (err, res) => {
      if (err || !res) return callback(err);
      if (typeof this.explain !== 'undefined') return callback(undefined, res);
      if (res.code) return callback(new MongoError(res));
      if (res.writeErrors) return callback(new MongoError(res.writeErrors[0]));

      callback(undefined, {
        acknowledged: this.writeConcern?.w !== 0 ?? true,
        modifiedCount: res.nModified != null ? res.nModified : res.n,
        upsertedId:
          Array.isArray(res.upserted) && res.upserted.length > 0 ? res.upserted[0]._id : null,
        upsertedCount: Array.isArray(res.upserted) && res.upserted.length ? res.upserted.length : 0,
        matchedCount: Array.isArray(res.upserted) && res.upserted.length > 0 ? 0 : res.n
      });
    });
  }
}

/** @public */
export interface ReplaceOptions extends CommandOperationOptions {
  /** If true, allows the write to opt-out of document level validation */
  bypassDocumentValidation?: boolean;
  /** Specifies a collation */
  collation?: CollationOptions;
  /** Specify that the update query should only consider plans using the hinted index */
  hint?: string | Document;
  /** When true, creates a new document if no document matches the query */
  upsert?: boolean;
}

/** @internal */
export class ReplaceOneOperation extends UpdateOperation {
  constructor(
    collection: Collection,
    filter: Document,
    replacement: Document,
    options: ReplaceOptions
  ) {
    super(
      collection.s.namespace,
      [makeUpdateOperation(filter, replacement, { ...options, multi: false })],
      options
    );

    if (hasAtomicOperators(replacement)) {
      throw new TypeError('Replacement document must not contain atomic operators');
    }
  }

  execute(
    server: Server,
    session: ClientSession,
    callback: Callback<UpdateResult | Document>
  ): void {
    super.execute(server, session, (err, res) => {
      if (err || !res) return callback(err);
      if (typeof this.explain !== 'undefined') return callback(undefined, res);
      if (res.code) return callback(new MongoError(res));
      if (res.writeErrors) return callback(new MongoError(res.writeErrors[0]));

      callback(undefined, {
        acknowledged: this.writeConcern?.w !== 0 ?? true,
        modifiedCount: res.nModified != null ? res.nModified : res.n,
        upsertedId:
          Array.isArray(res.upserted) && res.upserted.length > 0 ? res.upserted[0]._id : null,
        upsertedCount: Array.isArray(res.upserted) && res.upserted.length ? res.upserted.length : 0,
        matchedCount: Array.isArray(res.upserted) && res.upserted.length > 0 ? 0 : res.n
      });
    });
  }
}

function makeUpdateOperation(
  filter: Document,
  update: Document,
  options: UpdateOptions & { multi?: boolean }
): Document {
  if (filter == null || typeof filter !== 'object') {
    throw new TypeError('selector must be a valid JavaScript object');
  }

  if (update == null || typeof update !== 'object') {
    throw new TypeError('document must be a valid JavaScript object');
  }

  const op: Document = { q: filter, u: update };
  if (typeof options.upsert === 'boolean') {
    op.upsert = options.upsert;
  }

  if (typeof options.multi === 'boolean') {
    op.multi = options.multi;
  }

  if (options.hint) {
    op.hint = options.hint;
  }

  if (options.arrayFilters) {
    op.arrayFilters = options.arrayFilters;
  }

  if (options.collation) {
    op.collation = options.collation;
  }

  return op;
}

defineAspects(UpdateOperation, [Aspect.RETRYABLE, Aspect.WRITE_OPERATION, Aspect.SKIP_COLLATION]);
defineAspects(UpdateOneOperation, [
  Aspect.RETRYABLE,
  Aspect.WRITE_OPERATION,
  Aspect.EXPLAINABLE,
  Aspect.SKIP_COLLATION
]);
defineAspects(UpdateManyOperation, [
  Aspect.WRITE_OPERATION,
  Aspect.EXPLAINABLE,
  Aspect.SKIP_COLLATION
]);
defineAspects(ReplaceOneOperation, [
  Aspect.RETRYABLE,
  Aspect.WRITE_OPERATION,
  Aspect.SKIP_COLLATION
]);
