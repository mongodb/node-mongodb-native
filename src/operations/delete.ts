import { defineAspects, Aspect, OperationBase } from './operation';
import { removeDocuments } from './common_functions';
import { CommandOperation, CommandOperationOptions } from './command';
import { isObject } from 'util';
import type { Callback, MongoDBNamespace } from '../utils';
import type { Document } from '../bson';
import type { Server } from '../sdam/server';
import type { Collection } from '../collection';
import type { WriteCommandOptions } from '../cmap/wire_protocol/write_command';
import type { Connection } from '../cmap/connection';

/** @public */
export interface DeleteOptions extends CommandOperationOptions {
  single?: boolean;
}

/** @public */
export interface DeleteResult {
  /** Indicates whether this write result was acknowledged */
  acknowledged: boolean;
  /** The number of documents that were deleted */
  deletedCount: number;
  /** The raw result returned from MongoDB. Will vary depending on server version */
  result: Document;
  /** The connection object used for the operation */
  connection?: Connection;
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
    const options = this.options;

    options.single = true;
    removeDocuments(server, coll, filter, options, (err, r) => {
      if (callback == null) return;
      if (err && callback) return callback(err);
      if (r == null) {
        return callback(undefined, { acknowledged: true, deletedCount: 0, result: { ok: 1 } });
      }

      r.deletedCount = r.result.n;
      if (callback) callback(undefined, r);
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
    const options = this.options;

    // a user can pass `single: true` in to `deleteMany` to remove a single document, theoretically
    if (typeof options.single !== 'boolean') {
      options.single = false;
    }

    removeDocuments(server, coll, filter, options, (err, r) => {
      if (callback == null) return;
      if (err && callback) return callback(err);
      if (r == null) {
        return callback(undefined, { acknowledged: true, deletedCount: 0, result: { ok: 1 } });
      }

      r.deletedCount = r.result.n;
      if (callback) callback(undefined, r);
    });
  }
}

defineAspects(DeleteOperation, [Aspect.RETRYABLE, Aspect.WRITE_OPERATION]);
defineAspects(DeleteOneOperation, [Aspect.RETRYABLE, Aspect.WRITE_OPERATION]);
defineAspects(DeleteManyOperation, [Aspect.WRITE_OPERATION]);
