import type { Callback } from '../utils';
import type { Collection } from '../collection';
import { OperationOptions, AbstractOperation } from './operation';
import type { Server } from '../sdam/server';
import type { ClientSession } from '../sessions';
import { MongoDriverError } from '../error';

/** @internal */
export class IsCappedOperation extends AbstractOperation<boolean> {
  options: OperationOptions;
  collection: Collection;

  constructor(collection: Collection, options: OperationOptions) {
    super(options);
    this.options = options;
    this.collection = collection;
  }

  execute(server: Server, session: ClientSession, callback: Callback<boolean>): void {
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

        const collOptions = collections[0].options;
        callback(undefined, !!(collOptions && collOptions.capped));
      });
  }
}
