'use strict';

const EventEmitter = require('events').EventEmitter;
const inherits = require('util').inherits;
const getSingleProperty = require('./utils').getSingleProperty;
const CommandCursor = require('./command_cursor');
const handleCallback = require('./utils').handleCallback;
const filterOptions = require('./utils').filterOptions;
const toError = require('./utils').toError;
const ReadPreference = require('mongodb-core').ReadPreference;
const MongoError = require('mongodb-core').MongoError;
const ObjectID = require('mongodb-core').ObjectID;
const Logger = require('mongodb-core').Logger;
const Collection = require('./collection');
const mergeOptionsAndWriteConcern = require('./utils').mergeOptionsAndWriteConcern;
const executeOperation = require('./utils').executeOperation;
const applyWriteConcern = require('./utils').applyWriteConcern;
const resolveReadPreference = require('./utils').resolveReadPreference;
const ChangeStream = require('./change_stream');
const deprecate = require('util').deprecate;
const ClientSession = require('mongodb-core').Sessions.ClientSession;
const validate = require('./options_validator').validate;

// Operations
const addUser = require('./operations/db_ops').addUser;
const collections = require('./operations/db_ops').collections;
const createCollection = require('./operations/db_ops').createCollection;
const createIndex = require('./operations/db_ops').createIndex;
const createListener = require('./operations/db_ops').createListener;
const dropCollection = require('./operations/db_ops').dropCollection;
const dropDatabase = require('./operations/db_ops').dropDatabase;
const ensureIndex = require('./operations/db_ops').ensureIndex;
const evaluate = require('./operations/db_ops').evaluate;
const executeCommand = require('./operations/db_ops').executeCommand;
const executeDbAdminCommand = require('./operations/db_ops').executeDbAdminCommand;
const indexInformation = require('./operations/db_ops').indexInformation;
const listCollectionsTransforms = require('./operations/db_ops').listCollectionsTransforms;
const profilingInfo = require('./operations/db_ops').profilingInfo;
const profilingLevel = require('./operations/db_ops').profilingLevel;
const removeUser = require('./operations/db_ops').removeUser;
const rename = require('./operations/collection_ops').rename;
const setProfilingLevel = require('./operations/db_ops').setProfilingLevel;
const validateDatabaseName = require('./operations/db_ops').validateDatabaseName;

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
  'retryWrites',
  'optionsValidationLevel'
];

/**
 * @typedef {Object} WriteConcern
 * @property {(number|string)} w A request for acknowledgement that the write operation has propagated to a specified number of mongod instances or to mongod instances with specified tags.
 * @property {boolean} j A request for acknowledgement that the write operation has been written to the journal
 * @property {number} wtimeout A time limit to prevent write operations from blocking indefinitely
 */

/**
 * Creates a new Db instance
 * @class
 * @param {string} databaseName The name of the database this instance represents.
 * @param {(Server|ReplSet|Mongos)} topology The server topology for the database.
 * @param {object} [options] Optional settings.
 * @param {string} [options.authSource] If the database authentication is dependent on another databaseName.
 * @param {(number|string)} [options.w] The write concern.
 * @param {number} [options.wtimeout] The write concern timeout.
 * @param {boolean} [options.j=false] Specify a journal write concern.
 * @param {boolean} [options.forceServerObjectId=false] Force server to assign _id values instead of driver.
 * @param {boolean} [options.serializeFunctions=false] Serialize functions on any object.
 * @param {Boolean} [options.ignoreUndefined=false] Specify if the BSON serializer should ignore undefined fields.
 * @param {boolean} [options.raw=false] Return document results as raw BSON buffers.
 * @param {boolean} [options.promoteLongs=true] Promotes Long values to number if they fit inside the 53 bits resolution.
 * @param {boolean} [options.promoteBuffers=false] Promotes Binary BSON values to native Node Buffers.
 * @param {boolean} [options.promoteValues=true] Promotes BSON values to native types where possible, set to false to only receive wrapper types.
 * @param {number} [options.bufferMaxEntries=-1] Sets a cap on how many operations the driver will buffer up before giving up on getting a working connection, default is -1 which is unlimited.
 * @param {(ReadPreference|string)} [options.readPreference] The read preference. Defaults to the read preference of the Db, or MongoClient.
 * @param {object} [options.pkFactory] A primary key factory object for generation of custom _id keys.
 * @param {object} [options.promiseLibrary] A Promise library class the application wishes to use such as Bluebird, must be ES6 compatible
 * @param {object} [options.readConcern] Specify a read concern for the collection. (only MongoDB 3.2 or higher supported)
 * @param {object} [options.readConcern.level='local'] Specify a read concern level for the collection operations, one of [local|majority]. (only MongoDB 3.2 or higher supported)
 * @property {(Server|ReplSet|Mongos)} serverConfig Get the current db topology.
 * @property {number} bufferMaxEntries Current bufferMaxEntries value for the database
 * @property {string} databaseName The name of the database this instance represents.
 * @property {object} options The options associated with the db instance.
 * @property {boolean} native_parser The current value of the parameter native_parser.
 * @property {boolean} slaveOk The current slaveOk value for the db instance.
 * @property {WriteConcern} writeConcern The current write concern values.
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
    // Database name
    databaseName: databaseName,
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
    readPreference: options.readPreference,
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
    readConcern: options.readConcern
  };

  // Ensure we have a valid db name
  validateDatabaseName(this.s.databaseName);

  // Add a read Only property
  getSingleProperty(this, 'serverConfig', this.s.topology);
  getSingleProperty(this, 'bufferMaxEntries', this.s.bufferMaxEntries);
  getSingleProperty(this, 'databaseName', this.s.databaseName);

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

Object.defineProperty(Db.prototype, 'optionsValidationLevel', {
  enumerable: true,
  get: function() {
    if (this.s && this.s.options && this.s.options.optionsValidationLevel) {
      return this.s.options.optionsValidationLevel;
    }
    return 'warn';
  }
});

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

// get the write Concern
Object.defineProperty(Db.prototype, 'writeConcern', {
  enumerable: true,
  get: function() {
    const ops = {};
    if (this.s.options.w != null) ops.w = this.s.options.w;
    if (this.s.options.j != null) ops.j = this.s.options.j;
    if (this.s.options.fsync != null) ops.fsync = this.s.options.fsync;
    if (this.s.options.wtimeout != null) ops.wtimeout = this.s.options.wtimeout;
    return ops;
  }
});

/**
 * Execute a command
 * @method
 * @param {object} command The command hash
 * @param {object} [options] Optional settings.
 * @param {(ReadPreference|string)} [options.readPreference] The read preference. Defaults to the read preference of the Db, or MongoClient.
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Db~resultCallback} [callback] The command result callback
 * @return {Promise} returns Promise if no callback passed
 */
const commandSchema = {
  readPreference: { type: [ReadPreference, 'object', 'string'] },
  session: { type: ClientSession }
};
Db.prototype.command = function(command, options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = validate(
    commandSchema,
    options,
    {},
    { optionsValidationLevel: this.optionsValidationLevel }
  );

  return executeOperation(this.s.topology, executeCommand, [this, command, options, callback]);
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
 * Fetch a specific collection (containing the actual collection information). If the application does not use strict mode you
 * can use it without a callback in the following way: `const collection = db.collection('mycollection');`
 *
 * @method
 * @param {string} name the collection name we wish to access.
 * @param {object} [options] Optional settings.
 * @param {(number|string)} [options.w] The write concern.
 * @param {number} [options.wtimeout] The write concern timeout.
 * @param {boolean} [options.j] Specify a journal write concern.
 * @param {boolean} [options.raw=false] Return document results as raw BSON buffers.
 * @param {object} [options.pkFactory] A primary key factory object for generation of custom _id keys.
 * @param {(ReadPreference|string)} [options.readPreference] The read preference. Defaults to the read preference of the Db, or MongoClient.
 * @param {boolean} [options.serializeFunctions=false] Serialize functions on any object.
 * @param {boolean} [options.strict] Returns an error if the collection does not exist
 * @param {object} [options.readConcern] Specify a read concern for the collection. (only MongoDB 3.2 or higher supported)
 * @param {Db~collectionResultCallback} [callback] The collection result callback
 * @return {Collection} return the new Collection instance if not in strict mode
 */
const collectionSchema = {
  w: { type: ['number', 'string'] },
  wtimeout: { type: 'number' },
  j: { type: 'boolean' },
  raw: { type: 'boolean' },
  pkFactory: { type: 'object' },
  readPreference: { type: [ReadPreference, 'object', 'string'] },
  serializeFunctions: { type: 'boolean' },
  strict: { type: 'boolean' },
  readConcern: { type: 'object' },
  promiseLibrary: { overrideOnly: true },
  ignoreUndefined: { overrideOnly: true }
};
Db.prototype.collection = function(name, options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});

  options = validate(
    collectionSchema,
    options,
    { readConcern: this.s.readConcern },
    {
      promiseLibrary: this.s.promiseLibrary,
      readPreference: resolveReadPreference(options, { db: this }),
      ignoreUndefined: this.s.options.ignoreUndefined ? this.s.options.ignoreUndefined : null
    },
    { optionsValidationLevel: this.optionsValidationLevel }
  );

  // Merge in all needed options and ensure correct writeConcern merging from db level
  options = mergeOptionsAndWriteConcern(options, this.s.options, collectionKeys, true);

  // Execute
  if (options == null || !options.strict) {
    try {
      const collection = new Collection(
        this,
        this.s.topology,
        this.s.databaseName,
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
        new Collection(this, this.s.topology, this.s.databaseName, name, this.s.pkFactory, options)
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
 * @param {(number|string)} [options.w] The write concern.
 * @param {number} [options.wtimeout] The write concern timeout.
 * @param {boolean} [options.j] Specify a journal write concern.
 * @param {boolean} [options.raw=false] Return document results as raw BSON buffers.
 * @param {object} [options.pkFactory] A primary key factory object for generation of custom _id keys.
 * @param {(ReadPreference|string)} [options.readPreference] The read preference. Defaults to the read preference of the Db, or MongoClient.
 * @param {boolean} [options.serializeFunctions=false] Serialize functions on any object.
 * @param {boolean} [options.strict] Returns an error if the collection does not exist
 * @param {boolean} [options.capped] Create a capped collection.
 * @param {boolean} [options.autoIndexId] DEPRECATED: Create an index on the _id field of the document, True by default on MongoDB 2.6 - 3.0
 * @param {number} [options.size] The size of the capped collection in bytes.
 * @param {number} [options.max] The maximum number of documents in the capped collection.
 * @param {number} [options.flags] Optional. Available for the MMAPv1 storage engine only to set the usePowerOf2Sizes and the noPadding flag.
 * @param {object} [options.storageEngine] Allows users to specify configuration to the storage engine on a per-collection basis when creating a collection on MongoDB 3.0 or higher.
 * @param {object} [options.validator] Allows users to specify validation rules or expressions for the collection. For more information, see Document Validation on MongoDB 3.2 or higher.
 * @param {string} [options.validationLevel] Determines how strictly MongoDB applies the validation rules to existing documents during an update on MongoDB 3.2 or higher.
 * @param {string} [options.validationAction] Determines whether to error on invalid documents or just warn about the violations but allow invalid documents to be inserted on MongoDB 3.2 or higher.
 * @param {object} [options.indexOptionDefaults] Allows users to specify a default configuration for indexes when creating a collection on MongoDB 3.2 or higher.
 * @param {string} [options.viewOn] The name of the source collection or view from which to create the view. The name is not the full namespace of the collection or view; i.e. does not include the database name and implies the same database as the view to create on MongoDB 3.4 or higher.
 * @param {array} [options.pipeline] An array that consists of the aggregation pipeline stage. create creates the view by applying the specified pipeline to the viewOn collection or view on MongoDB 3.4 or higher.
 * @param {object} [options.collation] Specify collation (MongoDB 3.4 or higher) settings for update operation (see 3.4 documentation for available fields).
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {object} [options.promiseLibrary] A Promise library class the application wishes to use such as Bluebird, must be ES6 compatible
 * @param {Db~collectionResultCallback} [callback] The results callback
 * @return {Promise} returns Promise if no callback passed
 */
const createCollectionSchema = {
  w: { type: ['number', 'string'] },
  wtimeout: { type: 'number' },
  j: { type: 'boolean' },
  raw: { type: 'boolean' },
  pkFactory: { type: 'object' },
  readPreference: { type: [ReadPreference, 'object', 'string'] },
  serializeFunctions: { type: 'boolean' },
  strict: { type: 'boolean' },
  capped: { type: 'boolean' },
  autoIndexId: { type: 'boolean', deprecated: true },
  size: { type: 'number' },
  max: { type: 'number' },
  flags: { type: 'number' },
  storageEngine: { type: 'object' },
  validator: { type: 'object' },
  validationLevel: { type: 'string' },
  validationAction: { type: 'string' },
  indexOptionDefaults: { type: 'object' },
  viewOn: { type: 'string' },
  pipeline: { type: 'array' },
  collation: { type: 'object' },
  session: { type: ClientSession },
  promiseLibrary: { type: 'function' }
};
Db.prototype.createCollection = function(name, options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = validate(
    createCollectionSchema,
    options,
    { promiseLibrary: this.s.promiseLibrary },
    { optionsValidationLevel: this.optionsValidationLevel }
  );

  return executeOperation(this.s.topology, createCollection, [this, name, options, callback]);
};

/**
 * Get all the db statistics.
 *
 * @method
 * @param {object} [options] Optional settings.
 * @param {(ReadPreference|string)} [options.readPreference] The preferred read preference (ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST).
 * @param {number} [options.scale] Divide the returned sizes by scale value.
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Db~resultCallback} [callback] The collection result callback
 * @return {Promise} returns Promise if no callback passed
 */
const statsSchema = {
  readPreference: { type: [ReadPreference, 'object', 'string'] },
  scale: { type: 'number' },
  session: { type: ClientSession }
};
Db.prototype.stats = function(options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});

  options = validate(
    statsSchema,
    options,
    {},
    { readPreference: resolveReadPreference(options, { db: this }) },
    { optionsValidationLevel: this.optionsValidationLevel }
  );
  // Build command object
  const commandObject = { dbStats: true };
  // Check if we have the scale value
  if (options['scale'] != null) commandObject['scale'] = options['scale'];

  // Execute the command
  return this.command(commandObject, options, callback);
};

/**
 * Get the list of all collection information for the specified db.
 *
 * @method
 * @param {object} [filter={}] Query to filter collections by
 * @param {object} [options] Optional settings.
 * @param {boolean} [options.nameOnly=false] Since 4.0: If true, will only return the collection name in the response, and will omit additional info
 * @param {number} [options.batchSize] The batchSize for the returned command cursor or if pre 2.8 the systems batch collection
 * @param {(ReadPreference|string)} [options.readPreference] The read preference. Defaults to the read preference of the Db, or MongoClient.
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @return {CommandCursor}
 */
const listCollectionsSchema = {
  nameOnly: { type: 'boolean', default: false },
  batchSize: { type: 'number' },
  readPreference: { type: [ReadPreference, 'object', 'string'] },
  session: { type: ClientSession },
  cursorFactory: { overrideOnly: true }
};
Db.prototype.listCollections = function(filter, options) {
  filter = filter || {};
  options = validate(
    listCollectionsSchema,
    options,
    {},
    {
      promiseLibrary: this.s.promiseLibrary,
      readPreference: resolveReadPreference(options, { db: this, default: ReadPreference.primary }),
      cursorFactory: this.serverConfig.capabilities().hasListCollectionsCommand
        ? CommandCursor
        : null
    },
    { optionsValidationLevel: this.optionsValidationLevel }
  );

  // Cursor options
  let cursor = options.batchSize ? { batchSize: options.batchSize } : {};

  // We have a list collections command
  if (this.serverConfig.capabilities().hasListCollectionsCommand) {
    // Build the command
    const command = { listCollections: true, filter, cursor, nameOnly: options.nameOnly };
    // Create the cursor
    cursor = this.s.topology.cursor(`${this.s.databaseName}.$cmd`, command, options);
    // Do we have a readPreference, apply it
    if (options.readPreference) {
      cursor.setReadPreference(options.readPreference);
    }
    // Return the cursor
    return cursor;
  }

  // We cannot use the listCollectionsCommand
  if (!this.serverConfig.capabilities().hasListCollectionsCommand) {
    // If we have legacy mode and have not provided a full db name filter it
    if (
      typeof filter.name === 'string' &&
      !new RegExp('^' + this.databaseName + '\\.').test(filter.name)
    ) {
      filter = Object.assign({}, filter);
      filter.name = `${this.s.databaseName}.${filter.name}`;
    }
  }

  // No filter, filter by current database
  if (filter == null) {
    filter.name = `/${this.s.databaseName}/`;
  }

  // Rewrite the filter to use $and to filter out indexes
  if (filter.name) {
    filter = { $and: [{ name: filter.name }, { name: /^((?!\$).)*$/ }] };
  } else {
    filter = { name: /^((?!\$).)*$/ };
  }

  // Return options
  const _options = { transforms: listCollectionsTransforms(this.s.databaseName) };
  // Get the cursor
  cursor = this.collection(Db.SYSTEM_NAMESPACE_COLLECTION).find(filter, _options);
  // Do we have a readPreference, apply it
  if (options.readPreference) cursor.setReadPreference(options.readPreference);
  // Set the passed in batch size if one was provided
  if (options.batchSize) cursor = cursor.batchSize(options.batchSize);
  // We have a fallback mode using legacy systems collections
  return cursor;
};

/**
 * Evaluate JavaScript on the server
 *
 * @method
 * @param {Code} code JavaScript to execute on server.
 * @param {(object|array)} parameters The parameters for the call.
 * @param {object} [options] Optional settings.
 * @param {boolean} [options.nolock=false] Tell MongoDB not to block on the evaulation of the javascript.
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

  return executeOperation(this.s.topology, evaluate, [this, code, parameters, options, callback]);
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
 * @param {WriteConcern} [options.writeConcern] The write concern for this operation
 * @param {Db~collectionResultCallback} [callback] The results callback
 * @return {Promise} returns Promise if no callback passed
 */
const renameCollectionSchema = {
  dropTarget: { type: 'boolean', default: false },
  session: { type: ClientSession },
  w: { type: ['number', 'string'] },
  wtimeout: { type: 'number' },
  j: { type: 'boolean' },
  readPreference: { type: [ReadPreference, 'string', 'object'], overrideOnly: true }
};
Db.prototype.renameCollection = function(fromCollection, toCollection, options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = validate(
    renameCollectionSchema,
    options,
    {},
    { readPreference: ReadPreference.primary },
    { optionsValidationLevel: this.optionsValidationLevel }
  );

  const collection = this.collection(fromCollection);
  return executeOperation(this.s.topology, rename, [collection, toCollection, options, callback]);
};

/**
 * Drop a collection from the database, removing it permanently. New accesses will create a new collection.
 *
 * @method
 * @param {string} name Name of collection to drop
 * @param {Object} [options] Optional settings
 * @param {WriteConcern} [options.writeConcern] The write concern for this operation
 * @param {ClientSession} [options.session] Optional session to use for this operation
 * @param {Db~resultCallback} [callback] The results callback
 * @return {Promise} returns Promise if no callback passed
 */
const dropCollectionSchema = {
  w: { type: ['number', 'string'] },
  wtimeout: { type: 'number' },
  j: { type: 'boolean' },
  session: { type: ClientSession },
  readPreference: { overrideOnly: true }
};
Db.prototype.dropCollection = function(name, options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = validate(
    dropCollectionSchema,
    options,
    {},
    { readPreference: ReadPreference.primary },
    { optionsValidationLevel: this.optionsValidationLevel }
  );

  // Command to execute
  const cmd = { drop: name };

  // Decorate with write concern
  applyWriteConcern(cmd, { db: this }, options);

  return executeOperation(this.s.topology, dropCollection, [this, cmd, options, callback]);
};

/**
 * Drop a database, removing it permanently from the server.
 *
 * @method
 * @param {Object} [options] Optional settings
 * @param {WriteConcern} [options.writeConcern] The write concern for this operation
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Db~resultCallback} [callback] The results callback
 * @return {Promise} returns Promise if no callback passed
 */
const dropDatabaseSchema = {
  w: { type: ['number', 'string'] },
  wtimeout: { type: 'number' },
  j: { type: 'boolean' },
  session: { type: ClientSession },
  readPreference: { overrideOnly: true }
};
Db.prototype.dropDatabase = function(options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = validate(
    dropDatabaseSchema,
    options,
    {},
    { readPreference: ReadPreference.primary },
    { optionsValidationLevel: this.optionsValidationLevel }
  );
  // Drop database command
  const cmd = { dropDatabase: 1 };

  // Decorate with write concern
  applyWriteConcern(cmd, { db: this }, options);

  return executeOperation(this.s.topology, dropDatabase, [this, cmd, options, callback]);
};

/**
 * Fetch all collections for the current db.
 *
 * @method
 * @param {Object} [options] Optional settings
 * @param {boolean} [options.nameOnly=false] Since 4.0: If true, will only return the collection name in the response, and will omit additional info
 * @param {number} [options.batchSize] The batchSize for the returned command cursor or if pre 2.8 the systems batch collection
 * @param {(ReadPreference|string)} [options.readPreference] The read preference. Defaults to the read preference of the Db, or MongoClient.
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Db~collectionsResultCallback} [callback] The results callback
 * @return {Promise} returns Promise if no callback passed
 */
const collectionsSchema = {
  nameOnly: { type: 'boolean', default: false },
  batchSize: { type: 'number' },
  readPreference: { type: [ReadPreference, 'object', 'string'] },
  session: { type: ClientSession }
};
Db.prototype.collections = function(options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = validate(
    collectionsSchema,
    options,
    {},
    { optionsValidationLevel: this.optionsValidationLevel }
  );

  return executeOperation(this.s.topology, collections, [this, options, callback]);
};

/**
 * Runs a command on the database as admin.
 * @method
 * @param {object} command The command hash
 * @param {object} [options] Optional settings.
 * @param {(ReadPreference|string)} [options.readPreference] The read preference. Defaults to the read preference of the Db, or MongoClient.
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Db~resultCallback} [callback] The command result callback
 * @return {Promise} returns Promise if no callback passed
 */
const executeDbAdminCommandSchema = {
  readPreference: { type: [ReadPreference, 'object', 'string'] },
  session: { type: ClientSession }
};
Db.prototype.executeDbAdminCommand = function(selector, options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = validate(
    executeDbAdminCommandSchema,
    options,
    {},
    { readPreference: resolveReadPreference(options) },
    { optionsValidationLevel: this.optionsValidationLevel }
  );

  return executeOperation(this.s.topology, executeDbAdminCommand, [
    this,
    selector,
    options,
    callback
  ]);
};

/**
 * Creates an index on the db and collection.
 * @method
 * @param {string} name Name of the collection to create the index on.
 * @param {(string|object)} fieldOrSpec Defines the index.
 * @param {object} [options] Optional settings.
 * @param {(number|string)} [options.w] The write concern.
 * @param {number} [options.wtimeout] The write concern timeout.
 * @param {boolean} [options.j] Specify a journal write concern.
 * @param {boolean} [options.unique=false] Creates an unique index.
 * @param {boolean} [options.sparse] Creates a sparse index.
 * @param {boolean} [options.background] Creates the index in the background, yielding whenever possible.
 * @param {boolean} [options.dropDups] A unique index cannot be created on a key that has pre-existing duplicate values. If you would like to create the index anyway, keeping the first document the database indexes and deleting all subsequent documents that have duplicate value
 * @param {number} [options.min] For geospatial indexes set the lower bound for the co-ordinates.
 * @param {number} [options.max] For geospatial indexes set the high bound for the co-ordinates.
 * @param {number} [options.v] Specify the format version of the indexes.
 * @param {number} [options.expireAfterSeconds] Allows you to expire data on indexes applied to a data (MongoDB 2.2 or higher)
 * @param {number} [options.name] Override the autogenerated index name (useful if the resulting name is larger than 128 bytes)
 * @param {object} [options.partialFilterExpression] Creates a partial index based on the given filter object (MongoDB 3.2 or higher)
 * @param {object} [options.collation] Specify collation (MongoDB 3.4 or higher) settings for update operation (see 3.4 documentation for available fields).
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Db~resultCallback} [callback] The command result callback
 * @return {Promise} returns Promise if no callback passed
 */
const createIndexSchema = {
  w: { type: ['number', 'string'] },
  wtimeout: { type: 'number' },
  j: { type: 'boolean' },
  unique: { type: 'boolean', default: false },
  sparse: { type: 'boolean' },
  background: { type: 'boolean' },
  dropDups: { type: 'boolean' },
  min: { type: 'number' },
  max: { type: 'number' },
  v: { type: 'number' },
  expireAfterSeconds: { type: 'number' },
  name: { type: 'number' },
  partialFilterExpression: { type: 'object' },
  collation: { type: 'object' },
  session: { type: ClientSession }
};
Db.prototype.createIndex = function(name, fieldOrSpec, options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = validate(
    createIndexSchema,
    options,
    {},
    { optionsValidationLevel: this.optionsValidationLevel }
  );

  return executeOperation(this.s.topology, createIndex, [
    this,
    name,
    fieldOrSpec,
    options,
    callback
  ]);
};

/**
 * Ensures that an index exists, if it does not it creates it
 * @method
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
 * @return {Promise} returns Promise if no callback passed
 */
Db.prototype.ensureIndex = deprecate(function(name, fieldOrSpec, options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = options || {};

  return executeOperation(this.s.topology, ensureIndex, [
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
 * @param {(number|string)} [options.w] The write concern.
 * @param {number} [options.wtimeout] The write concern timeout.
 * @param {boolean} [options.j] Specify a journal write concern.
 * @param {object} [options.customData] Custom data associated with the user (only Mongodb 2.6 or higher)
 * @param {object[]} [options.roles] Roles associated with the created user (only Mongodb 2.6 or higher)
 * @param {Array} [options.authenticationRestrictions] The authentication restrictions the server enforces on the created user. Specifies a list of IP addresses and CIDR ranges from which the user is allowed to connect to the server or from which the server can accept users. New in MongoDB 3.6.
 * @param {Array} [options.mechanisms] Specify the specific SCRAM mechanism or mechanisms for creating SCRAM user credentials. New in MongoDB 4.0
 * @param {string} [options.passwordDigestor] Indicates whether the server or the client digests the password. The default for MongoDB 4.0 is 'server'. The default before 4.0 is 'client'.
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Db~resultCallback} [callback] The command result callback
 * @return {Promise} returns Promise if no callback passed
 */
const addUserSchema = {
  w: { type: ['number', 'string'] },
  wtimeout: { type: 'number' },
  j: { type: 'boolean' },
  customData: { type: 'object' },
  roles: { type: 'object' },
  authenticationRestrictions: { type: 'array' },
  mechanisms: { type: 'array' },
  passwordDigestor: { type: 'string' },
  session: { type: ClientSession }
};
Db.prototype.addUser = function(username, password, options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = validate(
    addUserSchema,
    options,
    {},
    { optionsValidationLevel: this.optionsValidationLevel }
  );

  return executeOperation(this.s.topology, addUser, [this, username, password, options, callback]);
};

/**
 * Remove a user from a database
 * @method
 * @param {string} username The username.
 * @param {object} [options] Optional settings.
 * @param {(number|string)} [options.w] The write concern.
 * @param {number} [options.wtimeout] The write concern timeout.
 * @param {boolean} [options.j] Specify a journal write concern.
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Db~resultCallback} [callback] The command result callback
 * @return {Promise} returns Promise if no callback passed
 */
const removeUserSchema = {
  w: { type: ['number', 'string'] },
  wtimeout: { type: 'number' },
  j: { type: 'boolean' },
  session: { type: ClientSession }
};
Db.prototype.removeUser = function(username, options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = validate(
    removeUserSchema,
    options,
    {},
    { optionsValidationLevel: this.optionsValidationLevel }
  );

  return executeOperation(this.s.topology, removeUser, [this, username, options, callback]);
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
const setProfilingLevelSchema = {
  session: { type: ClientSession }
};
Db.prototype.setProfilingLevel = function(level, options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = validate(
    setProfilingLevelSchema,
    options,
    {},
    { optionsValidationLevel: this.optionsValidationLevel }
  );

  return executeOperation(this.s.topology, setProfilingLevel, [this, level, options, callback]);
};

/**
 * Retrive the current profiling information for MongoDB
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

  return executeOperation(this.s.topology, profilingInfo, [this, options, callback]);
}, 'Db.profilingInfo is deprecated. Query the system.profile collection directly.');

/**
 * Retrieve the current profiling Level for MongoDB
 *
 * @param {Object} [options] Optional settings
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Db~resultCallback} [callback] The command result callback
 * @return {Promise} returns Promise if no callback passed
 */
const profilingLevelSchema = {
  session: { type: ClientSession }
};
Db.prototype.profilingLevel = function(options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = validate(
    profilingLevelSchema,
    options,
    {},
    { optionsValidationLevel: this.optionsValidationLevel }
  );

  return executeOperation(this.s.topology, profilingLevel, [this, options, callback]);
};

/**
 * Retrieves the named collection's index info.
 *
 * @method
 * @param {string} name The name of the collection.
 * @param {object} [options] Optional settings.
 * @param {number} [options.batchSize] The batchSize for the returned command cursor or if pre 2.8 the systems batch collection
 * @param {boolean} [options.full=false] Returns the full raw index information.
 * @param {(ReadPreference|string)} [options.readPreference] The read preference. Defaults to the read preference of the Db, or MongoClient.
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Db~resultCallback} [callback] The command result callback
 * @return {Promise} returns Promise if no callback passed
 */
const indexInformationSchema = {
  batchSize: { type: 'number' },
  full: { type: 'boolean', default: false },
  readPreference: { type: [ReadPreference, 'object', 'string'] },
  session: { type: ClientSession }
};
Db.prototype.indexInformation = function(name, options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = validate(
    indexInformationSchema,
    options,
    {},
    { optionsValidationLevel: this.optionsValidationLevel }
  );

  return executeOperation(this.s.topology, indexInformation, [this, name, options, callback]);
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
 * @param {number} [options.batchSize] The number of documents to return per batch. See {@link https://docs.mongodb.com/manual/reference/command/aggregate|aggregation documentation}.
 * @param {object} [options.collation] Specify collation settings for operation. See {@link https://docs.mongodb.com/manual/reference/command/aggregate|aggregation documentation}.
 * @param {(ReadPreference|string)} [options.readPreference] The read preference. Defaults to the read preference of the Db, or MongoClient.
 * @param {Timestamp} [options.startAtClusterTime] receive change events that occur after the specified timestamp
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @return {ChangeStream} a ChangeStream instance.
 */
const watchSchema = {
  fullDocument: { type: 'string', default: 'default' },
  resumeAfter: { type: 'object' },
  maxAwaitTimeMS: { type: 'number' },
  batchSize: { type: 'number' },
  collation: { type: 'object' },
  readPreference: { type: [ReadPreference, 'object', 'string'] },
  startAtClusterTime: { type: 'Timestamp' },
  session: { type: ClientSession }
};
Db.prototype.watch = function(pipeline, options) {
  pipeline = pipeline || [];

  // Allow optionally not specifying a pipeline
  if (!Array.isArray(pipeline)) {
    options = pipeline;
    pipeline = [];
  }

  options = validate(
    watchSchema,
    options,
    {},
    { readPreference: resolveReadPreference(options, { db: this }) },
    { optionsValidationLevel: this.optionsValidationLevel }
  );

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
Db.SYSTEM_NAMESPACE_COLLECTION = 'system.namespaces';
Db.SYSTEM_INDEX_COLLECTION = 'system.indexes';
Db.SYSTEM_PROFILE_COLLECTION = 'system.profile';
Db.SYSTEM_USER_COLLECTION = 'system.users';
Db.SYSTEM_COMMAND_COLLECTION = '$cmd';
Db.SYSTEM_JS_COLLECTION = 'system.js';

module.exports = Db;
