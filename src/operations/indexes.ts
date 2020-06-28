import { OperationBase } from './operation';
import { indexInformation } from './common_functions';

class IndexesOperation extends OperationBase {
  collection: any;

  constructor(collection: any, options: any) {
    super(options);

    this.collection = collection;
  }

  execute(callback: Function) {
    const coll = this.collection;
    let options = this.options;

    options = Object.assign({}, { full: true }, options);
    indexInformation(coll.s.db, coll.collectionName, options, callback);
  }
}

export = IndexesOperation;
