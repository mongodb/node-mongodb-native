import { handleCallback, toError } from '../utils';
import { OperationBase } from './operation';
import type { Callback, Document } from '../types';
import type { Collection } from '../collection';
import type { FindOptions } from './find_and_modify';

export class FindOneOperation extends OperationBase {
  collection: Collection;
  query: Document;

  constructor(collection: Collection, query: Document, options: FindOptions) {
    super(options);

    this.collection = collection;
    this.query = query;
  }

  execute(callback: Callback): void {
    const coll = this.collection;
    const query = this.query;
    const options = this.options;

    try {
      const cursor = coll.find(query, options).limit(-1).batchSize(1);

      // Return the item
      cursor.next((err, item) => {
        if (err != null) return handleCallback(callback, toError(err), null);
        handleCallback(callback, null, item);
      });
    } catch (e) {
      callback(e);
    }
  }
}
