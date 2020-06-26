'use strict';
import { OperationBase } from './operation';
import { handleCallback } from '../utils';
import { loadCollection } from '../dynamic_loaders';

class CollectionsOperation extends OperationBase {
  db: any;

  constructor(db: any, options: any) {
    super(options);

    this.db = db;
  }

  execute(callback: Function) {
    const db = this.db;
    let options = this.options;

    let Collection = loadCollection();

    options = Object.assign({}, options, { nameOnly: true });
    // Let's get the collection names
    db.listCollections({}, options).toArray((err?: any, documents?: any) => {
      if (err != null) return handleCallback(callback, err, null);
      // Filter collections removing any illegal ones
      documents = documents.filter((doc: any) => {
        return doc.name.indexOf('$') === -1;
      });

      // Return the collection objects
      handleCallback(
        callback,
        null,
        documents.map((d: any) => {
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

export = CollectionsOperation;
