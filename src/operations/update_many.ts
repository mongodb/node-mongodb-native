'use strict';
import { OperationBase } from './operation';
import { updateCallback, updateDocuments } from './common_functions';

class UpdateManyOperation extends OperationBase {
  collection: any;
  filter: any;
  update: any;

  constructor(collection: any, filter: any, update: any, options: any) {
    super(options);

    this.collection = collection;
    this.filter = filter;
    this.update = update;
  }

  execute(callback: Function) {
    const coll = this.collection;
    const filter = this.filter;
    const update = this.update;
    const options = this.options;

    // Set single document update
    options.multi = true;
    // Execute update
    updateDocuments(coll, filter, update, options, (err?: any, r?: any) =>
      updateCallback(err, r, callback)
    );
  }
}

export = UpdateManyOperation;
