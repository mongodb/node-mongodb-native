// Import overloaded classes
import { Admin as MDBAdmin, FindCursor as MDBFindCursor, ListCollectionsCursor as MDBListCollectionsCursor, ListIndexesCursor as MDBListIndexesCursor, AggregationCursor as MDBAggregationCursor, AbstractCursor as MDBAbstractCursor, ChangeStream as MDBChangeStream, Collection as MDBCollection, Db as MDBDb, GridFSBucket as MDBGridFSBucket, MongoClient as MDBMongoClient } from 'mongodb';

// Dependencies (options, etc.)
import type {
  AbstractCursorEvents,
  Document,
  MongoClientOptions,
  ChangeStreamOptions,
  ChangeStreamDocument,
  CursorCloseOptions,
  GridFSBucketOptions,
  IndexInformationOptions,
  CreateCollectionOptions,
  GridFSFile,
  FindOptions,
  Filter,
  ObjectId,
  DbOptions,
  Callback,
  CollectionInfo,
  ExplainVerbosityLike,
  CountOptions,
  ProfilingLevelOptions,
  ProfilingLevel,
  RunCommandOptions,
  SetProfilingLevelOptions,
  RemoveUserOptions,
  AddUserOptions,
  CreateIndexesOptions,
  IndexSpecification,
  ListCollectionsOptions,
  DropDatabaseOptions,
  DropCollectionOptions,
  RenameOptions,
  DbStatsOptions,
  CollectionOptions,
  AggregateOptions,
  DeleteResult,
  DeleteOptions,
  UpdateResult,
  UpdateOptions,
  UpdateFilter,
  InsertManyResult,
  BulkWriteOptions,
  OrderedBulkOperation,
  UnorderedBulkOperation,
  MapReduceOptions,
  MapFunction,
  ReduceFunction,
  FindOneAndUpdateOptions,
  ModifyResult,
  FindOneAndReplaceOptions,
  FindOneAndDeleteOptions,
  WithoutId,
  WithId,
  CollStats,
  CollStatsOptions,
  DistinctOptions,
  Flatten,
  CountDocumentsOptions,
  EstimatedDocumentCountOptions,
  ListIndexesOptions,
  DropIndexesOptions,
  IndexDescription,
  OperationOptions,
  ReplaceOptions,
  BulkWriteResult,
  AnyBulkWriteOperation,
  InsertOneOptions,
  OptionalUnlessRequiredId,
  InsertOneResult,
  CommandOperationOptions,
  ListDatabasesResult,
  ListDatabasesOptions,
  ValidateCollectionOptions,
} from 'mongodb';

// Delete constructor helper
type NonConstructorKeys<T> = { [P in keyof T]: T[P] extends new () => any ? never : P }[keyof T];
type NonConstructor<T> = Pick<T, NonConstructorKeys<T>>;

declare const Admin: new () => Omit<MDBAdmin, 'addUser' | 'buildInfo' | 'command' | 'listDatabases' | 'ping' | 'removeUser' | 'replSetGetStatus' | 'serverInfo' | 'serverStatus' | 'validateCollection'>;
declare const ChangeStream: new <TSchema extends Document = Document, TChange extends Document = ChangeStreamDocument<TSchema>>() => Omit<MDBChangeStream<TSchema, TChange>, 'close' | 'hasNext' | 'next' | 'tryNext'>;
declare const Collection: new <TSchema>() => Omit<MDBCollection<TSchema>,| 'bulkWrite'| 'count'| 'countDocuments'| 'estimatedDocumentCount'| 'createIndex'| 'createIndexes'| 'dropIndex'| 'dropIndexes'| 'deleteMany'| 'deleteOne'| 'distinct'| 'drop'| 'findOne'| 'findOneAndDelete'| 'findOneAndReplace'| 'findOneAndUpdate'| 'indexExists'| 'indexInformation'| 'indexes'| 'insert'| 'insertMany'| 'insertOne'| 'isCapped'| 'mapReduce'| 'options'| 'remove'| 'rename'| 'replaceOne'| 'stats'| 'update'| 'updateMany'| 'updateOne'| 'aggregate'| 'find'| 'listIndexes'| 'watch'>;
declare const Db: new () => Omit<MDBDb, 'command' | 'addUser' | 'removeUser' | 'createCollection' | 'dropCollection' | 'createIndex' | 'dropDatabase' | 'indexInformation' | 'profilingLevel' | 'setProfilingLevel' | 'renameCollection' | 'stats' | 'collections' | 'collection' | 'admin' | 'aggregate' | 'listCollections' | 'watch'>;
declare const GridFSBucket: new (db: LegacyDb, options: GridFSBucketOptions) => Omit<NonConstructor<MDBGridFSBucket>, 'delete' | 'rename' | 'drop' | 'find'>;
declare const MongoClient: new (url: string, options?: MongoClientOptions) => Omit<NonConstructor<MDBMongoClient>, 'connect' | 'close' | 'db' | 'watch'>;

declare class LegacyAdmin extends Admin {
  /**
   * Execute a command
   *
   * @param command - The command to execute
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  command(command: Document): Promise<Document>;
  command(command: Document, callback: Callback<Document>): void;
  command(command: Document, options: RunCommandOptions): Promise<Document>;
  command(command: Document, options: RunCommandOptions, callback: Callback<Document>): void;
  /**
   * Retrieve the server build information
   *
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  buildInfo(): Promise<Document>;
  buildInfo(callback: Callback<Document>): void;
  buildInfo(options: CommandOperationOptions): Promise<Document>;
  buildInfo(options: CommandOperationOptions, callback: Callback<Document>): void;
  /**
   * Retrieve the server build information
   *
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  serverInfo(): Promise<Document>;
  serverInfo(callback: Callback<Document>): void;
  serverInfo(options: CommandOperationOptions): Promise<Document>;
  serverInfo(options: CommandOperationOptions, callback: Callback<Document>): void;
  /**
   * Retrieve this db's server status.
   *
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  serverStatus(): Promise<Document>;
  serverStatus(callback: Callback<Document>): void;
  serverStatus(options: CommandOperationOptions): Promise<Document>;
  serverStatus(options: CommandOperationOptions, callback: Callback<Document>): void;
  /**
   * Ping the MongoDB server and retrieve results
   *
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  ping(): Promise<Document>;
  ping(callback: Callback<Document>): void;
  ping(options: CommandOperationOptions): Promise<Document>;
  ping(options: CommandOperationOptions, callback: Callback<Document>): void;
  /**
   * Add a user to the database
   *
   * @param username - The username for the new user
   * @param password - An optional password for the new user
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  addUser(username: string): Promise<Document>;
  addUser(username: string, callback: Callback<Document>): void;
  addUser(username: string, password: string): Promise<Document>;
  addUser(username: string, password: string, callback: Callback<Document>): void;
  addUser(username: string, options: AddUserOptions): Promise<Document>;
  addUser(username: string, options: AddUserOptions, callback: Callback<Document>): void;
  addUser(username: string, password: string, options: AddUserOptions): Promise<Document>;
  addUser(username: string, password: string, options: AddUserOptions, callback: Callback<Document>): void;
  /**
   * Remove a user from a database
   *
   * @param username - The username to remove
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  removeUser(username: string): Promise<boolean>;
  removeUser(username: string, callback: Callback<boolean>): void;
  removeUser(username: string, options: RemoveUserOptions): Promise<boolean>;
  removeUser(username: string, options: RemoveUserOptions, callback: Callback<boolean>): void;
  /**
   * Validate an existing collection
   *
   * @param collectionName - The name of the collection to validate.
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  validateCollection(collectionName: string): Promise<Document>;
  validateCollection(collectionName: string, callback: Callback<Document>): void;
  validateCollection(collectionName: string, options: ValidateCollectionOptions): Promise<Document>;
  validateCollection(collectionName: string, options: ValidateCollectionOptions, callback: Callback<Document>): void;
  /**
   * List the available databases
   *
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  listDatabases(): Promise<ListDatabasesResult>;
  listDatabases(callback: Callback<ListDatabasesResult>): void;
  listDatabases(options: ListDatabasesOptions): Promise<ListDatabasesResult>;
  listDatabases(options: ListDatabasesOptions, callback: Callback<ListDatabasesResult>): void;
  /**
   * Get ReplicaSet status
   *
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  replSetGetStatus(): Promise<Document>;
  replSetGetStatus(callback: Callback<Document>): void;
  replSetGetStatus(options: CommandOperationOptions): Promise<Document>;
  replSetGetStatus(options: CommandOperationOptions, callback: Callback<Document>): void;
}
declare class LegacyChangeStream<TSchema extends Document = Document, TChange extends Document = ChangeStreamDocument<TSchema>> extends MDBChangeStream<TSchema, TChange> {
  /** Check if there is any document still available in the Change Stream */
  hasNext(): Promise<boolean>;
  hasNext(callback: Callback<boolean>): void;
  /** Get the next available document from the Change Stream. */
  next(): Promise<TChange>;
  next(callback: Callback<TChange>): void;
  /**
   * Try to get the next available document from the Change Stream's cursor or `null` if an empty batch is returned
   */
  tryNext(): Promise<Document | null>;
  tryNext(callback: Callback<Document | null>): void;
  /** Close the Change Stream */
  close(): Promise<void>;
  close(callback: Callback): void;
}
declare class LegacyCollection<TSchema extends Document = Document> extends Collection<TSchema> {
  /**
   * Inserts a single document into MongoDB. If documents passed in do not contain the **_id** field,
   * one will be added to each of the documents missing it by the driver, mutating the document. This behavior
   * can be overridden by setting the **forceServerObjectId** flag.
   *
   * @param doc - The document to insert
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  insertOne(doc: OptionalUnlessRequiredId<TSchema>, options?: InsertOneOptions): Promise<InsertOneResult<TSchema>>;
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
  insertMany(docs: OptionalUnlessRequiredId<TSchema>[], callback: Callback<InsertManyResult<TSchema>>): void;
  insertMany(docs: OptionalUnlessRequiredId<TSchema>[], options: BulkWriteOptions): Promise<InsertManyResult<TSchema>>;
  insertMany(docs: OptionalUnlessRequiredId<TSchema>[], options: BulkWriteOptions, callback: Callback<InsertManyResult<TSchema>>): void;
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
  bulkWrite(operations: AnyBulkWriteOperation<TSchema>[], callback: Callback<BulkWriteResult>): void;
  bulkWrite(operations: AnyBulkWriteOperation<TSchema>[], options: BulkWriteOptions): Promise<BulkWriteResult>;
  bulkWrite(operations: AnyBulkWriteOperation<TSchema>[], options: BulkWriteOptions, callback: Callback<BulkWriteResult>): void;
  /**
   * Update a single document in a collection
   *
   * @param filter - The filter used to select the document to update
   * @param update - The update operations to be applied to the document
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  updateOne(filter: Filter<TSchema>, update: UpdateFilter<TSchema> | Partial<TSchema>): Promise<UpdateResult>;
  updateOne(filter: Filter<TSchema>, update: UpdateFilter<TSchema> | Partial<TSchema>, callback: Callback<UpdateResult>): void;
  updateOne(filter: Filter<TSchema>, update: UpdateFilter<TSchema> | Partial<TSchema>, options: UpdateOptions): Promise<UpdateResult>;
  updateOne(filter: Filter<TSchema>, update: UpdateFilter<TSchema> | Partial<TSchema>, options: UpdateOptions, callback: Callback<UpdateResult>): void;
  /**
   * Replace a document in a collection with another document
   *
   * @param filter - The filter used to select the document to replace
   * @param replacement - The Document that replaces the matching document
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  replaceOne(filter: Filter<TSchema>, replacement: WithoutId<TSchema>): Promise<UpdateResult | Document>;
  replaceOne(filter: Filter<TSchema>, replacement: WithoutId<TSchema>, callback: Callback<UpdateResult | Document>): void;
  replaceOne(filter: Filter<TSchema>, replacement: WithoutId<TSchema>, options: ReplaceOptions): Promise<UpdateResult | Document>;
  replaceOne(filter: Filter<TSchema>, replacement: WithoutId<TSchema>, options: ReplaceOptions, callback: Callback<UpdateResult | Document>): void;
  /**
   * Update multiple documents in a collection
   *
   * @param filter - The filter used to select the documents to update
   * @param update - The update operations to be applied to the documents
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  updateMany(filter: Filter<TSchema>, update: UpdateFilter<TSchema>): Promise<UpdateResult | Document>;
  updateMany(filter: Filter<TSchema>, update: UpdateFilter<TSchema>, callback: Callback<UpdateResult | Document>): void;
  updateMany(filter: Filter<TSchema>, update: UpdateFilter<TSchema>, options: UpdateOptions): Promise<UpdateResult | Document>;
  updateMany(filter: Filter<TSchema>, update: UpdateFilter<TSchema>, options: UpdateOptions, callback: Callback<UpdateResult | Document>): void;
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
  deleteOne(filter: Filter<TSchema>, options: DeleteOptions, callback?: Callback<DeleteResult>): void;
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
  deleteMany(filter: Filter<TSchema>, options: DeleteOptions, callback: Callback<DeleteResult>): void;
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
  rename(newName: string): Promise<LegacyCollection>;
  rename(newName: string, callback: Callback<LegacyCollection>): void;
  rename(newName: string, options: RenameOptions): Promise<LegacyCollection>;
  rename(newName: string, options: RenameOptions, callback: Callback<LegacyCollection>): void;
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
  findOne(filter: Filter<TSchema>, options: FindOptions, callback: Callback<WithId<TSchema> | null>): void;
  findOne<T = TSchema>(): Promise<T | null>;
  findOne<T = TSchema>(callback: Callback<T | null>): void;
  findOne<T = TSchema>(filter: Filter<TSchema>): Promise<T | null>;
  findOne<T = TSchema>(filter: Filter<TSchema>, options?: FindOptions): Promise<T | null>;
  findOne<T = TSchema>(filter: Filter<TSchema>, options?: FindOptions, callback?: Callback<T | null>): void;
  /**
   * Creates a cursor for a filter that can be used to iterate over results from MongoDB
   *
   * @param filter - The filter predicate. If unspecified, then all documents in the collection will match the predicate
   */
  find(): LegacyFindCursor<WithId<TSchema>>;
  find(filter: Filter<TSchema>, options?: FindOptions): LegacyFindCursor<WithId<TSchema>>;
  find<T extends Document>(filter: Filter<TSchema>, options?: FindOptions): LegacyFindCursor<T>;
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
  createIndex(indexSpec: IndexSpecification, options: CreateIndexesOptions, callback: Callback<string>): void;
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
  createIndexes(indexSpecs: IndexDescription[], options: CreateIndexesOptions, callback: Callback<string[]>): void;
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
  /**
   * Get the list of all indexes information for the collection.
   *
   * @param options - Optional settings for the command
   */
  listIndexes(options?: ListIndexesOptions): LegacyListIndexesCursor;
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
  indexExists(indexes: string | string[], options: IndexInformationOptions, callback: Callback<boolean>): void;
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
  /**
   * Gets an estimate of the count of documents in a collection using collection metadata.
   * This will always run a count command on all server versions.
   *
   * due to an oversight in versions 5.0.0-5.0.8 of MongoDB, the count command,
   * which estimatedDocumentCount uses in its implementation, was not included in v1 of
   * the Stable API, and so users of the Stable API with estimatedDocumentCount are
   * recommended to upgrade their server version to 5.0.9+ or set apiStrict: false to avoid
   * encountering errors.
   *
   * @see {@link https://www.mongodb.com/docs/manual/reference/command/count/#behavior|Count: Behavior}
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  estimatedDocumentCount(): Promise<number>;
  estimatedDocumentCount(callback: Callback<number>): void;
  estimatedDocumentCount(options: EstimatedDocumentCountOptions): Promise<number>;
  estimatedDocumentCount(options: EstimatedDocumentCountOptions, callback: Callback<number>): void;
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
  countDocuments(filter: Filter<TSchema>, options: CountDocumentsOptions, callback: Callback<number>): void;
  countDocuments(filter: Filter<TSchema>, callback: Callback<number>): void;
  /**
   * The distinct command returns a list of distinct values for the given key across a collection.
   *
   * @param key - Field of the document to find distinct values for
   * @param filter - The filter for filtering the set of documents to which we apply the distinct filter.
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  distinct<Key extends keyof WithId<TSchema>>(key: Key): Promise<Array<Flatten<WithId<TSchema>[Key]>>>;
  distinct<Key extends keyof WithId<TSchema>>(key: Key, callback: Callback<Array<Flatten<WithId<TSchema>[Key]>>>): void;
  distinct<Key extends keyof WithId<TSchema>>(key: Key, filter: Filter<TSchema>): Promise<Array<Flatten<WithId<TSchema>[Key]>>>;
  distinct<Key extends keyof WithId<TSchema>>(key: Key, filter: Filter<TSchema>, callback: Callback<Array<Flatten<WithId<TSchema>[Key]>>>): void;
  distinct<Key extends keyof WithId<TSchema>>(key: Key, filter: Filter<TSchema>, options: DistinctOptions): Promise<Array<Flatten<WithId<TSchema>[Key]>>>;
  distinct<Key extends keyof WithId<TSchema>>(key: Key, filter: Filter<TSchema>, options: DistinctOptions, callback: Callback<Array<Flatten<WithId<TSchema>[Key]>>>): void;
  distinct(key: string): Promise<any[]>;
  distinct(key: string, callback: Callback<any[]>): void;
  distinct(key: string, filter: Filter<TSchema>): Promise<any[]>;
  distinct(key: string, filter: Filter<TSchema>, callback: Callback<any[]>): void;
  distinct(key: string, filter: Filter<TSchema>, options: DistinctOptions): Promise<any[]>;
  distinct(key: string, filter: Filter<TSchema>, options: DistinctOptions, callback: Callback<any[]>): void;
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
  /**
   * Find a document and delete it in one atomic operation. Requires a write lock for the duration of the operation.
   *
   * @param filter - The filter used to select the document to remove
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  findOneAndDelete(filter: Filter<TSchema>): Promise<ModifyResult<TSchema>>;
  findOneAndDelete(filter: Filter<TSchema>, options: FindOneAndDeleteOptions): Promise<ModifyResult<TSchema>>;
  findOneAndDelete(filter: Filter<TSchema>, callback: Callback<ModifyResult<TSchema>>): void;
  findOneAndDelete(filter: Filter<TSchema>, options: FindOneAndDeleteOptions, callback: Callback<ModifyResult<TSchema>>): void;
  /**
   * Find a document and replace it in one atomic operation. Requires a write lock for the duration of the operation.
   *
   * @param filter - The filter used to select the document to replace
   * @param replacement - The Document that replaces the matching document
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  findOneAndReplace(filter: Filter<TSchema>, replacement: WithoutId<TSchema>): Promise<ModifyResult<TSchema>>;
  findOneAndReplace(filter: Filter<TSchema>, replacement: WithoutId<TSchema>, callback: Callback<ModifyResult<TSchema>>): void;
  findOneAndReplace(filter: Filter<TSchema>, replacement: WithoutId<TSchema>, options: FindOneAndReplaceOptions): Promise<ModifyResult<TSchema>>;
  findOneAndReplace(filter: Filter<TSchema>, replacement: WithoutId<TSchema>, options: FindOneAndReplaceOptions, callback: Callback<ModifyResult<TSchema>>): void;
  /**
   * Find a document and update it in one atomic operation. Requires a write lock for the duration of the operation.
   *
   * @param filter - The filter used to select the document to update
   * @param update - Update operations to be performed on the document
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  findOneAndUpdate(filter: Filter<TSchema>, update: UpdateFilter<TSchema>): Promise<ModifyResult<TSchema>>;
  findOneAndUpdate(filter: Filter<TSchema>, update: UpdateFilter<TSchema>, callback: Callback<ModifyResult<TSchema>>): void;
  findOneAndUpdate(filter: Filter<TSchema>, update: UpdateFilter<TSchema>, options: FindOneAndUpdateOptions): Promise<ModifyResult<TSchema>>;
  findOneAndUpdate(filter: Filter<TSchema>, update: UpdateFilter<TSchema>, options: FindOneAndUpdateOptions, callback: Callback<ModifyResult<TSchema>>): void;
  /**
   * Execute an aggregation framework pipeline against the collection, needs MongoDB \>= 2.2
   *
   * @param pipeline - An array of aggregation pipelines to execute
   * @param options - Optional settings for the command
   */
  aggregate<T extends Document = Document>(pipeline?: Document[], options?: AggregateOptions): LegacyAggregationCursor<T>;
  /**
   * Create a new Change Stream, watching for new changes (insertions, updates, replacements, deletions, and invalidations) in this collection.
   *
   * @remarks
   * watch() accepts two generic arguments for distinct usecases:
   * - The first is to override the schema that may be defined for this specific collection
   * - The second is to override the shape of the change stream document entirely, if it is not provided the type will default to ChangeStreamDocument of the first argument
   * @example
   * By just providing the first argument I can type the change to be `ChangeStreamDocument<{ _id: number }>`
   * ```ts
   * collection.watch<{ _id: number }>()
   *   .on('change', change => console.log(change._id.toFixed(4)));
   * ```
   *
   * @example
   * Passing a second argument provides a way to reflect the type changes caused by an advanced pipeline.
   * Here, we are using a pipeline to have MongoDB filter for insert changes only and add a comment.
   * No need start from scratch on the ChangeStreamInsertDocument type!
   * By using an intersection we can save time and ensure defaults remain the same type!
   * ```ts
   * collection
   *   .watch<Schema, ChangeStreamInsertDocument<Schema> & { comment: string }>([
   *     { $addFields: { comment: 'big changes' } },
   *     { $match: { operationType: 'insert' } }
   *   ])
   *   .on('change', change => {
   *     change.comment.startsWith('big');
   *     change.operationType === 'insert';
   *     // No need to narrow in code because the generics did that for us!
   *     expectType<Schema>(change.fullDocument);
   *   });
   * ```
   *
   * @param pipeline - An array of {@link https://docs.mongodb.com/manual/reference/operator/aggregation-pipeline/|aggregation pipeline stages} through which to pass change stream documents. This allows for filtering (using $match) and manipulating the change stream documents.
   * @param options - Optional settings for the command
   * @typeParam TLocal - Type of the data being detected by the change stream
   * @typeParam TChange - Type of the whole change stream document emitted
   */
  watch<TLocal extends Document = TSchema, TChange extends Document = ChangeStreamDocument<TLocal>>(pipeline?: Document[], options?: ChangeStreamOptions): LegacyChangeStream<TLocal, TChange>;
  /**
   * Run Map Reduce across a collection. Be aware that the inline option for out will return an array of results not a collection.
   *
   * @deprecated collection.mapReduce is deprecated. Use the aggregation pipeline instead. Visit https://docs.mongodb.com/manual/reference/map-reduce-to-aggregation-pipeline for more information on how to translate map-reduce operations to the aggregation pipeline.
   * @param map - The mapping function.
   * @param reduce - The reduce function.
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  mapReduce<TKey = any, TValue = any>(map: string | MapFunction<TSchema>, reduce: string | ReduceFunction<TKey, TValue>): Promise<Document | Document[]>;
  mapReduce<TKey = any, TValue = any>(map: string | MapFunction<TSchema>, reduce: string | ReduceFunction<TKey, TValue>, callback: Callback<Document | Document[]>): void;
  mapReduce<TKey = any, TValue = any>(map: string | MapFunction<TSchema>, reduce: string | ReduceFunction<TKey, TValue>, options: MapReduceOptions<TKey, TValue>): Promise<Document | Document[]>;
  mapReduce<TKey = any, TValue = any>(map: string | MapFunction<TSchema>, reduce: string | ReduceFunction<TKey, TValue>, options: MapReduceOptions<TKey, TValue>, callback: Callback<Document | Document[]>): void;
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
  insert(docs: OptionalUnlessRequiredId<TSchema>[], options: BulkWriteOptions, callback: Callback<InsertManyResult<TSchema>>): Promise<InsertManyResult<TSchema>> | void;
  /**
   * Updates documents.
   *
   * @deprecated use updateOne, updateMany or bulkWrite
   * @param selector - The selector for the update operation.
   * @param update - The update operations to be applied to the documents
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  update(selector: Filter<TSchema>, update: UpdateFilter<TSchema>, options: UpdateOptions, callback: Callback<Document>): Promise<UpdateResult> | void;
  /**
   * Remove documents.
   *
   * @deprecated use deleteOne, deleteMany or bulkWrite
   * @param selector - The selector for the update operation.
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  remove(selector: Filter<TSchema>, options: DeleteOptions, callback: Callback): Promise<DeleteResult> | void;
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
  count(filter: Filter<TSchema>, options: CountOptions, callback: Callback<number>): Promise<number> | void;
}
declare class LegacyDb extends Db {
  collection(name: string): LegacyCollection;
  /**
   * Create a new collection on a server with the specified options. Use this to create capped collections.
   * More information about command options available at https://docs.mongodb.com/manual/reference/command/create/
   *
   * @param name - The name of the collection to create
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  createCollection<TSchema extends Document = Document>(name: string, options?: CreateCollectionOptions): Promise<LegacyCollection<TSchema>>;
  createCollection<TSchema extends Document = Document>(name: string, callback: Callback<LegacyCollection<TSchema>>): void;
  createCollection<TSchema extends Document = Document>(name: string, options: CreateCollectionOptions | undefined, callback: Callback<LegacyCollection<TSchema>>): void;
  /**
   * Execute a command
   *
   * @remarks
   * This command does not inherit options from the MongoClient.
   *
   * @param command - The command to run
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  command(command: Document): Promise<Document>;
  command(command: Document, callback: Callback<Document>): void;
  command(command: Document, options: RunCommandOptions): Promise<Document>;
  command(command: Document, options: RunCommandOptions, callback: Callback<Document>): void;
  /**
   * Execute an aggregation framework pipeline against the database, needs MongoDB \>= 3.6
   *
   * @param pipeline - An array of aggregation stages to be executed
   * @param options - Optional settings for the command
   */
  aggregate<T extends Document = Document>(pipeline?: Document[], options?: AggregateOptions): LegacyAggregationCursor<T>;
  /** Return the Admin db instance */
  admin(): LegacyAdmin;
  /**
   * Returns a reference to a MongoDB Collection. If it does not exist it will be created implicitly.
   *
   * @param name - the collection name we wish to access.
   * @returns return the new Collection instance
   */
  collection<TSchema extends Document = Document>(name: string, options?: CollectionOptions): LegacyCollection<TSchema>;
  /**
   * Get all the db statistics.
   *
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  stats(): Promise<Document>;
  stats(callback: Callback<Document>): void;
  stats(options: DbStatsOptions): Promise<Document>;
  stats(options: DbStatsOptions, callback: Callback<Document>): void;
  /**
   * List all collections of this database with optional filter
   *
   * @param filter - Query to filter collections by
   * @param options - Optional settings for the command
   */
  listCollections(filter: Document,options: Exclude<ListCollectionsOptions, 'nameOnly'> & { nameOnly: true }): LegacyListCollectionsCursor<Pick<CollectionInfo, 'name' | 'type'>>;
  listCollections(filter: Document,options: Exclude<ListCollectionsOptions, 'nameOnly'> & {  nameOnly: false }): LegacyListCollectionsCursor<CollectionInfo>;
  listCollections<T extends Pick<CollectionInfo, 'name' | 'type'> | CollectionInfo = Pick<CollectionInfo, 'name' | 'type'> | CollectionInfo>(filter?: Document, options?: ListCollectionsOptions): LegacyListCollectionsCursor<T>;
  /**
   * Rename a collection.
   *
   * @remarks
   * This operation does not inherit options from the MongoClient.
   *
   * @param fromCollection - Name of current collection to rename
   * @param toCollection - New name of of the collection
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  renameCollection<TSchema extends Document = Document>(fromCollection: string, toCollection: string): Promise<LegacyCollection<TSchema>>;
  renameCollection<TSchema extends Document = Document>(fromCollection: string, toCollection: string, callback: Callback<LegacyCollection<TSchema>>): void;
  renameCollection<TSchema extends Document = Document>(fromCollection: string, toCollection: string, options: RenameOptions): Promise<LegacyCollection<TSchema>>;
  renameCollection<TSchema extends Document = Document>(fromCollection: string, toCollection: string, options: RenameOptions, callback: Callback<LegacyCollection<TSchema>>): void;
  /**
   * Drop a collection from the database, removing it permanently. New accesses will create a new collection.
   *
   * @param name - Name of collection to drop
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  dropCollection(name: string): Promise<boolean>;
  dropCollection(name: string, callback: Callback<boolean>): void;
  dropCollection(name: string, options: DropCollectionOptions): Promise<boolean>;
  dropCollection(name: string, options: DropCollectionOptions, callback: Callback<boolean>): void;
  /**
   * Drop a database, removing it permanently from the server.
   *
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  dropDatabase(): Promise<boolean>;
  dropDatabase(callback: Callback<boolean>): void;
  dropDatabase(options: DropDatabaseOptions): Promise<boolean>;
  dropDatabase(options: DropDatabaseOptions, callback: Callback<boolean>): void;
  /**
   * Fetch all collections for the current db.
   *
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  collections(): Promise<LegacyCollection[]>;
  collections(callback: Callback<LegacyCollection[]>): void;
  collections(options: ListCollectionsOptions): Promise<LegacyCollection[]>;
  collections(options: ListCollectionsOptions, callback: Callback<LegacyCollection[]>): void;
  /**
   * Creates an index on the db and collection.
   *
   * @param name - Name of the collection to create the index on.
   * @param indexSpec - Specify the field to index, or an index specification
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  createIndex(name: string, indexSpec: IndexSpecification): Promise<string>;
  createIndex(name: string, indexSpec: IndexSpecification, callback?: Callback<string>): void;
  createIndex(name: string, indexSpec: IndexSpecification, options: CreateIndexesOptions): Promise<string>;
  createIndex(name: string, indexSpec: IndexSpecification, options: CreateIndexesOptions, callback: Callback<string>): void;
  /**
   * Add a user to the database
   *
   * @param username - The username for the new user
   * @param password - An optional password for the new user
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  addUser(username: string): Promise<Document>;
  addUser(username: string, callback: Callback<Document>): void;
  addUser(username: string, password: string): Promise<Document>;
  addUser(username: string, password: string, callback: Callback<Document>): void;
  addUser(username: string, options: AddUserOptions): Promise<Document>;
  addUser(username: string, options: AddUserOptions, callback: Callback<Document>): void;
  addUser(username: string, password: string, options: AddUserOptions): Promise<Document>;
  addUser(username: string, password: string, options: AddUserOptions, callback: Callback<Document>): void;
  /**
   * Remove a user from a database
   *
   * @param username - The username to remove
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  removeUser(username: string): Promise<boolean>;
  removeUser(username: string, callback: Callback<boolean>): void;
  removeUser(username: string, options: RemoveUserOptions): Promise<boolean>;
  removeUser(username: string, options: RemoveUserOptions, callback: Callback<boolean>): void;
  /**
   * Set the current profiling level of MongoDB
   *
   * @param level - The new profiling level (off, slow_only, all).
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  setProfilingLevel(level: ProfilingLevel): Promise<ProfilingLevel>;
  setProfilingLevel(level: ProfilingLevel, callback: Callback<ProfilingLevel>): void;
  setProfilingLevel(level: ProfilingLevel, options: SetProfilingLevelOptions): Promise<ProfilingLevel>;
  setProfilingLevel(level: ProfilingLevel, options: SetProfilingLevelOptions, callback: Callback<ProfilingLevel>): void;
  /**
   * Retrieve the current profiling Level for MongoDB
   *
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  profilingLevel(): Promise<string>;
  profilingLevel(callback: Callback<string>): void;
  profilingLevel(options: ProfilingLevelOptions): Promise<string>;
  profilingLevel(options: ProfilingLevelOptions, callback: Callback<string>): void;
  /**
   * Retrieves this collections index info.
   *
   * @param name - The name of the collection.
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  indexInformation(name: string): Promise<Document>;
  indexInformation(name: string, callback: Callback<Document>): void;
  indexInformation(name: string, options: IndexInformationOptions): Promise<Document>;
  indexInformation(name: string, options: IndexInformationOptions, callback: Callback<Document>): void;
  /**
   * Create a new Change Stream, watching for new changes (insertions, updates,
   * replacements, deletions, and invalidations) in this database. Will ignore all
   * changes to system collections.
   *
   * @remarks
   * watch() accepts two generic arguments for distinct usecases:
   * - The first is to provide the schema that may be defined for all the collections within this database
   * - The second is to override the shape of the change stream document entirely, if it is not provided the type will default to ChangeStreamDocument of the first argument
   *
   * @param pipeline - An array of {@link https://docs.mongodb.com/manual/reference/operator/aggregation-pipeline/|aggregation pipeline stages} through which to pass change stream documents. This allows for filtering (using $match) and manipulating the change stream documents.
   * @param options - Optional settings for the command
   * @typeParam TSchema - Type of the data being detected by the change stream
   * @typeParam TChange - Type of the whole change stream document emitted
   */
  watch<TSchema extends Document = Document, TChange extends Document = ChangeStreamDocument<TSchema>>(pipeline?: Document[], options?: ChangeStreamOptions): LegacyChangeStream<TSchema, TChange>;
}
declare class LegacyGridFSBucket extends GridFSBucket {
  /**
   * Deletes a file with the given id
   *
   * @param id - The id of the file doc
   */
  delete(id: ObjectId): Promise<void>;
  delete(id: ObjectId, callback: Callback<void>): void;
  /**
   * Renames the file with the given _id to the given string
   *
   * @param id - the id of the file to rename
   * @param filename - new name for the file
   */
  rename(id: ObjectId, filename: string): Promise<void>;
  rename(id: ObjectId, filename: string, callback: Callback<void>): void;
  /** Removes this bucket's files collection, followed by its chunks collection. */
  drop(): Promise<void>;
  drop(callback: Callback<void>): void;
  /** Convenience wrapper around find on the files collection */
  find(filter?: Filter<GridFSFile>, options?: FindOptions): LegacyFindCursor<GridFSFile>;
}
declare class LegacyMongoClient extends MongoClient {
  /**
   * Connect to MongoDB using a url
   *
   * @see docs.mongodb.org/manual/reference/connection-string/
   */
  connect(): Promise<this>;
  connect(callback: Callback<this>): void;
  /**
   * Close the db and its underlying connections
   *
   * @param force - Force close, emitting no events
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  close(): Promise<void>;
  close(callback: Callback<void>): void;
  close(force: boolean): Promise<void>;
  close(force: boolean, callback: Callback<void>): void;
  /**
   * Create a new Db instance sharing the current socket connections.
   *
   * @param dbName - The name of the database we want to use. If not provided, use database name from connection string.
   * @param options - Optional settings for Db construction
   */
  db(dbName?: string, options?: DbOptions): LegacyDb;
  /**
   * Connect to MongoDB using a url
   *
   * @remarks
   * The programmatically provided options take precedence over the URI options.
   *
   * @see https://docs.mongodb.org/manual/reference/connection-string/
   */
  static connect(url: string): Promise<LegacyMongoClient>;
  static connect(url: string, callback: Callback<LegacyMongoClient>): void;
  static connect(url: string, options: MongoClientOptions): Promise<LegacyMongoClient>;
  static connect(url: string, options: MongoClientOptions, callback: Callback<LegacyMongoClient>): void;
  /**
   * Create a new Change Stream, watching for new changes (insertions, updates,
   * replacements, deletions, and invalidations) in this cluster. Will ignore all
   * changes to system collections, as well as the local, admin, and config databases.
   *
   * @remarks
   * watch() accepts two generic arguments for distinct usecases:
   * - The first is to provide the schema that may be defined for all the data within the current cluster
   * - The second is to override the shape of the change stream document entirely, if it is not provided the type will default to ChangeStreamDocument of the first argument
   *
   * @param pipeline - An array of {@link https://docs.mongodb.com/manual/reference/operator/aggregation-pipeline/|aggregation pipeline stages} through which to pass change stream documents. This allows for filtering (using $match) and manipulating the change stream documents.
   * @param options - Optional settings for the command
   * @typeParam TSchema - Type of the data being detected by the change stream
   * @typeParam TChange - Type of the whole change stream document emitted
   */
  watch<TSchema extends Document = Document, TChange extends Document = ChangeStreamDocument<TSchema>>(pipeline?: Document[], options?: ChangeStreamOptions): LegacyChangeStream<TSchema, TChange>;
}

// Cursors
declare const AbstractCursor: new <TSchema = any, CursorEvents extends AbstractCursorEvents = AbstractCursorEvents>(...args: any[]) => Omit<MDBAbstractCursor<TSchema, CursorEvents>, 'close' | 'forEach' | 'hasNext' | 'next' | 'toArray' | 'tryNext'>;

declare class LegacyAbstractCursor<TSchema = any, CursorEvents extends AbstractCursorEvents = AbstractCursorEvents> extends AbstractCursor<TSchema, CursorEvents> {
  hasNext(): Promise<boolean>;
  hasNext(callback: Callback<boolean>): void;
  /** Get the next available document from the cursor, returns null if no more documents are available. */
  next(): Promise<TSchema | null>;
  next(callback: Callback<TSchema | null>): void;
  next(callback?: Callback<TSchema | null>): Promise<TSchema | null> | void;
  /**
   * Try to get the next available document from the cursor or `null` if an empty batch is returned
   */
  tryNext(): Promise<TSchema | null>;
  tryNext(callback: Callback<TSchema | null>): void;
  /**
   * Iterates over all the documents for this cursor using the iterator, callback pattern.
   *
   * @param iterator - The iteration callback.
   * @param callback - The end callback.
   */
  forEach(iterator: (doc: TSchema) => boolean | void): Promise<void>;
  forEach(iterator: (doc: TSchema) => boolean | void, callback: Callback<void>): void;
  close(): Promise<void>;
  close(callback: Callback): void;
  /**
   * @deprecated options argument is deprecated
   */
  close(options: CursorCloseOptions): Promise<void>;
  /**
   * @deprecated options argument is deprecated
   */
  close(options: CursorCloseOptions, callback: Callback): void;
  /**
   * Returns an array of documents. The caller is responsible for making sure that there
   * is enough memory to store the results. Note that the array only contains partial
   * results when this cursor had been previously accessed. In that case,
   * cursor.rewind() can be used to reset the cursor.
   *
   * @param callback - The result callback.
   */
  toArray(): Promise<TSchema[]>;
  toArray(callback: Callback<TSchema[]>): void;
}

declare const FindCursor: new <TSchema = any>(...args: any[]) => LegacyAbstractCursor<TSchema> & Omit<MDBFindCursor<TSchema>, 'count' | 'explain'>;
declare const AggregationCursor: new <TSchema = any>(...args: any[]) => LegacyAbstractCursor<TSchema> & Omit<MDBAggregationCursor<TSchema>, 'explain'>;
declare const ListCollectionsCursor: new <T extends Pick<CollectionInfo, 'name' | 'type'> | CollectionInfo = Pick<CollectionInfo, 'name' | 'type'> | CollectionInfo>(...args: any[]) => LegacyAbstractCursor<T> & MDBListCollectionsCursor<T>;
declare const ListIndexesCursor: new (...args: any[]) => LegacyAbstractCursor & MDBListIndexesCursor;

declare class LegacyFindCursor<TSchema = any> extends FindCursor<TSchema> {
  /**
   * Get the count of documents for this cursor
   * @deprecated Use `collection.estimatedDocumentCount` or `collection.countDocuments` instead
   */
  count(): Promise<number>;
  /** @deprecated Use `collection.estimatedDocumentCount` or `collection.countDocuments` instead */
  count(callback: Callback<number>): void;
  /** @deprecated Use `collection.estimatedDocumentCount` or `collection.countDocuments` instead */
  count(options: CountOptions): Promise<number>;
  /** @deprecated Use `collection.estimatedDocumentCount` or `collection.countDocuments` instead */
  count(options: CountOptions, callback: Callback<number>): void;
  /** Execute the explain for the cursor */
  explain(): Promise<Document>;
  explain(callback: Callback): void;
  explain(verbosity?: ExplainVerbosityLike): Promise<Document>;
}
declare class LegacyAggregationCursor<TSchema = any> extends AggregationCursor<TSchema> {
  /** Execute the explain for the cursor */
  explain(): Promise<Document>;
  explain(callback: Callback): void;
  explain(verbosity: ExplainVerbosityLike): Promise<Document>;
}
declare class LegacyListCollectionsCursor<T extends Pick<CollectionInfo, 'name' | 'type'> | CollectionInfo = Pick<CollectionInfo, 'name' | 'type'> | CollectionInfo> extends ListCollectionsCursor<T> {}
declare class LegacyListIndexesCursor extends ListIndexesCursor {}

// Re-export everything
export * from 'mongodb';
// Override classes back to the usual names
export {
  LegacyAdmin as Admin,
  LegacyFindCursor as FindCursor,
  LegacyListCollectionsCursor as ListCollectionsCursor,
  LegacyListIndexesCursor as ListIndexesCursor,
  LegacyAggregationCursor as AggregationCursor,
  LegacyChangeStream as ChangeStream,
  LegacyCollection as Collection,
  LegacyDb as Db,
  LegacyGridFSBucket as GridFSBucket,
  LegacyMongoClient as MongoClient,
}
