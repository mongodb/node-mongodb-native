import { MongoError } from '../error';
import { defineAspects, Aspect, OperationBase } from './operation';
import { CommandOperation, CommandOperationOptions } from './command';
import { applyRetryableWrites, applyWriteConcern } from '../utils';
import { prepareDocs } from './common_functions';
import type { Callback, Document } from '../types';
import type { Server } from '../sdam/server';
import type { Collection } from '../collection';
import type { WriteCommandOptions } from '../cmap/wire_protocol/write_command';
import type { ObjectId } from 'bson';
import type { Connection } from '../cmap/connection';

export interface InsertOptions extends CommandOperationOptions {
  /** Allow driver to bypass schema validation in MongoDB 3.2 or higher. */
  bypassDocumentValidation?: boolean;
  /** If true, when an insert fails, don't execute the remaining writes. If false, continue with remaining inserts when one fails. */
  ordered?: boolean;
  /** @deprecated use `ordered` instead */
  keepGoing?: boolean;
  /** Force server to assign _id values instead of driver. */
  forceServerObjectId?: boolean;
}

export class InsertOperation extends OperationBase<InsertOptions> {
  namespace: string;
  operations: Document[];

  constructor(ns: string, ops: Document[], options: InsertOptions) {
    super(options);
    this.namespace = ns;
    this.operations = ops;
  }

  execute(server: Server, callback: Callback): void {
    server.insert(
      this.namespace.toString(),
      this.operations,
      this.options as WriteCommandOptions,
      callback
    );
  }
}

export interface InsertOneResult {
  /** The total amount of documents inserted */
  insertedCount: number;
  /** The driver generated ObjectId for the insert operation */
  insertedId: ObjectId;
  /** All the documents inserted using insertOne/insertMany/replaceOne. Documents contain the _id field if forceServerObjectId == false for insertOne/insertMany */
  ops: Document[];
  /** The connection object used for the operation */
  connection: Connection;
  /** The raw command result object returned from MongoDB (content might vary by server version) */
  result: Document;
}

export class InsertOneOperation extends CommandOperation<InsertOptions> {
  collection: Collection;
  doc: Document;

  constructor(collection: Collection, doc: Document, options: InsertOptions) {
    super(collection, options);

    this.collection = collection;
    this.doc = doc;
  }

  execute(server: Server, callback: Callback): void {
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
      if (r == null) return callback(undefined, { result: { ok: 1 } });
      // Add values to top level to ensure crud spec compatibility
      r.insertedCount = r.result.n;
      r.insertedId = doc._id;
      if (callback) callback(undefined, r);
    });
  }
}

function insertDocuments(
  server: Server,
  coll: Collection,
  docs: Document[],
  options: InsertOptions,
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
      if (result.result.code) return callback(new MongoError(result.result));
      if (result.result.writeErrors)
        return callback(new MongoError(result.result.writeErrors[0]));
      // Add docs to the list
      result.ops = docs;
      // Return the results
      callback(undefined, result);
    }
  );
}

defineAspects(InsertOperation, [
  Aspect.RETRYABLE,
  Aspect.WRITE_OPERATION,
  Aspect.EXECUTE_WITH_SELECTION
]);

defineAspects(InsertOneOperation, [
  Aspect.RETRYABLE,
  Aspect.WRITE_OPERATION,
  Aspect.EXECUTE_WITH_SELECTION
]);
