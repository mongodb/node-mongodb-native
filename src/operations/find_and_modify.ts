import { ReadPreference } from '../read_preference';
import {
  maxWireVersion,
  applyRetryableWrites,
  decorateWithCollation,
  applyWriteConcern,
  formattedOrderClause,
  handleCallback,
  hasAtomicOperators
} from '../utils';
import { MongoError } from '../error';
import { CommandOperation, CommandOperationOptions } from './command';
import { defineAspects, Aspect, Hint } from './operation';
import type { Callback, Document } from '../types';
import type { Server } from '../sdam/server';
import type { Collection } from '../collection';
import type { WriteConcern } from '../write_concern';

export type Sort = { [key: string]: number | string };

export interface FindOptions extends CommandOperationOptions {
  update: boolean;
  new: boolean;
  returnOriginal: undefined;
  upsert: boolean;
  fields: Document;
  projection: Document;
  remove: boolean;
  sort: Sort;
}

export interface FindAndModifyQuery {
  sort?: Sort;
  new?: boolean;
  remove?: boolean;
  upsert?: boolean;
  fields?: Document;
  arrayFilters?: any;
  update?: Document;
  maxTimeMS?: number;
  writeConcern?: WriteConcern;
  bypassDocumentValidation?: boolean;
  hint?: Hint;
  findAndModify?: string;
  query?: Document;
}

export class FindAndModifyOperation extends CommandOperation {
  collection: Collection;
  query: Document;
  sort: Sort;
  doc: Document | null;

  constructor(
    collection: Collection,
    query: Document,
    sort: Sort,
    doc: Document | null,
    options: FindOptions
  ) {
    super(collection, options);

    // force primary read preference
    this.readPreference = ReadPreference.primary;

    this.collection = collection;
    this.query = query;
    this.sort = sort;
    this.doc = doc;
  }

  execute(server: Server, callback: Callback): void {
    const coll = this.collection;
    const query = this.query;
    const sort = formattedOrderClause(this.sort);
    const doc = this.doc;
    let options = this.options;

    // Create findAndModify command object
    const queryObject: FindAndModifyQuery = {
      findAndModify: coll.collectionName,
      query: query
    };

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
      if (unacknowledgedWrite || maxWireVersion(server) < 8) {
        callback(
          new MongoError('The current topology does not support a hint on findAndModify commands')
        );

        return;
      }

      queryObject.hint = options.hint;
    }

    // Execute the command
    super.executeCommand(server, queryObject, (err, result) => {
      if (err) return handleCallback(callback, err, null);

      return handleCallback(callback, null, result);
    });
  }
}

export class FindOneAndDeleteOperation extends FindAndModifyOperation {
  constructor(collection: Collection, filter: Document, options: FindOptions) {
    // Final options
    const finalOptions = Object.assign({}, options);
    finalOptions.fields = options.projection;
    finalOptions.remove = true;

    // Basic validation
    if (filter == null || typeof filter !== 'object') {
      throw new TypeError('Filter parameter must be an object');
    }

    super(collection, filter, finalOptions.sort, null, finalOptions);
  }
}

export class FindOneAndReplaceOperation extends FindAndModifyOperation {
  constructor(
    collection: Collection,
    filter: Document,
    replacement: Document,
    options: FindOptions
  ) {
    // Final options
    const finalOptions = Object.assign({}, options);
    finalOptions.fields = options.projection;
    finalOptions.update = true;
    finalOptions.new = options.returnOriginal !== void 0 ? !options.returnOriginal : false;
    finalOptions.upsert = options.upsert !== void 0 ? !!options.upsert : false;

    if (filter == null || typeof filter !== 'object') {
      throw new TypeError('Filter parameter must be an object');
    }

    if (replacement == null || typeof replacement !== 'object') {
      throw new TypeError('Replacement parameter must be an object');
    }

    if (hasAtomicOperators(replacement)) {
      throw new TypeError('Replacement document must not contain atomic operators');
    }

    super(collection, filter, finalOptions.sort, replacement, finalOptions);
  }
}

export class FindOneAndUpdateOperation extends FindAndModifyOperation {
  constructor(collection: Collection, filter: Document, update: Document, options: FindOptions) {
    // Final options
    const finalOptions = Object.assign({}, options);
    finalOptions.fields = options.projection;
    finalOptions.update = true;
    finalOptions.new =
      typeof options.returnOriginal === 'boolean' ? !options.returnOriginal : false;
    finalOptions.upsert = typeof options.upsert === 'boolean' ? options.upsert : false;

    if (filter == null || typeof filter !== 'object') {
      throw new TypeError('Filter parameter must be an object');
    }

    if (update == null || typeof update !== 'object') {
      throw new TypeError('Update parameter must be an object');
    }

    if (!hasAtomicOperators(update)) {
      throw new TypeError('Update document requires atomic operators');
    }

    super(collection, filter, finalOptions.sort, update, finalOptions);
  }
}

defineAspects(FindAndModifyOperation, [
  Aspect.WRITE_OPERATION,
  Aspect.RETRYABLE,
  Aspect.EXECUTE_WITH_SELECTION
]);
