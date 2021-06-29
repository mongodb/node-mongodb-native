import { AbstractOperation, OperationOptions } from './operation';
import { MongoDriverError } from '../error';
import type { Callback } from '../utils';
import type { Document } from '../bson';
import type { Collection } from '../collection';
import type { Server } from '../sdam/server';
import type { ClientSession } from '../sessions';

/** @internal */
export class OptionsOperation extends AbstractOperation<Document> {
  options: OperationOptions;
  collection: Collection;

  constructor(collection: Collection, options: OperationOptions) {
    super(options);
    this.options = options;
    this.collection = collection;
  }

  execute(server: Server, session: ClientSession, callback: Callback<Document>): void {
    const coll = this.collection;

    coll.s.db
      .listCollections(
        { name: coll.collectionName },
        { ...this.options, nameOnly: false, readPreference: this.readPreference, session }
      )
      .toArray((err, collections) => {
        if (err || !collections) return callback(err);
        if (collections.length === 0) {
          return callback(new MongoDriverError(`collection ${coll.namespace} not found`));
        }

        callback(err, collections[0].options);
      });
  }
}
