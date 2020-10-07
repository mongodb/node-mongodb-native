import { OperationBase, OperationOptions } from './operation';
import { MongoError } from '../error';
import type { Callback } from '../utils';
import type { Document } from '../bson';
import type { Collection } from '../collection';
import type { Server } from '../sdam/server';

/** @internal */
export class OptionsOperation extends OperationBase implements OperationOptions {
  collection: Collection;

  constructor(collection: Collection, options: OperationOptions) {
    super(options);

    this.collection = collection;
  }

  execute(server: Server, callback: Callback<Document>): void {
    const coll = this.collection;

    coll.s.db.listCollections({ name: coll.collectionName }, this).toArray((err, collections) => {
      if (err || !collections) return callback(err);
      if (collections.length === 0) {
        return callback(new MongoError(`collection ${coll.namespace} not found`));
      }

      callback(err, collections[0].options || null);
    });
  }
}
