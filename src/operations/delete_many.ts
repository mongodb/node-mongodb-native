'use strict';
import { OperationBase } from './operation';
import { deleteCallback, removeDocuments } from './common_functions';

class DeleteManyOperation extends OperationBase {
  collection: any;
  filter: any;

  constructor(collection: any, filter: any, options: any) {
    super(options);

    this.collection = collection;
    this.filter = filter;
  }

  execute(callback: Function) {
    const coll = this.collection;
    const filter = this.filter;
    const options = this.options;

    options.single = false;
    removeDocuments(coll, filter, options, (err?: any, r?: any) =>
      deleteCallback(err, r, callback)
    );
  }
}

export = DeleteManyOperation;
