import { ReadPreference } from '../read_preference';
import {
  maxWireVersion,
  applyRetryableWrites,
  decorateWithCollation,
  applyWriteConcern,
  formattedOrderClause,
  hasAtomicOperators,
  Callback,
  HasRetryableWrites
} from '../utils';
import { MongoError } from '../error';
import { CommandOperation, CommandOperationOptions } from './command';
import { defineAspects, Aspect, Hint } from './operation';
import type { Document } from '../bson';
import type { Server } from '../sdam/server';
import type { Collection } from '../collection';
import type { Sort } from './find';

/** @public */
export interface FindAndModifyOptions extends CommandOperationOptions {
  /** When false, returns the updated document rather than the original. The default is true. */
  returnOriginal?: boolean;
  /** Upsert the document if it does not exist. */
  upsert?: boolean;
  /** Limits the fields to return for all matching documents. */
  projection?: Document;
  /** @deprecated use `projection` instead */
  fields?: Document;
  /** Determines which document the operation modifies if the query selects multiple documents. */
  sort?: Sort;
  /** Optional list of array filters referenced in filtered positional operators */
  arrayFilters?: Document[];
  /** Allow driver to bypass schema validation in MongoDB 3.2 or higher. */
  bypassDocumentValidation?: boolean;
  /** An optional hint for query optimization. See the {@link https://docs.mongodb.com/manual/reference/command/update/#update-command-hint|update command} reference for more information.*/
  hint?: Hint;

  // NOTE: These types are a misuse of options, can we think of a way to remove them?
  // TODO: Why is this a misuse?
  update?: boolean;
  remove?: boolean;
  new?: boolean;
}

/** @internal */
export class FindAndModifyOperation
  extends CommandOperation
  implements FindAndModifyOptions, HasRetryableWrites {
  collection: Collection;
  query: Document;
  sort?: Sort;
  doc?: Document;

  new?: boolean;
  remove?: boolean;
  upsert?: boolean;
  projection?: Document;
  arrayFilters?: Document[];
  serializeFunctions?: boolean;
  checkKeys?: boolean;
  bypassDocumentValidation?: boolean;
  hint?: Hint;
  retryWrites?: boolean;

  /** @deprecated Use projection instead */
  fields?: Document;

  constructor(
    collection: Collection,
    query: Document,
    sort: Sort | undefined,
    doc: Document | undefined,
    options?: FindAndModifyOptions
  ) {
    super(collection, options);

    // force primary read preference
    this.readPreference = ReadPreference.primary;

    this.collection = collection;
    this.query = query;
    this.sort = sort;
    this.doc = doc;
  }

  execute(server: Server, callback: Callback<Document>): void {
    const coll = this.collection;
    const query = this.query;
    const sort = formattedOrderClause(this.sort);
    const doc = this.doc;

    // Create findAndModify command object
    const cmd: Document = {
      findAndModify: coll.collectionName,
      query: query
    };

    if (sort) {
      cmd.sort = sort;
    }

    cmd.new = this.new ? true : false;
    cmd.remove = this.remove ? true : false;
    cmd.upsert = this.upsert ? true : false;

    const projection = this.projection || this.fields;

    if (projection) {
      cmd.fields = projection;
    }

    if (this.arrayFilters) {
      cmd.arrayFilters = this.arrayFilters;
    }

    if (doc && !this.remove) {
      cmd.update = doc;
    }

    if (this.maxTimeMS) {
      cmd.maxTimeMS = this.maxTimeMS;
    }

    // Either use override on the function, or go back to default on either the collection
    // level or db
    this.serializeFunctions = this.serializeFunctions || coll.s.serializeFunctions;

    // No check on the documents
    this.checkKeys = false;

    // Final options for retryable writes and write concern
    applyRetryableWrites(this, coll.s.db);
    applyWriteConcern(this, { db: coll.s.db, collection: coll }, this);

    // Decorate the findAndModify command with the write Concern
    if (this.writeConcern) {
      cmd.writeConcern = this.writeConcern;
    }

    // Have we specified bypassDocumentValidation
    if (this.bypassDocumentValidation === true) {
      cmd.bypassDocumentValidation = this.bypassDocumentValidation;
    }

    // Have we specified collation
    try {
      decorateWithCollation(cmd, coll, this);
    } catch (err) {
      return callback(err);
    }

    if (this.hint) {
      // TODO: once this method becomes a CommandOperation we will have the server
      // in place to check.
      const unacknowledgedWrite = this.writeConcern?.w === 0;
      if (unacknowledgedWrite || maxWireVersion(server) < 8) {
        callback(
          new MongoError('The current topology does not support a hint on findAndModify commands')
        );

        return;
      }

      cmd.hint = this.hint;
    }

    // Execute the command
    super.executeCommand(server, cmd, (err, result) => {
      if (err) return callback(err);
      return callback(undefined, result);
    });
  }
}

/** @internal */
export class FindOneAndDeleteOperation extends FindAndModifyOperation {
  constructor(collection: Collection, filter: Document, options: FindAndModifyOptions) {
    // Final options
    const finalOptions = Object.assign({}, options);
    finalOptions.fields = options.projection;
    finalOptions.remove = true;

    // Basic validation
    if (filter == null || typeof filter !== 'object') {
      throw new TypeError('Filter parameter must be an object');
    }

    super(collection, filter, finalOptions.sort, undefined, finalOptions);
  }
}

/** @internal */
export class FindOneAndReplaceOperation extends FindAndModifyOperation {
  constructor(
    collection: Collection,
    filter: Document,
    replacement: Document,
    options: FindAndModifyOptions
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

/** @internal */
export class FindOneAndUpdateOperation extends FindAndModifyOperation {
  constructor(
    collection: Collection,
    filter: Document,
    update: Document,
    options: FindAndModifyOptions
  ) {
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

defineAspects(FindAndModifyOperation, [Aspect.WRITE_OPERATION, Aspect.RETRYABLE]);
