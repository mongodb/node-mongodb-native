import { defineAspects, Aspect, OperationBase } from './operation';
import { updateDocuments, updateCallback } from './common_functions';
import { hasAtomicOperators } from '../utils';
import CommandOperation = require('./command');

class UpdateOperation extends OperationBase {
  namespace: any;
  operations: any;
  options: any;

  constructor(ns: any, ops: any, options: any) {
    super(options);
    this.namespace = ns;
    this.operations = ops;
  }

  execute(server: any, callback: Function) {
    server.update(this.namespace.toString(), this.operations, this.options, callback);
  }
}

class UpdateOneOperation extends CommandOperation {
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

class UpdateManyOperation extends CommandOperation {
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
