import type { Document, ObjectId } from '../bson';
import type { Collection } from '../collection';
import { MongoCompatibilityError, MongoInvalidArgumentError, MongoServerError } from '../error';
import type { Server } from '../sdam/server';
import type { ClientSession } from '../sessions';
import {
  Callback,
  collationNotSupported,
  hasAtomicOperators,
  maxWireVersion,
  MongoDBNamespace
} from '../utils';
import { CollationOptions, CommandOperation, CommandOperationOptions } from './command';
import { Aspect, defineAspects, Hint } from './operation';

/** @public */
export interface UpdateOptions extends CommandOperationOptions {
  /** A set of filters specifying to which array elements an update should apply */
  arrayFilters?: Document[];
  /** If true, allows the write to opt-out of document level validation */
  bypassDocumentValidation?: boolean;
  /** Specifies a collation */
  collation?: CollationOptions;
  /** Specify that the update query should only consider plans using the hinted index */
  hint?: Hint;
  /** When true, creates a new document if no document matches the query */
  upsert?: boolean;
  /** Map of parameter names and values that can be accessed using $$var (requires MongoDB 5.0). */
  let?: Document;
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

/** @public */
export interface UpdateStatement {
  /** The query that matches documents to update. */
  q: Document;
  /** The modifications to apply. */
  u: Document | Document[];
  /**  If true, perform an insert if no documents match the query. */
  upsert?: boolean;
  /** If true, updates all documents that meet the query criteria. */
  multi?: boolean;
  /** Specifies the collation to use for the operation. */
  collation?: CollationOptions;
  /** An array of filter documents that determines which array elements to modify for an update operation on an array field. */
  arrayFilters?: Document[];
  /** A document or string that specifies the index to use to support the query predicate. */
  hint?: Hint;
}

/** @internal */
export class UpdateOperation extends CommandOperation<Document> {
  override options: UpdateOptions & { ordered?: boolean };
  statements: UpdateStatement[];

  constructor(
    ns: MongoDBNamespace,
    statements: UpdateStatement[],
    options: UpdateOptions & { ordered?: boolean }
  ) {
    super(undefined, options);
    this.options = options;
    this.ns = ns;

    this.statements = statements;
  }

  override get canRetryWrite(): boolean {
    if (super.canRetryWrite === false) {
      return false;
    }

    return this.statements.every(op => op.multi == null || op.multi === false);
  }

  override execute(
    server: Server,
    session: ClientSession | undefined,
    callback: Callback<Document>
  ): void {
    const options = this.options ?? {};
    const ordered = typeof options.ordered === 'boolean' ? options.ordered : true;
    const command: Document = {
      update: this.ns.collection,
      updates: this.statements,
      ordered
    };

    if (typeof options.bypassDocumentValidation === 'boolean') {
      command.bypassDocumentValidation = options.bypassDocumentValidation;
    }

    if (options.let) {
      command.let = options.let;
    }

    // we check for undefined specifically here to allow falsy values
    // eslint-disable-next-line no-restricted-syntax
    if (options.comment !== undefined) {
      command.comment = options.comment;
    }

    const statementWithCollation = this.statements.find(statement => !!statement.collation);
    if (
      collationNotSupported(server, options) ||
      (statementWithCollation && collationNotSupported(server, statementWithCollation))
    ) {
      callback(new MongoCompatibilityError(`Server ${server.name} does not support collation`));
      return;
    }

    const unacknowledgedWrite = this.writeConcern && this.writeConcern.w === 0;
    if (unacknowledgedWrite || maxWireVersion(server) < 5) {
      if (this.statements.find((o: Document) => o.hint)) {
        callback(new MongoCompatibilityError(`Servers < 3.4 do not support hint on update`));
        return;
      }
    }

    if (this.explain && maxWireVersion(server) < 3) {
      callback(
        new MongoCompatibilityError(`Server ${server.name} does not support explain on update`)
      );
      return;
    }

    if (this.statements.some(statement => !!statement.arrayFilters) && maxWireVersion(server) < 6) {
      callback(
        new MongoCompatibilityError('Option "arrayFilters" is only supported on MongoDB 3.6+')
      );
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
      [makeUpdateStatement(filter, update, { ...options, multi: false })],
      options
    );

    if (!hasAtomicOperators(update)) {
      throw new MongoInvalidArgumentError('Update document requires atomic operators');
    }
  }

  override execute(
    server: Server,
    session: ClientSession | undefined,
    callback: Callback<UpdateResult | Document>
  ): void {
    super.execute(server, session, (err, res) => {
      if (err || !res) return callback(err);
      if (this.explain != null) return callback(undefined, res);
      if (res.code) return callback(new MongoServerError(res));
      if (res.writeErrors) return callback(new MongoServerError(res.writeErrors[0]));

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
      [makeUpdateStatement(filter, update, { ...options, multi: true })],
      options
    );

    if (!hasAtomicOperators(update)) {
      throw new MongoInvalidArgumentError('Update document requires atomic operators');
    }
  }

  override execute(
    server: Server,
    session: ClientSession | undefined,
    callback: Callback<UpdateResult | Document>
  ): void {
    super.execute(server, session, (err, res) => {
      if (err || !res) return callback(err);
      if (this.explain != null) return callback(undefined, res);
      if (res.code) return callback(new MongoServerError(res));
      if (res.writeErrors) return callback(new MongoServerError(res.writeErrors[0]));

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
  /** Map of parameter names and values that can be accessed using $$var (requires MongoDB 5.0). */
  let?: Document;
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
      [makeUpdateStatement(filter, replacement, { ...options, multi: false })],
      options
    );

    if (hasAtomicOperators(replacement)) {
      throw new MongoInvalidArgumentError('Replacement document must not contain atomic operators');
    }
  }

  override execute(
    server: Server,
    session: ClientSession | undefined,
    callback: Callback<UpdateResult | Document>
  ): void {
    super.execute(server, session, (err, res) => {
      if (err || !res) return callback(err);
      if (this.explain != null) return callback(undefined, res);
      if (res.code) return callback(new MongoServerError(res));
      if (res.writeErrors) return callback(new MongoServerError(res.writeErrors[0]));

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

export function makeUpdateStatement(
  filter: Document,
  update: Document | Document[],
  options: UpdateOptions & { multi?: boolean }
): UpdateStatement {
  if (filter == null || typeof filter !== 'object') {
    throw new MongoInvalidArgumentError('Selector must be a valid JavaScript object');
  }

  if (update == null || typeof update !== 'object') {
    throw new MongoInvalidArgumentError('Document must be a valid JavaScript object');
  }

  const op: UpdateStatement = { q: filter, u: update };
  if (typeof options.upsert === 'boolean') {
    op.upsert = options.upsert;
  }

  if (options.multi) {
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
