import { defineAspects, Aspect } from './operation';
import { updateCallback, updateDocuments } from './common_functions';
import CommandOperation = require('./command');

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

defineAspects(UpdateManyOperation, [Aspect.WRITE_OPERATION, Aspect.EXECUTE_WITH_SELECTION]);
export = UpdateManyOperation;
