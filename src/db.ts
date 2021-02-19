import {
  Callback,
  resolveOptions,
  filterOptions,
  MongoDBNamespace,
  getTopology,
  DEFAULT_PK_FACTORY
} from './utils';
import { loadAdmin } from './dynamic_loaders';
import { AggregationCursor } from './cursor/aggregation_cursor';
import { Document, BSONSerializeOptions, resolveBSONOptions } from './bson';
import { ReadPreference, ReadPreferenceLike } from './read_preference';
import { MongoError } from './error';
import { Collection, CollectionOptions } from './collection';
import { ChangeStream, ChangeStreamOptions } from './change_stream';
import * as CONSTANTS from './constants';
import { WriteConcern, WriteConcernOptions } from './write_concern';
import { ReadConcern } from './read_concern';
import { Logger, LoggerOptions } from './logger';
import type { AggregateOptions } from './operations/aggregate';
import { AddUserOperation, AddUserOptions } from './operations/add_user';
import { CollectionsOperation } from './operations/collections';
import { DbStatsOperation, DbStatsOptions } from './operations/stats';
import { RunCommandOperation, RunCommandOptions } from './operations/run_command';
import { CreateCollectionOperation, CreateCollectionOptions } from './operations/create_collection';
import {
  CreateIndexOperation,
  IndexInformationOperation,
  CreateIndexesOptions,
  IndexSpecification
} from './operations/indexes';
import {
  DropCollectionOperation,
  DropDatabaseOperation,
  DropDatabaseOptions,
  DropCollectionOptions
} from './operations/drop';
import { ListCollectionsCursor, ListCollectionsOptions } from './operations/list_collections';
import { ProfilingLevelOperation, ProfilingLevelOptions } from './operations/profiling_level';
import { RemoveUserOperation, RemoveUserOptions } from './operations/remove_user';
import { RenameOperation, RenameOptions } from './operations/rename';
import {
  SetProfilingLevelOperation,
  SetProfilingLevelOptions,
  ProfilingLevelId
} from './operations/set_profiling_level';
import { executeOperation } from './operations/execute_operation';
import type { IndexInformationOptions } from './operations/common_functions';
import type { MongoClient, PkFactory } from './mongo_client';
import type { Admin } from './admin';

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
  'promoteLongs',
  'readConcern',
  'retryMiliSeconds',
  'numberOfRetries',
  'loggerLevel',
  'logger',
  'promoteBuffers',
  'promoteLongs',
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
 * ```js
 * const { MongoClient } = require('mongodb');
 * // Connection url
 * const url = 'mongodb://localhost:27017';
 * // Database Name
 * const dbName = 'test';
 * // Connect using MongoClient
 * MongoClient.connect(url, function(err, client) {
 *   // Select the database by name
 *   const testDb = client.db(dbName);
 *   client.close();
 * });
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

  // slaveOk specified
  get slaveOk(): boolean {
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
  createCollection(name: string): Promise<Collection>;
  createCollection(name: string, callback: Callback<Collection>): void;
  createCollection(name: string, options: CreateCollectionOptions): Promise<Collection>;
  createCollection(
    name: string,
    options: CreateCollectionOptions,
    callback: Callback<Collection>
  ): void;
  createCollection(
    name: string,
    options?: CreateCollectionOptions | Callback<Collection>,
    callback?: Callback<Collection>
  ): Promise<Collection> | void {
    if (typeof options === 'function') (callback = options), (options = {});

    return executeOperation(
      getTopology(this),
      new CreateCollectionOperation(this, name, resolveOptions(this, options)),
      callback
    );
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
  command(command: Document, callback: Callback<Document>): void;
  command(command: Document, options: RunCommandOptions): Promise<Document>;
  command(command: Document, options: RunCommandOptions, callback: Callback<Document>): void;
  command(
    command: Document,
    options?: RunCommandOptions | Callback<Document>,
    callback?: Callback<Document>
  ): Promise<Document> | void {
    if (typeof options === 'function') (callback = options), (options = {});

    // Intentionally, we do not inherit options from parent for this operation.
    return executeOperation(
      getTopology(this),
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
  aggregate(pipeline: Document[] = [], options?: AggregateOptions): AggregationCursor {
    if (arguments.length > 2) {
      throw new TypeError('Third parameter to `db.aggregate()` must be undefined');
    }
    if (typeof pipeline === 'function') {
      throw new TypeError('`pipeline` parameter must not be function');
    }
    if (typeof options === 'function') {
      throw new TypeError('`options` parameter must not be function');
    }

    return new AggregationCursor(
      this,
      getTopology(this),
      this.s.namespace,
      pipeline,
      resolveOptions(this, options)
    );
  }

  /** Return the Admin db instance */
  admin(): Admin {
    const AdminClass = loadAdmin();
    return new AdminClass(this);
  }

  /**
   * Fetch a specific collection (containing the actual collection information). If the application does not use strict mode you
   * can use it without a callback in the following way: `const collection = db.collection('mycollection');`
   *
   * @param name - the collection name we wish to access.
   * @returns return the new Collection instance if not in strict mode
   */
  collection(name: string): Collection;
  collection(name: string, options: CollectionOptions): Collection;
  collection(name: string, callback: Callback<Collection>): void;
  collection(name: string, options: CollectionOptions, callback: Callback<Collection>): void;
  collection(
    name: string,
    options?: CollectionOptions | Callback<Collection>,
    callback?: Callback<Collection>
  ): Collection | void {
    if (typeof options === 'function') (callback = options), (options = {});
    const finalOptions = resolveOptions(this, options);

    // Execute
    if (!finalOptions.strict) {
      try {
        const collection = new Collection(this, name, finalOptions);
        if (callback) callback(undefined, collection);
        return collection;
      } catch (err) {
        if (err instanceof MongoError && callback) return callback(err);
        throw err;
      }
    }

    // Strict mode
    if (typeof callback !== 'function') {
      throw new MongoError(
        `A callback is required in strict mode. While getting collection ${name}`
      );
    }

    // Did the user destroy the topology
    if (getTopology(this).isDestroyed()) {
      return callback(new MongoError('topology was destroyed'));
    }

    const listCollectionOptions: ListCollectionsOptions = Object.assign({}, finalOptions, {
      nameOnly: true
    });

    // Strict mode
    this.listCollections({ name }, listCollectionOptions).toArray((err, collections) => {
      if (callback == null) return;
      if (err != null || !collections) return callback(err);
      if (collections.length === 0)
        return callback(
          new MongoError(`Collection ${name} does not exist. Currently in strict mode.`)
        );

      try {
        return callback(undefined, new Collection(this, name, finalOptions));
      } catch (err) {
        return callback(err);
      }
    });
  }

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
  stats(
    options?: DbStatsOptions | Callback<Document>,
    callback?: Callback<Document>
  ): Promise<Document> | void {
    if (typeof options === 'function') (callback = options), (options = {});
    return executeOperation(
      getTopology(this),
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
  listCollections(filter?: Document, options?: ListCollectionsOptions): ListCollectionsCursor {
    return new ListCollectionsCursor(this, filter || {}, resolveOptions(this, options));
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
  renameCollection(fromCollection: string, toCollection: string): Promise<Collection>;
  renameCollection(
    fromCollection: string,
    toCollection: string,
    callback: Callback<Collection>
  ): void;
  renameCollection(
    fromCollection: string,
    toCollection: string,
    options: RenameOptions
  ): Promise<Collection>;
  renameCollection(
    fromCollection: string,
    toCollection: string,
    options: RenameOptions,
    callback: Callback<Collection>
  ): void;
  renameCollection(
    fromCollection: string,
    toCollection: string,
    options?: RenameOptions | Callback<Collection>,
    callback?: Callback<Collection>
  ): Promise<Collection> | void {
    if (typeof options === 'function') (callback = options), (options = {});

    // Intentionally, we do not inherit options from parent for this operation.
    options = { ...options, readPreference: ReadPreference.PRIMARY };

    // Add return new collection
    options.new_collection = true;

    return executeOperation(
      getTopology(this),
      new RenameOperation(this.collection(fromCollection), toCollection, options),
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
  dropCollection(name: string, callback: Callback<boolean>): void;
  dropCollection(name: string, options: DropCollectionOptions): Promise<boolean>;
  dropCollection(name: string, options: DropCollectionOptions, callback: Callback<boolean>): void;
  dropCollection(
    name: string,
    options?: DropCollectionOptions | Callback<boolean>,
    callback?: Callback<boolean>
  ): Promise<boolean> | void {
    if (typeof options === 'function') (callback = options), (options = {});

    return executeOperation(
      getTopology(this),
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
  dropDatabase(callback: Callback<boolean>): void;
  dropDatabase(options: DropDatabaseOptions): Promise<boolean>;
  dropDatabase(options: DropDatabaseOptions, callback: Callback<boolean>): void;
  dropDatabase(
    options?: DropDatabaseOptions | Callback<boolean>,
    callback?: Callback<boolean>
  ): Promise<boolean> | void {
    if (typeof options === 'function') (callback = options), (options = {});

    return executeOperation(
      getTopology(this),
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
  collections(callback: Callback<Collection[]>): void;
  collections(options: ListCollectionsOptions): Promise<Collection[]>;
  collections(options: ListCollectionsOptions, callback: Callback<Collection[]>): void;
  collections(
    options?: ListCollectionsOptions | Callback<Collection[]>,
    callback?: Callback<Collection[]>
  ): Promise<Collection[]> | void {
    if (typeof options === 'function') (callback = options), (options = {});

    return executeOperation(
      getTopology(this),
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
  createIndex(name: string, indexSpec: IndexSpecification, callback?: Callback<string>): void;
  createIndex(
    name: string,
    indexSpec: IndexSpecification,
    options: CreateIndexesOptions
  ): Promise<string>;
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
      getTopology(this),
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
  addUser(username: string, callback: Callback<Document>): void;
  addUser(username: string, password: string): Promise<Document>;
  addUser(username: string, password: string, callback: Callback<Document>): void;
  addUser(username: string, options: AddUserOptions): Promise<Document>;
  addUser(username: string, options: AddUserOptions, callback: Callback<Document>): void;
  addUser(username: string, password: string, options: AddUserOptions): Promise<Document>;
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
      getTopology(this),
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
  removeUser(username: string, callback: Callback<boolean>): void;
  removeUser(username: string, options: RemoveUserOptions): Promise<boolean>;
  removeUser(username: string, options: RemoveUserOptions, callback: Callback<boolean>): void;
  removeUser(
    username: string,
    options?: RemoveUserOptions | Callback<boolean>,
    callback?: Callback<boolean>
  ): Promise<boolean> | void {
    if (typeof options === 'function') (callback = options), (options = {});

    return executeOperation(
      getTopology(this),
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
  setProfilingLevel(level: ProfilingLevelId): Promise<ProfilingLevelId>;
  setProfilingLevel(level: ProfilingLevelId, callback: Callback<ProfilingLevelId>): void;
  setProfilingLevel(
    level: ProfilingLevelId,
    options: SetProfilingLevelOptions
  ): Promise<ProfilingLevelId>;
  setProfilingLevel(
    level: ProfilingLevelId,
    options: SetProfilingLevelOptions,
    callback: Callback<ProfilingLevelId>
  ): void;
  setProfilingLevel(
    level: ProfilingLevelId,
    options?: SetProfilingLevelOptions | Callback<ProfilingLevelId>,
    callback?: Callback<ProfilingLevelId>
  ): Promise<ProfilingLevelId> | void {
    if (typeof options === 'function') (callback = options), (options = {});

    return executeOperation(
      getTopology(this),
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
  profilingLevel(callback: Callback<string>): void;
  profilingLevel(options: ProfilingLevelOptions): Promise<string>;
  profilingLevel(options: ProfilingLevelOptions, callback: Callback<string>): void;
  profilingLevel(
    options?: ProfilingLevelOptions | Callback<string>,
    callback?: Callback<string>
  ): Promise<string> | void {
    if (typeof options === 'function') (callback = options), (options = {});

    return executeOperation(
      getTopology(this),
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
  indexInformation(name: string, callback: Callback<Document>): void;
  indexInformation(name: string, options: IndexInformationOptions): Promise<Document>;
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
      getTopology(this),
      new IndexInformationOperation(this, name, resolveOptions(this, options)),
      callback
    );
  }

  /** Unref all sockets */
  unref(): void {
    getTopology(this).unref();
  }

  /**
   * Create a new Change Stream, watching for new changes (insertions, updates,
   * replacements, deletions, and invalidations) in this database. Will ignore all
   * changes to system collections.
   *
   * @param pipeline - An array of {@link https://docs.mongodb.com/manual/reference/operator/aggregation-pipeline/|aggregation pipeline stages} through which to pass change stream documents. This allows for filtering (using $match) and manipulating the change stream documents.
   * @param options - Optional settings for the command
   */
  watch(): ChangeStream;
  watch(pipeline?: Document[]): ChangeStream;
  watch(pipeline?: Document[], options?: ChangeStreamOptions): ChangeStream {
    pipeline = pipeline || [];
    options = options ?? {};

    // Allow optionally not specifying a pipeline
    if (!Array.isArray(pipeline)) {
      options = pipeline;
      pipeline = [];
    }

    return new ChangeStream(this, pipeline, resolveOptions(this, options));
  }

  /** Return the db logger */
  getLogger(): Logger {
    return this.s.logger;
  }

  get logger(): Logger {
    return this.s.logger;
  }
}

// Validate the database name
function validateDatabaseName(databaseName: string) {
  if (typeof databaseName !== 'string') throw new MongoError('database name must be a string');
  if (databaseName.length === 0) throw new MongoError('database name cannot be the empty string');
  if (databaseName === '$external') return;

  const invalidChars = [' ', '.', '$', '/', '\\'];
  for (let i = 0; i < invalidChars.length; i++) {
    if (databaseName.indexOf(invalidChars[i]) !== -1)
      throw new MongoError(`database names cannot contain the character '${invalidChars[i]}'`);
  }
}
