'use strict';
import { MongoError } from '../error';
import { OperationBase } from './operation';
import { insertDocuments } from './common_functions';

class InsertOneOperation extends OperationBase {
  collection: any;
  doc: any;

  constructor(collection: any, doc: any, options: any) {
    super(options);

    this.collection = collection;
    this.doc = doc;
  }

  execute(callback: Function) {
    const coll = this.collection;
    const doc = this.doc;
    const options = this.options;

    if (Array.isArray(doc)) {
      return callback(
        MongoError.create({ message: 'doc parameter must be an object', driver: true })
      );
    }

    insertDocuments(coll, [doc], options, (err?: any, r?: any) => {
      if (callback == null) return;
      if (err && callback) return callback(err);
      // Workaround for pre 2.6 servers
      if (r == null) return callback(null, { result: { ok: 1 } });
      // Add values to top level to ensure crud spec compatibility
      r.insertedCount = r.result.n;
      r.insertedId = doc._id;
      if (callback) callback(null, r);
    });
  }
}

export = InsertOneOperation;
