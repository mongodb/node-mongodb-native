import { MongoError } from '../error';
import { defineAspects, Aspect } from './operation';
import CommandOperation = require('./command');
import { applyRetryableWrites, applyWriteConcern, handleCallback, toError } from '../utils';
import { prepareDocs } from './common_functions';

class InsertOneOperation extends CommandOperation {
  collection: any;
  doc: any;

  constructor(collection: any, doc: any, options: any) {
    super(collection, options);

    this.collection = collection;
    this.doc = doc;
  }

  execute(server: any, callback: Function) {
    const coll = this.collection;
    const doc = this.doc;
    const options = this.options;

    if (Array.isArray(doc)) {
      return callback(
        MongoError.create({ message: 'doc parameter must be an object', driver: true })
      );
    }

    insertDocuments(server, coll, [doc], options, (err?: any, r?: any) => {
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

function insertDocuments(server: any, coll: any, docs: any, options: any, callback: Function) {
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
  server.insert(coll.s.namespace.toString(), docs, finalOptions, (err?: any, result?: any) => {
    if (callback == null) return;
    if (err) return handleCallback(callback, err);
    if (result == null) return handleCallback(callback, null, null);
    if (result.result.code) return handleCallback(callback, toError(result.result));
    if (result.result.writeErrors)
      return handleCallback(callback, toError(result.result.writeErrors[0]));
    // Add docs to the list
    result.ops = docs;
    // Return the results
    handleCallback(callback, null, result);
  });
}

defineAspects(InsertOneOperation, [
  Aspect.RETRYABLE,
  Aspect.WRITE_OPERATION,
  Aspect.EXECUTE_WITH_SELECTION
]);

export = InsertOneOperation;
