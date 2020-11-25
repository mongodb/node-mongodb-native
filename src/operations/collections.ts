import { OperationBase, OperationOptions } from './operation';
import { loadCollection } from '../dynamic_loaders';
import type { Callback } from '../utils';
import type { Db } from '../db';

// eslint-disable-next-line
import type { Collection } from '../collection';
import type { Server } from '../sdam/server';

export interface CollectionsOptions extends OperationOptions {
  nameOnly?: boolean;
}

/** @internal */
export class CollectionsOperation extends OperationBase<CollectionsOptions, Collection[]> {
  db: Db;

  constructor(db: Db, options: CollectionsOptions) {
    super(options);

    this.db = db;
  }

  execute(server: Server, callback: Callback<Collection[]>): void {
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
      callback(
        undefined,
        documents.map(d => {
          return new Collection(db, d.name, db.s.options);
        })
      );
    });
  }
}
