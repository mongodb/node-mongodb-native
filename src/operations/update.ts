import { defineAspects, Aspect, OperationBase, OperationOptions, Hint } from './operation';
import { updateDocuments, updateCallback } from './common_functions';
import { hasAtomicOperators, MongoDBNamespace } from '../utils';
import { CommandOperation } from './command';
import type { Callback, Document } from '../types';
import type { Server } from '../sdam/server';
import type { Collection } from '../collection';
import type { WriteConcern } from '../write_concern';
import type { CollationOptions } from '../cmap/wire_protocol/write_command';

export interface UpdateOptions extends OperationOptions {
  arrayFilters?: Document[];
  upsert?: boolean;
  writeConcern?: WriteConcern;
  collation?: CollationOptions;
  hint?: Hint;
}

export interface UpdateOperators {
  $currentDate?: Document;
  $inc?: Document;
  $min?: Document;
  $max?: Document;
  $mul?: Document;
  $rename?: Document;
  $set?: Document;
  $setOnInsert?: Document;
  $unset?: Document;
}

export class UpdateOperation extends OperationBase {
  namespace: MongoDBNamespace;
  operations: OperationOptions[];

  constructor(ns: MongoDBNamespace, ops: Document[], options: UpdateOptions) {
    super(options);
    this.namespace = ns;
    this.operations = ops;
  }

  get canRetryWrite(): boolean {
    return this.operations.every(op => op.multi == null || op.multi === false);
  }

  execute(server: Server, callback: Callback): void {
    server.update(this.namespace.toString(), this.operations, this.options, callback);
  }
}

export class UpdateOneOperation extends CommandOperation {
  collection: Collection;
  filter: Document;
  update: UpdateOperators;

  constructor(
    collection: Collection,
    filter: Document,
    update: UpdateOperators,
    options: UpdateOptions
  ) {
    super(collection, options);

    if (!hasAtomicOperators(update)) {
      throw new TypeError('Update document requires atomic operators');
    }

    this.collection = collection;
    this.filter = filter;
    this.update = update;
  }

  execute(server: Server, callback: Callback): void {
    const coll = this.collection;
    const filter = this.filter;
    const update = this.update;
    const options = this.options;

    // Set single document update
    options.multi = false;
    // Execute update
    updateDocuments(server, coll, filter, update, options, (err, r) =>
      updateCallback(err, r, callback)
    );
  }
}

export class UpdateManyOperation extends CommandOperation {
  collection: Collection;
  filter: Document;
  update: UpdateOperators;

  constructor(
    collection: Collection,
    filter: Document,
    update: UpdateOperators,
    options: UpdateOperation
  ) {
    super(collection, options);

    this.collection = collection;
    this.filter = filter;
    this.update = update;
  }

  execute(server: Server, callback: Callback): void {
    const coll = this.collection;
    const filter = this.filter;
    const update = this.update;
    const options = this.options;

    // Set single document update
    options.multi = true;
    // Execute update
    updateDocuments(server, coll, filter, update, options, (err, r) =>
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
