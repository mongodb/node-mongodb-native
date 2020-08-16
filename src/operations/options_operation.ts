import { OperationBase, OperationOptions } from './operation';
import { MongoError } from '../error';
import type { Callback } from '../utils';
import type { Document } from '../bson';
import type { Collection } from '../collection';
import type { Server } from '../sdam/server';

export class OptionsOperation extends OperationBase<OperationOptions> {
  collection: Collection;

  constructor(collection: Collection, options: OperationOptions) {
    super(options);

    this.collection = collection;
  }

  execute(server: Server, callback: Callback<Document>): void {
    const coll = this.collection;
    const opts = this.options;

    coll.s.db.listCollections({ name: coll.collectionName }, opts).toArray((err, collections) => {
      if (err || !collections) return callback(err);
      if (collections.length === 0) {
        return callback(
          MongoError.create({ message: `collection ${coll.namespace} not found`, driver: true })
        );
      }

      callback(err, collections[0].options || null);
    });
  }
}
