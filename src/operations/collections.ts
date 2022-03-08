import { Collection } from '../collection';
import type { Db } from '../db';
import type { Server } from '../sdam/server';
import type { ClientSession } from '../sessions';
import type { Callback } from '../utils';
import { AbstractOperation, OperationOptions } from './operation';

export interface CollectionsOptions extends OperationOptions {
  nameOnly?: boolean;
}

/** @internal */
export class CollectionsOperation extends AbstractOperation<Collection[]> {
  override options: CollectionsOptions;
  db: Db;

  constructor(db: Db, options: CollectionsOptions) {
    super(options);
    this.options = options;
    this.db = db;
  }

  override execute(
    server: Server,
    session: ClientSession | undefined,
    callback: Callback<Collection[]>
  ): void {
    const db = this.db;

    // Let's get the collection names
    db.listCollections(
      {},
      { ...this.options, nameOnly: true, readPreference: this.readPreference, session }
    ).toArray((err, documents) => {
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
