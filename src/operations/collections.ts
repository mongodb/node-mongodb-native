import { OperationBase, OperationOptions } from './operation';
import { Callback, deepFreeze } from '../utils';
import type { Db } from '../db';

// eslint-disable-next-line
import { Collection } from '../collection';
import type { Server } from '../sdam/server';

export interface CollectionsOptions extends OperationOptions {
  nameOnly?: boolean;
}

/** @internal */
export class CollectionsOperation extends OperationBase<CollectionsOptions, Collection[]> {
  db: Db;
  protected nameOnly;

  getOptions(): Readonly<CollectionsOptions> {
    return deepFreeze({
      ...super.getOptions(),
      nameOnly: this.nameOnly
    });
  }

  constructor(db: Db, options: CollectionsOptions) {
    super(options);

    this.db = db;
    this.nameOnly = options.nameOnly ?? true;
  }

  execute(server: Server, callback: Callback<Collection[]>): void {
    const db = this.db;
    const options = this.getOptions();

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
