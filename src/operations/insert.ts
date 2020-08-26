import { MongoError } from '../error';
import { defineAspects, Aspect, OperationBase } from './operation';
import { CommandOperation } from './command';
import { applyRetryableWrites, applyWriteConcern, Callback, MongoDBNamespace } from '../utils';
import { prepareDocs } from './common_functions';
import type { Server } from '../sdam/server';
import type { Collection } from '../collection';
import type { WriteCommandOptions } from '../cmap/wire_protocol/write_command';
import type { ObjectId, Document, BSONSerializeOptions } from '../bson';
import type { Connection } from '../cmap/connection';
import type { BulkWriteOptions } from '../bulk/common';
import type { WriteConcernOptions } from '../write_concern';

/** @internal */
export class InsertOperation extends OperationBase<BulkWriteOptions, Document> {
  operations: Document[];

  constructor(ns: MongoDBNamespace, ops: Document[], options: BulkWriteOptions) {
    super(options);
    this.ns = ns;
    this.operations = ops;
  }

  execute(server: Server, callback: Callback<Document>): void {
    server.insert(
      this.ns.toString(),
      this.operations,
      this.options as WriteCommandOptions,
      callback
    );
  }
}

/** @public */
export interface InsertOneOptions extends BSONSerializeOptions, WriteConcernOptions {
  /** Allow driver to bypass schema validation in MongoDB 3.2 or higher. */
  bypassDocumentValidation?: boolean;
}

/** @public */
export interface InsertOneResult {
  /** The total amount of documents inserted */
  insertedCount: number;
  /** The driver generated ObjectId for the insert operation */
  insertedId?: ObjectId;
  /** All the documents inserted using insertOne/insertMany/replaceOne. Documents contain the _id field if forceServerObjectId == false for insertOne/insertMany */
  ops?: Document[];
  /** The connection object used for the operation */
  connection?: Connection;
  /** The raw command result object returned from MongoDB (content might vary by server version) */
  result: Document;
}

export class InsertOneOperation extends CommandOperation<InsertOneOptions, InsertOneResult> {
  collection: Collection;
  doc: Document;

  constructor(collection: Collection, doc: Document, options: InsertOneOptions) {
    super(collection, options);

    this.collection = collection;
    this.doc = doc;
  }

  execute(server: Server, callback: Callback<InsertOneResult>): void {
    const coll = this.collection;
    const doc = this.doc;
    const options = this.options;

    if (Array.isArray(doc)) {
      return callback(
        MongoError.create({ message: 'doc parameter must be an object', driver: true })
      );
    }

    insertDocuments(server, coll, [doc], options, (err, r) => {
      if (callback == null) return;
      if (err && callback) return callback(err);
      // Workaround for pre 2.6 servers
      if (r == null) return callback(undefined, { insertedCount: 0, result: { ok: 1 } });
      // Add values to top level to ensure crud spec compatibility
      r.insertedCount = r.n;
      r.insertedId = doc._id;
      if (callback) callback(undefined, r as InsertOneResult);
    });
  }
}

function insertDocuments(
  server: Server,
  coll: Collection,
  docs: Document[],
  options: BulkWriteOptions,
  callback: Callback<Document>
) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = options || {};
  // Ensure we are operating on an array op docs
  docs = Array.isArray(docs) ? docs : [docs];

  // Final options for retryable writes and write concern
  let finalOptions = Object.assign({}, options);
  finalOptions = applyRetryableWrites(finalOptions, coll.s.db);
  finalOptions = applyWriteConcern(finalOptions, { db: coll.s.db, collection: coll }, options);

  // If keep going set unordered
  if (finalOptions.keepGoing === true) finalOptions.ordered = false;
  finalOptions.serializeFunctions = options.serializeFunctions || coll.s.serializeFunctions;

  docs = prepareDocs(coll, docs, options);

  // File inserts
  server.insert(
    coll.s.namespace.toString(),
    docs,
    finalOptions as WriteCommandOptions,
    (err, result) => {
      if (callback == null) return;
      if (err) return callback(err);
      if (result == null) return callback();
      if (result.code) return callback(new MongoError(result));
      if (result.writeErrors) return callback(new MongoError(result.writeErrors[0]));
      // Add docs to the list
      result.ops = docs;
      // Return the results
      callback(undefined, result);
    }
  );
}

defineAspects(InsertOperation, [Aspect.RETRYABLE, Aspect.WRITE_OPERATION]);
defineAspects(InsertOneOperation, [Aspect.RETRYABLE, Aspect.WRITE_OPERATION]);
