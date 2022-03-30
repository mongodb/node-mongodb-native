import { BSONSerializeOptions, Document, resolveBSONOptions } from './bson';
import type { AnyBulkWriteOperation, BulkWriteOptions, BulkWriteResult } from './bulk/common';
import { OrderedBulkOperation } from './bulk/ordered';
import { UnorderedBulkOperation } from './bulk/unordered';
import { ChangeStream, ChangeStreamOptions } from './change_stream';
import { AggregationCursor } from './cursor/aggregation_cursor';
import { FindCursor } from './cursor/find_cursor';
import type { Db } from './db';
import { MongoInvalidArgumentError } from './error';
import type { Logger, LoggerOptions } from './logger';
import type { PkFactory } from './mongo_client';
import type {
  Filter,
  Flatten,
  OptionalUnlessRequiredId,
  TODO_NODE_3286,
  UpdateFilter,
  WithId,
  WithoutId
} from './mongo_types';
import type { AggregateOptions } from './operations/aggregate';
import { BulkWriteOperation } from './operations/bulk_write';
import type { IndexInformationOptions } from './operations/common_functions';
import { CountOperation, CountOptions } from './operations/count';
import { CountDocumentsOperation, CountDocumentsOptions } from './operations/count_documents';
import {
  DeleteManyOperation,
  DeleteOneOperation,
  DeleteOptions,
  DeleteResult
} from './operations/delete';
import { DistinctOperation, DistinctOptions } from './operations/distinct';
import { DropCollectionOperation, DropCollectionOptions } from './operations/drop';
import {
  EstimatedDocumentCountOperation,
  EstimatedDocumentCountOptions
} from './operations/estimated_document_count';
import { executeOperation } from './operations/execute_operation';
import type { FindOptions } from './operations/find';
import {
  FindOneAndDeleteOperation,
  FindOneAndDeleteOptions,
  FindOneAndReplaceOperation,
  FindOneAndReplaceOptions,
  FindOneAndUpdateOperation,
  FindOneAndUpdateOptions
} from './operations/find_and_modify';
import {
  CreateIndexesOperation,
  CreateIndexesOptions,
  CreateIndexOperation,
  DropIndexesOperation,
  DropIndexesOptions,
  DropIndexOperation,
  IndexDescription,
  IndexesOperation,
  IndexExistsOperation,
  IndexInformationOperation,
  IndexSpecification,
  ListIndexesCursor,
  ListIndexesOptions
} from './operations/indexes';
import {
  InsertManyOperation,
  InsertManyResult,
  InsertOneOperation,
  InsertOneOptions,
  InsertOneResult
} from './operations/insert';
import { IsCappedOperation } from './operations/is_capped';
import {
  MapFunction,
  MapReduceOperation,
  MapReduceOptions,
  ReduceFunction
} from './operations/map_reduce';
import type { Hint, OperationOptions } from './operations/operation';
import { OptionsOperation } from './operations/options_operation';
import { RenameOperation, RenameOptions } from './operations/rename';
import { CollStats, CollStatsOperation, CollStatsOptions } from './operations/stats';
import {
  ReplaceOneOperation,
  ReplaceOptions,
  UpdateManyOperation,
  UpdateOneOperation,
  UpdateOptions,
  UpdateResult
} from './operations/update';
import { ReadConcern, ReadConcernLike } from './read_concern';
import { ReadPreference, ReadPreferenceLike } from './read_preference';
import {
  Callback,
  checkCollectionName,
  DEFAULT_PK_FACTORY,
  emitWarningOnce,
  getTopology,
  MongoDBNamespace,
  normalizeHintField,
  resolveOptions
} from './utils';
import { WriteConcern, WriteConcernOptions } from './write_concern';

/** @public */
export interface ModifyResult<TSchema = Document> {
  value: WithId<TSchema> | null;
  lastErrorObject?: Document;
  ok: 0 | 1;
}

/** @public */
export interface CollectionOptions
  extends BSONSerializeOptions,
    WriteConcernOptions,
    LoggerOptions {
  /**
   * @deprecated Use readPreference instead
   */
  slaveOk?: boolean;
  /** Specify a read concern for the collection. (only MongoDB 3.2 or higher supported) */
  readConcern?: ReadConcernLike;
  /** The preferred read preference (ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST). */
  readPreference?: ReadPreferenceLike;
}

/** @internal */
export interface CollectionPrivate {
  pkFactory: PkFactory;
  db: Db;
  options: any;
  namespace: MongoDBNamespace;
  readPreference?: ReadPreference;
  bsonOptions: BSONSerializeOptions;
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
export class Collection<TSchema extends Document = Document> {
  /** @internal */
  s: CollectionPrivate;

  /**
   * Create a new Collection instance
   * @internal
   */
  constructor(db: Db, name: string, options?: CollectionOptions) {
    checkCollectionName(name);

    // Internal state
    this.s = {
      db,
      options,
      namespace: new MongoDBNamespace(db.databaseName, name),
      pkFactory: db.options?.pkFactory ?? DEFAULT_PK_FACTORY,
      readPreference: ReadPreference.fromOptions(options),
      bsonOptions: resolveBSONOptions(options, db),
      readConcern: ReadConcern.fromOptions(options),
      writeConcern: WriteConcern.fromOptions(options)
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

  get bsonOptions(): BSONSerializeOptions {
    return this.s.bsonOptions;
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
  insertOne(doc: OptionalUnlessRequiredId<TSchema>): Promise<InsertOneResult<TSchema>>;
  insertOne(
    doc: OptionalUnlessRequiredId<TSchema>,
    callback: Callback<InsertOneResult<TSchema>>
  ): void;
  insertOne(
    doc: OptionalUnlessRequiredId<TSchema>,
    options: InsertOneOptions
  ): Promise<InsertOneResult<TSchema>>;
  insertOne(
    doc: OptionalUnlessRequiredId<TSchema>,
    options: InsertOneOptions,
    callback: Callback<InsertOneResult<TSchema>>
  ): void;
  insertOne(
    doc: OptionalUnlessRequiredId<TSchema>,
    options?: InsertOneOptions | Callback<InsertOneResult<TSchema>>,
    callback?: Callback<InsertOneResult<TSchema>>
  ): Promise<InsertOneResult<TSchema>> | void {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }

    // CSFLE passes in { w: 'majority' } to ensure the lib works in both 3.x and 4.x
    // we support that option style here only
    if (options && Reflect.get(options, 'w')) {
      options.writeConcern = WriteConcern.fromOptions(Reflect.get(options, 'w'));
    }

    return executeOperation(
      this,
      new InsertOneOperation(
        this as TODO_NODE_3286,
        doc,
        resolveOptions(this, options)
      ) as TODO_NODE_3286,
      callback
    );
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
  insertMany(docs: OptionalUnlessRequiredId<TSchema>[]): Promise<InsertManyResult<TSchema>>;
  insertMany(
    docs: OptionalUnlessRequiredId<TSchema>[],
    callback: Callback<InsertManyResult<TSchema>>
  ): void;
  insertMany(
    docs: OptionalUnlessRequiredId<TSchema>[],
    options: BulkWriteOptions
  ): Promise<InsertManyResult<TSchema>>;
  insertMany(
    docs: OptionalUnlessRequiredId<TSchema>[],
    options: BulkWriteOptions,
    callback: Callback<InsertManyResult<TSchema>>
  ): void;
  insertMany(
    docs: OptionalUnlessRequiredId<TSchema>[],
    options?: BulkWriteOptions | Callback<InsertManyResult<TSchema>>,
    callback?: Callback<InsertManyResult<TSchema>>
  ): Promise<InsertManyResult<TSchema>> | void {
    if (typeof options === 'function') (callback = options), (options = {});
    options = options ? Object.assign({}, options) : { ordered: true };

    return executeOperation(
      this,
      new InsertManyOperation(
        this as TODO_NODE_3286,
        docs,
        resolveOptions(this, options)
      ) as TODO_NODE_3286,
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
   *  { replaceOne: { filter: {c:3}, replacement: {c:4}, upsert:true} }
   *```
   * Please note that raw operations are no longer accepted as of driver version 4.0.
   *
   * If documents passed in do not contain the **_id** field,
   * one will be added to each of the documents missing it by the driver, mutating the document. This behavior
   * can be overridden by setting the **forceServerObjectId** flag.
   *
   * @param operations - Bulk operations to perform
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   * @throws MongoDriverError if operations is not an array
   */
  bulkWrite(operations: AnyBulkWriteOperation<TSchema>[]): Promise<BulkWriteResult>;
  bulkWrite(
    operations: AnyBulkWriteOperation<TSchema>[],
    callback: Callback<BulkWriteResult>
  ): void;
  bulkWrite(
    operations: AnyBulkWriteOperation<TSchema>[],
    options: BulkWriteOptions
  ): Promise<BulkWriteResult>;
  bulkWrite(
    operations: AnyBulkWriteOperation<TSchema>[],
    options: BulkWriteOptions,
    callback: Callback<BulkWriteResult>
  ): void;
  bulkWrite(
    operations: AnyBulkWriteOperation<TSchema>[],
    options?: BulkWriteOptions | Callback<BulkWriteResult>,
    callback?: Callback<BulkWriteResult>
  ): Promise<BulkWriteResult> | void {
    if (typeof options === 'function') (callback = options), (options = {});
    options = options || { ordered: true };

    if (!Array.isArray(operations)) {
      throw new MongoInvalidArgumentError('Argument "operations" must be an array of documents');
    }

    return executeOperation(
      this,
      new BulkWriteOperation(
        this as TODO_NODE_3286,
        operations as TODO_NODE_3286,
        resolveOptions(this, options)
      ),
      callback
    );
  }

  /**
   * Update a single document in a collection
   *
   * @param filter - The filter used to select the document to update
   * @param update - The update operations to be applied to the document
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  updateOne(
    filter: Filter<TSchema>,
    update: UpdateFilter<TSchema> | Partial<TSchema>
  ): Promise<UpdateResult>;
  updateOne(
    filter: Filter<TSchema>,
    update: UpdateFilter<TSchema> | Partial<TSchema>,
    callback: Callback<UpdateResult>
  ): void;
  updateOne(
    filter: Filter<TSchema>,
    update: UpdateFilter<TSchema> | Partial<TSchema>,
    options: UpdateOptions
  ): Promise<UpdateResult>;
  updateOne(
    filter: Filter<TSchema>,
    update: UpdateFilter<TSchema> | Partial<TSchema>,
    options: UpdateOptions,
    callback: Callback<UpdateResult>
  ): void;
  updateOne(
    filter: Filter<TSchema>,
    update: UpdateFilter<TSchema> | Partial<TSchema>,
    options?: UpdateOptions | Callback<UpdateResult>,
    callback?: Callback<UpdateResult>
  ): Promise<UpdateResult> | void {
    if (typeof options === 'function') (callback = options), (options = {});

    return executeOperation(
      this,
      new UpdateOneOperation(
        this as TODO_NODE_3286,
        filter,
        update,
        resolveOptions(this, options)
      ) as TODO_NODE_3286,
      callback
    );
  }

  /**
   * Replace a document in a collection with another document
   *
   * @param filter - The filter used to select the document to replace
   * @param replacement - The Document that replaces the matching document
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  replaceOne(
    filter: Filter<TSchema>,
    replacement: WithoutId<TSchema>
  ): Promise<UpdateResult | Document>;
  replaceOne(
    filter: Filter<TSchema>,
    replacement: WithoutId<TSchema>,
    callback: Callback<UpdateResult | Document>
  ): void;
  replaceOne(
    filter: Filter<TSchema>,
    replacement: WithoutId<TSchema>,
    options: ReplaceOptions
  ): Promise<UpdateResult | Document>;
  replaceOne(
    filter: Filter<TSchema>,
    replacement: WithoutId<TSchema>,
    options: ReplaceOptions,
    callback: Callback<UpdateResult | Document>
  ): void;
  replaceOne(
    filter: Filter<TSchema>,
    replacement: WithoutId<TSchema>,
    options?: ReplaceOptions | Callback<UpdateResult | Document>,
    callback?: Callback<UpdateResult | Document>
  ): Promise<UpdateResult | Document> | void {
    if (typeof options === 'function') (callback = options), (options = {});

    return executeOperation(
      this,
      new ReplaceOneOperation(
        this as TODO_NODE_3286,
        filter,
        replacement,
        resolveOptions(this, options)
      ),
      callback
    );
  }

  /**
   * Update multiple documents in a collection
   *
   * @param filter - The filter used to select the documents to update
   * @param update - The update operations to be applied to the documents
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  updateMany(
    filter: Filter<TSchema>,
    update: UpdateFilter<TSchema>
  ): Promise<UpdateResult | Document>;
  updateMany(
    filter: Filter<TSchema>,
    update: UpdateFilter<TSchema>,
    callback: Callback<UpdateResult | Document>
  ): void;
  updateMany(
    filter: Filter<TSchema>,
    update: UpdateFilter<TSchema>,
    options: UpdateOptions
  ): Promise<UpdateResult | Document>;
  updateMany(
    filter: Filter<TSchema>,
    update: UpdateFilter<TSchema>,
    options: UpdateOptions,
    callback: Callback<UpdateResult | Document>
  ): void;
  updateMany(
    filter: Filter<TSchema>,
    update: UpdateFilter<TSchema>,
    options?: UpdateOptions | Callback<UpdateResult | Document>,
    callback?: Callback<UpdateResult | Document>
  ): Promise<UpdateResult | Document> | void {
    if (typeof options === 'function') (callback = options), (options = {});

    return executeOperation(
      this,
      new UpdateManyOperation(
        this as TODO_NODE_3286,
        filter,
        update,
        resolveOptions(this, options)
      ),
      callback
    );
  }

  /**
   * Delete a document from a collection
   *
   * @param filter - The filter used to select the document to remove
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  deleteOne(filter: Filter<TSchema>): Promise<DeleteResult>;
  deleteOne(filter: Filter<TSchema>, callback: Callback<DeleteResult>): void;
  deleteOne(filter: Filter<TSchema>, options: DeleteOptions): Promise<DeleteResult>;
  deleteOne(
    filter: Filter<TSchema>,
    options: DeleteOptions,
    callback?: Callback<DeleteResult>
  ): void;
  deleteOne(
    filter: Filter<TSchema>,
    options?: DeleteOptions | Callback<DeleteResult>,
    callback?: Callback<DeleteResult>
  ): Promise<DeleteResult> | void {
    if (typeof options === 'function') (callback = options), (options = {});

    return executeOperation(
      this,
      new DeleteOneOperation(this as TODO_NODE_3286, filter, resolveOptions(this, options)),
      callback
    );
  }

  /**
   * Delete multiple documents from a collection
   *
   * @param filter - The filter used to select the documents to remove
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  deleteMany(filter: Filter<TSchema>): Promise<DeleteResult>;
  deleteMany(filter: Filter<TSchema>, callback: Callback<DeleteResult>): void;
  deleteMany(filter: Filter<TSchema>, options: DeleteOptions): Promise<DeleteResult>;
  deleteMany(
    filter: Filter<TSchema>,
    options: DeleteOptions,
    callback: Callback<DeleteResult>
  ): void;
  deleteMany(
    filter: Filter<TSchema>,
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

    return executeOperation(
      this,
      new DeleteManyOperation(this as TODO_NODE_3286, filter, resolveOptions(this, options)),
      callback
    );
  }

  /**
   * Rename the collection.
   *
   * @remarks
   * This operation does not inherit options from the Db or MongoClient.
   *
   * @param newName - New name of of the collection.
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  rename(newName: string): Promise<Collection>;
  rename(newName: string, callback: Callback<Collection>): void;
  rename(newName: string, options: RenameOptions): Promise<Collection>;
  rename(newName: string, options: RenameOptions, callback: Callback<Collection>): void;
  rename(
    newName: string,
    options?: RenameOptions | Callback<Collection>,
    callback?: Callback<Collection>
  ): Promise<Collection> | void {
    if (typeof options === 'function') (callback = options), (options = {});

    // Intentionally, we do not inherit options from parent for this operation.
    return executeOperation(
      this,
      new RenameOperation(this as TODO_NODE_3286, newName, {
        ...options,
        readPreference: ReadPreference.PRIMARY
      }),
      callback
    );
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
    options = options ?? {};

    return executeOperation(
      this,
      new DropCollectionOperation(this.s.db, this.collectionName, options),
      callback
    );
  }

  /**
   * Fetches the first document that matches the filter
   *
   * @param filter - Query for find Operation
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  findOne(): Promise<WithId<TSchema> | null>;
  findOne(callback: Callback<WithId<TSchema> | null>): void;
  findOne(filter: Filter<TSchema>): Promise<WithId<TSchema> | null>;
  findOne(filter: Filter<TSchema>, callback: Callback<WithId<TSchema> | null>): void;
  findOne(filter: Filter<TSchema>, options: FindOptions): Promise<WithId<TSchema> | null>;
  findOne(
    filter: Filter<TSchema>,
    options: FindOptions,
    callback: Callback<WithId<TSchema> | null>
  ): void;

  // allow an override of the schema.
  findOne<T = TSchema>(): Promise<T | null>;
  findOne<T = TSchema>(callback: Callback<T | null>): void;
  findOne<T = TSchema>(filter: Filter<TSchema>): Promise<T | null>;
  findOne<T = TSchema>(filter: Filter<TSchema>, options?: FindOptions): Promise<T | null>;
  findOne<T = TSchema>(
    filter: Filter<TSchema>,
    options?: FindOptions,
    callback?: Callback<T | null>
  ): void;

  findOne(
    filter?: Filter<TSchema> | Callback<WithId<TSchema> | null>,
    options?: FindOptions | Callback<WithId<TSchema> | null>,
    callback?: Callback<WithId<TSchema> | null>
  ): Promise<WithId<TSchema> | null> | void {
    if (callback != null && typeof callback !== 'function') {
      throw new MongoInvalidArgumentError(
        'Third parameter to `findOne()` must be a callback or undefined'
      );
    }

    if (typeof filter === 'function') {
      callback = filter as Callback<WithId<TSchema> | null>;
      filter = {};
      options = {};
    }
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }

    const finalFilter = filter ?? {};
    const finalOptions = options ?? {};
    return this.find(finalFilter, finalOptions).limit(-1).batchSize(1).next(callback);
  }

  /**
   * Creates a cursor for a filter that can be used to iterate over results from MongoDB
   *
   * @param filter - The filter predicate. If unspecified, then all documents in the collection will match the predicate
   */
  find(): FindCursor<WithId<TSchema>>;
  find(filter: Filter<TSchema>, options?: FindOptions): FindCursor<WithId<TSchema>>;
  find<T extends Document>(filter: Filter<TSchema>, options?: FindOptions): FindCursor<T>;
  find(filter?: Filter<TSchema>, options?: FindOptions): FindCursor<WithId<TSchema>> {
    if (arguments.length > 2) {
      throw new MongoInvalidArgumentError(
        'Method "collection.find()" accepts at most two arguments'
      );
    }
    if (typeof options === 'function') {
      throw new MongoInvalidArgumentError('Argument "options" must not be function');
    }

    return new FindCursor<WithId<TSchema>>(
      getTopology(this),
      this.s.namespace,
      filter,
      resolveOptions(this as TODO_NODE_3286, options)
    );
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

    return executeOperation(
      this,
      new OptionsOperation(this as TODO_NODE_3286, resolveOptions(this, options)),
      callback
    );
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

    return executeOperation(
      this,
      new IsCappedOperation(this as TODO_NODE_3286, resolveOptions(this, options)),
      callback
    );
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
  createIndex(indexSpec: IndexSpecification): Promise<string>;
  createIndex(indexSpec: IndexSpecification, callback: Callback<string>): void;
  createIndex(indexSpec: IndexSpecification, options: CreateIndexesOptions): Promise<string>;
  createIndex(
    indexSpec: IndexSpecification,
    options: CreateIndexesOptions,
    callback: Callback<string>
  ): void;
  createIndex(
    indexSpec: IndexSpecification,
    options?: CreateIndexesOptions | Callback<string>,
    callback?: Callback<string>
  ): Promise<string> | void {
    if (typeof options === 'function') (callback = options), (options = {});

    return executeOperation(
      this,
      new CreateIndexOperation(
        this as TODO_NODE_3286,
        this.collectionName,
        indexSpec,
        resolveOptions(this, options)
      ),
      callback
    );
  }

  /**
   * Creates multiple indexes in the collection, this method is only supported for
   * MongoDB 2.6 or higher. Earlier version of MongoDB will throw a command not supported
   * error.
   *
   * **Note**: Unlike {@link Collection#createIndex| createIndex}, this function takes in raw index specifications.
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
  createIndexes(indexSpecs: IndexDescription[]): Promise<string[]>;
  createIndexes(indexSpecs: IndexDescription[], callback: Callback<string[]>): void;
  createIndexes(indexSpecs: IndexDescription[], options: CreateIndexesOptions): Promise<string[]>;
  createIndexes(
    indexSpecs: IndexDescription[],
    options: CreateIndexesOptions,
    callback: Callback<string[]>
  ): void;
  createIndexes(
    indexSpecs: IndexDescription[],
    options?: CreateIndexesOptions | Callback<string[]>,
    callback?: Callback<string[]>
  ): Promise<string[]> | void {
    if (typeof options === 'function') (callback = options), (options = {});
    options = options ? Object.assign({}, options) : {};
    if (typeof options.maxTimeMS !== 'number') delete options.maxTimeMS;

    return executeOperation(
      this,
      new CreateIndexesOperation(
        this as TODO_NODE_3286,
        this.collectionName,
        indexSpecs,
        resolveOptions(this, options)
      ),
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
    options = resolveOptions(this, options);

    // Run only against primary
    options.readPreference = ReadPreference.primary;

    return executeOperation(
      this,
      new DropIndexOperation(this as TODO_NODE_3286, indexName, options),
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

    return executeOperation(
      this,
      new DropIndexesOperation(this as TODO_NODE_3286, resolveOptions(this, options)),
      callback
    );
  }

  /**
   * Get the list of all indexes information for the collection.
   *
   * @param options - Optional settings for the command
   */
  listIndexes(options?: ListIndexesOptions): ListIndexesCursor {
    return new ListIndexesCursor(this as TODO_NODE_3286, resolveOptions(this, options));
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

    return executeOperation(
      this,
      new IndexExistsOperation(this as TODO_NODE_3286, indexes, resolveOptions(this, options)),
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

    return executeOperation(
      this,
      new IndexInformationOperation(this.s.db, this.collectionName, resolveOptions(this, options)),
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
    return executeOperation(
      this,
      new EstimatedDocumentCountOperation(this as TODO_NODE_3286, resolveOptions(this, options)),
      callback
    );
  }

  /**
   * Gets the number of documents matching the filter.
   * For a fast count of the total documents in a collection see {@link Collection#estimatedDocumentCount| estimatedDocumentCount}.
   * **Note**: When migrating from {@link Collection#count| count} to {@link Collection#countDocuments| countDocuments}
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
   * @param filter - The filter for the count
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
  countDocuments(filter: Filter<TSchema>): Promise<number>;
  countDocuments(callback: Callback<number>): void;
  countDocuments(filter: Filter<TSchema>, options: CountDocumentsOptions): Promise<number>;
  countDocuments(
    filter: Filter<TSchema>,
    options: CountDocumentsOptions,
    callback: Callback<number>
  ): void;
  countDocuments(filter: Filter<TSchema>, callback: Callback<number>): void;
  countDocuments(
    filter?: Document | CountDocumentsOptions | Callback<number>,
    options?: CountDocumentsOptions | Callback<number>,
    callback?: Callback<number>
  ): Promise<number> | void {
    if (filter == null) {
      (filter = {}), (options = {}), (callback = undefined);
    } else if (typeof filter === 'function') {
      (callback = filter as Callback<number>), (filter = {}), (options = {});
    } else {
      if (arguments.length === 2) {
        if (typeof options === 'function') (callback = options), (options = {});
      }
    }

    filter ??= {};
    return executeOperation(
      this,
      new CountDocumentsOperation(
        this as TODO_NODE_3286,
        filter as Document,
        resolveOptions(this, options as CountDocumentsOptions)
      ),
      callback
    );
  }

  /**
   * The distinct command returns a list of distinct values for the given key across a collection.
   *
   * @param key - Field of the document to find distinct values for
   * @param filter - The filter for filtering the set of documents to which we apply the distinct filter.
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  distinct<Key extends keyof WithId<TSchema>>(
    key: Key
  ): Promise<Array<Flatten<WithId<TSchema>[Key]>>>;
  distinct<Key extends keyof WithId<TSchema>>(
    key: Key,
    callback: Callback<Array<Flatten<WithId<TSchema>[Key]>>>
  ): void;
  distinct<Key extends keyof WithId<TSchema>>(
    key: Key,
    filter: Filter<TSchema>
  ): Promise<Array<Flatten<WithId<TSchema>[Key]>>>;
  distinct<Key extends keyof WithId<TSchema>>(
    key: Key,
    filter: Filter<TSchema>,
    callback: Callback<Array<Flatten<WithId<TSchema>[Key]>>>
  ): void;
  distinct<Key extends keyof WithId<TSchema>>(
    key: Key,
    filter: Filter<TSchema>,
    options: DistinctOptions
  ): Promise<Array<Flatten<WithId<TSchema>[Key]>>>;
  distinct<Key extends keyof WithId<TSchema>>(
    key: Key,
    filter: Filter<TSchema>,
    options: DistinctOptions,
    callback: Callback<Array<Flatten<WithId<TSchema>[Key]>>>
  ): void;

  // Embedded documents overload
  distinct(key: string): Promise<any[]>;
  distinct(key: string, callback: Callback<any[]>): void;
  distinct(key: string, filter: Filter<TSchema>): Promise<any[]>;
  distinct(key: string, filter: Filter<TSchema>, callback: Callback<any[]>): void;
  distinct(key: string, filter: Filter<TSchema>, options: DistinctOptions): Promise<any[]>;
  distinct(
    key: string,
    filter: Filter<TSchema>,
    options: DistinctOptions,
    callback: Callback<any[]>
  ): void;
  // Implementation
  distinct<Key extends keyof WithId<TSchema>>(
    key: Key,
    filter?: Filter<TSchema> | DistinctOptions | Callback<any[]>,
    options?: DistinctOptions | Callback<any[]>,
    callback?: Callback<any[]>
  ): Promise<any[]> | void {
    if (typeof filter === 'function') {
      (callback = filter as Callback<any[]>), (filter = {}), (options = {});
    } else {
      if (arguments.length === 3 && typeof options === 'function') {
        (callback = options), (options = {});
      }
    }

    filter ??= {};
    return executeOperation(
      this,
      new DistinctOperation(
        this as TODO_NODE_3286,
        key as TODO_NODE_3286,
        filter,
        resolveOptions(this, options as DistinctOptions)
      ),
      callback
    );
  }

  /**
   * Retrieve all the indexes on the collection.
   *
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  indexes(): Promise<Document[]>;
  indexes(callback: Callback<Document[]>): void;
  indexes(options: IndexInformationOptions): Promise<Document[]>;
  indexes(options: IndexInformationOptions, callback: Callback<Document[]>): void;
  indexes(
    options?: IndexInformationOptions | Callback<Document[]>,
    callback?: Callback<Document[]>
  ): Promise<Document[]> | void {
    if (typeof options === 'function') (callback = options), (options = {});

    return executeOperation(
      this,
      new IndexesOperation(this as TODO_NODE_3286, resolveOptions(this, options)),
      callback
    );
  }

  /**
   * Get all the collection statistics.
   *
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  stats(): Promise<CollStats>;
  stats(callback: Callback<CollStats>): void;
  stats(options: CollStatsOptions): Promise<CollStats>;
  stats(options: CollStatsOptions, callback: Callback<CollStats>): void;
  stats(
    options?: CollStatsOptions | Callback<CollStats>,
    callback?: Callback<CollStats>
  ): Promise<CollStats> | void {
    if (typeof options === 'function') (callback = options), (options = {});
    options = options ?? {};

    return executeOperation(
      this,
      new CollStatsOperation(this as TODO_NODE_3286, options),
      callback
    );
  }

  /**
   * Find a document and delete it in one atomic operation. Requires a write lock for the duration of the operation.
   *
   * @param filter - The filter used to select the document to remove
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  findOneAndDelete(filter: Filter<TSchema>): Promise<ModifyResult<TSchema>>;
  findOneAndDelete(
    filter: Filter<TSchema>,
    options: FindOneAndDeleteOptions
  ): Promise<ModifyResult<TSchema>>;
  findOneAndDelete(filter: Filter<TSchema>, callback: Callback<ModifyResult<TSchema>>): void;
  findOneAndDelete(
    filter: Filter<TSchema>,
    options: FindOneAndDeleteOptions,
    callback: Callback<ModifyResult<TSchema>>
  ): void;
  findOneAndDelete(
    filter: Filter<TSchema>,
    options?: FindOneAndDeleteOptions | Callback<ModifyResult<TSchema>>,
    callback?: Callback<ModifyResult<TSchema>>
  ): Promise<Document> | void {
    if (typeof options === 'function') (callback = options), (options = {});

    return executeOperation(
      this,
      new FindOneAndDeleteOperation(
        this as TODO_NODE_3286,
        filter,
        resolveOptions(this, options)
      ) as TODO_NODE_3286,
      callback
    );
  }

  /**
   * Find a document and replace it in one atomic operation. Requires a write lock for the duration of the operation.
   *
   * @param filter - The filter used to select the document to replace
   * @param replacement - The Document that replaces the matching document
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  findOneAndReplace(
    filter: Filter<TSchema>,
    replacement: WithoutId<TSchema>
  ): Promise<ModifyResult<TSchema>>;
  findOneAndReplace(
    filter: Filter<TSchema>,
    replacement: WithoutId<TSchema>,
    callback: Callback<ModifyResult<TSchema>>
  ): void;
  findOneAndReplace(
    filter: Filter<TSchema>,
    replacement: WithoutId<TSchema>,
    options: FindOneAndReplaceOptions
  ): Promise<ModifyResult<TSchema>>;
  findOneAndReplace(
    filter: Filter<TSchema>,
    replacement: WithoutId<TSchema>,
    options: FindOneAndReplaceOptions,
    callback: Callback<ModifyResult<TSchema>>
  ): void;
  findOneAndReplace(
    filter: Filter<TSchema>,
    replacement: WithoutId<TSchema>,
    options?: FindOneAndReplaceOptions | Callback<ModifyResult<TSchema>>,
    callback?: Callback<ModifyResult<TSchema>>
  ): Promise<ModifyResult<TSchema>> | void {
    if (typeof options === 'function') (callback = options), (options = {});

    return executeOperation(
      this,
      new FindOneAndReplaceOperation(
        this as TODO_NODE_3286,
        filter,
        replacement,
        resolveOptions(this, options)
      ) as TODO_NODE_3286,
      callback
    );
  }

  /**
   * Find a document and update it in one atomic operation. Requires a write lock for the duration of the operation.
   *
   * @param filter - The filter used to select the document to update
   * @param update - Update operations to be performed on the document
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  findOneAndUpdate(
    filter: Filter<TSchema>,
    update: UpdateFilter<TSchema>
  ): Promise<ModifyResult<TSchema>>;
  findOneAndUpdate(
    filter: Filter<TSchema>,
    update: UpdateFilter<TSchema>,
    callback: Callback<ModifyResult<TSchema>>
  ): void;
  findOneAndUpdate(
    filter: Filter<TSchema>,
    update: UpdateFilter<TSchema>,
    options: FindOneAndUpdateOptions
  ): Promise<ModifyResult<TSchema>>;
  findOneAndUpdate(
    filter: Filter<TSchema>,
    update: UpdateFilter<TSchema>,
    options: FindOneAndUpdateOptions,
    callback: Callback<ModifyResult<TSchema>>
  ): void;
  findOneAndUpdate(
    filter: Filter<TSchema>,
    update: UpdateFilter<TSchema>,
    options?: FindOneAndUpdateOptions | Callback<ModifyResult<TSchema>>,
    callback?: Callback<ModifyResult<TSchema>>
  ): Promise<ModifyResult<TSchema>> | void {
    if (typeof options === 'function') (callback = options), (options = {});

    return executeOperation(
      this,
      new FindOneAndUpdateOperation(
        this as TODO_NODE_3286,
        filter,
        update,
        resolveOptions(this, options)
      ) as TODO_NODE_3286,
      callback
    );
  }

  /**
   * Execute an aggregation framework pipeline against the collection, needs MongoDB \>= 2.2
   *
   * @param pipeline - An array of aggregation pipelines to execute
   * @param options - Optional settings for the command
   */
  aggregate<T extends Document = Document>(
    pipeline: Document[] = [],
    options?: AggregateOptions
  ): AggregationCursor<T> {
    if (arguments.length > 2) {
      throw new MongoInvalidArgumentError(
        'Method "collection.aggregate()" accepts at most two arguments'
      );
    }
    if (!Array.isArray(pipeline)) {
      throw new MongoInvalidArgumentError(
        'Argument "pipeline" must be an array of aggregation stages'
      );
    }
    if (typeof options === 'function') {
      throw new MongoInvalidArgumentError('Argument "options" must not be function');
    }

    return new AggregationCursor(
      getTopology(this),
      this.s.namespace,
      pipeline,
      resolveOptions(this, options)
    );
  }

  /**
   * Create a new Change Stream, watching for new changes (insertions, updates, replacements, deletions, and invalidations) in this collection.
   *
   * @since 3.0.0
   * @param pipeline - An array of {@link https://docs.mongodb.com/manual/reference/operator/aggregation-pipeline/|aggregation pipeline stages} through which to pass change stream documents. This allows for filtering (using $match) and manipulating the change stream documents.
   * @param options - Optional settings for the command
   */
  watch<TLocal extends Document = TSchema>(
    pipeline: Document[] = [],
    options: ChangeStreamOptions = {}
  ): ChangeStream<TLocal> {
    // Allow optionally not specifying a pipeline
    if (!Array.isArray(pipeline)) {
      options = pipeline;
      pipeline = [];
    }

    return new ChangeStream<TLocal>(this, pipeline, resolveOptions(this, options));
  }

  /**
   * Run Map Reduce across a collection. Be aware that the inline option for out will return an array of results not a collection.
   *
   * @deprecated collection.mapReduce is deprecated. Use the aggregation pipeline instead. Visit https://docs.mongodb.com/manual/reference/map-reduce-to-aggregation-pipeline for more information on how to translate map-reduce operations to the aggregation pipeline.
   * @param map - The mapping function.
   * @param reduce - The reduce function.
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  mapReduce<TKey = any, TValue = any>(
    map: string | MapFunction<TSchema>,
    reduce: string | ReduceFunction<TKey, TValue>
  ): Promise<Document | Document[]>;
  mapReduce<TKey = any, TValue = any>(
    map: string | MapFunction<TSchema>,
    reduce: string | ReduceFunction<TKey, TValue>,
    callback: Callback<Document | Document[]>
  ): void;
  mapReduce<TKey = any, TValue = any>(
    map: string | MapFunction<TSchema>,
    reduce: string | ReduceFunction<TKey, TValue>,
    options: MapReduceOptions<TKey, TValue>
  ): Promise<Document | Document[]>;
  mapReduce<TKey = any, TValue = any>(
    map: string | MapFunction<TSchema>,
    reduce: string | ReduceFunction<TKey, TValue>,
    options: MapReduceOptions<TKey, TValue>,
    callback: Callback<Document | Document[]>
  ): void;
  mapReduce<TKey = any, TValue = any>(
    map: string | MapFunction<TSchema>,
    reduce: string | ReduceFunction<TKey, TValue>,
    options?: MapReduceOptions<TKey, TValue> | Callback<Document | Document[]>,
    callback?: Callback<Document | Document[]>
  ): Promise<Document | Document[]> | void {
    emitWarningOnce(
      'collection.mapReduce is deprecated. Use the aggregation pipeline instead. Visit https://docs.mongodb.com/manual/reference/map-reduce-to-aggregation-pipeline for more information on how to translate map-reduce operations to the aggregation pipeline.'
    );
    if ('function' === typeof options) (callback = options), (options = {});
    // Out must always be defined (make sure we don't break weirdly on pre 1.8+ servers)
    // TODO NODE-3339: Figure out if this is still necessary given we no longer officially support pre-1.8
    if (options?.out == null) {
      throw new MongoInvalidArgumentError(
        'Option "out" must be defined, see mongodb docs for possible values'
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
      this,
      new MapReduceOperation(
        this as TODO_NODE_3286,
        map,
        reduce,
        resolveOptions(this, options) as TODO_NODE_3286
      ),
      callback
    );
  }

  /** Initiate an Out of order batch write operation. All operations will be buffered into insert/update/remove commands executed out of order. */
  initializeUnorderedBulkOp(options?: BulkWriteOptions): UnorderedBulkOperation {
    return new UnorderedBulkOperation(this as TODO_NODE_3286, resolveOptions(this, options));
  }

  /** Initiate an In order bulk write operation. Operations will be serially executed in the order they are added, creating a new operation for each switch in types. */
  initializeOrderedBulkOp(options?: BulkWriteOptions): OrderedBulkOperation {
    return new OrderedBulkOperation(this as TODO_NODE_3286, resolveOptions(this, options));
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
    docs: OptionalUnlessRequiredId<TSchema>[],
    options: BulkWriteOptions,
    callback: Callback<InsertManyResult<TSchema>>
  ): Promise<InsertManyResult<TSchema>> | void {
    emitWarningOnce(
      'collection.insert is deprecated. Use insertOne, insertMany or bulkWrite instead.'
    );
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
    selector: Filter<TSchema>,
    update: UpdateFilter<TSchema>,
    options: UpdateOptions,
    callback: Callback<Document>
  ): Promise<UpdateResult> | void {
    emitWarningOnce(
      'collection.update is deprecated. Use updateOne, updateMany, or bulkWrite instead.'
    );
    if (typeof options === 'function') (callback = options), (options = {});
    options = options ?? {};

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
    selector: Filter<TSchema>,
    options: DeleteOptions,
    callback: Callback
  ): Promise<DeleteResult> | void {
    emitWarningOnce(
      'collection.remove is deprecated. Use deleteOne, deleteMany, or bulkWrite instead.'
    );
    if (typeof options === 'function') (callback = options), (options = {});
    options = options ?? {};

    return this.deleteMany(selector, options, callback);
  }

  /**
   * An estimated count of matching documents in the db to a filter.
   *
   * **NOTE:** This method has been deprecated, since it does not provide an accurate count of the documents
   * in a collection. To obtain an accurate count of documents in the collection, use {@link Collection#countDocuments| countDocuments}.
   * To obtain an estimated count of all documents in the collection, use {@link Collection#estimatedDocumentCount| estimatedDocumentCount}.
   *
   * @deprecated use {@link Collection#countDocuments| countDocuments} or {@link Collection#estimatedDocumentCount| estimatedDocumentCount} instead
   *
   * @param filter - The filter for the count.
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  count(): Promise<number>;
  count(callback: Callback<number>): void;
  count(filter: Filter<TSchema>): Promise<number>;
  count(filter: Filter<TSchema>, callback: Callback<number>): void;
  count(filter: Filter<TSchema>, options: CountOptions): Promise<number>;
  count(
    filter: Filter<TSchema>,
    options: CountOptions,
    callback: Callback<number>
  ): Promise<number> | void;
  count(
    filter?: Filter<TSchema> | CountOptions | Callback<number>,
    options?: CountOptions | Callback<number>,
    callback?: Callback<number>
  ): Promise<number> | void {
    if (typeof filter === 'function') {
      (callback = filter as Callback<number>), (filter = {}), (options = {});
    } else {
      if (typeof options === 'function') (callback = options), (options = {});
    }

    filter ??= {};
    return executeOperation(
      this,
      new CountOperation(
        MongoDBNamespace.fromString(this.namespace),
        filter,
        resolveOptions(this, options)
      ),
      callback
    );
  }
}
