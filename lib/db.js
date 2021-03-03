'use strict';

const EventEmitter = require('events').EventEmitter;
const inherits = require('util').inherits;
const getSingleProperty = require('./utils').getSingleProperty;
const CommandCursor = require('./command_cursor');
const handleCallback = require('./utils').handleCallback;
const filterOptions = require('./utils').filterOptions;
const toError = require('./utils').toError;
const ReadPreference = require('./core').ReadPreference;
const MongoError = require('./core').MongoError;
const ObjectID = require('./core').ObjectID;
const Logger = require('./core').Logger;
const Collection = require('./collection');
const conditionallyMergeWriteConcern = require('./utils').conditionallyMergeWriteConcern;
const executeLegacyOperation = require('./utils').executeLegacyOperation;
const ChangeStream = require('./change_stream');
const deprecate = require('util').deprecate;
const deprecateOptions = require('./utils').deprecateOptions;
const MongoDBNamespace = require('./utils').MongoDBNamespace;
const CONSTANTS = require('./constants');
const WriteConcern = require('./write_concern');
const ReadConcern = require('./read_concern');
const AggregationCursor = require('./aggregation_cursor');

// Operations
const createListener = require('./operations/db_ops').createListener;
const ensureIndex = require('./operations/db_ops').ensureIndex;
const evaluate = require('./operations/db_ops').evaluate;
const profilingInfo = require('./operations/db_ops').profilingInfo;
const validateDatabaseName = require('./operations/db_ops').validateDatabaseName;

const AggregateOperation = require('./operations/aggregate');
const AddUserOperation = require('./operations/add_user');
const CollectionsOperation = require('./operations/collections');
const CommandOperation = require('./operations/command');
const RunCommandOperation = require('./operations/run_command');
const CreateCollectionOperation = require('./operations/create_collection');
const CreateIndexesOperation = require('./operations/create_indexes');
const DropCollectionOperation = require('./operations/drop').DropCollectionOperation;
const DropDatabaseOperation = require('./operations/drop').DropDatabaseOperation;
const ExecuteDbAdminCommandOperation = require('./operations/execute_db_admin_command');
const IndexInformationOperation = require('./operations/index_information');
const ListCollectionsOperation = require('./operations/list_collections');
const ProfilingLevelOperation = require('./operations/profiling_level');
const RemoveUserOperation = require('./operations/remove_user');
const RenameOperation = require('./operations/rename');
const SetProfilingLevelOperation = require('./operations/set_profiling_level');

const executeOperation = require('./operations/execute_operation');

/**
 * @fileOverview The **Db** class is a class that represents a MongoDB Database.
 *
 * @example
 * const MongoClient = require('mongodb').MongoClient;
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

// Allowed parameters
const legalOptionNames = [
  'w',
  'wtimeout',
  'fsync',
  'j',
  'writeConcern',
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
  'promiseLibrary',
  'readConcern',
  'retryMiliSeconds',
  'numberOfRetries',
  'parentDb',
  'noListener',
  'loggerLevel',
  'logger',
  'promoteBuffers',
  'promoteLongs',
  'promoteValues',
  'compression',
  'retryWrites'
];

/**
 * Creates a new Db instance
 * @class
 * @param {string} databaseName The name of the database this instance represents.
 * @param {(Server|ReplSet|Mongos)} topology The server topology for the database.
 * @param {object} [options] Optional settings.
 * @param {string} [options.authSource] If the database authentication is dependent on another databaseName.
 * @param {(number|string)} [options.w] **Deprecated** The write concern. Use writeConcern instead.
 * @param {number} [options.wtimeout] **Deprecated** The write concern timeout. Use writeConcern instead.
 * @param {boolean} [options.j=false] **Deprecated** Specify a journal write concern. Use writeConcern instead.
 * @param {object|WriteConcern} [options.writeConcern] Specify write concern settings.
 * @param {boolean} [options.forceServerObjectId=false] Force server to assign _id values instead of driver.
 * @param {boolean} [options.serializeFunctions=false] Serialize functions on any object.
 * @param {Boolean} [options.ignoreUndefined=false] Specify if the BSON serializer should ignore undefined fields.
 * @param {boolean} [options.raw=false] Return document results as raw BSON buffers.
 * @param {boolean} [options.promoteLongs=true] Promotes Long values to number if they fit inside the 53 bits resolution.
 * @param {boolean} [options.promoteBuffers=false] Promotes Binary BSON values to native Node Buffers.
 * @param {boolean} [options.promoteValues=true] Promotes BSON values to native types where possible, set to false to only receive wrapper types.
 * @param {number} [options.bufferMaxEntries=-1] Sets a cap on how many operations the driver will buffer up before giving up on getting a working connection, default is -1 which is unlimited.
 * @param {(ReadPreference|string)} [options.readPreference] The preferred read preference (ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST).
 * @param {object} [options.pkFactory] A primary key factory object for generation of custom _id keys.
 * @param {object} [options.promiseLibrary] A Promise library class the application wishes to use such as Bluebird, must be ES6 compatible
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
 * @fires Db#close
 * @fires Db#reconnect
 * @fires Db#error
 * @fires Db#timeout
 * @fires Db#parseError
 * @fires Db#fullsetup
 * @return {Db} a Db instance.
 */
function Db(databaseName, topology, options) {
  options = options || {};
  if (!(this instanceof Db)) return new Db(databaseName, topology, options);
  EventEmitter.call(this);

  // Get the promiseLibrary
  const promiseLibrary = options.promiseLibrary || Promise;

  // Filter the options
  options = filterOptions(options, legalOptionNames);

  // Ensure we put the promiseLib in the options
  options.promiseLibrary = promiseLibrary;

  // Internal state of the db object
  this.s = {
    // DbCache
    dbCache: {},
    // Children db's
    children: [],
    // Topology
    topology: topology,
    // Options
    options: options,
    // Logger instance
    logger: Logger('Db', options),
    // Get the bson parser
    bson: topology ? topology.bson : null,
    // Unpack read preference
    readPreference: ReadPreference.fromOptions(options),
    // Set buffermaxEntries
    bufferMaxEntries: typeof options.bufferMaxEntries === 'number' ? options.bufferMaxEntries : -1,
    // Parent db (if chained)
    parentDb: options.parentDb || null,
    // Set up the primary key factory or fallback to ObjectID
    pkFactory: options.pkFactory || ObjectID,
    // Get native parser
    nativeParser: options.nativeParser || options.native_parser,
    // Promise library
    promiseLibrary: promiseLibrary,
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

  // This is a child db, do not register any listeners
  if (options.parentDb) return;
  if (this.s.noListener) return;

  // Add listeners
  topology.on('error', createListener(this, 'error', this));
  topology.on('timeout', createListener(this, 'timeout', this));
  topology.on('close', createListener(this, 'close', this));
  topology.on('parseError', createListener(this, 'parseError', this));
  topology.once('open', createListener(this, 'open', this));
  topology.once('fullsetup', createListener(this, 'fullsetup', this));
  topology.once('all', createListener(this, 'all', this));
  topology.on('reconnect', createListener(this, 'reconnect', this));
}

inherits(Db, EventEmitter);

Db.prototype.on = deprecate(function() {
  return Db.super_.prototype.on.apply(this, arguments);
}, 'Listening to events on the Db class has been deprecated and will be removed in the next major version.');

Db.prototype.once = deprecate(function() {
  return Db.super_.prototype.once.apply(this, arguments);
}, 'Listening to events on the Db class has been deprecated and will be removed in the next major version.');

// Topology
Object.defineProperty(Db.prototype, 'topology', {
  enumerable: true,
  get: function() {
    return this.s.topology;
  }
});

// Options
Object.defineProperty(Db.prototype, 'options', {
  enumerable: true,
  get: function() {
    return this.s.options;
  }
});

// slaveOk specified
Object.defineProperty(Db.prototype, 'slaveOk', {
  enumerable: true,
  get: function() {
    if (
      this.s.options.readPreference != null &&
      (this.s.options.readPreference !== 'primary' ||
        this.s.options.readPreference.mode !== 'primary')
    ) {
      return true;
    }
    return false;
  }
});

Object.defineProperty(Db.prototype, 'readConcern', {
  enumerable: true,
  get: function() {
    return this.s.readConcern;
  }
});

Object.defineProperty(Db.prototype, 'readPreference', {
  enumerable: true,
  get: function() {
    if (this.s.readPreference == null) {
      // TODO: check client
      return ReadPreference.primary;
    }

    return this.s.readPreference;
  }
});

// get the write Concern
Object.defineProperty(Db.prototype, 'writeConcern', {
  enumerable: true,
  get: function() {
    return this.s.writeConcern;
  }
});

Object.defineProperty(Db.prototype, 'namespace', {
  enumerable: true,
  get: function() {
    return this.s.namespace.toString();
  }
});

/**
 * Execute a command
 * @method
 * @param {object} command The command hash
 * @param {object} [options] Optional settings.
 * @param {(ReadPreference|string)} [options.readPreference] The preferred read preference (ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST).
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Db~resultCallback} [callback] The command result callback
 * @return {Promise} returns Promise if no callback passed
 */
Db.prototype.command = function(command, options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = Object.assign({}, options);

  const commandOperation = new RunCommandOperation(this, command, options);

  return executeOperation(this.s.topology, commandOperation, callback);
};

/**
 * Execute an aggregation framework pipeline against the database, needs MongoDB >= 3.6
 * @method
 * @param {object} [pipeline=[]] Array containing all the aggregation framework commands for the execution.
 * @param {object} [options] Optional settings.
 * @param {(ReadPreference|string)} [options.readPreference] The preferred read preference (ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST).
 * @param {number} [options.batchSize=1000] The number of documents to return per batch. See {@link https://docs.mongodb.com/manual/reference/command/aggregate|aggregation documentation}.
 * @param {object} [options.cursor] Return the query as cursor, on 2.6 > it returns as a real cursor on pre 2.6 it returns as an emulated cursor.
 * @param {number} [options.cursor.batchSize=1000] Deprecated. Use `options.batchSize`
 * @param {'queryPlanner'|'queryPlannerExtended'|'executionStats'|'allPlansExecution'|boolean} [options.explain] The verbosity mode for the explain output.
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
 * @param {Database~aggregationCallback} callback The command result callback
 * @return {(null|AggregationCursor)}
 */
Db.prototype.aggregate = function(pipeline, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }

  // If we have no options or callback we are doing
  // a cursor based aggregation
  if (options == null && callback == null) {
    options = {};
  }

  const cursor = new AggregationCursor(
    this.s.topology,
    new AggregateOperation(this, pipeline, options),
    options
  );

  // TODO: remove this when NODE-2074 is resolved
  if (typeof callback === 'function') {
    callback(null, cursor);
    return;
  }

  return cursor;
};

/**
 * Return the Admin db instance
 * @method
 * @return {Admin} return the new Admin db instance
 */
Db.prototype.admin = function() {
  const Admin = require('./admin');

  return new Admin(this, this.s.topology, this.s.promiseLibrary);
};

/**
 * The callback format for the collection method, must be used if strict is specified
 * @callback Db~collectionResultCallback
 * @param {MongoError} error An error instance representing the error during the execution.
 * @param {Collection} collection The collection instance.
 */

/**
 * The callback format for an aggregation call
 * @callback Database~aggregationCallback
 * @param {MongoError} error An error instance representing the error during the execution.
 * @param {AggregationCursor} cursor The cursor if the aggregation command was executed successfully.
 */

const COLLECTION_OPTION_KEYS = [
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
 * Fetch a specific collection (containing the actual collection information). If the application does not use strict mode you
 * can use it without a callback in the following way: `const collection = db.collection('mycollection');`
 *
 * @method
 * @param {string} name the collection name we wish to access.
 * @param {object} [options] Optional settings.
 * @param {(number|string)} [options.w] **Deprecated** The write concern. Use writeConcern instead.
 * @param {number} [options.wtimeout] **Deprecated** The write concern timeout. Use writeConcern instead.
 * @param {boolean} [options.j=false] **Deprecated** Specify a journal write concern. Use writeConcern instead.
 * @param {object|WriteConcern} [options.writeConcern] Specify write concern settings.
 * @param {boolean} [options.raw=false] Return document results as raw BSON buffers.
 * @param {object} [options.pkFactory] A primary key factory object for generation of custom _id keys.
 * @param {(ReadPreference|string)} [options.readPreference] The preferred read preference (ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST).
 * @param {boolean} [options.serializeFunctions=false] Serialize functions on any object.
 * @param {boolean} [options.strict=false] Returns an error if the collection does not exist
 * @param {object} [options.readConcern] Specify a read concern for the collection. (only MongoDB 3.2 or higher supported)
 * @param {ReadConcernLevel} [options.readConcern.level='local'] Specify a read concern level for the collection operations (only MongoDB 3.2 or higher supported)
 * @param {Db~collectionResultCallback} [callback] The collection result callback
 * @return {Collection} return the new Collection instance if not in strict mode
 */
Db.prototype.collection = function(name, options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = options || {};
  options = Object.assign({}, options);

  // Set the promise library
  options.promiseLibrary = this.s.promiseLibrary;

  // If we have not set a collection level readConcern set the db level one
  options.readConcern = options.readConcern
    ? new ReadConcern(options.readConcern.level)
    : this.readConcern;

  // Do we have ignoreUndefined set
  if (this.s.options.ignoreUndefined) {
    options.ignoreUndefined = this.s.options.ignoreUndefined;
  }

  for (const collectionOptionKey of COLLECTION_OPTION_KEYS) {
    if (!(collectionOptionKey in options) && this.s.options[collectionOptionKey] !== undefined) {
      options[collectionOptionKey] = this.s.options[collectionOptionKey];
    }
  }

  // Merge in all needed options and ensure correct writeConcern merging from db level
  options = conditionallyMergeWriteConcern(options, this.s.options);

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
  this.listCollections({ name: name }, listCollectionOptions).toArray((err, collections) => {
    if (err != null) return handleCallback(callback, err, null);
    if (collections.length === 0)
      return handleCallback(
        callback,
        toError(`Collection ${name} does not exist. Currently in strict mode.`),
        null
      );

    try {
      return handleCallback(
        callback,
        null,
        new Collection(this, this.s.topology, this.databaseName, name, this.s.pkFactory, options)
      );
    } catch (err) {
      return handleCallback(callback, err, null);
    }
  });
};

/**
 * Create a new collection on a server with the specified options. Use this to create capped collections.
 * More information about command options available at https://docs.mongodb.com/manual/reference/command/create/
 *
 * @method
 * @param {string} name the collection name we wish to access.
 * @param {object} [options] Optional settings.
 * @param {(number|string)} [options.w] **Deprecated** The write concern. Use writeConcern instead.
 * @param {number} [options.wtimeout] **Deprecated** The write concern timeout. Use writeConcern instead.
 * @param {boolean} [options.j=false] **Deprecated** Specify a journal write concern. Use writeConcern instead.
 * @param {object|WriteConcern} [options.writeConcern] Specify write concern settings.
 * @param {boolean} [options.raw=false] Return document results as raw BSON buffers.
 * @param {object} [options.pkFactory] A primary key factory object for generation of custom _id keys.
 * @param {(ReadPreference|string)} [options.readPreference] The preferred read preference (ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST).
 * @param {boolean} [options.serializeFunctions=false] Serialize functions on any object.
 * @param {boolean} [options.strict=false] DEPRECATED: Returns an error if the collection does not exist
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
 * @param {array} [options.pipeline] An array that consists of the aggregation pipeline stage. Creates the view by applying the specified pipeline to the viewOn collection or view on MongoDB 3.4 or higher.
 * @param {object} [options.collation] Specify collation (MongoDB 3.4 or higher) settings for update operation (see 3.4 documentation for available fields).
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Db~collectionResultCallback} [callback] The results callback
 * @return {Promise} returns Promise if no callback passed
 */
Db.prototype.createCollection = deprecateOptions(
  {
    name: 'Db.createCollection',
    deprecatedOptions: ['autoIndexId', 'strict', 'w', 'wtimeout', 'j'],
    optionsIndex: 1
  },
  function(name, options, callback) {
    if (typeof options === 'function') (callback = options), (options = {});
    options = options || {};
    options.promiseLibrary = options.promiseLibrary || this.s.promiseLibrary;
    options.readConcern = options.readConcern
      ? new ReadConcern(options.readConcern.level)
      : this.readConcern;
    const createCollectionOperation = new CreateCollectionOperation(this, name, options);

    return executeOperation(this.s.topology, createCollectionOperation, callback);
  }
);

/**
 * Get all the db statistics.
 *
 * @method
 * @param {object} [options] Optional settings.
 * @param {number} [options.scale] Divide the returned sizes by scale value.
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Db~resultCallback} [callback] The collection result callback
 * @return {Promise} returns Promise if no callback passed
 */
Db.prototype.stats = function(options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = options || {};
  // Build command object
  const commandObject = { dbStats: true };
  // Check if we have the scale value
  if (options['scale'] != null) commandObject['scale'] = options['scale'];

  // If we have a readPreference set
  if (options.readPreference == null && this.s.readPreference) {
    options.readPreference = this.s.readPreference;
  }

  const statsOperation = new CommandOperation(this, options, null, commandObject);

  // Execute the command
  return executeOperation(this.s.topology, statsOperation, callback);
};

/**
 * Get the list of all collection information for the specified db.
 *
 * @method
 * @param {object} [filter={}] Query to filter collections by
 * @param {object} [options] Optional settings.
 * @param {boolean} [options.nameOnly=false] Since 4.0: If true, will only return the collection name in the response, and will omit additional info
 * @param {number} [options.batchSize=1000] The batchSize for the returned command cursor or if pre 2.8 the systems batch collection
 * @param {(ReadPreference|string)} [options.readPreference] The preferred read preference (ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST).
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @return {CommandCursor}
 */
Db.prototype.listCollections = function(filter, options) {
  filter = filter || {};
  options = options || {};

  return new CommandCursor(
    this.s.topology,
    new ListCollectionsOperation(this, filter, options),
    options
  );
};

/**
 * Evaluate JavaScript on the server
 *
 * @method
 * @param {Code} code JavaScript to execute on server.
 * @param {(object|array)} parameters The parameters for the call.
 * @param {object} [options] Optional settings.
 * @param {boolean} [options.nolock=false] Tell MongoDB not to block on the evaluation of the javascript.
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Db~resultCallback} [callback] The results callback
 * @deprecated Eval is deprecated on MongoDB 3.2 and forward
 * @return {Promise} returns Promise if no callback passed
 */
Db.prototype.eval = deprecate(function(code, parameters, options, callback) {
  const args = Array.prototype.slice.call(arguments, 1);
  callback = typeof args[args.length - 1] === 'function' ? args.pop() : undefined;
  parameters = args.length ? args.shift() : parameters;
  options = args.length ? args.shift() || {} : {};

  return executeLegacyOperation(this.s.topology, evaluate, [
    this,
    code,
    parameters,
    options,
    callback
  ]);
}, 'Db.eval is deprecated as of MongoDB version 3.2');

/**
 * Rename a collection.
 *
 * @method
 * @param {string} fromCollection Name of current collection to rename.
 * @param {string} toCollection New name of of the collection.
 * @param {object} [options] Optional settings.
 * @param {boolean} [options.dropTarget=false] Drop the target name collection if it previously exists.
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Db~collectionResultCallback} [callback] The results callback
 * @return {Promise} returns Promise if no callback passed
 */
Db.prototype.renameCollection = function(fromCollection, toCollection, options, callback) {
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
};

/**
 * Drop a collection from the database, removing it permanently. New accesses will create a new collection.
 *
 * @method
 * @param {string} name Name of collection to drop
 * @param {Object} [options] Optional settings
 * @param {(number|string)} [options.w] **Deprecated** The write concern. Use writeConcern instead.
 * @param {number} [options.wtimeout] **Deprecated** The write concern timeout. Use writeConcern instead.
 * @param {boolean} [options.j=false] **Deprecated** Specify a journal write concern. Use writeConcern instead.
 * @param {object|WriteConcern} [options.writeConcern] Specify write concern settings.
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Db~resultCallback} [callback] The results callback
 * @return {Promise} returns Promise if no callback passed
 */
Db.prototype.dropCollection = function(name, options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = options || {};

  const dropCollectionOperation = new DropCollectionOperation(this, name, options);

  return executeOperation(this.s.topology, dropCollectionOperation, callback);
};

/**
 * Drop a database, removing it permanently from the server.
 *
 * @method
 * @param {Object} [options] Optional settings
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Db~resultCallback} [callback] The results callback
 * @return {Promise} returns Promise if no callback passed
 */
Db.prototype.dropDatabase = function(options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = options || {};

  const dropDatabaseOperation = new DropDatabaseOperation(this, options);

  return executeOperation(this.s.topology, dropDatabaseOperation, callback);
};

/**
 * Fetch all collections for the current db.
 *
 * @method
 * @param {Object} [options] Optional settings
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Db~collectionsResultCallback} [callback] The results callback
 * @return {Promise} returns Promise if no callback passed
 */
Db.prototype.collections = function(options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = options || {};

  const collectionsOperation = new CollectionsOperation(this, options);

  return executeOperation(this.s.topology, collectionsOperation, callback);
};

/**
 * Runs a command on the database as admin.
 * @method
 * @param {object} command The command hash
 * @param {object} [options] Optional settings.
 * @param {(ReadPreference|string)} [options.readPreference] The preferred read preference (ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST).
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Db~resultCallback} [callback] The command result callback
 * @return {Promise} returns Promise if no callback passed
 */
Db.prototype.executeDbAdminCommand = function(selector, options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = options || {};
  options.readPreference = ReadPreference.resolve(this, options);

  const executeDbAdminCommandOperation = new ExecuteDbAdminCommandOperation(
    this,
    selector,
    options
  );

  return executeOperation(this.s.topology, executeDbAdminCommandOperation, callback);
};

/**
 * Creates an index on the db and collection.
 * @method
 * @param {string} name Name of the collection to create the index on.
 * @param {(string|object)} fieldOrSpec Defines the index.
 * @param {object} [options] Optional settings.
 * @param {(number|string)} [options.w] **Deprecated** The write concern. Use writeConcern instead.
 * @param {number} [options.wtimeout] **Deprecated** The write concern timeout. Use writeConcern instead.
 * @param {boolean} [options.j=false] **Deprecated** Specify a journal write concern. Use writeConcern instead.
 * @param {object|WriteConcern} [options.writeConcern] Specify write concern settings.
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
 * @return {Promise} returns Promise if no callback passed
 */
Db.prototype.createIndex = function(name, fieldOrSpec, options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = options ? Object.assign({}, options) : {};

  const createIndexesOperation = new CreateIndexesOperation(this, name, fieldOrSpec, options);

  return executeOperation(this.s.topology, createIndexesOperation, callback);
};

/**
 * Ensures that an index exists, if it does not it creates it
 * @method
 * @deprecated since version 2.0
 * @param {string} name The index name
 * @param {(string|object)} fieldOrSpec Defines the index.
 * @param {object} [options] Optional settings.
 * @param {(number|string)} [options.w] **Deprecated** The write concern. Use writeConcern instead.
 * @param {number} [options.wtimeout] **Deprecated** The write concern timeout. Use writeConcern instead.
 * @param {boolean} [options.j=false] **Deprecated** Specify a journal write concern. Use writeConcern instead.
 * @param {object|WriteConcern} [options.writeConcern] Specify write concern settings.
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
 * @return {Promise} returns Promise if no callback passed
 */
Db.prototype.ensureIndex = deprecate(function(name, fieldOrSpec, options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = options || {};

  return executeLegacyOperation(this.s.topology, ensureIndex, [
    this,
    name,
    fieldOrSpec,
    options,
    callback
  ]);
}, 'Db.ensureIndex is deprecated as of MongoDB version 3.0 / driver version 2.0');

Db.prototype.addChild = function(db) {
  if (this.s.parentDb) return this.s.parentDb.addChild(db);
  this.s.children.push(db);
};

/**
 * Add a user to the database.
 * @method
 * @param {string} username The username.
 * @param {string} password The password.
 * @param {object} [options] Optional settings.
 * @param {(number|string)} [options.w] **Deprecated** The write concern. Use writeConcern instead.
 * @param {number} [options.wtimeout] **Deprecated** The write concern timeout. Use writeConcern instead.
 * @param {boolean} [options.j=false] **Deprecated** Specify a journal write concern. Use writeConcern instead.
 * @param {object|WriteConcern} [options.writeConcern] Specify write concern settings.
 * @param {object} [options.customData] Custom data associated with the user (only Mongodb 2.6 or higher)
 * @param {object[]} [options.roles] Roles associated with the created user (only Mongodb 2.6 or higher)
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Db~resultCallback} [callback] The command result callback
 * @return {Promise} returns Promise if no callback passed
 */
Db.prototype.addUser = function(username, password, options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = options || {};

  // Special case where there is no password ($external users)
  if (typeof username === 'string' && password != null && typeof password === 'object') {
    options = password;
    password = null;
  }

  const addUserOperation = new AddUserOperation(this, username, password, options);

  return executeOperation(this.s.topology, addUserOperation, callback);
};

/**
 * Remove a user from a database
 * @method
 * @param {string} username The username.
 * @param {object} [options] Optional settings.
 * @param {(number|string)} [options.w] **Deprecated** The write concern. Use writeConcern instead.
 * @param {number} [options.wtimeout] **Deprecated** The write concern timeout. Use writeConcern instead.
 * @param {boolean} [options.j=false] **Deprecated** Specify a journal write concern. Use writeConcern instead.
 * @param {object|WriteConcern} [options.writeConcern] Specify write concern settings.
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Db~resultCallback} [callback] The command result callback
 * @return {Promise} returns Promise if no callback passed
 */
Db.prototype.removeUser = function(username, options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = options || {};

  const removeUserOperation = new RemoveUserOperation(this, username, options);

  return executeOperation(this.s.topology, removeUserOperation, callback);
};

/**
 * Set the current profiling level of MongoDB
 *
 * @param {string} level The new profiling level (off, slow_only, all).
 * @param {Object} [options] Optional settings
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Db~resultCallback} [callback] The command result callback.
 * @return {Promise} returns Promise if no callback passed
 */
Db.prototype.setProfilingLevel = function(level, options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = options || {};

  const setProfilingLevelOperation = new SetProfilingLevelOperation(this, level, options);

  return executeOperation(this.s.topology, setProfilingLevelOperation, callback);
};

/**
 * Retrieve the current profiling information for MongoDB
 *
 * @param {Object} [options] Optional settings
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Db~resultCallback} [callback] The command result callback.
 * @return {Promise} returns Promise if no callback passed
 * @deprecated Query the system.profile collection directly.
 */
Db.prototype.profilingInfo = deprecate(function(options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = options || {};

  return executeLegacyOperation(this.s.topology, profilingInfo, [this, options, callback]);
}, 'Db.profilingInfo is deprecated. Query the system.profile collection directly.');

/**
 * Retrieve the current profiling Level for MongoDB
 *
 * @param {Object} [options] Optional settings
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Db~resultCallback} [callback] The command result callback
 * @return {Promise} returns Promise if no callback passed
 */
Db.prototype.profilingLevel = function(options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = options || {};

  const profilingLevelOperation = new ProfilingLevelOperation(this, options);

  return executeOperation(this.s.topology, profilingLevelOperation, callback);
};

/**
 * Retrieves this collections index info.
 * @method
 * @param {string} name The name of the collection.
 * @param {object} [options] Optional settings.
 * @param {boolean} [options.full=false] Returns the full raw index information.
 * @param {(ReadPreference|string)} [options.readPreference] The preferred read preference (ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST).
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Db~resultCallback} [callback] The command result callback
 * @return {Promise} returns Promise if no callback passed
 */
Db.prototype.indexInformation = function(name, options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = options || {};

  const indexInformationOperation = new IndexInformationOperation(this, name, options);

  return executeOperation(this.s.topology, indexInformationOperation, callback);
};

/**
 * Unref all sockets
 * @method
 */
Db.prototype.unref = function() {
  this.s.topology.unref();
};

/**
 * Create a new Change Stream, watching for new changes (insertions, updates, replacements, deletions, and invalidations) in this database. Will ignore all changes to system collections.
 * @method
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
 * @return {ChangeStream} a ChangeStream instance.
 */
Db.prototype.watch = function(pipeline, options) {
  pipeline = pipeline || [];
  options = options || {};

  // Allow optionally not specifying a pipeline
  if (!Array.isArray(pipeline)) {
    options = pipeline;
    pipeline = [];
  }

  return new ChangeStream(this, pipeline, options);
};

/**
 * Return the db logger
 * @method
 * @return {Logger} return the db logger
 * @ignore
 */
Db.prototype.getLogger = function() {
  return this.s.logger;
};

/**
 * Db close event
 *
 * Emitted after a socket closed against a single server or mongos proxy.
 *
 * @event Db#close
 * @type {MongoError}
 */

/**
 * Db reconnect event
 *
 *  * Server: Emitted when the driver has reconnected and re-authenticated.
 *  * ReplicaSet: N/A
 *  * Mongos: Emitted when the driver reconnects and re-authenticates successfully against a Mongos.
 *
 * @event Db#reconnect
 * @type {object}
 */

/**
 * Db error event
 *
 * Emitted after an error occurred against a single server or mongos proxy.
 *
 * @event Db#error
 * @type {MongoError}
 */

/**
 * Db timeout event
 *
 * Emitted after a socket timeout occurred against a single server or mongos proxy.
 *
 * @event Db#timeout
 * @type {MongoError}
 */

/**
 * Db parseError event
 *
 * The parseError event is emitted if the driver detects illegal or corrupt BSON being received from the server.
 *
 * @event Db#parseError
 * @type {MongoError}
 */

/**
 * Db fullsetup event, emitted when all servers in the topology have been connected to at start up time.
 *
 * * Server: Emitted when the driver has connected to the single server and has authenticated.
 * * ReplSet: Emitted after the driver has attempted to connect to all replicaset members.
 * * Mongos: Emitted after the driver has attempted to connect to all mongos proxies.
 *
 * @event Db#fullsetup
 * @type {Db}
 */

// Constants
Db.SYSTEM_NAMESPACE_COLLECTION = CONSTANTS.SYSTEM_NAMESPACE_COLLECTION;
Db.SYSTEM_INDEX_COLLECTION = CONSTANTS.SYSTEM_INDEX_COLLECTION;
Db.SYSTEM_PROFILE_COLLECTION = CONSTANTS.SYSTEM_PROFILE_COLLECTION;
Db.SYSTEM_USER_COLLECTION = CONSTANTS.SYSTEM_USER_COLLECTION;
Db.SYSTEM_COMMAND_COLLECTION = CONSTANTS.SYSTEM_COMMAND_COLLECTION;
Db.SYSTEM_JS_COLLECTION = CONSTANTS.SYSTEM_JS_COLLECTION;

module.exports = Db;
