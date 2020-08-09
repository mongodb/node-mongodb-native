import { OperationBase, OperationOptions } from './operation';
import { handleCallback } from '../utils';
import { loadCollection } from '../dynamic_loaders';
import type { Callback } from '../types';
import type { Db } from '../db';
import type { Collection } from '../collection';

export interface CollectionsOptions extends OperationOptions {
  nameOnly?: boolean;
}

export class CollectionsOperation extends OperationBase<CollectionsOptions> {
  db: Db;

  constructor(db: Db, options: CollectionsOptions) {
    super(options);

    this.db = db;
  }

  execute(callback: Callback<Collection[]>): void {
    const db = this.db;
    let options: CollectionsOptions = this.options;

    const Collection = loadCollection();

    options = Object.assign({}, options, { nameOnly: true });
    // Let's get the collection names
    db.listCollections({}, options).toArray((err, documents) => {
      if (err || !documents) return callback(err);
      // Filter collections removing any illegal ones
      documents = documents.filter(doc => doc.name.indexOf('$') === -1);

      // Return the collection objects
      handleCallback(
        callback,
        null,
        documents.map(d => {
          return new Collection(
            db,
            db.s.topology,
            db.databaseName,
            d.name,
            db.s.pkFactory,
            db.s.options
          );
        })
      );
    });
  }
}
