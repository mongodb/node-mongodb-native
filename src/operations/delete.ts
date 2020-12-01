import { defineAspects, Aspect, OperationBase, Hint } from './operation';
import { CommandOperation, CommandOperationOptions } from './command';
import { isObject } from 'util';
import {
  applyRetryableWrites,
  Callback,
  decorateWithCollation,
  maxWireVersion,
  MongoDBNamespace
} from '../utils';
import type { Document } from '../bson';
import type { Server } from '../sdam/server';
import type { Collection } from '../collection';
import type { WriteCommandOptions } from '../cmap/wire_protocol/write_command';
import { MongoError } from '../error';

/** @public */
export interface DeleteOptions extends CommandOperationOptions {
  single?: boolean;
  hint?: Hint;
}

/** @public */
export interface DeleteResult {
  /** Indicates whether this write result was acknowledged. If not, then all other members of this result will be undefined. */
  acknowledged: boolean;
  /** The number of documents that were deleted */
  deletedCount: number;
}

/** @internal */
export class DeleteOperation extends OperationBase<DeleteOptions, Document> {
  operations: Document[];

  constructor(ns: MongoDBNamespace, ops: Document[], options: DeleteOptions) {
    super(options);
    this.ns = ns;
    this.operations = ops;
  }

  get canRetryWrite(): boolean {
    return this.operations.every(op => (typeof op.limit !== 'undefined' ? op.limit > 0 : true));
  }

  execute(server: Server, callback: Callback): void {
    server.remove(
      this.ns.toString(),
      this.operations,
      this.options as WriteCommandOptions,
      callback
    );
  }
}

export class DeleteOneOperation extends CommandOperation<DeleteOptions, DeleteResult> {
  collection: Collection;
  filter: Document;

  constructor(collection: Collection, filter: Document, options: DeleteOptions) {
    super(collection, options);

    this.collection = collection;
    this.filter = filter;
  }

  execute(server: Server, callback: Callback<DeleteResult>): void {
    const coll = this.collection;
    const filter = this.filter;
    const options = { ...this.options, ...this.bsonOptions };

    options.single = true;
    removeDocuments(server, coll, filter, options, (err, res) => {
      if (err || res == null) return callback(err);
      if (typeof options.explain !== 'undefined') return callback(undefined, res);
      callback(undefined, {
        acknowledged: this.writeConcern?.w !== 0 ?? true,
        deletedCount: res.n
      });
    });
  }
}

export class DeleteManyOperation extends CommandOperation<DeleteOptions, DeleteResult> {
  collection: Collection;
  filter: Document;

  constructor(collection: Collection, filter: Document, options: DeleteOptions) {
    super(collection, options);

    if (!isObject(filter)) {
      throw new TypeError('filter is a required parameter');
    }

    this.collection = collection;
    this.filter = filter;
  }

  execute(server: Server, callback: Callback<DeleteResult>): void {
    const coll = this.collection;
    const filter = this.filter;
    const options = { ...this.options, ...this.bsonOptions };

    // a user can pass `single: true` in to `deleteMany` to remove a single document, theoretically
    if (typeof options.single !== 'boolean') {
      options.single = false;
    }

    removeDocuments(server, coll, filter, options, (err, res) => {
      if (err || res == null) return callback(err);
      if (typeof options.explain !== 'undefined') return callback(undefined, res);
      callback(undefined, {
        acknowledged: this.writeConcern?.w !== 0 ?? true,
        deletedCount: res.n
      });
    });
  }
}

function removeDocuments(
  server: Server,
  coll: Collection,
  selector: Document,
  options: DeleteOptions | Document,
  callback: Callback
): void {
  if (typeof options === 'function') {
    (callback = options as Callback), (options = {});
  } else if (typeof selector === 'function') {
    callback = selector as Callback;
    options = {};
    selector = {};
  }

  // Create an empty options object if the provided one is null
  options = options || {};

  // Final options for retryable writes
  let finalOptions = Object.assign({}, options);
  finalOptions = applyRetryableWrites(finalOptions, coll.s.db);

  // If selector is null set empty
  if (selector == null) selector = {};

  // Build the op
  const op = { q: selector, limit: 0 } as any;
  if (options.single) {
    op.limit = 1;
  } else if (finalOptions.retryWrites) {
    finalOptions.retryWrites = false;
  }
  if (options.hint) {
    op.hint = options.hint;
  }

  // Have we specified collation
  try {
    decorateWithCollation(finalOptions, coll, options);
  } catch (err) {
    return callback ? callback(err, null) : undefined;
  }

  if (options.explain !== undefined && maxWireVersion(server) < 3) {
    return callback
      ? callback(new MongoError(`server ${server.name} does not support explain on remove`))
      : undefined;
  }

  // Execute the remove
  server.remove(
    coll.s.namespace.toString(),
    [op],
    finalOptions as WriteCommandOptions,
    (err, result) => {
      if (err || result == null) return callback(err);
      if (result.code) return callback(new MongoError(result));
      if (result.writeErrors) {
        return callback(new MongoError(result.writeErrors[0]));
      }

      // Return the results
      callback(undefined, result);
    }
  );
}

defineAspects(DeleteOperation, [Aspect.RETRYABLE, Aspect.WRITE_OPERATION]);
defineAspects(DeleteOneOperation, [Aspect.RETRYABLE, Aspect.WRITE_OPERATION, Aspect.EXPLAINABLE]);
defineAspects(DeleteManyOperation, [Aspect.WRITE_OPERATION, Aspect.EXPLAINABLE]);
