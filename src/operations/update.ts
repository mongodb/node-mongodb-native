import type { Connection } from '../cmap/connection';
import type { ObjectID } from 'bson';
import type { Document } from './../types.d';
import { defineAspects, Aspect, OperationBase } from './operation';
import { updateDocuments, updateCallback } from './common_functions';
import { hasAtomicOperators } from '../utils';
import { CommandOperation, CommandOperationOptions } from './command';

class UpdateOperation extends OperationBase {
  namespace: any;
  operations: any;
  options: any;

  constructor(ns: any, ops: any, options: any) {
    super(options);
    this.namespace = ns;
    this.operations = ops;
  }

  get canRetryWrite() {
    return this.operations.every((op: any) => op.multi == null || op.multi === false);
  }

  execute(server: any, callback: Function) {
    server.update(this.namespace.toString(), this.operations, this.options, callback);
  }
}

export interface UpdateOneResult {
  /** The number of documents that matched the filter. */
  matchedCount: number;
  /** The number of documents that were modified. */
  modifiedCount: number;
  /** The number of documents upserted. */
  upsertedCount: number;
  /** The upserted id. */
  upsertId: { _id: ObjectID };
  /** The raw msg response wrapped in an internal class */
  message: Document;
  /** Contains the new value of the document on the server. This is the same
   * document that was originally passed in, and is only here for legacy
   * purposes. */
  ops?: Document[];
  connection: Connection;
  result: {
    ok: number;
    n: number;
    nModified: number;
  };
}

export interface UpdateOneOperationOptions extends CommandOperationOptions {
  multi?: boolean;
}

class UpdateOneOperation extends CommandOperation<UpdateOneOperationOptions> {
  collection: any;
  filter: any;
  update: any;

  constructor(collection: any, filter: any, update: any, options: any) {
    super(collection, options);

    if (!hasAtomicOperators(update)) {
      throw new TypeError('Update document requires atomic operators');
    }

    this.collection = collection;
    this.filter = filter;
    this.update = update;
  }

  execute(server: any, callback: Function) {
    const coll = this.collection;
    const filter = this.filter;
    const update = this.update;
    const options = this.options;

    // Set single document update
    options.multi = false;
    // Execute update
    updateDocuments(server, coll, filter, update, options, (err?: any, r?: any) =>
      updateCallback(err, r, callback)
    );
  }
}

export interface UpdateManyOperationOptions extends CommandOperationOptions {
  multi?: boolean;
}

class UpdateManyOperation extends CommandOperation<UpdateManyOperationOptions> {
  collection: any;
  filter: any;
  update: any;

  constructor(collection: any, filter: any, update: any, options: any) {
    super(collection, options);

    this.collection = collection;
    this.filter = filter;
    this.update = update;
  }

  execute(server: any, callback: Function) {
    const coll = this.collection;
    const filter = this.filter;
    const update = this.update;
    const options = this.options;

    // Set single document update
    options.multi = true;
    // Execute update
    updateDocuments(server, coll, filter, update, options, (err?: any, r?: any) =>
      updateCallback(err, r, callback)
    );
  }
}

defineAspects(UpdateOperation, [
  Aspect.RETRYABLE,
  Aspect.WRITE_OPERATION,
  Aspect.EXECUTE_WITH_SELECTION
]);

defineAspects(UpdateOneOperation, [
  Aspect.RETRYABLE,
  Aspect.WRITE_OPERATION,
  Aspect.EXECUTE_WITH_SELECTION
]);

defineAspects(UpdateManyOperation, [Aspect.WRITE_OPERATION, Aspect.EXECUTE_WITH_SELECTION]);
export { UpdateOperation, UpdateOneOperation, UpdateManyOperation };
