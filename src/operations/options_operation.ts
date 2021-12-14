import type { Document } from '../bson';
import type { Collection } from '../collection';
import { MongoAPIError } from '../error';
import type { Server } from '../sdam/server';
import type { ClientSession } from '../sessions';
import type { Callback } from '../utils';
import { AbstractOperation, OperationOptions } from './operation';

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
          // TODO(NODE-3485)
          return callback(new MongoAPIError(`collection ${coll.namespace} not found`));
        }

        callback(err, collections[0].options);
      });
  }
}
