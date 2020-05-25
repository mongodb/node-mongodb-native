import { OperationBase } from './operation';
import { handleCallback } from '../utils';
import { MongoError } from '../error';

class OptionsOperation extends OperationBase {
  collection: any;

  constructor(collection: any, options: any) {
    super(options);

    this.collection = collection;
  }

  execute(callback: Function) {
    const coll = this.collection;
    const opts = this.options;

    coll.s.db
      .listCollections({ name: coll.collectionName }, opts)
      .toArray((err?: any, collections?: any) => {
        if (err) return handleCallback(callback, err);
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

export = OptionsOperation;
