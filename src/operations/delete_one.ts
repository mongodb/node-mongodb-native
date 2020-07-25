import { defineAspects, Aspect } from './operation';
import { deleteCallback, removeDocuments } from './common_functions';
import CommandOperation = require('./command');

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

defineAspects(DeleteOneOperation, [
  Aspect.RETRYABLE,
  Aspect.WRITE_OPERATION,
  Aspect.EXECUTE_WITH_SELECTION
]);

export = DeleteOneOperation;
