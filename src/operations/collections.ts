import { OperationBase } from './operation';
import { handleCallback } from '../utils';
import { loadCollection } from '../dynamic_loaders';
import type { Callback } from '../types';
import type { Db } from '../db';

export interface CollectionsOperationOptions {
  nameOnly: boolean;
}

export class CollectionsOperation extends OperationBase {
  db: Db;

  constructor(db: Db, options: CollectionsOperationOptions) {
    super(options);

    this.db = db;
  }

  execute(callback: Callback): void {
    const db = this.db;
    let options: CollectionsOperationOptions = this.options;

    const Collection = loadCollection();

    options = Object.assign({}, options, { nameOnly: true });
    // Let's get the collection names
    db.listCollections({}, options).toArray((err, documents) => {
      if (err || !documents) return handleCallback(callback, err, null);
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
