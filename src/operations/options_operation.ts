import { OperationBase } from './operation';
import { handleCallback } from '../utils';
import { MongoError } from '../error';
import type { Callback } from '../types';
import type { Collection } from '../collection';

export class OptionsOperation extends OperationBase {
  collection: Collection;

  constructor(collection: Collection, options: any) {
    super(options);

    this.collection = collection;
  }

  execute(callback: Callback): void {
    const coll = this.collection;
    const opts = this.options;

    coll.s.db.listCollections({ name: coll.collectionName }, opts).toArray((err, collections) => {
      if (err || !collections) return handleCallback(callback, err);
      if (collections.length === 0) {
        return handleCallback(
          callback,
          MongoError.create({ message: `collection ${coll.namespace} not found`, driver: true })
        );
      }

      handleCallback(callback, err, collections[0].options || null);
    });
  }
}
