import type { InsertOptions } from './../cmap/wire_protocol/index';
import type { BinMsg, CommandResult } from './../cmap/commands';
import type { Server } from '../sdam/server';
import type { Connection } from './../cmap/connection';
import type { ObjectId } from 'bson';
import type { Document, Callback } from './../types.d';
import { MongoError } from '../error';
import { defineAspects, Aspect, OperationBase } from './operation';
import { CommandOperation } from './command';
import { applyRetryableWrites, applyWriteConcern, handleCallback, toError } from '../utils';
import { prepareDocs } from './common_functions';
import type { Collection, WriteConcernOptions } from '../collection';

export interface InsertDocumentsResult {
  connection: Connection;
  message: BinMsg;
  ops: Document;
  result: {
    n: number;
    ok: number;
  };
}

export interface InsertOneResultPreTwoSix {
  result: {
    ok: number;
  };
}

/** The result object if the command was executed successfully. */
export interface InsertOneResult extends InsertDocumentsResult {
  /** The total amount of documents inserted. */
  insertedCount?: number;
  /** The driver generated ObjectId for the insert operation. */
  insertedId?: ObjectId;
}

export interface InsertOperationOptions extends InsertOptions, WriteConcernOptions {
  keepGoing?: boolean;
}

export class InsertOperation extends OperationBase<InsertOperationOptions> {
  namespace: any;
  operations: any;

  constructor(ns: any, ops: any, options: InsertOperationOptions) {
    super(options);
    this.namespace = ns;
    this.operations = ops;
  }

  execute(server: any, callback: Function) {
    server.insert(this.namespace.toString(), this.operations, this.options, callback);
  }
}

export class InsertOneOperation extends CommandOperation<InsertOperationOptions> {
  collection: Collection;
  doc: Document;

  constructor(collection: any, doc: any, options: InsertOperationOptions) {
    super(collection, options);

    this.collection = collection;
    this.doc = doc;
  }

  execute(server: Server, callback: Callback<Partial<InsertOneResult> | InsertOneResultPreTwoSix>) {
    const coll = this.collection;
    const doc = this.doc;
    const options = this.options;

    if (Array.isArray(doc)) {
      return callback(
        MongoError.create({ message: 'doc parameter must be an object', driver: true })
      );
    }

    insertDocuments(server, coll, [doc], options, (err?: any, r?) => {
      if (callback == null) return;
      if (err && callback) return callback(err);
      // Workaround for pre 2.6 servers
      if (r == null) return callback(undefined, { result: { ok: 1 } });
      // Add values to top level to ensure crud spec compatibility
      if (callback)
        return callback(undefined, { ...r, insertedCount: r.result.n, insertedId: doc._id });
    });
  }
}

function insertDocuments(
  server: Server,
  coll: Collection,
  docs: Document[],
  options?: InsertOperationOptions,
  callback?: Callback<InsertDocumentsResult>
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
  const ns = coll.s.namespace.toString();

  // File inserts
  server.insert(ns, docs, finalOptions, (err?: any, result?: CommandResult) => {
    if (callback == null) return;
    if (err) return handleCallback(callback, err);
    if (result === undefined) return handleCallback(callback, undefined);
    if (result.result.code) return handleCallback(callback, toError(result.result));
    if (result.result.writeErrors)
      return handleCallback(callback, toError(result.result.writeErrors[0]));
    handleCallback(callback, null, ({ ...result, ops: docs } as unknown) as InsertDocumentsResult);
  });
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
