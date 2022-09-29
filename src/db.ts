import { Admin } from './admin';
import { BSONSerializeOptions, Document, resolveBSONOptions } from './bson';
import { ChangeStream, ChangeStreamDocument, ChangeStreamOptions } from './change_stream';
import { Collection, CollectionOptions } from './collection';
import * as CONSTANTS from './constants';
import { AggregationCursor } from './cursor/aggregation_cursor';
import { ListCollectionsCursor } from './cursor/list_collections_cursor';
import { MongoAPIError, MongoInvalidArgumentError } from './error';
import { Logger, LoggerOptions } from './logger';
import type { MongoClient, PkFactory } from './mongo_client';
import type { TODO_NODE_3286 } from './mongo_types';
import { AddUserOperation, AddUserOptions } from './operations/add_user';
import type { AggregateOptions } from './operations/aggregate';
import { CollectionsOperation } from './operations/collections';
import type { IndexInformationOptions } from './operations/common_functions';
import { CreateCollectionOperation, CreateCollectionOptions } from './operations/create_collection';
import {
  DropCollectionOperation,
  DropCollectionOptions,
  DropDatabaseOperation,
  DropDatabaseOptions
} from './operations/drop';
import { executeOperation } from './operations/execute_operation';
import {
  CreateIndexesOptions,
  CreateIndexOperation,
  IndexInformationOperation,
  IndexSpecification
} from './operations/indexes';
import type { CollectionInfo, ListCollectionsOptions } from './operations/list_collections';
import { ProfilingLevelOperation, ProfilingLevelOptions } from './operations/profiling_level';
import { RemoveUserOperation, RemoveUserOptions } from './operations/remove_user';
import { RenameOperation, RenameOptions } from './operations/rename';
import { RunCommandOperation, RunCommandOptions } from './operations/run_command';
import {
  ProfilingLevel,
  SetProfilingLevelOperation,
  SetProfilingLevelOptions
} from './operations/set_profiling_level';
import { DbStatsOperation, DbStatsOptions } from './operations/stats';
import { ReadConcern } from './read_concern';
import { ReadPreference, ReadPreferenceLike } from './read_preference';
import {
  Callback,
  DEFAULT_PK_FACTORY,
  filterOptions,
  getTopology,
  MongoDBNamespace,
  resolveOptions
} from './utils';
import { WriteConcern, WriteConcernOptions } from './write_concern';

// Allowed parameters
const DB_OPTIONS_ALLOW_LIST = [
  'writeConcern',
  'readPreference',
  'readPreferenceTags',
  'native_parser',
  'forceServerObjectId',
  'pkFactory',
  'serializeFunctions',
  'raw',
  'authSource',
  'ignoreUndefined',
  'readConcern',
  'retryMiliSeconds',
  'numberOfRetries',
  'loggerLevel',
  'logger',
  'promoteBuffers',
  'promoteLongs',
  'bsonRegExp',
  'enableUtf8Validation',
  'promoteValues',
  'compression',
  'retryWrites'
];

/** @internal */
export interface DbPrivate {
  client: MongoClient;
  options?: DbOptions;
  logger: Logger;
  readPreference?: ReadPreference;
  pkFactory: PkFactory;
  readConcern?: ReadConcern;
  bsonOptions: BSONSerializeOptions;
  writeConcern?: WriteConcern;
  namespace: MongoDBNamespace;
}

/** @public */
export interface DbOptions extends BSONSerializeOptions, WriteConcernOptions, LoggerOptions {
  /** If the database authentication is dependent on another databaseName. */
  authSource?: string;
  /** Force server to assign _id values instead of driver. */
  forceServerObjectId?: boolean;
  /** The preferred read preference (ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST). */
  readPreference?: ReadPreferenceLike;
  /** A primary key factory object for generation of custom _id keys. */
  pkFactory?: PkFactory;
  /** Specify a read concern for the collection. (only MongoDB 3.2 or higher supported) */
  readConcern?: ReadConcern;
  /** Should retry failed writes */
  retryWrites?: boolean;
}

/**
 * The **Db** class is a class that represents a MongoDB Database.
 * @public
 *
 * @example
 * ```ts
 * import { MongoClient } from 'mongodb';
 *
 * interface Pet {
 *   name: string;
 *   kind: 'dog' | 'cat' | 'fish';
 * }
 *
 * const client = new MongoClient('mongodb://localhost:27017');
 * const db = client.db();
 *
 * // Create a collection that validates our union
 * await db.createCollection<Pet>('pets', {
 *   validator: { $expr: { $in: ['$kind', ['dog', 'cat', 'fish']] } }
 * })
 * ```
 */
export class Db {
  /** @internal */
  s: DbPrivate;

  public static SYSTEM_NAMESPACE_COLLECTION = CONSTANTS.SYSTEM_NAMESPACE_COLLECTION;
  public static SYSTEM_INDEX_COLLECTION = CONSTANTS.SYSTEM_INDEX_COLLECTION;
  public static SYSTEM_PROFILE_COLLECTION = CONSTANTS.SYSTEM_PROFILE_COLLECTION;
  public static SYSTEM_USER_COLLECTION = CONSTANTS.SYSTEM_USER_COLLECTION;
  public static SYSTEM_COMMAND_COLLECTION = CONSTANTS.SYSTEM_COMMAND_COLLECTION;
  public static SYSTEM_JS_COLLECTION = CONSTANTS.SYSTEM_JS_COLLECTION;

  /**
   * Creates a new Db instance
   *
   * @param client - The MongoClient for the database.
   * @param databaseName - The name of the database this instance represents.
   * @param options - Optional settings for Db construction
   */
  constructor(client: MongoClient, databaseName: string, options?: DbOptions) {
    options = options ?? {};

    // Filter the options
    options = filterOptions(options, DB_OPTIONS_ALLOW_LIST);

    // Ensure we have a valid db name
    validateDatabaseName(databaseName);

    // Internal state of the db object
    this.s = {
      // Client
      client,
      // Options
      options,
      // Logger instance
      logger: new Logger('Db', options),
      // Unpack read preference
      readPreference: ReadPreference.fromOptions(options),
      // Merge bson options
      bsonOptions: resolveBSONOptions(options, client),
      // Set up the primary key factory or fallback to ObjectId
      pkFactory: options?.pkFactory ?? DEFAULT_PK_FACTORY,
      // ReadConcern
      readConcern: ReadConcern.fromOptions(options),
      writeConcern: WriteConcern.fromOptions(options),
      // Namespace
      namespace: new MongoDBNamespace(databaseName)
    };
  }

  get databaseName(): string {
    return this.s.namespace.db;
  }

  // Options
  get options(): DbOptions | undefined {
    return this.s.options;
  }

  /**
   * slaveOk specified
   * @deprecated Use secondaryOk instead
   */
  get slaveOk(): boolean {
    return this.secondaryOk;
  }

  /**
   * Check if a secondary can be used (because the read preference is *not* set to primary)
   */
  get secondaryOk(): boolean {
    return this.s.readPreference?.preference !== 'primary' || false;
  }

  get readConcern(): ReadConcern | undefined {
    return this.s.readConcern;
  }

  /**
   * The current readPreference of the Db. If not explicitly defined for
   * this Db, will be inherited from the parent MongoClient
   */
  get readPreference(): ReadPreference {
    if (this.s.readPreference == null) {
      return this.s.client.readPreference;
    }

    return this.s.readPreference;
  }

  get bsonOptions(): BSONSerializeOptions {
    return this.s.bsonOptions;
  }

  // get the write Concern
  get writeConcern(): WriteConcern | undefined {
    return this.s.writeConcern;
  }

  get namespace(): string {
    return this.s.namespace.toString();
  }

  /**
   * Create a new collection on a server with the specified options. Use this to create capped collections.
   * More information about command options available at https://docs.mongodb.com/manual/reference/command/create/
   *
   * @param name - The name of the collection to create
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  createCollection<TSchema extends Document = Document>(
    name: string,
    options?: CreateCollectionOptions
  ): Promise<Collection<TSchema>>;
  /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
  createCollection<TSchema extends Document = Document>(
    name: string,
    callback: Callback<Collection<TSchema>>
  ): void;
  /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
  createCollection<TSchema extends Document = Document>(
    name: string,
    options: CreateCollectionOptions | undefined,
    callback: Callback<Collection<TSchema>>
  ): void;
  createCollection<TSchema extends Document = Document>(
    name: string,
    options?: CreateCollectionOptions | Callback<Collection>,
    callback?: Callback<Collection>
  ): Promise<Collection<TSchema>> | void {
    if (typeof options === 'function') (callback = options), (options = {});

    return executeOperation(
      this.s.client,
      new CreateCollectionOperation(this, name, resolveOptions(this, options)) as TODO_NODE_3286,
      callback
    ) as TODO_NODE_3286;
  }

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
  /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
  command(command: Document, callback: Callback<Document>): void;
  command(command: Document, options: RunCommandOptions): Promise<Document>;
  /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
  command(command: Document, options: RunCommandOptions, callback: Callback<Document>): void;
  command(
    command: Document,
    options?: RunCommandOptions | Callback<Document>,
    callback?: Callback<Document>
  ): Promise<Document> | void {
    if (typeof options === 'function') (callback = options), (options = {});

    // Intentionally, we do not inherit options from parent for this operation.
    return executeOperation(
      this.s.client,
      new RunCommandOperation(this, command, options ?? {}),
      callback
    );
  }

  /**
   * Execute an aggregation framework pipeline against the database, needs MongoDB \>= 3.6
   *
   * @param pipeline - An array of aggregation stages to be executed
   * @param options - Optional settings for the command
   */
  aggregate<T extends Document = Document>(
    pipeline: Document[] = [],
    options?: AggregateOptions
  ): AggregationCursor<T> {
    if (arguments.length > 2) {
      throw new MongoInvalidArgumentError('Method "db.aggregate()" accepts at most two arguments');
    }
    if (typeof pipeline === 'function') {
      throw new MongoInvalidArgumentError('Argument "pipeline" must not be function');
    }
    if (typeof options === 'function') {
      throw new MongoInvalidArgumentError('Argument "options" must not be function');
    }

    return new AggregationCursor(
      this.s.client,
      this.s.namespace,
      pipeline,
      resolveOptions(this, options)
    );
  }

  /** Return the Admin db instance */
  admin(): Admin {
    return new Admin(this);
  }

  /**
   * Returns a reference to a MongoDB Collection. If it does not exist it will be created implicitly.
   *
   * @param name - the collection name we wish to access.
   * @returns return the new Collection instance
   */
  collection<TSchema extends Document = Document>(
    name: string,
    options: CollectionOptions = {}
  ): Collection<TSchema> {
    if (typeof options === 'function') {
      throw new MongoInvalidArgumentError('The callback form of this helper has been removed.');
    }
    const finalOptions = resolveOptions(this, options);
    return new Collection<TSchema>(this, name, finalOptions);
  }

  /**
   * Get all the db statistics.
   *
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  stats(): Promise<Document>;
  /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
  stats(callback: Callback<Document>): void;
  stats(options: DbStatsOptions): Promise<Document>;
  /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
  stats(options: DbStatsOptions, callback: Callback<Document>): void;
  stats(
    options?: DbStatsOptions | Callback<Document>,
    callback?: Callback<Document>
  ): Promise<Document> | void {
    if (typeof options === 'function') (callback = options), (options = {});
    return executeOperation(
      this.s.client,
      new DbStatsOperation(this, resolveOptions(this, options)),
      callback
    );
  }

  /**
   * List all collections of this database with optional filter
   *
   * @param filter - Query to filter collections by
   * @param options - Optional settings for the command
   */
  listCollections(
    filter: Document,
    options: Exclude<ListCollectionsOptions, 'nameOnly'> & { nameOnly: true }
  ): ListCollectionsCursor<Pick<CollectionInfo, 'name' | 'type'>>;
  listCollections(
    filter: Document,
    options: Exclude<ListCollectionsOptions, 'nameOnly'> & { nameOnly: false }
  ): ListCollectionsCursor<CollectionInfo>;
  listCollections<
    T extends Pick<CollectionInfo, 'name' | 'type'> | CollectionInfo =
      | Pick<CollectionInfo, 'name' | 'type'>
      | CollectionInfo
  >(filter?: Document, options?: ListCollectionsOptions): ListCollectionsCursor<T>;
  listCollections<
    T extends Pick<CollectionInfo, 'name' | 'type'> | CollectionInfo =
      | Pick<CollectionInfo, 'name' | 'type'>
      | CollectionInfo
  >(filter: Document = {}, options: ListCollectionsOptions = {}): ListCollectionsCursor<T> {
    return new ListCollectionsCursor<T>(this, filter, resolveOptions(this, options));
  }

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
  renameCollection<TSchema extends Document = Document>(
    fromCollection: string,
    toCollection: string
  ): Promise<Collection<TSchema>>;
  /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
  renameCollection<TSchema extends Document = Document>(
    fromCollection: string,
    toCollection: string,
    callback: Callback<Collection<TSchema>>
  ): void;
  renameCollection<TSchema extends Document = Document>(
    fromCollection: string,
    toCollection: string,
    options: RenameOptions
  ): Promise<Collection<TSchema>>;
  /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
  renameCollection<TSchema extends Document = Document>(
    fromCollection: string,
    toCollection: string,
    options: RenameOptions,
    callback: Callback<Collection<TSchema>>
  ): void;
  renameCollection<TSchema extends Document = Document>(
    fromCollection: string,
    toCollection: string,
    options?: RenameOptions | Callback<Collection<TSchema>>,
    callback?: Callback<Collection<TSchema>>
  ): Promise<Collection<TSchema>> | void {
    if (typeof options === 'function') (callback = options), (options = {});

    // Intentionally, we do not inherit options from parent for this operation.
    options = { ...options, readPreference: ReadPreference.PRIMARY };

    // Add return new collection
    options.new_collection = true;

    return executeOperation(
      this.s.client,
      new RenameOperation(
        this.collection<TSchema>(fromCollection) as TODO_NODE_3286,
        toCollection,
        options
      ) as TODO_NODE_3286,
      callback
    );
  }

  /**
   * Drop a collection from the database, removing it permanently. New accesses will create a new collection.
   *
   * @param name - Name of collection to drop
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  dropCollection(name: string): Promise<boolean>;
  /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
  dropCollection(name: string, callback: Callback<boolean>): void;
  dropCollection(name: string, options: DropCollectionOptions): Promise<boolean>;
  /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
  dropCollection(name: string, options: DropCollectionOptions, callback: Callback<boolean>): void;
  dropCollection(
    name: string,
    options?: DropCollectionOptions | Callback<boolean>,
    callback?: Callback<boolean>
  ): Promise<boolean> | void {
    if (typeof options === 'function') (callback = options), (options = {});

    return executeOperation(
      this.s.client,
      new DropCollectionOperation(this, name, resolveOptions(this, options)),
      callback
    );
  }

  /**
   * Drop a database, removing it permanently from the server.
   *
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  dropDatabase(): Promise<boolean>;
  /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
  dropDatabase(callback: Callback<boolean>): void;
  dropDatabase(options: DropDatabaseOptions): Promise<boolean>;
  /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
  dropDatabase(options: DropDatabaseOptions, callback: Callback<boolean>): void;
  dropDatabase(
    options?: DropDatabaseOptions | Callback<boolean>,
    callback?: Callback<boolean>
  ): Promise<boolean> | void {
    if (typeof options === 'function') (callback = options), (options = {});

    return executeOperation(
      this.s.client,
      new DropDatabaseOperation(this, resolveOptions(this, options)),
      callback
    );
  }

  /**
   * Fetch all collections for the current db.
   *
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  collections(): Promise<Collection[]>;
  /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
  collections(callback: Callback<Collection[]>): void;
  collections(options: ListCollectionsOptions): Promise<Collection[]>;
  /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
  collections(options: ListCollectionsOptions, callback: Callback<Collection[]>): void;
  collections(
    options?: ListCollectionsOptions | Callback<Collection[]>,
    callback?: Callback<Collection[]>
  ): Promise<Collection[]> | void {
    if (typeof options === 'function') (callback = options), (options = {});

    return executeOperation(
      this.s.client,
      new CollectionsOperation(this, resolveOptions(this, options)),
      callback
    );
  }

  /**
   * Creates an index on the db and collection.
   *
   * @param name - Name of the collection to create the index on.
   * @param indexSpec - Specify the field to index, or an index specification
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  createIndex(name: string, indexSpec: IndexSpecification): Promise<string>;
  /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
  createIndex(name: string, indexSpec: IndexSpecification, callback: Callback<string>): void;
  createIndex(
    name: string,
    indexSpec: IndexSpecification,
    options: CreateIndexesOptions
  ): Promise<string>;
  /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
  createIndex(
    name: string,
    indexSpec: IndexSpecification,
    options: CreateIndexesOptions,
    callback: Callback<string>
  ): void;
  createIndex(
    name: string,
    indexSpec: IndexSpecification,
    options?: CreateIndexesOptions | Callback<string>,
    callback?: Callback<string>
  ): Promise<string> | void {
    if (typeof options === 'function') (callback = options), (options = {});

    return executeOperation(
      this.s.client,
      new CreateIndexOperation(this, name, indexSpec, resolveOptions(this, options)),
      callback
    );
  }

  /**
   * Add a user to the database
   *
   * @param username - The username for the new user
   * @param password - An optional password for the new user
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  addUser(username: string): Promise<Document>;
  /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
  addUser(username: string, callback: Callback<Document>): void;
  addUser(username: string, password: string): Promise<Document>;
  /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
  addUser(username: string, password: string, callback: Callback<Document>): void;
  addUser(username: string, options: AddUserOptions): Promise<Document>;
  /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
  addUser(username: string, options: AddUserOptions, callback: Callback<Document>): void;
  addUser(username: string, password: string, options: AddUserOptions): Promise<Document>;
  /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
  addUser(
    username: string,
    password: string,
    options: AddUserOptions,
    callback: Callback<Document>
  ): void;
  addUser(
    username: string,
    password?: string | AddUserOptions | Callback<Document>,
    options?: AddUserOptions | Callback<Document>,
    callback?: Callback<Document>
  ): Promise<Document> | void {
    if (typeof password === 'function') {
      (callback = password), (password = undefined), (options = {});
    } else if (typeof password !== 'string') {
      if (typeof options === 'function') {
        (callback = options), (options = password), (password = undefined);
      } else {
        (options = password), (callback = undefined), (password = undefined);
      }
    } else {
      if (typeof options === 'function') (callback = options), (options = {});
    }

    return executeOperation(
      this.s.client,
      new AddUserOperation(this, username, password, resolveOptions(this, options)),
      callback
    );
  }

  /**
   * Remove a user from a database
   *
   * @param username - The username to remove
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  removeUser(username: string): Promise<boolean>;
  /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
  removeUser(username: string, callback: Callback<boolean>): void;
  removeUser(username: string, options: RemoveUserOptions): Promise<boolean>;
  /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
  removeUser(username: string, options: RemoveUserOptions, callback: Callback<boolean>): void;
  removeUser(
    username: string,
    options?: RemoveUserOptions | Callback<boolean>,
    callback?: Callback<boolean>
  ): Promise<boolean> | void {
    if (typeof options === 'function') (callback = options), (options = {});

    return executeOperation(
      this.s.client,
      new RemoveUserOperation(this, username, resolveOptions(this, options)),
      callback
    );
  }

  /**
   * Set the current profiling level of MongoDB
   *
   * @param level - The new profiling level (off, slow_only, all).
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  setProfilingLevel(level: ProfilingLevel): Promise<ProfilingLevel>;
  /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
  setProfilingLevel(level: ProfilingLevel, callback: Callback<ProfilingLevel>): void;
  setProfilingLevel(
    level: ProfilingLevel,
    options: SetProfilingLevelOptions
  ): Promise<ProfilingLevel>;
  /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
  setProfilingLevel(
    level: ProfilingLevel,
    options: SetProfilingLevelOptions,
    callback: Callback<ProfilingLevel>
  ): void;
  setProfilingLevel(
    level: ProfilingLevel,
    options?: SetProfilingLevelOptions | Callback<ProfilingLevel>,
    callback?: Callback<ProfilingLevel>
  ): Promise<ProfilingLevel> | void {
    if (typeof options === 'function') (callback = options), (options = {});

    return executeOperation(
      this.s.client,
      new SetProfilingLevelOperation(this, level, resolveOptions(this, options)),
      callback
    );
  }

  /**
   * Retrieve the current profiling Level for MongoDB
   *
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  profilingLevel(): Promise<string>;
  /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
  profilingLevel(callback: Callback<string>): void;
  profilingLevel(options: ProfilingLevelOptions): Promise<string>;
  /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
  profilingLevel(options: ProfilingLevelOptions, callback: Callback<string>): void;
  profilingLevel(
    options?: ProfilingLevelOptions | Callback<string>,
    callback?: Callback<string>
  ): Promise<string> | void {
    if (typeof options === 'function') (callback = options), (options = {});

    return executeOperation(
      this.s.client,
      new ProfilingLevelOperation(this, resolveOptions(this, options)),
      callback
    );
  }

  /**
   * Retrieves this collections index info.
   *
   * @param name - The name of the collection.
   * @param options - Optional settings for the command
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  indexInformation(name: string): Promise<Document>;
  /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
  indexInformation(name: string, callback: Callback<Document>): void;
  indexInformation(name: string, options: IndexInformationOptions): Promise<Document>;
  /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
  indexInformation(
    name: string,
    options: IndexInformationOptions,
    callback: Callback<Document>
  ): void;
  indexInformation(
    name: string,
    options?: IndexInformationOptions | Callback<Document>,
    callback?: Callback<Document>
  ): Promise<Document> | void {
    if (typeof options === 'function') (callback = options), (options = {});

    return executeOperation(
      this.s.client,
      new IndexInformationOperation(this, name, resolveOptions(this, options)),
      callback
    );
  }

  /**
   * Unref all sockets
   * @deprecated This function is deprecated and will be removed in the next major version.
   */
  unref(): void {
    getTopology(this).unref();
  }

  /**
   * Create a new Change Stream, watching for new changes (insertions, updates,
   * replacements, deletions, and invalidations) in this database. Will ignore all
   * changes to system collections.
   *
   * @remarks
   * watch() accepts two generic arguments for distinct use cases:
   * - The first is to provide the schema that may be defined for all the collections within this database
   * - The second is to override the shape of the change stream document entirely, if it is not provided the type will default to ChangeStreamDocument of the first argument
   *
   * @param pipeline - An array of {@link https://docs.mongodb.com/manual/reference/operator/aggregation-pipeline/|aggregation pipeline stages} through which to pass change stream documents. This allows for filtering (using $match) and manipulating the change stream documents.
   * @param options - Optional settings for the command
   * @typeParam TSchema - Type of the data being detected by the change stream
   * @typeParam TChange - Type of the whole change stream document emitted
   */
  watch<
    TSchema extends Document = Document,
    TChange extends Document = ChangeStreamDocument<TSchema>
  >(pipeline: Document[] = [], options: ChangeStreamOptions = {}): ChangeStream<TSchema, TChange> {
    // Allow optionally not specifying a pipeline
    if (!Array.isArray(pipeline)) {
      options = pipeline;
      pipeline = [];
    }

    return new ChangeStream<TSchema, TChange>(this, pipeline, resolveOptions(this, options));
  }

  /** Return the db logger */
  getLogger(): Logger {
    return this.s.logger;
  }

  get logger(): Logger {
    return this.s.logger;
  }
}

// TODO(NODE-3484): Refactor into MongoDBNamespace
// Validate the database name
function validateDatabaseName(databaseName: string) {
  if (typeof databaseName !== 'string')
    throw new MongoInvalidArgumentError('Database name must be a string');
  if (databaseName.length === 0)
    throw new MongoInvalidArgumentError('Database name cannot be the empty string');
  if (databaseName === '$external') return;

  const invalidChars = [' ', '.', '$', '/', '\\'];
  for (let i = 0; i < invalidChars.length; i++) {
    if (databaseName.indexOf(invalidChars[i]) !== -1)
      throw new MongoAPIError(`database names cannot contain the character '${invalidChars[i]}'`);
  }
}
