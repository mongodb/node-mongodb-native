import { OperationBase } from './operation';
import type { Callback } from '../utils';
import { Document, inheritOrDefaultBSONSerializableOptions } from '../bson';
import type { Collection } from '../collection';
import type { FindOptions } from './find';
import { MongoError } from '../error';
import type { Server } from '../sdam/server';

/** @internal */
export class FindOneOperation extends OperationBase<FindOptions, Document> {
  collection: Collection;
  query: Document;

  constructor(collection: Collection, query: Document, options: FindOptions) {
    super(options);

    this.collection = collection;
    this.query = query;

    // Assign all bsonOptions to OperationBase obj, preferring command options over parent options
    Object.assign(this, inheritOrDefaultBSONSerializableOptions(options, collection.s));
  }

  execute(server: Server, callback: Callback<Document>): void {
    const coll = this.collection;
    const query = this.query;
    const options = Object.assign({}, this.options, this.bsonOptions);

    try {
      const cursor = coll.find(query, options).limit(-1).batchSize(1);

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
