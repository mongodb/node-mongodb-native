import { deprecate } from 'util';
import { emitDeprecatedOptionWarning } from './utils';
import { loadAdmin } from './dynamic_loaders';
import { AggregationCursor, CommandCursor } from './cursor';
import { ObjectId } from './bson';
import ReadPreference = require('./read_preference');
import { MongoError } from './error';
import Collection = require('./collection');
import ChangeStream = require('./change_stream');
import CONSTANTS = require('./constants');
import WriteConcern = require('./write_concern');
import ReadConcern = require('./read_concern');
import Logger = require('./logger');
import {
  getSingleProperty,
  handleCallback,
  filterOptions,
  toError,
  mergeOptionsAndWriteConcern,
  deprecateOptions,
  MongoDBNamespace
} from './utils';
import AggregateOperation = require('./operations/aggregate');
import AddUserOperation = require('./operations/add_user');
import CollectionsOperation = require('./operations/collections');
import { DbStatsOperation } from './operations/stats';
import { RunCommandOperation, RunAdminCommandOperation } from './operations/run_command';
import CreateCollectionOperation = require('./operations/create_collection');
import {
  CreateIndexOperation,
  EnsureIndexOperation,
  IndexInformationOperation
} from './operations/indexes';
import { DropCollectionOperation, DropDatabaseOperation } from './operations/drop';
import ListCollectionsOperation = require('./operations/list_collections');
import ProfilingLevelOperation = require('./operations/profiling_level');
import RemoveUserOperation = require('./operations/remove_user');
import RenameOperation = require('./operations/rename');
import SetProfilingLevelOperation = require('./operations/set_profiling_level');
import executeOperation = require('./operations/execute_operation');
import EvalOperation = require('./operations/eval');

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

interface Db {
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
class Db {
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
   * @function
   * @param {object} command The command hash
   * @param {object} [options] Optional settings.
   * @param {(ReadPreference|string)} [options.readPreference] The preferred read preference (ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST).
   * @param {ClientSession} [options.session] optional session to use for this operation
   * @param {Db~resultCallback} [callback] The command result callback
   * @returns {Promise<void>} returns Promise if no callback passed
   */
  command(command: object, options?: any, callback?: Function): Promise<void> {
    if (typeof options === 'function') (callback = options), (options = {});
    options = Object.assign({}, options);

    const commandOperation = new RunCommandOperation(this, command, options);

    return executeOperation(this.s.topology, commandOperation, callback);
  }

  /**
   * Execute an aggregation framework pipeline against the database, needs MongoDB >= 3.6
   *
   * @function
   * @param {object} [pipeline=[]] Array containing all the aggregation framework commands for the execution.
   * @param {object} [options] Optional settings.
   * @param {(ReadPreference|string)} [options.readPreference] The preferred read preference (ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST).
   * @param {number} [options.batchSize=1000] The number of documents to return per batch. See {@link https://docs.mongodb.com/manual/reference/command/aggregate|aggregation documentation}.
   * @param {object} [options.cursor] Return the query as cursor, on 2.6 > it returns as a real cursor on pre 2.6 it returns as an emulated cursor.
   * @param {number} [options.cursor.batchSize=1000] Deprecated. Use `options.batchSize`
   * @param {boolean} [options.explain=false] Explain returns the aggregation execution plan (requires mongodb 2.6 >).
   * @param {boolean} [options.allowDiskUse=false] allowDiskUse lets the server know if it can use disk to store temporary results for the aggregation (requires mongodb 2.6 >).
   * @param {number} [options.maxTimeMS] maxTimeMS specifies a cumulative time limit in milliseconds for processing operations on the cursor. MongoDB interrupts the operation at the earliest following interrupt point.
   * @param {number} [options.maxAwaitTimeMS] The maximum amount of time for the server to wait on new documents to satisfy a tailable cursor query.
   * @param {boolean} [options.bypassDocumentValidation=false] Allow driver to bypass schema validation in MongoDB 3.2 or higher.
   * @param {boolean} [options.raw=false] Return document results as raw BSON buffers.
   * @param {boolean} [options.promoteLongs=true] Promotes Long values to number if they fit inside the 53 bits resolution.
   * @param {boolean} [options.promoteValues=true] Promotes BSON values to native types where possible, set to false to only receive wrapper types.
   * @param {boolean} [options.promoteBuffers=false] Promotes Binary BSON values to native Node Buffers.
   * @param {object} [options.collation] Specify collation (MongoDB 3.4 or higher) settings for update operation (see 3.4 documentation for available fields).
   * @param {string} [options.comment] Add a comment to an aggregation command
   * @param {string|object} [options.hint] Add an index selection hint to an aggregation command
   * @param {ClientSession} [options.session] optional session to use for this operation
   * @returns {AggregationCursor}
   */
  aggregate(pipeline?: object, options?: any): AggregationCursor {
    if (arguments.length > 2) {
      throw new TypeError('Third parameter to `db.aggregate()` must be undefined');
    }
    if (typeof pipeline === 'function') {
      throw new TypeError('`pipeline` parameter must not be function');
    }
    if (typeof options === 'function') {
      throw new TypeError('`options` parameter must not be function');
    }

    if (!options) options = {};

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
   * @function
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
   * @function
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
  collection(name: string, options?: any, callback?: Function): any {
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
        if (callback) callback(null, collection);
        return collection;
      } catch (err) {
        if (err instanceof MongoError && callback) return callback(err);
        throw err;
      }
    }

    // Strict mode
    if (typeof callback !== 'function') {
      throw toError(`A callback is required in strict mode. While getting collection ${name}`);
    }

    // Did the user destroy the topology
    if (this.serverConfig && this.serverConfig.isDestroyed()) {
      return callback(new MongoError('topology was destroyed'));
    }

    const listCollectionOptions = Object.assign({}, options, { nameOnly: true });

    // Strict mode
    this.listCollections({ name }, listCollectionOptions).toArray(
      (err?: any, collections?: any) => {
        if (err != null) return handleCallback(callback!, err, null);
        if (collections.length === 0)
          return handleCallback(
            callback!,
            toError(`Collection ${name} does not exist. Currently in strict mode.`),
            null
          );

        try {
          return handleCallback(
            callback!,
            null,
            new Collection(
              this,
              this.s.topology,
              this.databaseName,
              name,
              this.s.pkFactory,
              options
            )
          );
        } catch (err) {
          return handleCallback(callback!, err, null);
        }
      }
    );
  }

  /**
   * Get all the db statistics.
   *
   * @function
   * @param {object} [options] Optional settings.
   * @param {number} [options.scale] Divide the returned sizes by scale value.
   * @param {ClientSession} [options.session] optional session to use for this operation
   * @param {Db~resultCallback} [callback] The collection result callback
   * @returns {Promise<void>} returns Promise if no callback passed
   */
  stats(options?: any, callback?: Function): Promise<void> {
    if (typeof options === 'function') (callback = options), (options = {});
    options = options || {};

    const statsOperation = new DbStatsOperation(this, options);
    return executeOperation(this.s.topology, statsOperation, callback);
  }

  /**
   * Get the list of all collection information for the specified db.
   *
   * @function
   * @param {object} [filter={}] Query to filter collections by
   * @param {object} [options] Optional settings.
   * @param {boolean} [options.nameOnly=false] Since 4.0: If true, will only return the collection name in the response, and will omit additional info
   * @param {number} [options.batchSize=1000] The batchSize for the returned command cursor or if pre 2.8 the systems batch collection
   * @param {(ReadPreference|string)} [options.readPreference] The preferred read preference (ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST).
   * @param {ClientSession} [options.session] optional session to use for this operation
   * @returns {CommandCursor}
   */
  listCollections(filter?: object, options?: any): CommandCursor {
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
   * @function
   * @param {string} fromCollection Name of current collection to rename.
   * @param {string} toCollection New name of of the collection.
   * @param {object} [options] Optional settings.
   * @param {boolean} [options.dropTarget=false] Drop the target name collection if it previously exists.
   * @param {ClientSession} [options.session] optional session to use for this operation
   * @param {Db~collectionResultCallback} [callback] The results callback
   * @returns {Promise<void>} returns Promise if no callback passed
   */
  renameCollection(
    fromCollection: string,
    toCollection: string,
    options?: any,
    callback?: Function
  ): Promise<void> {
    if (typeof options === 'function') (callback = options), (options = {});
    options = Object.assign({}, options, { readPreference: ReadPreference.PRIMARY });

    // Add return new collection
    options.new_collection = true;

    const renameOperation = new RenameOperation(
      this.collection(fromCollection),
      toCollection,
      options
    );

    return executeOperation(this.s.topology, renameOperation, callback);
  }

  /**
   * Drop a collection from the database, removing it permanently. New accesses will create a new collection.
   *
   * @function
   * @param {string} name Name of collection to drop
   * @param {object} [options] Optional settings
   * @param {WriteConcern} [options.writeConcern] A full WriteConcern object
   * @param {(number|string)} [options.w] The write concern
   * @param {number} [options.wtimeout] The write concern timeout
   * @param {boolean} [options.j] The journal write concern
   * @param {ClientSession} [options.session] optional session to use for this operation
   * @param {Db~resultCallback} [callback] The results callback
   * @returns {Promise<void>} returns Promise if no callback passed
   */
  dropCollection(name: string, options?: any, callback?: Function): Promise<void> {
    if (typeof options === 'function') (callback = options), (options = {});
    options = options || {};

    const dropCollectionOperation = new DropCollectionOperation(this, name, options);

    return executeOperation(this.s.topology, dropCollectionOperation, callback);
  }

  /**
   * Drop a database, removing it permanently from the server.
   *
   * @function
   * @param {object} [options] Optional settings
   * @param {ClientSession} [options.session] optional session to use for this operation
   * @param {Db~resultCallback} [callback] The results callback
   * @returns {Promise<void>} returns Promise if no callback passed
   */
  dropDatabase(options?: any, callback?: Function): Promise<void> {
    if (typeof options === 'function') (callback = options), (options = {});
    options = options || {};

    const dropDatabaseOperation = new DropDatabaseOperation(this, options);

    return executeOperation(this.s.topology, dropDatabaseOperation, callback);
  }

  /**
   * Fetch all collections for the current db.
   *
   * @function
   * @param {object} [options] Optional settings
   * @param {ClientSession} [options.session] optional session to use for this operation
   * @param {Db~collectionsResultCallback} [callback] The results callback
   * @returns {Promise<void>} returns Promise if no callback passed
   */
  collections(options?: any, callback?: Function): Promise<void> {
    if (typeof options === 'function') (callback = options), (options = {});
    options = options || {};

    const collectionsOperation = new CollectionsOperation(this, options);

    return executeOperation(this.s.topology, collectionsOperation, callback);
  }

  /**
   * Runs a command on the database as admin.
   *
   * @function
   * @param {object} selector The command hash
   * @param {object} [options] Optional settings.
   * @param {(ReadPreference|string)} [options.readPreference] The preferred read preference (ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST).
   * @param {ClientSession} [options.session] optional session to use for this operation
   * @param {Db~resultCallback} [callback] The command result callback
   * @returns {Promise<void>} returns Promise if no callback passed
   */
  executeDbAdminCommand(selector: object, options?: any, callback?: Function): Promise<void> {
    if (typeof options === 'function') (callback = options), (options = {});
    options = options || {};

    return executeOperation(
      this.s.topology,
      new RunAdminCommandOperation(this, selector, options),
      callback
    );
  }

  /**
   * Creates an index on the db and collection.
   *
   * @function
   * @param {string} name Name of the collection to create the index on.
   * @param {(string|object)} fieldOrSpec Defines the index.
   * @param {object} [options] Optional settings.
   * @param {(number|string)} [options.w] The write concern.
   * @param {number} [options.wtimeout] The write concern timeout.
   * @param {boolean} [options.j=false] Specify a journal write concern.
   * @param {boolean} [options.unique=false] Creates an unique index.
   * @param {boolean} [options.sparse=false] Creates a sparse index.
   * @param {boolean} [options.background=false] Creates the index in the background, yielding whenever possible.
   * @param {boolean} [options.dropDups=false] A unique index cannot be created on a key that has pre-existing duplicate values. If you would like to create the index anyway, keeping the first document the database indexes and deleting all subsequent documents that have duplicate value
   * @param {number} [options.min] For geospatial indexes set the lower bound for the co-ordinates.
   * @param {number} [options.max] For geospatial indexes set the high bound for the co-ordinates.
   * @param {number} [options.v] Specify the format version of the indexes.
   * @param {number} [options.expireAfterSeconds] Allows you to expire data on indexes applied to a data (MongoDB 2.2 or higher)
   * @param {string} [options.name] Override the autogenerated index name (useful if the resulting name is larger than 128 bytes)
   * @param {object} [options.partialFilterExpression] Creates a partial index based on the given filter object (MongoDB 3.2 or higher)
   * @param {ClientSession} [options.session] optional session to use for this operation
   * @param {(number|string)} [options.commitQuorum] (MongoDB 4.4. or higher) Specifies how many data-bearing members of a replica set, including the primary, must complete the index builds successfully before the primary marks the indexes as ready. This option accepts the same values for the "w" field in a write concern plus "votingMembers", which indicates all voting data-bearing nodes.
   * @param {Db~resultCallback} [callback] The command result callback
   * @returns {Promise<void>} returns Promise if no callback passed
   */
  createIndex(name: string, fieldOrSpec: any, options?: any, callback?: Function): Promise<void> {
    if (typeof options === 'function') (callback = options), (options = {});
    options = options ? Object.assign({}, options) : {};

    return executeOperation(
      this.s.topology,
      new CreateIndexOperation(this, name, fieldOrSpec, options),
      callback
    );
  }

  /**
   * Add a user to the database.
   *
   * @function
   * @param {string} username The username.
   * @param {any} password The password.
   * @param {object} [options] Optional settings.
   * @param {(number|string)} [options.w] The write concern.
   * @param {number} [options.wtimeout] The write concern timeout.
   * @param {boolean} [options.j=false] Specify a journal write concern.
   * @param {object} [options.customData] Custom data associated with the user (only Mongodb 2.6 or higher)
   * @param {object[]} [options.roles] Roles associated with the created user (only Mongodb 2.6 or higher)
   * @param {ClientSession} [options.session] optional session to use for this operation
   * @param {Db~resultCallback} [callback] The command result callback
   * @returns {Promise<void>} returns Promise if no callback passed
   */
  addUser(username: string, password: any, options?: any, callback?: Function): Promise<void> {
    if (typeof options === 'function') (callback = options), (options = {});
    options = options || {};

    // Special case where there is no password ($external users)
    if (typeof username === 'string' && password != null && typeof password === 'object') {
      options = password;
      password = null;
    }

    const addUserOperation = new AddUserOperation(this, username, password, options);

    return executeOperation(this.s.topology, addUserOperation, callback);
  }

  /**
   * Remove a user from a database
   *
   * @function
   * @param {string} username The username.
   * @param {object} [options] Optional settings.
   * @param {(number|string)} [options.w] The write concern.
   * @param {number} [options.wtimeout] The write concern timeout.
   * @param {boolean} [options.j=false] Specify a journal write concern.
   * @param {ClientSession} [options.session] optional session to use for this operation
   * @param {Db~resultCallback} [callback] The command result callback
   * @returns {Promise<void>} returns Promise if no callback passed
   */
  removeUser(username: string, options?: any, callback?: Function): Promise<void> {
    if (typeof options === 'function') (callback = options), (options = {});
    options = options || {};

    const removeUserOperation = new RemoveUserOperation(this, username, options);

    return executeOperation(this.s.topology, removeUserOperation, callback);
  }

  /**
   * Set the current profiling level of MongoDB
   *
   * @param {string} level The new profiling level (off, slow_only, all).
   * @param {object} [options] Optional settings
   * @param {ClientSession} [options.session] optional session to use for this operation
   * @param {Db~resultCallback} [callback] The command result callback.
   * @returns {Promise<void>} returns Promise if no callback passed
   */
  setProfilingLevel(level: string, options?: any, callback?: Function): Promise<void> {
    if (typeof options === 'function') (callback = options), (options = {});
    options = options || {};

    const setProfilingLevelOperation = new SetProfilingLevelOperation(this, level, options);

    return executeOperation(this.s.topology, setProfilingLevelOperation, callback);
  }

  /**
   * Retrieve the current profiling Level for MongoDB
   *
   * @param {object} [options] Optional settings
   * @param {ClientSession} [options.session] optional session to use for this operation
   * @param {Db~resultCallback} [callback] The command result callback
   * @returns {Promise<void>} returns Promise if no callback passed
   */
  profilingLevel(options?: any, callback?: Function): Promise<void> {
    if (typeof options === 'function') (callback = options), (options = {});
    options = options || {};

    const profilingLevelOperation = new ProfilingLevelOperation(this, options);

    return executeOperation(this.s.topology, profilingLevelOperation, callback);
  }

  /**
   * Retrieves this collections index info.
   *
   * @function
   * @param {string} name The name of the collection.
   * @param {object} [options] Optional settings.
   * @param {boolean} [options.full=false] Returns the full raw index information.
   * @param {(ReadPreference|string)} [options.readPreference] The preferred read preference (ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST).
   * @param {ClientSession} [options.session] optional session to use for this operation
   * @param {Db~resultCallback} [callback] The command result callback
   * @returns {Promise<void>} returns Promise if no callback passed
   */
  indexInformation(name: string, options?: any, callback?: Function): Promise<void> {
    if (typeof options === 'function') (callback = options), (options = {});
    options = options || {};

    const indexInformationOperation = new IndexInformationOperation(this, name, options);

    return executeOperation(this.s.topology, indexInformationOperation, callback);
  }

  /**
   * Unref all sockets
   *
   * @function
   */
  unref() {
    this.s.topology.unref();
  }

  /**
   * Create a new Change Stream, watching for new changes (insertions, updates, replacements, deletions, and invalidations) in this database. Will ignore all changes to system collections.
   *
   * @function
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

  /**
   * Return the db logger
   *
   * @function
   * @returns {Logger} return the db logger
   */
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
 * @function
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
 * @param {boolean} [options.capped=false] Create a capped collection.
 * @param {boolean} [options.autoIndexId=true] DEPRECATED: Create an index on the _id field of the document, True by default on MongoDB 2.6 - 3.0
 * @param {number} [options.size] The size of the capped collection in bytes.
 * @param {number} [options.max] The maximum number of documents in the capped collection.
 * @param {number} [options.flags] Optional. Available for the MMAPv1 storage engine only to set the usePowerOf2Sizes and the noPadding flag.
 * @param {object} [options.storageEngine] Allows users to specify configuration to the storage engine on a per-collection basis when creating a collection on MongoDB 3.0 or higher.
 * @param {object} [options.validator] Allows users to specify validation rules or expressions for the collection. For more information, see Document Validation on MongoDB 3.2 or higher.
 * @param {string} [options.validationLevel] Determines how strictly MongoDB applies the validation rules to existing documents during an update on MongoDB 3.2 or higher.
 * @param {string} [options.validationAction] Determines whether to error on invalid documents or just warn about the violations but allow invalid documents to be inserted on MongoDB 3.2 or higher.
 * @param {object} [options.indexOptionDefaults] Allows users to specify a default configuration for indexes when creating a collection on MongoDB 3.2 or higher.
 * @param {string} [options.viewOn] The name of the source collection or view from which to create the view. The name is not the full namespace of the collection or view; i.e. does not include the database name and implies the same database as the view to create on MongoDB 3.4 or higher.
 * @param {Array} [options.pipeline] An array that consists of the aggregation pipeline stage. Creates the view by applying the specified pipeline to the viewOn collection or view on MongoDB 3.4 or higher.
 * @param {object} [options.collation] Specify collation (MongoDB 3.4 or higher) settings for update operation (see 3.4 documentation for available fields).
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Db~collectionResultCallback} [callback] The results callback
 * @returns {Promise<void>} returns Promise if no callback passed
 */
Db.prototype.createCollection = deprecateOptions(
  {
    name: 'Db.createCollection',
    deprecatedOptions: ['autoIndexId'],
    optionsIndex: 1
  },
  function(this: any, name: any, options: any, callback: Function) {
    if (typeof options === 'function') (callback = options), (options = {});
    options = options || {};
    options.readConcern = options.readConcern
      ? new ReadConcern(options.readConcern.level)
      : this.readConcern;
    const createCollectionOperation = new CreateCollectionOperation(this, name, options);

    return executeOperation(this.s.topology, createCollectionOperation, callback);
  }
);

/**
 * Evaluate JavaScript on the server
 *
 * @function
 * @param {Code} code JavaScript to execute on server.
 * @param {(object|Array)} parameters The parameters for the call.
 * @param {object} [options] Optional settings.
 * @param {boolean} [options.nolock=false] Tell MongoDB not to block on the evaluation of the javascript.
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Db~resultCallback} [callback] The results callback
 * @deprecated Eval is deprecated on MongoDB 3.2 and forward
 * @returns {Promise<void>} returns Promise if no callback passed
 */
Db.prototype.eval = deprecate(function(
  this: any,
  code: any,
  parameters: any,
  options: any,
  callback: Function
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
 * @function
 * @deprecated since version 2.0
 * @param {string} name The index name
 * @param {(string|object)} fieldOrSpec Defines the index.
 * @param {object} [options] Optional settings.
 * @param {(number|string)} [options.w] The write concern.
 * @param {number} [options.wtimeout] The write concern timeout.
 * @param {boolean} [options.j=false] Specify a journal write concern.
 * @param {boolean} [options.unique=false] Creates an unique index.
 * @param {boolean} [options.sparse=false] Creates a sparse index.
 * @param {boolean} [options.background=false] Creates the index in the background, yielding whenever possible.
 * @param {boolean} [options.dropDups=false] A unique index cannot be created on a key that has pre-existing duplicate values. If you would like to create the index anyway, keeping the first document the database indexes and deleting all subsequent documents that have duplicate value
 * @param {number} [options.min] For geospatial indexes set the lower bound for the co-ordinates.
 * @param {number} [options.max] For geospatial indexes set the high bound for the co-ordinates.
 * @param {number} [options.v] Specify the format version of the indexes.
 * @param {number} [options.expireAfterSeconds] Allows you to expire data on indexes applied to a data (MongoDB 2.2 or higher)
 * @param {number} [options.name] Override the autogenerated index name (useful if the resulting name is larger than 128 bytes)
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Db~resultCallback} [callback] The command result callback
 * @returns {Promise<void>} returns Promise if no callback passed
 */
Db.prototype.ensureIndex = deprecate(function(
  this: any,
  name: any,
  fieldOrSpec: any,
  options: any,
  callback: Function
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
 * @param {object} [options] Optional settings
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Db~resultCallback} [callback] The command result callback.
 * @returns {Promise<void>} returns Promise if no callback passed
 * @deprecated Query the system.profile collection directly.
 */
Db.prototype.profilingInfo = deprecate(function(this: any, options: any, callback: Function) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = options || {};

  return this.collection('system.profile')
    .find({}, options)
    .toArray(callback);
}, 'Db.profilingInfo is deprecated. Query the system.profile collection directly.');

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

export = Db;
