import { OperationBase } from './operation';
import type { Callback } from '../utils';
import type { Document } from '../bson';
import type { Collection } from '../collection';
import type { FindOptions } from './find';
import { MongoError } from '../error';
import type { Server } from '../sdam/server';

/** @internal */
export class FindOneOperation extends OperationBase implements FindOptions {
  collection: Collection;
  query: Document;

  constructor(collection: Collection, query: Document, options: FindOptions) {
    super(options);

    this.collection = collection;
    this.query = query;
  }

  execute(server: Server, callback: Callback<Document>): void {
    const coll = this.collection;
    const query = this.query;

    try {
      const cursor = coll.find(query, this).limit(-1).batchSize(1);

      // Return the item
      cursor.next((err, item) => {
        if (err != null) return callback(new MongoError(err));
        callback(undefined, item);
      });
    } catch (e) {
      callback(e);
    }
  }
}
