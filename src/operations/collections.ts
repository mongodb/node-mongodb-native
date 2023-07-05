import { Collection } from '../collection';
import type { Db } from '../db';
import type { Server } from '../sdam/server';
import type { ClientSession } from '../sessions';
import type { Callback } from '../utils';
import { AbstractCallbackOperation, type OperationOptions } from './operation';

export interface CollectionsOptions extends OperationOptions {
  nameOnly?: boolean;
}

/** @internal */
export class CollectionsOperation extends AbstractCallbackOperation<Collection[]> {
  override options: CollectionsOptions;
  db: Db;

  constructor(db: Db, options: CollectionsOptions) {
    super(options);
    this.options = options;
    this.db = db;
  }

  override executeCallback(
    server: Server,
    session: ClientSession | undefined,
    callback: Callback<Collection[]>
  ): void {
    // Let's get the collection names
    this.db
      .listCollections(
        {},
        { ...this.options, nameOnly: true, readPreference: this.readPreference, session }
      )
      .toArray()
      .then(
        documents => {
          const collections = [];
          for (const { name } of documents) {
            if (!name.includes('$')) {
              // Filter collections removing any illegal ones
              collections.push(new Collection(this.db, name, this.db.s.options));
            }
          }
          // Return the collection objects
          callback(undefined, collections);
        },
        error => callback(error)
      );
  }
}
