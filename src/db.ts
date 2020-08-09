import { deprecate } from 'util';
import { emitDeprecatedOptionWarning } from './utils';
import { loadAdmin } from './dynamic_loaders';
import { AggregationCursor, CommandCursor } from './cursor';
import { ObjectId, Code } from './bson';
import { ReadPreference } from './read_preference';
import { MongoError } from './error';
import { Collection } from './collection';
import { ChangeStream } from './change_stream';
import * as CONSTANTS from './constants';
import { WriteConcern } from './write_concern';
import { ReadConcern } from './read_concern';
import { Logger } from './logger';
import {
  getSingleProperty,
  filterOptions,
  mergeOptionsAndWriteConcern,
  deprecateOptions,
  MongoDBNamespace
} from './utils';
import { AggregateOperation } from './operations/aggregate';
import { AddUserOperation, AddUserOptions } from './operations/add_user';
import { CollectionsOperation } from './operations/collections';
import { DbStatsOperation, DbStatsOptions } from './operations/stats';
import {
  RunCommandOperation,
  RunAdminCommandOperation,
  RunCommandOptions
} from './operations/run_command';
import { CreateCollectionOperation, CreateCollectionOptions } from './operations/create_collection';
import {
  CreateIndexOperation,
  EnsureIndexOperation,
  IndexInformationOperation,
  CreateIndexesOptions
} from './operations/indexes';
import {
  DropCollectionOperation,
  DropDatabaseOperation,
  DropDatabaseOptions,
  DropCollectionOptions
} from './operations/drop';
import { ListCollectionsOperation, ListCollectionsOptions } from './operations/list_collections';
import { ProfilingLevelOperation, ProfilingLevelOptions } from './operations/profiling_level';
import { RemoveUserOperation, RemoveUserOptions } from './operations/remove_user';
import { RenameOperation, RenameOptions } from './operations/rename';
import {
  SetProfilingLevelOperation,
  ProfilingLevel,
  SetProfilingLevelOptions
} from './operations/set_profiling_level';
import { executeOperation } from './operations/execute_operation';
import { EvalOperation, EvalOptions } from './operations/eval';
import type { Callback, Document } from './types';
import type { IndexInformationOptions } from './operations/common_functions';

// Allowed parameters
const legalOptionNames = [
  'w',
  'wtimeout',
  'fsync',
  'j',
  'readPreference',
  'readPreferenceTags',
  'native_parser',
  'forceServerObjectId',
  'pkFactory',
  'serializeFunctions',
  'raw',
  'bufferMaxEntries',
  'authSource',
  'ignoreUndefined',
  'promoteLongs',
  'readConcern',
  'retryMiliSeconds',
  'numberOfRetries',
  'noListener',
  'loggerLevel',
  'logger',
  'promoteBuffers',
  'promoteLongs',
  'promoteValues',
  'compression',
  'retryWrites'
];

export interface Db {
  createCollection(name: any, options: any, callback: any): void;
  eval(code: any, parameters: any, options: any, callback: any): void;
  ensureIndex(name: any, fieldOrSpec: any, options: any, callback: any): void;
  profilingInfo(options: any, callback: any): void;
}

/**
 * The **Db** class is a class that represents a MongoDB Database.
 *
 * @example
 *
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
 */
export class Db {
  s: any;
  databaseName: any;
  serverConfig: any;

  public static SYSTEM_NAMESPACE_COLLECTION = CONSTANTS.SYSTEM_NAMESPACE_COLLECTION;
  public static SYSTEM_INDEX_COLLECTION = CONSTANTS.SYSTEM_INDEX_COLLECTION;
  public static SYSTEM_PROFILE_COLLECTION = CONSTANTS.SYSTEM_PROFILE_COLLECTION;
  public static SYSTEM_USER_COLLECTION = CONSTANTS.SYSTEM_USER_COLLECTION;
  public static SYSTEM_COMMAND_COLLECTION = CONSTANTS.SYSTEM_COMMAND_COLLECTION;
  public static SYSTEM_JS_COLLECTION = CONSTANTS.SYSTEM_JS_COLLECTION;

  /**
   * Creates a new Db instance
   *
   * @param {string} databaseName The name of the database this instance represents.
   * @param {(Server|ReplSet|Mongos)} topology The server topology for the database.
   * @param {object} [options] Optional settings.
   * @param {string} [options.authSource] If the database authentication is dependent on another databaseName.
   * @param {(number|string)} [options.w] The write concern.
   * @param {number} [options.wtimeout] The write concern timeout.
   * @param {boolean} [options.j=false] Specify a journal write concern.
   * @param {boolean} [options.forceServerObjectId=false] Force server to assign _id values instead of driver.
   * @param {boolean} [options.serializeFunctions=false] Serialize functions on any object.
   * @param {boolean} [options.ignoreUndefined=false] Specify if the BSON serializer should ignore undefined fields.
   * @param {boolean} [options.raw=false] Return document results as raw BSON buffers.
   * @param {boolean} [options.promoteLongs=true] Promotes Long values to number if they fit inside the 53 bits resolution.
   * @param {boolean} [options.promoteBuffers=false] Promotes Binary BSON values to native Node Buffers.
   * @param {boolean} [options.promoteValues=true] Promotes BSON values to native types where possible, set to false to only receive wrapper types.
   * @param {number} [options.bufferMaxEntries=-1] Sets a cap on how many operations the driver will buffer up before giving up on getting a working connection, default is -1 which is unlimited.
   * @param {(ReadPreference|string)} [options.readPreference] The preferred read preference (ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST).
   * @param {object} [options.pkFactory] A primary key factory object for generation of custom _id keys.
   * @param {object} [options.promiseLibrary] DEPRECATED: A Promise library class the application wishes to use such as Bluebird, must be ES6 compatible
   * @param {object} [options.readConcern] Specify a read concern for the collection. (only MongoDB 3.2 or higher supported)
   * @param {ReadConcernLevel} [options.readConcern.level='local'] Specify a read concern level for the collection operations (only MongoDB 3.2 or higher supported)
   * @property {(Server|ReplSet|Mongos)} serverConfig Get the current db topology.
   * @property {number} bufferMaxEntries Current bufferMaxEntries value for the database
   * @property {string} databaseName The name of the database this instance represents.
   * @property {object} options The options associated with the db instance.
   * @property {boolean} native_parser The current value of the parameter native_parser.
   * @property {boolean} slaveOk The current slaveOk value for the db instance.
   * @property {object} writeConcern The current write concern values.
   * @property {object} topology Access the topology object (single server, replicaset or mongos).
   * @returns {Db} a Db instance.
   */
  constructor(databaseName: string, topology: any, options?: any) {
    options = options || {};
    if (!(this instanceof Db)) return new Db(databaseName, topology, options);
    emitDeprecatedOptionWarning(options, ['promiseLibrary']);

    // Filter the options
    options = filterOptions(options, legalOptionNames);

    // Internal state of the db object
    this.s = {
      // DbCache
      dbCache: {},
      // Topology
      topology,
      // Options
      options,
      // Logger instance
      logger: new Logger('Db', options),
      // Unpack read preference
      readPreference: ReadPreference.fromOptions(options),
      // Set buffermaxEntries
      bufferMaxEntries:
        typeof options.bufferMaxEntries === 'number' ? options.bufferMaxEntries : -1,
      // Set up the primary key factory or fallback to ObjectId
      pkFactory: options.pkFactory || ObjectId,
      // No listener
      noListener: typeof options.noListener === 'boolean' ? options.noListener : false,
      // ReadConcern
      readConcern: ReadConcern.fromOptions(options),
      writeConcern: WriteConcern.fromOptions(options),
      // Namespace
      namespace: new MongoDBNamespace(databaseName)
    };

    // Ensure we have a valid db name
    validateDatabaseName(databaseName);

    // Add a read Only property
    getSingleProperty(this, 'serverConfig', this.s.topology);
    getSingleProperty(this, 'bufferMaxEntries', this.s.bufferMaxEntries);
    getSingleProperty(this, 'databaseName', this.s.namespace.db);

    if (this.s.noListener) return;
  }

  // Topology
  get topology() {
    return this.s.topology;
  }

  // Options
  get options() {
    return this.s.options;
  }

  // slaveOk specified
  get slaveOk() {
    if (
      this.s.options.readPreference != null &&
      (this.s.options.readPreference !== 'primary' ||
        this.s.options.readPreference.mode !== 'primary')
    ) {
      return true;
    }
    return false;
  }

  get readConcern() {
    return this.s.readConcern;
  }

  get readPreference() {
    if (this.s.readPreference == null) {
      // TODO: check client
      return ReadPreference.primary;
    }

    return this.s.readPreference;
  }

  // get the write Concern
  get writeConcern() {
    return this.s.writeConcern;
  }

  get namespace() {
    return this.s.namespace.toString();
  }

  /**
   * Execute a command
   *
   * @param command The command to run
   * @param options Optional settings for the command
   * @param callback An optional callback, a Promise will be returned if none is provided
   */
  command(
    command: Document,
    options?: RunCommandOptions,
    callback?: Callback
  ): Promise<void> | void {
    if (typeof options === 'function') (callback = options), (options = {});
    options = Object.assign({}, options);

    return executeOperation(
      this.s.topology,
      new RunCommandOperation(this, command, options),
      callback
    );
  }

  /**
   * Execute an aggregation framework pipeline against the database, needs MongoDB >= 3.6
   *
   * @param pipeline An array of aggregation stages to be executed
   * @param options Optional settings for the command
   */
  aggregate(pipeline: Document[] = [], options?: any): AggregationCursor {
    if (arguments.length > 2) {
      throw new TypeError('Third parameter to `db.aggregate()` must be undefined');
    }
    if (typeof pipeline === 'function') {
      throw new TypeError('`pipeline` parameter must not be function');
    }
    if (typeof options === 'function') {
      throw new TypeError('`options` parameter must not be function');
    }

    options = options || {};
    const cursor = new AggregationCursor(
      this.s.topology,
      new AggregateOperation(this, pipeline, options),
      options
    );

    return cursor;
  }

  /**
   * Return the Admin db instance
   *
   * @returns {Admin} return the new Admin db instance
   */
  admin(): any {
    const Admin = loadAdmin();
    return new Admin(this, this.s.topology);
  }

  /**
   * Fetch a specific collection (containing the actual collection information). If the application does not use strict mode you
   * can use it without a callback in the following way: `const collection = db.collection('mycollection');`
   *
   * @param {string} name the collection name we wish to access.
   * @param {object} [options] Optional settings.
   * @param {(number|string)} [options.w] The write concern.
   * @param {number} [options.wtimeout] The write concern timeout.
   * @param {boolean} [options.j=false] Specify a journal write concern.
   * @param {boolean} [options.raw=false] Return document results as raw BSON buffers.
   * @param {object} [options.pkFactory] A primary key factory object for generation of custom _id keys.
   * @param {(ReadPreference|string)} [options.readPreference] The preferred read preference (ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST).
   * @param {boolean} [options.serializeFunctions=false] Serialize functions on any object.
   * @param {boolean} [options.strict=false] Returns an error if the collection does not exist
   * @param {object} [options.readConcern] Specify a read concern for the collection. (only MongoDB 3.2 or higher supported)
   * @param {ReadConcernLevel} [options.readConcern.level='local'] Specify a read concern level for the collection operations (only MongoDB 3.2 or higher supported)
   * @param {Db~collectionResultCallback} [callback] The collection result callback
   * @returns {Collection} return the new Collection instance if not in strict mode
   */
  collection(name: string, options?: any): Collection;
  collection(name: string, options: any, callback: Callback): void;
  collection(name: string, options?: any, callback?: Callback): Collection | void {
    if (typeof options === 'function') (callback = options), (options = {});
    options = options || {};
    options = Object.assign({}, options);

    // If we have not set a collection level readConcern set the db level one
    options.readConcern = options.readConcern
      ? new ReadConcern(options.readConcern.level)
      : this.readConcern;

    // Do we have ignoreUndefined set
    if (this.s.options.ignoreUndefined) {
      options.ignoreUndefined = this.s.options.ignoreUndefined;
    }

    // Merge in all needed options and ensure correct writeConcern merging from db level
    options = mergeOptionsAndWriteConcern(options, this.s.options, collectionKeys, true);

    // Execute
    if (options == null || !options.strict) {
      try {
        const collection = new Collection(
          this,
          this.s.topology,
          this.databaseName,
          name,
          this.s.pkFactory,
          options
        );
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
    if (this.serverConfig && this.serverConfig.isDestroyed()) {
      return callback(new MongoError('topology was destroyed'));
    }

    const listCollectionOptions = Object.assign({}, options, { nameOnly: true });

    // Strict mode
    this.listCollections({ name }, listCollectionOptions).toArray((err, collections) => {
      if (callback == null) return;
      if (err != null || !collections) return callback(err);
      if (collections.length === 0)
        return callback(
          new MongoError(`Collection ${name} does not exist. Currently in strict mode.`)
        );

      try {
        return callback(
          undefined,
          new Collection(this, this.s.topology, this.databaseName, name, this.s.pkFactory, options)
        );
      } catch (err) {
        return callback(err);
      }
    });
  }

  /**
   * Get all the db statistics.
   *
   * @param options Optional settings for the command
   * @param callback An optional callback, a Promise will be returned if none is provided
   */
  stats(options?: DbStatsOptions, callback?: Callback<Document>): Promise<Document> | void {
    if (typeof options === 'function') (callback = options), (options = {});
    options = options || {};

    return executeOperation(this.s.topology, new DbStatsOperation(this, options), callback);
  }

  /**
   * List all collections of this database with optional filter
   *
   * @param filter Query to filter collections by
   * @param options Optional settings for the command
   */
  listCollections(filter?: Document, options?: ListCollectionsOptions): CommandCursor {
    filter = filter || {};
    options = options || {};

    return new CommandCursor(
      this.s.topology,
      new ListCollectionsOperation(this, filter, options),
      options
    );
  }

  /**
   * Rename a collection.
   *
   * @param fromCollection Name of current collection to rename
   * @param toCollection New name of of the collection
   * @param options Optional settings for the command
   * @param callback An optional callback, a Promise will be returned if none is provided
   */
  renameCollection(
    fromCollection: string,
    toCollection: string,
    options?: RenameOptions,
    callback?: Callback<Collection>
  ): Promise<Collection> | void {
    if (typeof options === 'function') (callback = options), (options = {});
    options = Object.assign({}, options, { readPreference: ReadPreference.PRIMARY });

    // Add return new collection
    options.new_collection = true;

    return executeOperation(
      this.s.topology,
      new RenameOperation(this.collection(fromCollection), toCollection, options),
      callback
    );
  }

  /**
   * Drop a collection from the database, removing it permanently. New accesses will create a new collection.
   *
   * @param name Name of collection to drop
   * @param options Optional settings for the command
   * @param callback An optional callback, a Promise will be returned if none is provided
   */
  dropCollection(
    name: string,
    options?: DropCollectionOptions,
    callback?: Callback<boolean>
  ): Promise<boolean> | void {
    if (typeof options === 'function') (callback = options), (options = {});
    options = options || {};

    return executeOperation(
      this.s.topology,
      new DropCollectionOperation(this, name, options),
      callback
    );
  }

  /**
   * Drop a database, removing it permanently from the server.
   *
   * @param options Optional settings for the command
   * @param callback An optional callback, a Promise will be returned if none is provided
   */
  dropDatabase(
    options?: DropDatabaseOptions,
    callback?: Callback<boolean>
  ): Promise<boolean> | void {
    if (typeof options === 'function') (callback = options), (options = {});
    options = options || {};

    return executeOperation(this.s.topology, new DropDatabaseOperation(this, options), callback);
  }

  /**
   * Fetch all collections for the current db.
   *
   * @param options Optional settings for the command
   * @param callback An optional callback, a Promise will be returned if none is provided
   */
  collections(
    options?: ListCollectionsOptions,
    callback?: Callback<Collection[]>
  ): Promise<Collection[]> | void {
    if (typeof options === 'function') (callback = options), (options = {});
    options = options || {};

    return executeOperation(this.s.topology, new CollectionsOperation(this, options), callback);
  }

  /**
   * Runs a command on the database as admin.
   *
   * @param command The command to run
   * @param options Optional settings for the command
   * @param callback An optional callback, a Promise will be returned if none is provided
   */
  executeDbAdminCommand(
    command: Document,
    options?: RunCommandOptions,
    callback?: Callback
  ): Promise<void> | void {
    if (typeof options === 'function') (callback = options), (options = {});
    options = options || {};

    return executeOperation(
      this.s.topology,
      new RunAdminCommandOperation(this, command, options),
      callback
    );
  }

  /**
   * Creates an index on the db and collection.
   *
   * @param name Name of the collection to create the index on.
   * @param fieldOrSpec Specify the field to index, or an index specification
   * @param options Optional settings for the command
   * @param callback An optional callback, a Promise will be returned if none is provided
   */
  createIndex(
    name: string,
    fieldOrSpec: string | object,
    options?: CreateIndexesOptions,
    callback?: Callback<Document>
  ): Promise<Document> | void {
    if (typeof options === 'function') (callback = options), (options = {});
    options = options ? Object.assign({}, options) : {};

    return executeOperation(
      this.s.topology,
      new CreateIndexOperation(this, name, fieldOrSpec, options),
      callback
    );
  }

  /**
   * Add a user to the database
   *
   * @param username The username for the new user
   * @param password An optional password for the new user
   * @param options Optional settings for the command
   * @param callback An optional callback, a Promise will be returned if none is provided
   */
  addUser(
    username: string,
    password: string | undefined,
    options?: AddUserOptions,
    callback?: Callback<Document>
  ): Promise<Document> | void {
    if (typeof options === 'function') (callback = options), (options = {});
    options = options || {};

    return executeOperation(
      this.s.topology,
      new AddUserOperation(this, username, password, options),
      callback
    );
  }

  /**
   * Remove a user from a database
   *
   * @param username The username to remove
   * @param options Optional settings for the command
   * @param callback An optional callback, a Promise will be returned if none is provided
   */
  removeUser(
    username: string,
    options?: RemoveUserOptions,
    callback?: Callback<boolean>
  ): Promise<boolean> | void {
    if (typeof options === 'function') (callback = options), (options = {});
    options = options || {};

    return executeOperation(
      this.s.topology,
      new RemoveUserOperation(this, username, options),
      callback
    );
  }

  /**
   * Set the current profiling level of MongoDB
   *
   * @param level The new profiling level (off, slow_only, all).
   * @param options Optional settings for the command
   * @param callback An optional callback, a Promise will be returned if none is provided
   */
  setProfilingLevel(
    level: ProfilingLevel,
    options?: SetProfilingLevelOptions,
    callback?: Callback<ProfilingLevel>
  ): Promise<ProfilingLevel> | void {
    if (typeof options === 'function') (callback = options), (options = {});
    options = options || {};

    return executeOperation(
      this.s.topology,
      new SetProfilingLevelOperation(this, level, options),
      callback
    );
  }

  /**
   * Retrieve the current profiling Level for MongoDB
   *
   * @param options Optional settings for the command
   * @param callback An optional callback, a Promise will be returned if none is provided
   */
  profilingLevel(
    options?: ProfilingLevelOptions,
    callback?: Callback<string>
  ): Promise<string> | void {
    if (typeof options === 'function') (callback = options), (options = {});
    options = options || {};

    return executeOperation(this.s.topology, new ProfilingLevelOperation(this, options), callback);
  }

  /**
   * Retrieves this collections index info.
   *
   * @param name The name of the collection.
   * @param options Optional settings for the command
   * @param callback An optional callback, a Promise will be returned if none is provided
   */
  indexInformation(
    name: string,
    options?: IndexInformationOptions,
    callback?: Callback
  ): Promise<void> | void {
    if (typeof options === 'function') (callback = options), (options = {});
    options = options || {};

    return executeOperation(
      this.s.topology,
      new IndexInformationOperation(this, name, options),
      callback
    );
  }

  /** Unref all sockets */
  unref() {
    this.s.topology.unref();
  }

  /**
   * Create a new Change Stream, watching for new changes (insertions, updates, replacements, deletions, and invalidations) in this database. Will ignore all changes to system collections.
   *
   * @since 3.1.0
   * @param {Array} [pipeline] An array of {@link https://docs.mongodb.com/manual/reference/operator/aggregation-pipeline/|aggregation pipeline stages} through which to pass change stream documents. This allows for filtering (using $match) and manipulating the change stream documents.
   * @param {object} [options] Optional settings
   * @param {string} [options.fullDocument='default'] Allowed values: ‘default’, ‘updateLookup’. When set to ‘updateLookup’, the change stream will include both a delta describing the changes to the document, as well as a copy of the entire document that was changed from some time after the change occurred.
   * @param {object} [options.resumeAfter] Specifies the logical starting point for the new change stream. This should be the _id field from a previously returned change stream document.
   * @param {number} [options.maxAwaitTimeMS] The maximum amount of time for the server to wait on new documents to satisfy a change stream query
   * @param {number} [options.batchSize=1000] The number of documents to return per batch. See {@link https://docs.mongodb.com/manual/reference/command/aggregate|aggregation documentation}.
   * @param {object} [options.collation] Specify collation settings for operation. See {@link https://docs.mongodb.com/manual/reference/command/aggregate|aggregation documentation}.
   * @param {ReadPreference} [options.readPreference] The read preference. Defaults to the read preference of the database. See {@link https://docs.mongodb.com/manual/reference/read-preference|read preference documentation}.
   * @param {Timestamp} [options.startAtOperationTime] receive change events that occur after the specified timestamp
   * @param {ClientSession} [options.session] optional session to use for this operation
   * @returns {ChangeStream} a ChangeStream instance.
   */
  watch(pipeline?: any[], options?: any): ChangeStream {
    pipeline = pipeline || [];
    options = options || {};

    // Allow optionally not specifying a pipeline
    if (!Array.isArray(pipeline)) {
      options = pipeline;
      pipeline = [];
    }

    return new ChangeStream(this, pipeline, options);
  }

  /** Return the db logger */
  getLogger(): Logger {
    return this.s.logger;
  }
}

/**
 * The callback format for the collection method, must be used if strict is specified
 *
 * @callback Db~collectionResultCallback
 * @param {MongoError} error An error instance representing the error during the execution.
 * @param {Collection} collection The collection instance.
 */

/**
 * The callback format for an aggregation call
 *
 * @callback Database~aggregationCallback
 * @param {MongoError} error An error instance representing the error during the execution.
 * @param {AggregationCursor} cursor The cursor if the aggregation command was executed successfully.
 */

const collectionKeys = [
  'pkFactory',
  'readPreference',
  'serializeFunctions',
  'strict',
  'readConcern',
  'ignoreUndefined',
  'promoteValues',
  'promoteBuffers',
  'promoteLongs'
];

/**
 * Create a new collection on a server with the specified options. Use this to create capped collections.
 * More information about command options available at https://docs.mongodb.com/manual/reference/command/create/
 *
 * @param name The name of the collection to create
 * @param options Optional settings for the command
 * @param callback An optional callback, a Promise will be returned if none is provided
 */
Db.prototype.createCollection = deprecateOptions(
  {
    name: 'Db.createCollection',
    deprecatedOptions: ['autoIndexId'],
    optionsIndex: 1
  },
  function (this: Db, name: string, options?: CreateCollectionOptions, callback?: Callback) {
    if (typeof options === 'function') (callback = options), (options = {});
    options = options || {};
    options.readConcern = options.readConcern
      ? new ReadConcern(options.readConcern.level)
      : this.readConcern;

    return executeOperation(
      this.s.topology,
      new CreateCollectionOperation(this, name, options),
      callback
    );
  }
);

/**
 * Evaluate JavaScript on the server
 *
 * @deprecated Eval is deprecated on MongoDB 3.2 and forward
 * @param code JavaScript to execute on server.
 * @param parameters The parameters for the call.
 * @param options Optional settings for the command
 * @param callback An optional callback, a Promise will be returned if none is provided
 */
Db.prototype.eval = deprecate(function (
  this: Db,
  code: Code,
  parameters: Document | Document[],
  options: EvalOptions,
  callback: Callback
) {
  const args = Array.prototype.slice.call(arguments, 1);
  callback = typeof args[args.length - 1] === 'function' ? args.pop() : undefined;
  parameters = args.length ? args.shift() : parameters;
  options = args.length ? args.shift() || {} : {};

  return executeOperation(
    this.s.topology,
    new EvalOperation(this, code, parameters, options),
    callback
  );
},
'Db.eval is deprecated as of MongoDB version 3.2');

/**
 * Ensures that an index exists, if it does not it creates it
 *
 * @deprecated since version 2.0
 * @param name The index name
 * @param fieldOrSpec Defines the index.
 * @param options Optional settings for the command
 * @param callback An optional callback, a Promise will be returned if none is provided
 */
Db.prototype.ensureIndex = deprecate(function (
  this: Db,
  name: string,
  fieldOrSpec: string | Document,
  options: CreateIndexesOptions,
  callback: Callback
) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = options || {};

  return executeOperation(
    this.s.topology,
    new EnsureIndexOperation(this, name, fieldOrSpec, options),
    callback
  );
},
'Db.ensureIndex is deprecated as of MongoDB version 3.0 / driver version 2.0');

/**
 * Retrieve the current profiling information for MongoDB
 *
 * @deprecated Query the `system.profile` collection directly.
 * @param options Optional settings for the command
 * @param callback An optional callback, a Promise will be returned if none is provided
 */
Db.prototype.profilingInfo = deprecate(function (
  this: Db,
  options: ProfilingLevelOptions,
  callback: Callback
) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = options || {};

  return this.collection('system.profile').find({}, options).toArray(callback);
},
'Db.profilingInfo is deprecated. Query the system.profile collection directly.');

// Validate the database name
function validateDatabaseName(databaseName: any) {
  if (typeof databaseName !== 'string')
    throw MongoError.create({ message: 'database name must be a string', driver: true });
  if (databaseName.length === 0)
    throw MongoError.create({ message: 'database name cannot be the empty string', driver: true });
  if (databaseName === '$external') return;

  const invalidChars = [' ', '.', '$', '/', '\\'];
  for (let i = 0; i < invalidChars.length; i++) {
    if (databaseName.indexOf(invalidChars[i]) !== -1)
      throw MongoError.create({
        message: "database names cannot contain the character '" + invalidChars[i] + "'",
        driver: true
      });
  }
}
