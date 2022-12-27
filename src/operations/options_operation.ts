import type { Document } from '../bson';
import type { Collection } from '../collection';
import { MongoAPIError } from '../error';
import type { Server } from '../sdam/server';
import type { ClientSession } from '../sessions';
import type { Callback } from '../utils';
import { AbstractOperation, OperationOptions } from './operation';

/** @internal */
export class OptionsOperation extends AbstractOperation<Document> {
  override options: OperationOptions;
  collection: Collection;

  constructor(collection: Collection, options: OperationOptions) {
    super(options);
    this.options = options;
    this.collection = collection;
  }

  override execute(
    server: Server,
    session: ClientSession | undefined,
    callback: Callback<Document>
  ): void {
    const coll = this.collection;

    coll.s.db
      .listCollections(
        { name: coll.collectionName },
        { ...this.options, nameOnly: false, readPreference: this.readPreference, session }
      )
      .toArray()
      .then(
        collections => {
          if (collections.length === 0) {
            // TODO(NODE-3485)
            return callback(new MongoAPIError(`collection ${coll.namespace} not found`));
          }

          callback(undefined, collections[0].options);
        },
        error => callback(error)
      );
  }
}
