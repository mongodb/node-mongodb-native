import { defineAspects, Aspect, Hint } from './operation';
import { CommandOperation, CommandOperationOptions, CollationOptions } from './command';
import { Callback, maxWireVersion, MongoDBNamespace, collationNotSupported } from '../utils';
import type { Document } from '../bson';
import type { Server } from '../sdam/server';
import type { Collection } from '../collection';
import type { ClientSession } from '../sessions';
import { MongoServerError, MongoCompatibilityError } from '../error';
import type { WriteConcernOptions } from '../write_concern';

/** @public */
export interface DeleteOptions extends CommandOperationOptions, WriteConcernOptions {
  /** If true, when an insert fails, don't execute the remaining writes. If false, continue with remaining inserts when one fails. */
  ordered?: boolean;
  /** A user-provided comment to attach to this command */
  comment?: string | Document;
  /** Specifies the collation to use for the operation */
  collation?: CollationOptions;
  /** Specify that the update query should only consider plans using the hinted index */
  hint?: string | Document;
  /** Map of parameter names and values that can be accessed using $$var (requires MongoDB 5.0). */
  let?: Document;

  /** @deprecated use `removeOne` or `removeMany` to implicitly specify the limit */
  single?: boolean;
}

/** @public */
export interface DeleteResult {
  /** Indicates whether this write result was acknowledged. If not, then all other members of this result will be undefined. */
  acknowledged: boolean;
  /** The number of documents that were deleted */
  deletedCount: number;
}

/** @public */
export interface DeleteStatement {
  /** The query that matches documents to delete. */
  q: Document;
  /** The number of matching documents to delete. */
  limit: number;
  /** Specifies the collation to use for the operation. */
  collation?: CollationOptions;
  /** A document or string that specifies the index to use to support the query predicate. */
  hint?: Hint;
  /** A user-provided comment to attach to this command */
  comment?: string | Document;
}

/** @internal */
export class DeleteOperation extends CommandOperation<Document> {
  options: DeleteOptions;
  statements: DeleteStatement[];

  constructor(ns: MongoDBNamespace, statements: DeleteStatement[], options: DeleteOptions) {
    super(undefined, options);
    this.options = options;
    this.ns = ns;
    this.statements = statements;
  }

  get canRetryWrite(): boolean {
    if (super.canRetryWrite === false) {
      return false;
    }

    return this.statements.every(op => (op.limit != null ? op.limit > 0 : true));
  }

  execute(server: Server, session: ClientSession, callback: Callback): void {
    const options = this.options ?? {};
    const ordered = typeof options.ordered === 'boolean' ? options.ordered : true;
    const command: Document = {
      delete: this.ns.collection,
      deletes: this.statements,
      ordered
    };

    if (options.let) {
      command.let = options.let;
    }

    if (options.explain != null && maxWireVersion(server) < 3) {
      return callback
        ? callback(
            new MongoCompatibilityError(`Server ${server.name} does not support explain on delete`)
          )
        : undefined;
    }

    const unacknowledgedWrite = this.writeConcern && this.writeConcern.w === 0;
    if (unacknowledgedWrite || maxWireVersion(server) < 5) {
      if (this.statements.find((o: Document) => o.hint)) {
        callback(new MongoCompatibilityError(`Servers < 3.4 do not support hint on delete`));
        return;
      }
    }

    const statementWithCollation = this.statements.find(statement => !!statement.collation);
    if (statementWithCollation && collationNotSupported(server, statementWithCollation)) {
      callback(new MongoCompatibilityError(`Server ${server.name} does not support collation`));
      return;
    }

    super.executeCommand(server, session, command, callback);
  }
}

export class DeleteOneOperation extends DeleteOperation {
  constructor(collection: Collection, filter: Document, options: DeleteOptions) {
    super(collection.s.namespace, [makeDeleteStatement(filter, { ...options, limit: 1 })], options);
  }

  execute(server: Server, session: ClientSession, callback: Callback<DeleteResult>): void {
    super.execute(server, session, (err, res) => {
      if (err || res == null) return callback(err);
      if (res.code) return callback(new MongoServerError(res));
      if (res.writeErrors) return callback(new MongoServerError(res.writeErrors[0]));
      if (this.explain) return callback(undefined, res);

      callback(undefined, {
        acknowledged: this.writeConcern?.w !== 0 ?? true,
        deletedCount: res.n
      });
    });
  }
}

export class DeleteManyOperation extends DeleteOperation {
  constructor(collection: Collection, filter: Document, options: DeleteOptions) {
    super(collection.s.namespace, [makeDeleteStatement(filter, options)], options);
  }

  execute(server: Server, session: ClientSession, callback: Callback<DeleteResult>): void {
    super.execute(server, session, (err, res) => {
      if (err || res == null) return callback(err);
      if (res.code) return callback(new MongoServerError(res));
      if (res.writeErrors) return callback(new MongoServerError(res.writeErrors[0]));
      if (this.explain) return callback(undefined, res);

      callback(undefined, {
        acknowledged: this.writeConcern?.w !== 0 ?? true,
        deletedCount: res.n
      });
    });
  }
}

export function makeDeleteStatement(
  filter: Document,
  options: DeleteOptions & { limit?: number }
): DeleteStatement {
  const op: DeleteStatement = {
    q: filter,
    limit: typeof options.limit === 'number' ? options.limit : 0
  };

  if (options.single === true) {
    op.limit = 1;
  }

  if (options.collation) {
    op.collation = options.collation;
  }

  if (options.hint) {
    op.hint = options.hint;
  }

  if (options.comment) {
    op.comment = options.comment;
  }

  return op;
}

defineAspects(DeleteOperation, [Aspect.RETRYABLE, Aspect.WRITE_OPERATION]);
defineAspects(DeleteOneOperation, [
  Aspect.RETRYABLE,
  Aspect.WRITE_OPERATION,
  Aspect.EXPLAINABLE,
  Aspect.SKIP_COLLATION
]);
defineAspects(DeleteManyOperation, [
  Aspect.WRITE_OPERATION,
  Aspect.EXPLAINABLE,
  Aspect.SKIP_COLLATION
]);
