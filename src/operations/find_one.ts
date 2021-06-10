import type { Callback } from '../utils';
import type { Document } from '../bson';
import type { Collection } from '../collection';
import type { FindOptions } from './find';
import type { Server } from '../sdam/server';
import { CommandOperation } from './command';
import { Aspect, defineAspects } from './operation';
import type { ClientSession } from '../sessions';

/** @internal */
export class FindOneOperation extends CommandOperation<Document> {
  options: FindOptions;
  collection: Collection;
  query: Document;

  constructor(collection: Collection, query: Document, options: FindOptions) {
    super(collection, options);

    this.options = options;
    this.collection = collection;
    this.query = query;
  }

  execute(server: Server, session: ClientSession, callback: Callback<Document>): void {
    const coll = this.collection;
    const query = this.query;
    const options = { ...this.options, ...this.bsonOptions, session };

    try {
      const cursor = coll.find(query, options).limit(-1).batchSize(1);

      // Return the item
      cursor.next((err, item) => {
        if (err != null) return callback(err);
        callback(undefined, item || undefined);
      });
    } catch (e) {
      callback(e);
    }
  }
}

defineAspects(FindOneOperation, [Aspect.EXPLAINABLE]);
