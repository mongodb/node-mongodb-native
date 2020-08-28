import { emitDeprecatedOptionWarning } from './utils';
import { ReadPreference, ReadPreferenceLike } from './read_preference';
import { deprecate } from 'util';
import {
  normalizeHintField,
  decorateCommand,
  decorateWithCollation,
  decorateWithReadConcern,
  formattedOrderClause,
  checkCollectionName,
  deprecateOptions,
  MongoDBNamespace,
  Callback
} from './utils';
import { ObjectId, Document, BSONSerializeOptions } from './bson';
import { MongoError } from './error';
import { UnorderedBulkOperation } from './bulk/unordered';
import { OrderedBulkOperation } from './bulk/ordered';
import { ChangeStream, ChangeStreamOptions } from './change_stream';
import { WriteConcern, WriteConcernOptions } from './write_concern';
import { ReadConcern } from './read_concern';
import { AggregationCursor, CommandCursor, Cursor } from './cursor';
import { AggregateOperation, AggregateOptions } from './operations/aggregate';
import { BulkWriteOperation } from './operations/bulk_write';
import { CountDocumentsOperation, CountDocumentsOptions } from './operations/count_documents';
import {
  CreateIndexesOperation,
  CreateIndexOperation,
  DropIndexOperation,
  DropIndexesOperation,
  EnsureIndexOperation,
  IndexesOperation,
  IndexExistsOperation,
  IndexInformationOperation,
  ListIndexesOperation,
  CreateIndexesOptions,
  DropIndexesOptions,
  ListIndexesOptions,
  IndexSpecification,
  IndexDescription
} from './operations/indexes';
import { DistinctOperation, DistinctOptions } from './operations/distinct';
import { DropCollectionOperation, DropCollectionOptions } from './operations/drop';
import {
  EstimatedDocumentCountOperation,
  EstimatedDocumentCountOptions
} from './operations/estimated_document_count';
import { FindOperation, FindOptions, Sort } from './operations/find';
import { FindOneOperation } from './operations/find_one';
import {
  FindAndModifyOperation,
  FindOneAndDeleteOperation,
  FindOneAndReplaceOperation,
  FindOneAndUpdateOperation,
  FindAndModifyOptions
} from './operations/find_and_modify';
import { InsertManyOperation, InsertManyResult } from './operations/insert_many';
import { InsertOneOperation, InsertOneOptions, InsertOneResult } from './operations/insert';
import {
  UpdateOneOperation,
  UpdateManyOperation,
  UpdateOptions,
  UpdateResult
} from './operations/update';
import {
  DeleteOneOperation,
  DeleteManyOperation,
  DeleteOptions,
  DeleteResult
} from './operations/delete';
import { IsCappedOperation } from './operations/is_capped';
import {
  MapReduceOperation,
  MapFunction,
  ReduceFunction,
  MapReduceOptions
} from './operations/map_reduce';
import { OptionsOperation } from './operations/options_operation';
import { RenameOperation, RenameOptions } from './operations/rename';
import { ReplaceOneOperation, ReplaceOptions } from './operations/replace_one';
import { CollStatsOperation, CollStatsOptions } from './operations/stats';
import { executeOperation } from './operations/execute_operation';
import { EvalGroupOperation, GroupOperation } from './operations/group';
import type { Db } from './db';
import type { OperationOptions, Hint } from './operations/operation';
import type { IndexInformationOptions } from './operations/common_functions';
import type { CountOptions } from './operations/count';
import type { BulkWriteResult, BulkWriteOptions, AnyBulkWriteOperation } from './bulk/common';
import type { PkFactory } from './mongo_client';
import type { Topology } from './sdam/topology';
import type { Logger, LoggerOptions } from './logger';
import type { OperationParent } from './operations/command';

const mergeKeys = ['ignoreUndefined'];

/** @public */
export interface Collection {
  /** @deprecated Use {@link Collection.dropIndexes#Class} instead */
  dropAllIndexes(): void;
  removeMany(
    filter: Document,
    options?: DeleteOptions,
    callback?: Callback<DeleteResult>
  ): Promise<DeleteResult> | void;
  removeOne(
    filter: Document,
    options?: DeleteOptions,
    callback?: Callback<DeleteResult>
  ): Promise<DeleteResult> | void;
  findAndModify(this: any, query: any, sort: any, doc: any, options: any, callback: Callback): any;
}

/** @public */
export interface CollectionOptions
  extends BSONSerializeOptions,
    WriteConcernOptions,
    LoggerOptions {
  slaveOk?: boolean;
  /** Returns an error if the collection does not exist */
  strict?: boolean;
  /** Specify a read concern for the collection. (only MongoDB 3.2 or higher supported) */
  readConcern?: ReadConcern;
  /** The preferred read preference (ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST). */
  readPreference?: ReadPreferenceLike;
}

/** @internal */
export interface CollectionPrivate {
  pkFactory: PkFactory;
  db: Db;
  topology: Topology;
  options: any;
  namespace: MongoDBNamespace;
  readPreference?: ReadPreference;
  slaveOk?: boolean;
  serializeFunctions?: boolean;
  raw?: boolean;
  promoteLongs?: boolean;
  promoteValues?: boolean;
  promoteBuffers?: boolean;
  collectionHint?: Hint;
  readConcern?: ReadConcern;
  writeConcern?: WriteConcern;
}

/**
 * The **Collection** class is an internal class that embodies a MongoDB collection
 * allowing for insert/update/remove/find and other command operation on that MongoDB collection.
 *
 * **COLLECTION Cannot directly be instantiated**
 * @public
 *
 * @example
 * ```js
 * const MongoClient = require('mongodb').MongoClient;
 * const test = require('assert');
 * // Connection url
 * const url = 'mongodb://localhost:27017';
 * // Database Name
 * const dbName = 'test';
 * // Connect using MongoClient
 * MongoClient.connect(url, function(err, client) {
 *   // Create a collection we want to drop later
 *   const col = client.db(dbName).collection('createIndexExample1');
 *   // Show that duplicate records got dropped
 *   col.find({}).toArray(function(err, items) {
 *     expect(err).to.not.exist;
 *     test.equal(4, items.length);
 *     client.close();
 *   });
 * });
 * ```
 */
export class Collection implements OperationParent {
  /** @internal */
  s: CollectionPrivate;

  /** @internal Create a new Collection instance (INTERNAL TYPE, do not instantiate directly) */
  constructor(db: Db, name: string, options?: CollectionOptions) {
    checkCollectionName(name);
    emitDeprecatedOptionWarning(options, ['promiseLibrary']);

    // Internal state
    this.s = {
      db,
      options,
      topology: db.s.topology,
      namespace: new MongoDBNamespace(db.databaseName, name),
      pkFactory: db.options?.pkFactory
        ? db.options.pkFactory
        : ((ObjectId as unknown) as PkFactory), // TODO: remove when bson is typed
      readPreference: ReadPreference.fromOptions(options),
      readConcern: ReadConcern.fromOptions(options),
      writeConcern: WriteConcern.fromOptions(options),
      slaveOk: options == null || options.slaveOk == null ? db.slaveOk : options.slaveOk,
      serializeFunctions:
        options == null || options.serializeFunctions == null
          ? db.s.options?.serializeFunctions
          : options.serializeFunctions,
      raw: options == null || options.raw == null ? db.s.options?.raw : options.raw,
      promoteLongs:
        options == null || options.promoteLongs == null
          ? db.s.options?.promoteLongs
          : options.promoteLongs,
      promoteValues:
        options == null || options.promoteValues == null
          ? db.s.options?.promoteValues
          : options.promoteValues,
      promoteBuffers:
        options == null || options.promoteBuffers == null
          ? db.s.options?.promoteBuffers
          : options.promoteBuffers
    };
  }

  /**
   * The name of the database this collection belongs to
   */
  get dbName(): string {
    return this.s.namespace.db;
  }

  /**
   * The name of this collection
   */
  get collectionName(): string {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return this.s.namespace.collection!;
  }

  /**
   * The namespace of this collection, in the format `${this.dbName}.${this.collectionName}`
   */
  get namespace(): string {
    return this.s.namespace.toString();
  }

  /**
   * The current readConcern of the collection. If not explicitly defined for
   * this collection, will be inherited from the parent DB
   */
  get readConcern(): ReadConcern | undefined {
    if (this.s.readConcern == null) {
      return this.s.db.readConcern;
    }
    return this.s.readConcern;
  }

  /**
   * The current readPreference of the collection. If not explicitly defined for
   * this collection, will be inherited from the parent DB
   */
  get readPreference(): ReadPreference | undefined {
    if (this.s.readPreference == null) {
      return this.s.db.readPreference;
    }

    return this.s.readPreference;
  }

  /**
   * The current writeConcern of the collection. If not explicitly defined for
   * this collection, will be inherited from the parent DB
   */
  get writeConcern(): WriteConcern | undefined {
    if (this.s.writeConcern == null) {
      return this.s.db.writeConcern;
    }
    return this.s.writeConcern;
  }

  /** The current index hint for the collection */
  get hint(): Hint | undefined {
    return this.s.collectionHint;
  }

  set hint(v: Hint | undefined) {
    this.s.collectionHint = normalizeHintField(v);
  }

  /**
   * Inserts a single document into MongoDB. If documents passed in do not contain the **_id** field,
   * one will be added to each of the documents missing it by the driver, mutating the document. This behavior
   * can be overridden by setting the **forceServerObjectId** flag.
   *
   * @param doc - The document to insert
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  insertOne(doc: Document): Promise<InsertOneResult>;
  insertOne(doc: Document, callback: Callback<InsertOneResult>): void;
  insertOne(doc: Document, options: InsertOneOptions): Promise<InsertOneResult>;
  insertOne(doc: Document, options: InsertOneOptions, callback: Callback<InsertOneResult>): void;
  insertOne(
    doc: Document,
    options?: InsertOneOptions | Callback<InsertOneResult>,
    callback?: Callback<InsertOneResult>
  ): Promise<InsertOneResult> | void {
    if (typeof options === 'function') (callback = options), (options = {});
    options = options || {};

    // Add ignoreUndefined
    if (this.s.options.ignoreUndefined) {
      options = Object.assign({}, options);
      options.ignoreUndefined = this.s.options.ignoreUndefined;
    }

    return executeOperation(this.s.topology, new InsertOneOperation(this, doc, options), callback);
  }

  /**
   * Inserts an array of documents into MongoDB. If documents passed in do not contain the **_id** field,
   * one will be added to each of the documents missing it by the driver, mutating the document. This behavior
   * can be overridden by setting the **forceServerObjectId** flag.
   *
   * @param docs - The documents to insert
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  insertMany(docs: Document[]): Promise<InsertManyResult>;
  insertMany(docs: Document[], callback: Callback<InsertManyResult>): void;
  insertMany(docs: Document[], options: BulkWriteOptions): Promise<InsertManyResult>;
  insertMany(
    docs: Document[],
    options: BulkWriteOptions,
    callback: Callback<InsertManyResult>
  ): void;
  insertMany(
    docs: Document[],
    options?: BulkWriteOptions | Callback<InsertManyResult>,
    callback?: Callback<InsertManyResult>
  ): Promise<InsertManyResult> | void {
    if (typeof options === 'function') (callback = options), (options = {});
    options = options ? Object.assign({}, options) : { ordered: true };

    return executeOperation(
      this.s.topology,
      new InsertManyOperation(this, docs, options),
      callback
    );
  }

  /**
   * Perform a bulkWrite operation without a fluent API
   *
   * Legal operation types are
   *
   * ```js
   *  { insertOne: { document: { a: 1 } } }
   *
   *  { updateOne: { filter: {a:2}, update: {$set: {a:2}}, upsert:true } }
   *
   *  { updateMany: { filter: {a:2}, update: {$set: {a:2}}, upsert:true } }
   *
   *  { updateMany: { filter: {}, update: {$set: {"a.$[i].x": 5}}, arrayFilters: [{ "i.x": 5 }]} }
   *
   *  { deleteOne: { filter: {c:1} } }
   *
   *  { deleteMany: { filter: {c:1} } }
   *
   *  { replaceOne: { filter: {c:3}, replacement: {c:4}, upsert:true}}
   *```
   *
   * If documents passed in do not contain the **_id** field,
   * one will be added to each of the documents missing it by the driver, mutating the document. This behavior
   * can be overridden by setting the **forceServerObjectId** flag.
   *
   * @param operations - Bulk operations to perform
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   * @throws MongoError if operations is not an array
   */
  bulkWrite(operations: AnyBulkWriteOperation[]): Promise<BulkWriteResult>;
  bulkWrite(operations: AnyBulkWriteOperation[], callback: Callback<BulkWriteResult>): void;
  bulkWrite(
    operations: AnyBulkWriteOperation[],
    options: BulkWriteOptions
  ): Promise<BulkWriteResult>;
  bulkWrite(
    operations: AnyBulkWriteOperation[],
    options: BulkWriteOptions,
    callback: Callback<BulkWriteResult>
  ): void;
  bulkWrite(
    operations: AnyBulkWriteOperation[],
    options?: BulkWriteOptions | Callback<BulkWriteResult>,
    callback?: Callback<BulkWriteResult>
  ): Promise<BulkWriteResult> | void {
    if (typeof options === 'function') (callback = options), (options = {});
    options = options || { ordered: true };

    if (!Array.isArray(operations)) {
      throw new MongoError('operations must be an array of documents');
    }

    return executeOperation(
      this.s.topology,
      new BulkWriteOperation(this, operations, options),
      callback
    );
  }

  /**
   * Update a single document in a collection
   *
   * @param filter - The Filter used to select the document to update
   * @param update - The update operations to be applied to the document
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  updateOne(filter: Document, update: Document): Promise<UpdateResult>;
  updateOne(filter: Document, update: Document, callback: Callback<UpdateResult>): void;
  updateOne(filter: Document, update: Document, options: UpdateOptions): Promise<UpdateResult>;
  updateOne(
    filter: Document,
    update: Document,
    options: UpdateOptions,
    callback: Callback<UpdateResult>
  ): void;
  updateOne(
    filter: Document,
    update: Document,
    options?: UpdateOptions | Callback<UpdateResult>,
    callback?: Callback<UpdateResult>
  ): Promise<UpdateResult> | void {
    if (typeof options === 'function') (callback = options), (options = {});
    options = Object.assign({}, options);

    // Add ignoreUndefined
    if (this.s.options.ignoreUndefined) {
      options = Object.assign({}, options);
      options.ignoreUndefined = this.s.options.ignoreUndefined;
    }

    return executeOperation(
      this.s.topology,
      new UpdateOneOperation(this, filter, update, options),
      callback
    );
  }

  /**
   * Replace a document in a collection with another document
   *
   * @param filter - The Filter used to select the document to replace
   * @param replacement - The Document that replaces the matching document
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  replaceOne(filter: Document, replacement: Document): Promise<UpdateResult>;
  replaceOne(filter: Document, replacement: Document, callback: Callback<UpdateResult>): void;
  replaceOne(
    filter: Document,
    replacement: Document,
    options: ReplaceOptions
  ): Promise<UpdateResult>;
  replaceOne(
    filter: Document,
    replacement: Document,
    options: ReplaceOptions,
    callback: Callback<UpdateResult>
  ): void;
  replaceOne(
    filter: Document,
    replacement: Document,
    options?: ReplaceOptions | Callback<UpdateResult>,
    callback?: Callback<UpdateResult>
  ): Promise<UpdateResult> | void {
    if (typeof options === 'function') (callback = options), (options = {});
    options = Object.assign({}, options);

    // Add ignoreUndefined
    if (this.s.options.ignoreUndefined) {
      options = Object.assign({}, options);
      options.ignoreUndefined = this.s.options.ignoreUndefined;
    }

    return executeOperation(
      this.s.topology,
      new ReplaceOneOperation(this, filter, replacement, options),
      callback
    );
  }

  /**
   * Update multiple documents in a collection
   *
   * @param filter - The Filter used to select the documents to update
   * @param update - The update operations to be applied to the documents
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  updateMany(filter: Document, update: Document): Promise<UpdateResult>;
  updateMany(filter: Document, update: Document, callback: Callback<UpdateResult>): void;
  updateMany(filter: Document, update: Document, options: UpdateOptions): Promise<UpdateResult>;
  updateMany(
    filter: Document,
    update: Document,
    options: UpdateOptions,
    callback: Callback<UpdateResult>
  ): void;
  updateMany(
    filter: Document,
    update: Document,
    options?: UpdateOptions | Callback<UpdateResult>,
    callback?: Callback<UpdateResult>
  ): Promise<UpdateResult> | void {
    if (typeof options === 'function') (callback = options), (options = {});
    options = Object.assign({}, options);

    // Add ignoreUndefined
    if (this.s.options.ignoreUndefined) {
      options = Object.assign({}, options);
      options.ignoreUndefined = this.s.options.ignoreUndefined;
    }

    return executeOperation(
      this.s.topology,
      new UpdateManyOperation(this, filter, update, options),
      callback
    );
  }

  /**
   * Delete a document from a collection
   *
   * @param filter - The Filter used to select the document to remove
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  deleteOne(filter: Document): Promise<DeleteResult>;
  deleteOne(filter: Document, callback: Callback<DeleteResult>): void;
  deleteOne(filter: Document, options: DeleteOptions): Promise<DeleteResult>;
  deleteOne(filter: Document, options: DeleteOptions, callback?: Callback<DeleteResult>): void;
  deleteOne(
    filter: Document,
    options?: DeleteOptions | Callback<DeleteResult>,
    callback?: Callback<DeleteResult>
  ): Promise<DeleteResult> | void {
    if (typeof options === 'function') (callback = options), (options = {});
    options = Object.assign({}, options);

    // Add ignoreUndefined
    if (this.s.options.ignoreUndefined) {
      options = Object.assign({}, options);
      options.ignoreUndefined = this.s.options.ignoreUndefined;
    }

    return executeOperation(
      this.s.topology,
      new DeleteOneOperation(this, filter, options),
      callback
    );
  }

  /**
   * Delete multiple documents from a collection
   *
   * @param filter - The Filter used to select the documents to remove
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  deleteMany(filter: Document): Promise<DeleteResult>;
  deleteMany(filter: Document, callback: Callback<DeleteResult>): void;
  deleteMany(filter: Document, options: DeleteOptions): Promise<DeleteResult>;
  deleteMany(filter: Document, options: DeleteOptions, callback: Callback<DeleteResult>): void;
  deleteMany(
    filter: Document,
    options?: DeleteOptions | Callback<DeleteResult>,
    callback?: Callback<DeleteResult>
  ): Promise<DeleteResult> | void {
    if (filter == null) {
      filter = {};
      options = {};
      callback = undefined;
    } else if (typeof filter === 'function') {
      callback = filter as Callback<DeleteResult>;
      filter = {};
      options = {};
    } else if (typeof options === 'function') {
      callback = options;
      options = {};
    }

    options = Object.assign({}, options);

    // Add ignoreUndefined
    if (this.s.options.ignoreUndefined) {
      options = Object.assign({}, options);
      options.ignoreUndefined = this.s.options.ignoreUndefined;
    }

    return executeOperation(
      this.s.topology,
      new DeleteManyOperation(this, filter, options),
      callback
    );
  }

  /**
   * Rename the collection.
   *
   * @param newName - New name of of the collection.
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  rename(newName: string): Promise<Collection>;
  rename(newName: string, callback: Callback<Collection>): void;
  rename(newName: string, options: RenameOptions): Promise<Collection> | void;
  rename(newName: string, options: RenameOptions, callback: Callback<Collection>): void;
  rename(
    newName: string,
    options?: RenameOptions | Callback<Collection>,
    callback?: Callback<Collection>
  ): Promise<Collection> | void {
    if (typeof options === 'function') (callback = options), (options = {});
    options = Object.assign({}, options, { readPreference: ReadPreference.PRIMARY });

    return executeOperation(this.s.topology, new RenameOperation(this, newName, options), callback);
  }

  /**
   * Drop the collection from the database, removing it permanently. New accesses will create a new collection.
   *
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  drop(): Promise<boolean>;
  drop(callback: Callback<boolean>): void;
  drop(options: DropCollectionOptions): Promise<boolean>;
  drop(options: DropCollectionOptions, callback: Callback<boolean>): void;
  drop(
    options?: DropCollectionOptions | Callback<boolean>,
    callback?: Callback<boolean>
  ): Promise<boolean> | void {
    if (typeof options === 'function') (callback = options), (options = {});
    options = options || {};

    return executeOperation(
      this.s.topology,
      new DropCollectionOperation(this.s.db, this.collectionName, options),
      callback
    );
  }

  /**
   * Fetches the first document that matches the query
   *
   * @param query - Query for find Operation
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  findOne(): Promise<Document>;
  findOne(callback: Callback<Document>): void;
  findOne(query: Document): Promise<Document>;
  findOne(query: Document, callback?: Callback<Document>): void;
  findOne(query: Document, options: FindOptions): Promise<Document>;
  findOne(query: Document, options: FindOptions, callback: Callback<Document>): void;
  findOne(
    query?: Document | Callback<Document>,
    options?: FindOptions | Callback<Document>,
    callback?: Callback<Document>
  ): Promise<Document> | void {
    if (callback !== undefined && typeof callback !== 'function') {
      throw new TypeError('Third parameter to `findOne()` must be a callback or undefined');
    }

    if (typeof query === 'function')
      (callback = query as Callback<Document>), (query = {}), (options = {});
    if (typeof options === 'function') (callback = options), (options = {});
    query = query || {};
    options = options || {};

    return executeOperation(this.s.topology, new FindOneOperation(this, query, options), callback);
  }

  /**
   * Creates a cursor for a query that can be used to iterate over results from MongoDB
   *
   * @param query - The cursor query object.
   * @param options - Optional settings for the command
   */
  find(): Cursor;
  find(query: Document): Cursor;
  find(query: Document, options: FindOptions): Cursor;
  find(query?: Document, options?: FindOptions): Cursor {
    if (arguments.length > 2) {
      throw new TypeError('Third parameter to `collection.find()` must be undefined');
    }
    if (typeof query === 'function') {
      throw new TypeError('`query` parameter must not be function');
    }
    if (typeof options === 'function') {
      throw new TypeError('`options` parameter must not be function');
    }

    let selector =
      query !== null && typeof query === 'object' && Array.isArray(query) === false ? query : {};

    // Validate correctness off the selector
    const object = selector;
    if (Buffer.isBuffer(object)) {
      const object_size = object[0] | (object[1] << 8) | (object[2] << 16) | (object[3] << 24);
      if (object_size !== object.length) {
        const error = new Error(
          'query selector raw message size does not match message header size [' +
            object.length +
            '] != [' +
            object_size +
            ']'
        );
        error.name = 'MongoError';
        throw error;
      }
    }

    // Check special case where we are using an objectId
    if (selector != null && selector._bsontype === 'ObjectID') {
      selector = { _id: selector };
    }

    if (!options) {
      options = {};
    }

    let projection = options.projection || options.fields;

    if (projection && !Buffer.isBuffer(projection) && Array.isArray(projection)) {
      projection = projection.length
        ? projection.reduce((result, field) => {
            result[field] = 1;
            return result;
          }, {})
        : { _id: 1 };
    }

    // Make a shallow copy of options
    const newOptions: Document = Object.assign({}, options);

    // Make a shallow copy of the collection options
    for (const key in this.s.options) {
      if (mergeKeys.indexOf(key) !== -1) {
        newOptions[key] = this.s.options[key];
      }
    }

    // Unpack options
    newOptions.skip = options.skip ? options.skip : 0;
    newOptions.limit = options.limit ? options.limit : 0;
    newOptions.raw = typeof options.raw === 'boolean' ? options.raw : this.s.raw;
    newOptions.hint =
      options.hint != null ? normalizeHintField(options.hint) : this.s.collectionHint;
    newOptions.timeout = typeof options.timeout === 'undefined' ? undefined : options.timeout;
    // // If we have overridden slaveOk otherwise use the default db setting
    newOptions.slaveOk = options.slaveOk != null ? options.slaveOk : this.s.db.slaveOk;

    // Add read preference if needed
    newOptions.readPreference = ReadPreference.resolve(this, newOptions);

    // Set slave ok to true if read preference different from primary
    if (
      newOptions.readPreference != null &&
      (newOptions.readPreference !== 'primary' || newOptions.readPreference.mode !== 'primary')
    ) {
      newOptions.slaveOk = true;
    }

    // Ensure the query is an object
    if (selector != null && typeof selector !== 'object') {
      throw new MongoError('query selector must be an object');
    }

    // Build the find command
    const findCommand: Document = {
      find: this.s.namespace.toString(),
      limit: newOptions.limit,
      skip: newOptions.skip,
      query: selector
    };

    if (typeof options.allowDiskUse === 'boolean') {
      findCommand.allowDiskUse = options.allowDiskUse;
    }

    // Ensure we use the right await data option
    if (typeof newOptions.awaitdata === 'boolean') {
      newOptions.awaitData = newOptions.awaitdata;
    }

    // Translate to new command option noCursorTimeout
    if (typeof newOptions.timeout === 'boolean') newOptions.noCursorTimeout = newOptions.timeout;

    decorateCommand(findCommand, newOptions, ['session', 'collation']);

    if (projection) findCommand.fields = projection;

    // Add db object to the new options
    newOptions.db = this.s.db;

    // Set raw if available at collection level
    if (newOptions.raw == null && typeof this.s.raw === 'boolean') newOptions.raw = this.s.raw;
    // Set promoteLongs if available at collection level
    if (newOptions.promoteLongs == null && typeof this.s.promoteLongs === 'boolean')
      newOptions.promoteLongs = this.s.promoteLongs;
    if (newOptions.promoteValues == null && typeof this.s.promoteValues === 'boolean')
      newOptions.promoteValues = this.s.promoteValues;
    if (newOptions.promoteBuffers == null && typeof this.s.promoteBuffers === 'boolean')
      newOptions.promoteBuffers = this.s.promoteBuffers;

    // Sort options
    if (findCommand.sort) {
      findCommand.sort = formattedOrderClause(findCommand.sort);
    }

    // Set the readConcern
    decorateWithReadConcern(findCommand, this, options);

    // Decorate find command with collation options

    decorateWithCollation(findCommand, this, options);

    const cursor = new Cursor(
      this.s.topology,
      new FindOperation(this, this.s.namespace, findCommand, newOptions),
      newOptions
    );

    return cursor;
  }

  /**
   * Returns the options of the collection.
   *
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  options(): Promise<Document>;
  options(callback: Callback<Document>): void;
  options(options: OperationOptions): Promise<Document>;
  options(options: OperationOptions, callback: Callback<Document>): void;
  options(
    options?: OperationOptions | Callback<Document>,
    callback?: Callback<Document>
  ): Promise<Document> | void {
    if (typeof options === 'function') (callback = options), (options = {});
    options = options || {};

    return executeOperation(this.s.topology, new OptionsOperation(this, options), callback);
  }

  /**
   * Returns if the collection is a capped collection
   *
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  isCapped(): Promise<boolean>;
  isCapped(callback: Callback<boolean>): void;
  isCapped(options: OperationOptions): Promise<boolean>;
  isCapped(options: OperationOptions, callback: Callback<boolean>): void;
  isCapped(
    options?: OperationOptions | Callback<boolean>,
    callback?: Callback<boolean>
  ): Promise<boolean> | void {
    if (typeof options === 'function') (callback = options), (options = {});
    options = options || {};

    return executeOperation(this.s.topology, new IsCappedOperation(this, options), callback);
  }

  /**
   * Creates an index on the db and collection collection.
   *
   * @param indexSpec - The field name or index specification to create an index for
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   *
   * @example
   * ```js
   * const collection = client.db('foo').collection('bar');
   *
   * await collection.createIndex({ a: 1, b: -1 });
   *
   * // Alternate syntax for { c: 1, d: -1 } that ensures order of indexes
   * await collection.createIndex([ [c, 1], [d, -1] ]);
   *
   * // Equivalent to { e: 1 }
   * await collection.createIndex('e');
   *
   * // Equivalent to { f: 1, g: 1 }
   * await collection.createIndex(['f', 'g'])
   *
   * // Equivalent to { h: 1, i: -1 }
   * await collection.createIndex([ { h: 1 }, { i: -1 } ]);
   *
   * // Equivalent to { j: 1, k: -1, l: 2d }
   * await collection.createIndex(['j', ['k', -1], { l: '2d' }])
   * ```
   */
  createIndex(indexSpec: IndexSpecification): Promise<Document>;
  createIndex(indexSpec: IndexSpecification, callback: Callback<Document>): void;
  createIndex(indexSpec: IndexSpecification, options: CreateIndexesOptions): Promise<Document>;
  createIndex(
    indexSpec: IndexSpecification,
    options: CreateIndexesOptions,
    callback: Callback<Document>
  ): void;
  createIndex(
    indexSpec: IndexSpecification,
    options?: CreateIndexesOptions | Callback<Document>,
    callback?: Callback<Document>
  ): Promise<Document> | void {
    if (typeof options === 'function') (callback = options), (options = {});
    options = options || {};

    return executeOperation(
      this.s.topology,
      new CreateIndexOperation(this, this.collectionName, indexSpec, options),
      callback
    );
  }

  /**
   * Creates multiple indexes in the collection, this method is only supported for
   * MongoDB 2.6 or higher. Earlier version of MongoDB will throw a command not supported
   * error.
   *
   * **Note**: Unlike {@link (Collection:class).createIndex| createIndex}, this function takes in raw index specifications.
   * Index specifications are defined {@link http://docs.mongodb.org/manual/reference/command/createIndexes/| here}.
   *
   * @param indexSpecs - An array of index specifications to be created
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   *
   * @example
   * ```js
   * const collection = client.db('foo').collection('bar');
   * await collection.createIndexes([
   *   // Simple index on field fizz
   *   {
   *     key: { fizz: 1 },
   *   }
   *   // wildcard index
   *   {
   *     key: { '$**': 1 }
   *   },
   *   // named index on darmok and jalad
   *   {
   *     key: { darmok: 1, jalad: -1 }
   *     name: 'tanagra'
   *   }
   * ]);
   * ```
   */
  createIndexes(indexSpecs: IndexDescription[]): Promise<Document>;
  createIndexes(indexSpecs: IndexDescription[], callback: Callback<Document>): void;
  createIndexes(indexSpecs: IndexDescription[], options: CreateIndexesOptions): Promise<Document>;
  createIndexes(
    indexSpecs: IndexDescription[],
    options: CreateIndexesOptions,
    callback: Callback<Document>
  ): void;
  createIndexes(
    indexSpecs: IndexDescription[],
    options?: CreateIndexesOptions | Callback<Document>,
    callback?: Callback<Document>
  ): Promise<Document> | void {
    if (typeof options === 'function') (callback = options), (options = {});
    options = options ? Object.assign({}, options) : {};
    if (typeof options.maxTimeMS !== 'number') delete options.maxTimeMS;

    return executeOperation(
      this.s.topology,
      new CreateIndexesOperation(this, this.collectionName, indexSpecs, options),
      callback
    );
  }

  /**
   * Drops an index from this collection.
   *
   * @param indexName - Name of the index to drop.
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  dropIndex(indexName: string): Promise<Document>;
  dropIndex(indexName: string, callback: Callback<Document>): void;
  dropIndex(indexName: string, options: DropIndexesOptions): Promise<Document>;
  dropIndex(indexName: string, options: DropIndexesOptions, callback: Callback<Document>): void;
  dropIndex(
    indexName: string,
    options?: DropIndexesOptions | Callback<Document>,
    callback?: Callback<Document>
  ): Promise<Document> | void {
    if (typeof options === 'function') (callback = options), (options = {});
    options = options || {};

    // Run only against primary
    options.readPreference = ReadPreference.primary;

    return executeOperation(
      this.s.topology,
      new DropIndexOperation(this, indexName, options),
      callback
    );
  }

  /**
   * Drops all indexes from this collection.
   *
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  dropIndexes(): Promise<Document>;
  dropIndexes(callback: Callback<Document>): void;
  dropIndexes(options: DropIndexesOptions): Promise<Document>;
  dropIndexes(options: DropIndexesOptions, callback: Callback<Document>): void;
  dropIndexes(
    options?: DropIndexesOptions | Callback<Document>,
    callback?: Callback<Document>
  ): Promise<Document> | void {
    if (typeof options === 'function') (callback = options), (options = {});
    options = options ? Object.assign({}, options) : {};

    return executeOperation(this.s.topology, new DropIndexesOperation(this, options), callback);
  }

  /**
   * Get the list of all indexes information for the collection.
   *
   * @param options - Optional settings for the command
   */
  listIndexes(options?: ListIndexesOptions): CommandCursor {
    const cursor = new CommandCursor(
      this.s.topology,
      new ListIndexesOperation(this, options),
      options
    );

    return cursor;
  }

  /**
   * Checks if one or more indexes exist on the collection, fails on first non-existing index
   *
   * @param indexes - One or more index names to check.
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  indexExists(indexes: string | string[]): Promise<boolean>;
  indexExists(indexes: string | string[], callback: Callback<boolean>): void;
  indexExists(indexes: string | string[], options: IndexInformationOptions): Promise<boolean>;
  indexExists(
    indexes: string | string[],
    options: IndexInformationOptions,
    callback: Callback<boolean>
  ): void;
  indexExists(
    indexes: string | string[],
    options?: IndexInformationOptions | Callback<boolean>,
    callback?: Callback<boolean>
  ): Promise<boolean> | void {
    if (typeof options === 'function') (callback = options), (options = {});
    options = options || {};

    return executeOperation(
      this.s.topology,
      new IndexExistsOperation(this, indexes, options),
      callback
    );
  }

  /**
   * Retrieves this collections index info.
   *
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  indexInformation(): Promise<Document>;
  indexInformation(callback: Callback<Document>): void;
  indexInformation(options: IndexInformationOptions): Promise<Document>;
  indexInformation(options: IndexInformationOptions, callback: Callback<Document>): void;
  indexInformation(
    options?: IndexInformationOptions | Callback<Document>,
    callback?: Callback<Document>
  ): Promise<Document> | void {
    if (typeof options === 'function') (callback = options), (options = {});
    options = options || {};

    return executeOperation(
      this.s.topology,
      new IndexInformationOperation(this.s.db, this.collectionName, options),
      callback
    );
  }

  /**
   * Gets an estimate of the count of documents in a collection using collection metadata.
   *
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  estimatedDocumentCount(): Promise<number>;
  estimatedDocumentCount(callback: Callback<number>): void;
  estimatedDocumentCount(options: EstimatedDocumentCountOptions): Promise<number>;
  estimatedDocumentCount(options: EstimatedDocumentCountOptions, callback: Callback<number>): void;
  estimatedDocumentCount(
    options?: EstimatedDocumentCountOptions | Callback<number>,
    callback?: Callback<number>
  ): Promise<number> | void {
    if (typeof options === 'function') (callback = options), (options = {});
    options = options || {};

    return executeOperation(
      this.s.topology,
      new EstimatedDocumentCountOperation(this, options),
      callback
    );
  }

  /**
   * Gets the number of documents matching the filter.
   * For a fast count of the total documents in a collection see {@link Collection.estimatedDocumentCount| estimatedDocumentCount}.
   * **Note**: When migrating from {@link Collection.count| count} to {@link Collection.countDocuments| countDocuments}
   * the following query operators must be replaced:
   *
   * | Operator | Replacement |
   * | -------- | ----------- |
   * | `$where`   | [`$expr`][1] |
   * | `$near`    | [`$geoWithin`][2] with [`$center`][3] |
   * | `$nearSphere` | [`$geoWithin`][2] with [`$centerSphere`][4] |
   *
   * [1]: https://docs.mongodb.com/manual/reference/operator/query/expr/
   * [2]: https://docs.mongodb.com/manual/reference/operator/query/geoWithin/
   * [3]: https://docs.mongodb.com/manual/reference/operator/query/center/#op._S_center
   * [4]: https://docs.mongodb.com/manual/reference/operator/query/centerSphere/#op._S_centerSphere
   *
   * @param query - The query for the count
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   *
   * @see https://docs.mongodb.com/manual/reference/operator/query/expr/
   * @see https://docs.mongodb.com/manual/reference/operator/query/geoWithin/
   * @see https://docs.mongodb.com/manual/reference/operator/query/center/#op._S_center
   * @see https://docs.mongodb.com/manual/reference/operator/query/centerSphere/#op._S_centerSphere
   */
  countDocuments(): Promise<number>;
  countDocuments(callback: Callback<number>): void;
  countDocuments(query: Document): Promise<number>;
  countDocuments(callback: Callback<number>): void;
  countDocuments(query: Document, options: CountDocumentsOptions): Promise<number>;
  countDocuments(query: Document, options: CountDocumentsOptions, callback: Callback<number>): void;
  countDocuments(
    query?: Document | CountDocumentsOptions | Callback<number>,
    options?: CountDocumentsOptions | Callback<number>,
    callback?: Callback<number>
  ): Promise<number> | void {
    if (typeof query === 'undefined') {
      (query = {}), (options = {}), (callback = undefined);
    } else if (typeof query === 'function') {
      (callback = query as Callback<number>), (query = {}), (options = {});
    } else {
      if (arguments.length === 2) {
        if (typeof options === 'function') (callback = options), (options = {});
      }
    }

    query = query || {};
    options = options || {};
    return executeOperation(
      this.s.topology,
      new CountDocumentsOperation(this, query as Document, options as CountDocumentsOptions),
      callback
    );
  }

  /**
   * The distinct command returns a list of distinct values for the given key across a collection.
   *
   * @param key - Field of the document to find distinct values for
   * @param query - The query for filtering the set of documents to which we apply the distinct filter.
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  distinct(key: string): Promise<Document[]>;
  distinct(key: string, callback: Callback<Document[]>): void;
  distinct(key: string, query: Document): Promise<Document[]>;
  distinct(key: string, query: Document, callback: Callback<Document[]>): void;
  distinct(key: string, query: Document, options: DistinctOptions): Promise<Document[]>;
  distinct(
    key: string,
    query: Document,
    options: DistinctOptions,
    callback: Callback<Document[]>
  ): void;
  distinct(
    key: string,
    query?: Document | DistinctOptions | Callback<Document[]>,
    options?: DistinctOptions | Callback<Document[]>,
    callback?: Callback<Document[]>
  ): Promise<Document[]> | void {
    if (typeof query === 'function') {
      (callback = query as Callback<Document[]>), (query = {}), (options = {});
    } else {
      if (arguments.length === 3 && typeof options === 'function') {
        (callback = options), (options = {});
      }
    }

    query = query || {};
    options = options || {};
    return executeOperation(
      this.s.topology,
      new DistinctOperation(this, key, query as Document, options as DistinctOptions),
      callback
    );
  }

  /**
   * Retrieve all the indexes on the collection.
   *
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  indexes(): Promise<Document>;
  indexes(callback: Callback<Document>): void;
  indexes(options: IndexInformationOptions): Promise<Document>;
  indexes(options: IndexInformationOptions, callback: Callback<Document>): void;
  indexes(
    options?: IndexInformationOptions | Callback<Document>,
    callback?: Callback<Document>
  ): Promise<Document> | void {
    if (typeof options === 'function') (callback = options), (options = {});
    options = options || {};

    return executeOperation(this.s.topology, new IndexesOperation(this, options), callback);
  }

  /**
   * Get all the collection statistics.
   *
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  stats(): Promise<Document>;
  stats(callback: Callback<Document>): void;
  stats(options: CollStatsOptions): Promise<Document>;
  stats(options: CollStatsOptions, callback: Callback<Document>): void;
  stats(
    options?: CollStatsOptions | Callback<Document>,
    callback?: Callback<Document>
  ): Promise<Document> | void {
    if (typeof options === 'function') (callback = options), (options = {});
    options = options || {};

    return executeOperation(this.s.topology, new CollStatsOperation(this, options), callback);
  }

  /**
   * Find a document and delete it in one atomic operation. Requires a write lock for the duration of the operation.
   *
   * @param filter - The Filter used to select the document to remove
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  findOneAndDelete(filter: Document): Promise<Document>;
  findOneAndDelete(filter: Document, callback: Callback<Document>): void;
  findOneAndDelete(filter: Document, options: FindAndModifyOptions): Promise<Document>;
  findOneAndDelete(
    filter: Document,
    options: FindAndModifyOptions,
    callback: Callback<Document>
  ): void;
  findOneAndDelete(
    filter: Document,
    options?: FindAndModifyOptions | Callback<Document>,
    callback?: Callback<Document>
  ): Promise<Document> | void {
    if (typeof options === 'function') (callback = options), (options = {});
    options = options || {};

    return executeOperation(
      this.s.topology,
      new FindOneAndDeleteOperation(this, filter, options),
      callback
    );
  }

  /**
   * Find a document and replace it in one atomic operation. Requires a write lock for the duration of the operation.
   *
   * @param filter - The Filter used to select the document to replace
   * @param replacement - The Document that replaces the matching document
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  findOneAndReplace(filter: Document, replacement: Document): Promise<Document>;
  findOneAndReplace(filter: Document, replacement: Document, callback: Callback<Document>): void;
  findOneAndReplace(
    filter: Document,
    replacement: Document,
    options: FindAndModifyOptions
  ): Promise<Document>;
  findOneAndReplace(
    filter: Document,
    replacement: Document,
    options: FindAndModifyOptions,
    callback: Callback<Document>
  ): void;
  findOneAndReplace(
    filter: Document,
    replacement: Document,
    options?: FindAndModifyOptions | Callback<Document>,
    callback?: Callback<Document>
  ): Promise<Document> | void {
    if (typeof options === 'function') (callback = options), (options = {});
    options = options || {};

    return executeOperation(
      this.s.topology,
      new FindOneAndReplaceOperation(this, filter, replacement, options),
      callback
    );
  }

  /**
   * Find a document and update it in one atomic operation. Requires a write lock for the duration of the operation.
   *
   * @param filter - The Filter used to select the document to update
   * @param update - Update operations to be performed on the document
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  findOneAndUpdate(filter: Document, update: Document): Promise<Document>;
  findOneAndUpdate(filter: Document, update: Document, callback: Callback<Document>): void;
  findOneAndUpdate(
    filter: Document,
    update: Document,
    options: FindAndModifyOptions
  ): Promise<Document>;
  findOneAndUpdate(
    filter: Document,
    update: Document,
    options: FindAndModifyOptions,
    callback: Callback<Document>
  ): void;
  findOneAndUpdate(
    filter: Document,
    update: Document,
    options?: FindAndModifyOptions | Callback<Document>,
    callback?: Callback<Document>
  ): Promise<Document> | void {
    if (typeof options === 'function') (callback = options), (options = {});
    options = options || {};

    return executeOperation(
      this.s.topology,
      new FindOneAndUpdateOperation(this, filter, update, options),
      callback
    );
  }

  /**
   * Execute an aggregation framework pipeline against the collection, needs MongoDB \>= 2.2
   *
   * @param pipeline - An array of aggregation pipelines to execute
   * @param options - Optional settings for the command
   */
  aggregate(pipeline: Document[] = [], options?: AggregateOptions): AggregationCursor {
    if (arguments.length > 2) {
      throw new TypeError('Third parameter to `collection.aggregate()` must be undefined');
    }
    if (!Array.isArray(pipeline)) {
      throw new TypeError('`pipeline` parameter must be an array of aggregation stages');
    }
    if (typeof options === 'function') {
      throw new TypeError('`options` parameter must not be function');
    }

    options = options || {};
    return new AggregationCursor(
      this.s.topology,
      new AggregateOperation(this, pipeline, options),
      options
    );
  }

  /**
   * Create a new Change Stream, watching for new changes (insertions, updates, replacements, deletions, and invalidations) in this collection.
   *
   * @since 3.0.0
   * @param pipeline - An array of {@link https://docs.mongodb.com/manual/reference/operator/aggregation-pipeline/|aggregation pipeline stages} through which to pass change stream documents. This allows for filtering (using $match) and manipulating the change stream documents.
   * @param options - Optional settings for the command
   */
  watch(): ChangeStream;
  watch(pipeline?: Document[]): ChangeStream;
  watch(pipeline?: Document[], options?: ChangeStreamOptions): ChangeStream {
    pipeline = pipeline || [];
    options = options || {};

    // Allow optionally not specifying a pipeline
    if (!Array.isArray(pipeline)) {
      options = pipeline;
      pipeline = [];
    }

    return new ChangeStream(this, pipeline, options);
  }

  /**
   * Run Map Reduce across a collection. Be aware that the inline option for out will return an array of results not a collection.
   *
   * @param map - The mapping function.
   * @param reduce - The reduce function.
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  mapReduce(
    map: string | MapFunction,
    reduce: string | ReduceFunction
  ): Promise<Document | Document[]>;
  mapReduce(
    map: string | MapFunction,
    reduce: string | ReduceFunction,
    callback: Callback<Document | Document[]>
  ): void;
  mapReduce(
    map: string | MapFunction,
    reduce: string | ReduceFunction,
    options: MapReduceOptions
  ): Promise<Document | Document[]>;
  mapReduce(
    map: string | MapFunction,
    reduce: string | ReduceFunction,
    options: MapReduceOptions,
    callback: Callback<Document | Document[]>
  ): void;
  mapReduce(
    map: string | MapFunction,
    reduce: string | ReduceFunction,
    options?: MapReduceOptions | Callback<Document | Document[]>,
    callback?: Callback<Document | Document[]>
  ): Promise<Document | Document[]> | void {
    if ('function' === typeof options) (callback = options), (options = {});
    // Out must always be defined (make sure we don't break weirdly on pre 1.8+ servers)
    if (options?.out == null) {
      throw new Error(
        'the out option parameter must be defined, see mongodb docs for possible values'
      );
    }

    if ('function' === typeof map) {
      map = map.toString();
    }

    if ('function' === typeof reduce) {
      reduce = reduce.toString();
    }

    if ('function' === typeof options.finalize) {
      options.finalize = options.finalize.toString();
    }

    return executeOperation(
      this.s.topology,
      new MapReduceOperation(this, map, reduce, options),
      callback
    );
  }

  /** Initiate an Out of order batch write operation. All operations will be buffered into insert/update/remove commands executed out of order. */
  initializeUnorderedBulkOp(options?: BulkWriteOptions): any {
    options = options || {};
    // Give function's options precedence over session options.
    if (options.ignoreUndefined == null) {
      options.ignoreUndefined = this.s.options.ignoreUndefined;
    }

    return new UnorderedBulkOperation(this, options);
  }

  /** Initiate an In order bulk write operation. Operations will be serially executed in the order they are added, creating a new operation for each switch in types. */
  initializeOrderedBulkOp(options?: BulkWriteOptions): any {
    options = options || {};
    // Give function's options precedence over session's options.
    if (options.ignoreUndefined == null) {
      options.ignoreUndefined = this.s.options.ignoreUndefined;
    }

    return new OrderedBulkOperation(this, options);
  }

  /** Get the db scoped logger */
  getLogger(): Logger {
    return this.s.db.s.logger;
  }

  get logger(): Logger {
    return this.s.db.s.logger;
  }

  /**
   * Inserts a single document or a an array of documents into MongoDB. If documents passed in do not contain the **_id** field,
   * one will be added to each of the documents missing it by the driver, mutating the document. This behavior
   * can be overridden by setting the **forceServerObjectId** flag.
   *
   * @deprecated Use insertOne, insertMany or bulkWrite instead.
   * @param docs - The documents to insert
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  insert(
    docs: Document[],
    options: BulkWriteOptions,
    callback: Callback<InsertManyResult>
  ): Promise<InsertManyResult> | void {
    if (typeof options === 'function') (callback = options), (options = {});
    options = options || { ordered: false };
    docs = !Array.isArray(docs) ? [docs] : docs;

    if (options.keepGoing === true) {
      options.ordered = false;
    }

    return this.insertMany(docs, options, callback);
  }

  /**
   * Updates documents.
   *
   * @deprecated use updateOne, updateMany or bulkWrite
   * @param selector - The selector for the update operation.
   * @param update - The update operations to be applied to the documents
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  update(
    selector: Document,
    update: Document,
    options: UpdateOptions,
    callback: Callback<Document>
  ): Promise<UpdateResult> | void {
    if (typeof options === 'function') (callback = options), (options = {});
    options = options || {};

    // Add ignoreUndefined
    if (this.s.options.ignoreUndefined) {
      options = Object.assign({}, options);
      options.ignoreUndefined = this.s.options.ignoreUndefined;
    }

    return this.updateMany(selector, update, options, callback);
  }

  /**
   * Remove documents.
   *
   * @deprecated use deleteOne, deleteMany or bulkWrite
   * @param selector - The selector for the update operation.
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  remove(
    selector: Document,
    options: DeleteOptions,
    callback: Callback
  ): Promise<DeleteResult> | void {
    if (typeof options === 'function') (callback = options), (options = {});
    options = options || {};

    // Add ignoreUndefined
    if (this.s.options.ignoreUndefined) {
      options = Object.assign({}, options);
      options.ignoreUndefined = this.s.options.ignoreUndefined;
    }

    return this.deleteMany(selector, options, callback);
  }

  /**
   * Ensures that an index exists, if it does not it creates it
   *
   * @deprecated use createIndexes instead
   * @param fieldOrSpec - Defines the index.
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  ensureIndex(
    fieldOrSpec: string | Document,
    options: CreateIndexesOptions,
    callback: Callback<Document>
  ): Promise<Document> | void {
    if (typeof options === 'function') (callback = options), (options = {});
    options = options || {};

    return executeOperation(
      this.s.topology,
      new EnsureIndexOperation(this.s.db, this.collectionName, fieldOrSpec, options),
      callback
    );
  }

  /**
   * An estimated count of matching documents in the db to a query.
   *
   * **NOTE:** This method has been deprecated, since it does not provide an accurate count of the documents
   * in a collection. To obtain an accurate count of documents in the collection, use {@link Collection.countDocuments| countDocuments}.
   * To obtain an estimated count of all documents in the collection, use {@link Collection.estimatedDocumentCount| estimatedDocumentCount}.
   *
   * @deprecated use {@link Collection.countDocuments| countDocuments} or {@link Collection.estimatedDocumentCount| estimatedDocumentCount} instead
   *
   * @param query - The query for the count.
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  count(): Promise<number>;
  count(callback: Callback<number>): void;
  count(query: Document): Promise<number>;
  count(query: Document, callback: Callback<number>): void;
  count(query: Document, options: CountOptions): Promise<number>;
  count(query: Document, options: CountOptions, callback: Callback<number>): Promise<number> | void;
  count(
    query?: Document | CountOptions | Callback<number>,
    options?: CountOptions | Callback<number>,
    callback?: Callback<number>
  ): Promise<number> | void {
    if (typeof query === 'function') {
      (callback = query as Callback<number>), (query = {}), (options = {});
    } else {
      if (typeof options === 'function') (callback = options), (options = {});
    }

    query = query || {};
    options = options || {};
    return executeOperation(
      this.s.topology,
      new EstimatedDocumentCountOperation(this, query, options),
      callback
    );
  }

  /**
   * Find and remove a document.
   *
   * @deprecated use findOneAndDelete instead
   *
   * @param query - Query object to locate the object to modify.
   * @param sort - If multiple docs match, choose the first one in the specified sort order as the object to manipulate.
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  findAndRemove(query: Document, callback: Callback): void;
  findAndRemove(query: Document): Promise<Document>;
  findAndRemove(query: Document, sort: Sort, callback: Callback): void;
  findAndRemove(query: Document, sort: Sort): Promise<Document>;
  findAndRemove(
    query: Document,
    sort: Sort,
    options: FindAndModifyOptions,
    callback: Callback
  ): void;
  findAndRemove(query: Document, sort: Sort, options: FindAndModifyOptions): Promise<Document>;
  findAndRemove(
    query: Document,
    sortOrOptionsOrCallback?: Sort | FindAndModifyOptions | Callback,
    optionsOrCallback?: FindAndModifyOptions | Callback,
    _callback?: Callback
  ): Promise<Document> | void {
    let sort = sortOrOptionsOrCallback ?? {};
    let options = optionsOrCallback ?? {};
    let callback = _callback;
    if (typeof sort === 'function') {
      callback = sort;
      sort = {};
    }
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }

    // Add the remove option
    options.remove = true;

    return executeOperation(
      this.s.topology,
      new FindAndModifyOperation(this, query, sort as Sort, undefined, options),
      callback
    );
  }

  /**
   * Run a group command across a collection
   *
   * @deprecated MongoDB 3.6 or higher no longer supports the group command. We recommend rewriting using the aggregation framework.
   * @param keys - An object, array or function expressing the keys to group by.
   * @param condition - An optional condition that must be true for a row to be considered.
   * @param initial - Initial value of the aggregation counter object.
   * @param reduce - The reduce function aggregates (reduces) the objects iterated
   * @param finalize - An optional function to be run on each item in the result set just before the item is returned.
   * @param command - Specify if you wish to run using the internal group command or using eval, default is true.
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  group(
    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    keys: any,
    condition: Document,
    initial: Document,
    // TODO: Use labeled tuples when api-extractor supports TS 4.0
    ...args: [/*reduce?:*/ any, /*finalize?:*/ any, /*command?:*/ any, /*callback?:*/ Callback]
  ): Promise<Document> | void {
    const callback = typeof args[args.length - 1] === 'function' ? args.pop() : undefined;
    let reduce = args.length ? args.shift() : undefined;
    let finalize = args.length ? args.shift() : undefined;
    let command = args.length ? args.shift() : undefined;
    const options = args.length ? args.shift() || {} : {};

    // Make sure we are backward compatible
    if (!(typeof finalize === 'function')) {
      command = finalize;
      finalize = undefined;
    }

    if (
      !Array.isArray(keys) &&
      keys instanceof Object &&
      typeof keys !== 'function' &&
      !(keys._bsontype === 'Code')
    ) {
      keys = Object.keys(keys);
    }

    if (typeof reduce === 'function') {
      reduce = reduce.toString();
    }

    if (typeof finalize === 'function') {
      finalize = finalize.toString();
    }

    // Set up the command as default
    command = command == null ? true : command;

    if (command == null) {
      return executeOperation(
        this.s.topology,
        new EvalGroupOperation(this, keys, condition, initial, reduce, finalize, options),
        callback
      );
    }

    return executeOperation(
      this.s.topology,
      new GroupOperation(this, keys, condition, initial, reduce, finalize, options),
      callback
    );
  }

  /**
   * Find and modify a document.
   *
   * @deprecated use findOneAndUpdate, findOneAndReplace or findOneAndDelete instead
   *
   * @param query - Query object to locate the object to modify.
   * @param sort - If multiple docs match, choose the first one in the specified sort order as the object to manipulate.
   * @param doc - The fields/values to be updated.
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  _findAndModify(query: Document, sort: Document, doc: Document): Promise<Document>;
  _findAndModify(
    query: Document,
    sort: Document,
    doc: Document,
    callback: Callback<Document>
  ): void;
  _findAndModify(
    query: Document,
    sort: Document,
    doc: Document,
    options: FindAndModifyOptions
  ): Promise<Document>;
  _findAndModify(
    query: Document,
    sort: Document,
    doc: Document,
    options: FindAndModifyOptions,
    callback: Callback<Document>
  ): Promise<Document> | void;
  _findAndModify(
    query: Document,
    sort: Document,
    doc: Document,
    options?: FindAndModifyOptions | Callback<Document>,
    callback?: Callback<Document>
  ): Promise<Document> | void {
    if (typeof options === 'function') (callback = options), (options = {});
    options = options || {};

    // Force read preference primary
    options.readPreference = ReadPreference.primary;

    return executeOperation(
      this.s.topology,
      new FindAndModifyOperation(this, query, sort, doc, options),
      callback
    );
  }
}

const DEPRECATED_FIND_OPTIONS = ['maxScan', 'fields', 'snapshot', 'oplogReplay'];
Collection.prototype.find = deprecateOptions(
  {
    name: 'collection.find',
    deprecatedOptions: DEPRECATED_FIND_OPTIONS,
    optionsIndex: 1
  },
  Collection.prototype.find
);

Collection.prototype.findOne = deprecateOptions(
  {
    name: 'collection.find',
    deprecatedOptions: DEPRECATED_FIND_OPTIONS,
    optionsIndex: 1
  },
  Collection.prototype.findOne
);

Collection.prototype.insert = deprecate(
  Collection.prototype.insert,
  'collection.insert is deprecated. Use insertOne, insertMany or bulkWrite instead.'
);

Collection.prototype.update = deprecate(
  Collection.prototype.update,
  'collection.update is deprecated. Use updateOne, updateMany, or bulkWrite instead.'
);

Collection.prototype.removeOne = Collection.prototype.deleteOne;
Collection.prototype.removeMany = Collection.prototype.deleteMany;

Collection.prototype.remove = deprecate(
  Collection.prototype.remove,
  'collection.remove is deprecated. Use deleteOne, deleteMany, or bulkWrite instead.'
);

Collection.prototype.dropAllIndexes = deprecate(
  Collection.prototype.dropIndexes,
  'collection.dropAllIndexes is deprecated. Use dropIndexes instead.'
);

Collection.prototype.ensureIndex = deprecate(
  Collection.prototype.ensureIndex,
  'collection.ensureIndex is deprecated. Use createIndexes instead.'
);

Collection.prototype.count = deprecate(
  Collection.prototype.count,
  'collection.count is deprecated, and will be removed in a future version.' +
    ' Use Collection.countDocuments or Collection.estimatedDocumentCount instead'
);

Collection.prototype.findAndModify = deprecate(
  Collection.prototype._findAndModify,
  'collection.findAndModify is deprecated. Use findOneAndUpdate, findOneAndReplace or findOneAndDelete instead.'
);

Collection.prototype.findAndRemove = deprecate(
  Collection.prototype.findAndRemove,
  'collection.findAndRemove is deprecated. Use findOneAndDelete instead.'
);

Collection.prototype.group = deprecate(
  Collection.prototype.group,
  'MongoDB 3.6 or higher no longer supports the group command. We recommend rewriting using the aggregation framework.'
);
