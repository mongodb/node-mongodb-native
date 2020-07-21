import ReadPreference = require('../read_preference');
import {
  maxWireVersion,
  applyRetryableWrites,
  decorateWithCollation,
  applyWriteConcern,
  formattedOrderClause,
  handleCallback
} from '../utils';
import { MongoError } from '../error';
import { defineAspects, Aspect, OperationBase } from './operation';

class FindAndModifyOperation extends OperationBase {
  collection: any;
  query: any;
  sort: any;
  doc: any;

  constructor(collection: any, query: any, sort: any, doc: any, options: any) {
    super(options);

    this.collection = collection;
    this.query = query;
    this.sort = sort;
    this.doc = doc;
  }

  execute(callback: Function) {
    const coll = this.collection;
    const query = this.query;
    const sort = formattedOrderClause(this.sort);
    const doc = this.doc;
    let options = this.options;

    // Create findAndModify command object
    const queryObject = {
      findAndModify: coll.collectionName,
      query: query
    } as any;

    if (sort) {
      queryObject.sort = sort;
    }

    queryObject.new = options.new ? true : false;
    queryObject.remove = options.remove ? true : false;
    queryObject.upsert = options.upsert ? true : false;

    const projection = options.projection || options.fields;

    if (projection) {
      queryObject.fields = projection;
    }

    if (options.arrayFilters) {
      queryObject.arrayFilters = options.arrayFilters;
    }

    if (doc && !options.remove) {
      queryObject.update = doc;
    }

    if (options.maxTimeMS) queryObject.maxTimeMS = options.maxTimeMS;

    // Either use override on the function, or go back to default on either the collection
    // level or db
    options.serializeFunctions = options.serializeFunctions || coll.s.serializeFunctions;

    // No check on the documents
    options.checkKeys = false;

    // Final options for retryable writes and write concern
    options = applyRetryableWrites(options, coll.s.db);
    options = applyWriteConcern(options, { db: coll.s.db, collection: coll }, options);

    // Decorate the findAndModify command with the write Concern
    if (options.writeConcern) {
      queryObject.writeConcern = options.writeConcern;
    }

    // Have we specified bypassDocumentValidation
    if (options.bypassDocumentValidation === true) {
      queryObject.bypassDocumentValidation = options.bypassDocumentValidation;
    }

    options.readPreference = ReadPreference.primary;

    // Have we specified collation
    try {
      decorateWithCollation(queryObject, coll, options);
    } catch (err) {
      return callback(err, null);
    }

    if (options.hint) {
      // TODO: once this method becomes a CommandOperation we will have the server
      // in place to check.
      const unacknowledgedWrite = options.writeConcern && options.writeConcern.w === 0;
      if (unacknowledgedWrite || maxWireVersion(coll.s.topology) < 8) {
        callback(
          new MongoError('The current topology does not support a hint on findAndModify commands')
        );

        return;
      }

      queryObject.hint = options.hint;
    }

    // Execute the command
    executeCommand(coll.s.db, queryObject, options, (err?: any, result?: any) => {
      if (err) return handleCallback(callback, err, null);

      return handleCallback(callback, null, result);
    });
  }
}

/**
 * Execute a command
 *
 * @function
 * @param {Db} db The Db instance on which to execute the command.
 * @param {object} command The command hash
 * @param {object} [options] Optional settings. See Db.prototype.command for a list of options.
 * @param {Db~resultCallback} [callback] The command result callback
 */
function executeCommand(db: any, command: object, options?: any, callback?: Function) {
  // Did the user destroy the topology
  if (db.serverConfig && db.serverConfig.isDestroyed()) {
    return callback!(new MongoError('topology was destroyed'));
  }

  // Convert the readPreference if its not a write
  options.readPreference = ReadPreference.resolve(db, options);

  // Execute command
  db.s.topology.command(
    db.s.namespace.withCollection('$cmd'),
    command,
    options,
    (err?: any, result?: any) => {
      if (err) return handleCallback(callback!, err);
      if (options.full) return handleCallback(callback!, null, result);
      handleCallback(callback!, null, result.result);
    }
  );
}

class FindOneAndDeleteOperation extends FindAndModifyOperation {
  constructor(collection: any, filter: any, options: any) {
    // Final options
    const finalOptions = Object.assign({}, options);
    finalOptions.fields = options.projection;
    finalOptions.remove = true;

    super(collection, filter, finalOptions.sort, null, finalOptions);
  }
}

class FindOneAndReplaceOperation extends FindAndModifyOperation {
  constructor(collection: any, filter: any, replacement: any, options: any) {
    // Final options
    const finalOptions = Object.assign({}, options);
    finalOptions.fields = options.projection;
    finalOptions.update = true;
    finalOptions.new = options.returnOriginal !== void 0 ? !options.returnOriginal : false;
    finalOptions.upsert = options.upsert !== void 0 ? !!options.upsert : false;

    super(collection, filter, finalOptions.sort, replacement, finalOptions);
  }
}

class FindOneAndUpdateOperation extends FindAndModifyOperation {
  constructor(collection: any, filter: any, update: any, options: any) {
    // Final options
    const finalOptions = Object.assign({}, options);
    finalOptions.fields = options.projection;
    finalOptions.update = true;
    finalOptions.new =
      typeof options.returnOriginal === 'boolean' ? !options.returnOriginal : false;
    finalOptions.upsert = typeof options.upsert === 'boolean' ? options.upsert : false;

    super(collection, filter, finalOptions.sort, update, finalOptions);
  }
}

export {
  FindAndModifyOperation,
  FindOneAndDeleteOperation,
  FindOneAndReplaceOperation,
  FindOneAndUpdateOperation
};
