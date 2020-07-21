import { handleCallback, toError } from '../utils';
import { OperationBase } from './operation';

class FindOneOperation extends OperationBase {
  collection: any;
  query: any;

  constructor(collection: any, query: any, options: any) {
    super(options);

    this.collection = collection;
    this.query = query;
  }

  execute(callback: Function) {
    const coll = this.collection;
    const query = this.query;
    const options = this.options;

    try {
      const cursor = coll.find(query, options).limit(-1).batchSize(1);

      // Return the item
      cursor.next((err?: any, item?: any) => {
        if (err != null) return handleCallback(callback, toError(err), null);
        handleCallback(callback, null, item);
      });
    } catch (e) {
      callback(e);
    }
  }
}

export = FindOneOperation;
