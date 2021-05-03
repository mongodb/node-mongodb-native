import { ReadPreference } from '../read_preference';
import { maxWireVersion, decorateWithCollation, hasAtomicOperators, Callback } from '../utils';
import { MongoError } from '../error';
import { CommandOperation, CommandOperationOptions } from './command';
import { defineAspects, Aspect } from './operation';
import type { Document } from '../bson';
import type { Server } from '../sdam/server';
import type { Collection } from '../collection';
import { Sort, formatSort } from '../sort';
import type { ClientSession } from '../sessions';

/** @public */
export interface FindOneAndDeleteOptions extends CommandOperationOptions {
  /** An optional hint for query optimization. See the {@link https://docs.mongodb.com/manual/reference/command/update/#update-command-hint|update command} reference for more information.*/
  hint?: Document;
  /** Limits the fields to return for all matching documents. */
  projection?: Document;
  /** Determines which document the operation modifies if the query selects multiple documents. */
  sort?: Sort;
}

/** @public */
export interface FindOneAndReplaceOptions extends CommandOperationOptions {
  /** Allow driver to bypass schema validation in MongoDB 3.2 or higher. */
  bypassDocumentValidation?: boolean;
  /** An optional hint for query optimization. See the {@link https://docs.mongodb.com/manual/reference/command/update/#update-command-hint|update command} reference for more information.*/
  hint?: Document;
  /** Limits the fields to return for all matching documents. */
  projection?: Document;
  /** When false, returns the updated document rather than the original. The default is true. */
  returnOriginal?: boolean;
  /** Determines which document the operation modifies if the query selects multiple documents. */
  sort?: Sort;
  /** Upsert the document if it does not exist. */
  upsert?: boolean;
}

/** @public */
export interface FindOneAndUpdateOptions extends CommandOperationOptions {
  /** Optional list of array filters referenced in filtered positional operators */
  arrayFilters?: Document[];
  /** Allow driver to bypass schema validation in MongoDB 3.2 or higher. */
  bypassDocumentValidation?: boolean;
  /** An optional hint for query optimization. See the {@link https://docs.mongodb.com/manual/reference/command/update/#update-command-hint|update command} reference for more information.*/
  hint?: Document;
  /** Limits the fields to return for all matching documents. */
  projection?: Document;
  /** When false, returns the updated document rather than the original. The default is true. */
  returnOriginal?: boolean;
  /** Determines which document the operation modifies if the query selects multiple documents. */
  sort?: Sort;
  /** Upsert the document if it does not exist. */
  upsert?: boolean;
}

// TODO: NODE-1812 to deprecate returnOriginal for returnDocument

/** @internal */
interface FindAndModifyOptions extends CommandOperationOptions {
  /** When false, returns the updated document rather than the original. The default is true. */
  returnOriginal?: boolean;
  /** Upsert the document if it does not exist. */
  upsert?: boolean;
  /** Limits the fields to return for all matching documents. */
  projection?: Document;
  /** Determines which document the operation modifies if the query selects multiple documents. */
  sort?: Sort;
  /** Optional list of array filters referenced in filtered positional operators */
  arrayFilters?: Document[];
  /** Allow driver to bypass schema validation in MongoDB 3.2 or higher. */
  bypassDocumentValidation?: boolean;
  /** An optional hint for query optimization. See the {@link https://docs.mongodb.com/manual/reference/command/update/#update-command-hint|update command} reference for more information.*/
  hint?: Document;

  // NOTE: These types are a misuse of options, can we think of a way to remove them?
  remove?: boolean;
}

/** @internal */
export class FindAndModifyOperation extends CommandOperation<Document> {
  options: FindAndModifyOptions;
  collection: Collection;
  query: Document;
  sort?: Sort;
  doc?: Document;

  constructor(
    collection: Collection,
    query: Document,
    sort: Sort | undefined,
    doc: Document | undefined,
    options?: FindAndModifyOptions
  ) {
    super(collection, options);
    this.options = options ?? {};

    // force primary read preference
    this.readPreference = ReadPreference.primary;

    this.collection = collection;
    this.query = query;
    this.sort = sort;
    this.doc = doc;
  }

  execute(server: Server, session: ClientSession, callback: Callback<Document>): void {
    const coll = this.collection;
    const query = this.query;
    const sort = formatSort(this.sort);
    const doc = this.doc;
    const options = { ...this.options, ...this.bsonOptions };

    // Create findAndModify command object
    const cmd: Document = {
      findAndModify: coll.collectionName,
      query: query
    };

    if (sort) {
      cmd.sort = sort;
    }

    if (!options.remove) {
      cmd.new = typeof options.returnOriginal === 'boolean' ? !options.returnOriginal : false;
      cmd.upsert = typeof options.upsert === 'boolean' ? options.upsert : false;
      if (doc) {
        cmd.update = doc;
      }
    }

    cmd.remove = options.remove ? true : false;

    if (options.projection) {
      cmd.fields = options.projection;
    }

    if (options.arrayFilters) {
      cmd.arrayFilters = options.arrayFilters;
    }

    if (options.maxTimeMS) {
      cmd.maxTimeMS = options.maxTimeMS;
    }

    // Decorate the findAndModify command with the write Concern
    if (options.writeConcern) {
      cmd.writeConcern = options.writeConcern;
    }

    // Have we specified bypassDocumentValidation
    if (options.bypassDocumentValidation === true) {
      cmd.bypassDocumentValidation = options.bypassDocumentValidation;
    }

    // Have we specified collation
    try {
      decorateWithCollation(cmd, coll, options);
    } catch (err) {
      return callback(err);
    }

    if (options.hint) {
      // TODO: once this method becomes a CommandOperation we will have the server
      // in place to check.
      const unacknowledgedWrite = this.writeConcern?.w === 0;
      if (unacknowledgedWrite || maxWireVersion(server) < 8) {
        callback(
          new MongoError('The current topology does not support a hint on findAndModify commands')
        );

        return;
      }

      cmd.hint = options.hint;
    }

    if (this.explain && maxWireVersion(server) < 4) {
      callback(new MongoError(`server ${server.name} does not support explain on findAndModify`));
      return;
    }

    // Execute the command
    super.executeCommand(server, session, cmd, (err, result) => {
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
  Aspect.EXPLAINABLE
]);
