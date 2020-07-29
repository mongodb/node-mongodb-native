import { defineAspects, Aspect, OperationBase } from './operation';
import { deleteCallback, removeDocuments } from './common_functions';
import CommandOperation = require('./command');
import { isObject } from 'util';

class DeleteOperation extends OperationBase {
  namespace: any;
  operations: any;
  options: any;

  constructor(ns: any, ops: any, options: any) {
    super(options);
    this.namespace = ns;
    this.operations = ops;
  }

  get canRetryWrite() {
    return this.operations.every((op: any) =>
      typeof op.limit !== 'undefined' ? op.limit > 0 : true
    );
  }

  execute(server: any, callback: Function) {
    server.remove(this.namespace.toString(), this.operations, this.options, callback);
  }
}

class DeleteOneOperation extends CommandOperation {
  collection: any;
  filter: any;

  constructor(collection: any, filter: any, options: any) {
    super(collection, options);

    this.collection = collection;
    this.filter = filter;
  }

  execute(server: any, callback: Function) {
    const coll = this.collection;
    const filter = this.filter;
    const options = this.options;

    options.single = true;
    removeDocuments(server, coll, filter, options, (err?: any, r?: any) =>
      deleteCallback(err, r, callback)
    );
  }
}

class DeleteManyOperation extends CommandOperation {
  collection: any;
  filter: any;

  constructor(collection: any, filter: any, options: any) {
    super(collection, options);

    if (!isObject(filter)) {
      throw new TypeError('filter is a required parameter');
    }

    this.collection = collection;
    this.filter = filter;
  }

  execute(server: any, callback: Function) {
    const coll = this.collection;
    const filter = this.filter;
    const options = this.options;

    // a user can pass `single: true` in to `deleteMany` to remove a single document, theoretically
    if (typeof options.single !== 'boolean') {
      options.single = false;
    }

    removeDocuments(server, coll, filter, options, (err?: any, r?: any) =>
      deleteCallback(err, r, callback)
    );
  }
}

defineAspects(DeleteOperation, [
  Aspect.RETRYABLE,
  Aspect.WRITE_OPERATION,
  Aspect.EXECUTE_WITH_SELECTION
]);

defineAspects(DeleteOneOperation, [
  Aspect.RETRYABLE,
  Aspect.WRITE_OPERATION,
  Aspect.EXECUTE_WITH_SELECTION
]);

defineAspects(DeleteManyOperation, [Aspect.WRITE_OPERATION, Aspect.EXECUTE_WITH_SELECTION]);
export { DeleteOperation, DeleteOneOperation, DeleteManyOperation };
