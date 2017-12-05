'use strict';

var EventEmitter = require('events').EventEmitter,
  inherits = require('util').inherits,
  getSingleProperty = require('./utils').getSingleProperty,
  shallowClone = require('./utils').shallowClone,
  parseIndexOptions = require('./utils').parseIndexOptions,
  debugOptions = require('./utils').debugOptions,
  CommandCursor = require('./command_cursor'),
  handleCallback = require('./utils').handleCallback,
  filterOptions = require('./utils').filterOptions,
  toError = require('./utils').toError,
  ReadPreference = require('mongodb-core').ReadPreference,
  f = require('util').format,
  Admin = require('./admin'),
  Code = require('mongodb-core').BSON.Code,
  MongoError = require('mongodb-core').MongoError,
  ObjectID = require('mongodb-core').ObjectID,
  Define = require('./metadata'),
  Logger = require('mongodb-core').Logger,
  Collection = require('./collection'),
  crypto = require('crypto'),
  mergeOptionsAndWriteConcern = require('./utils').mergeOptionsAndWriteConcern,
  assign = require('./utils').assign,
  executeOperation = require('./utils').executeOperation;

var debugFields = [
  'authSource',
  'w',
  'wtimeout',
  'j',
  'native_parser',
  'forceServerObjectId',
  'serializeFunctions',
  'raw',
  'promoteLongs',
  'promoteValues',
  'promoteBuffers',
  'bufferMaxEntries',
  'numberOfRetries',
  'retryMiliSeconds',
  'readPreference',
  'pkFactory',
  'parentDb',
  'promiseLibrary',
  'noListener'
];

// Filter out any write concern options
var illegalCommandFields = [
  'w',
  'wtimeout',
  'j',
  'fsync',
  'autoIndexId',
  'strict',
  'serializeFunctions',
  'pkFactory',
  'raw',
  'readPreference',
  'session'
];

/**
 * @fileOverview The **Db** class is a class that represents a MongoDB Database.
 *
 * @example
 * var MongoClient = require('mongodb').MongoClient,
 *   test = require('assert');
 * // Connection url
 * var url = 'mongodb://localhost:27017/test';
 * // Connect using MongoClient
 * MongoClient.connect(url, function(err, client) {
 *   // Get an additional db
 *   var testDb = client.db('test');
 *   db.close();
 * });
 */

// Allowed parameters
var legalOptionNames = [
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
  'retryWrites'
];

/**
 * Creates a new Db instance
 * @class
 * @param {string} databaseName The name of the database this instance represents.
 * @param {(Server|ReplSet|Mongos)} topology The server topology for the database.
 * @param {object} [options=null] Optional settings.
 * @param {string} [options.authSource=null] If the database authentication is dependent on another databaseName.
 * @param {(number|string)} [options.w=null] The write concern.
 * @param {number} [options.wtimeout=null] The write concern timeout.
 * @param {boolean} [options.j=false] Specify a journal write concern.
 * @param {boolean} [options.forceServerObjectId=false] Force server to assign _id values instead of driver.
 * @param {boolean} [options.serializeFunctions=false] Serialize functions on any object.
 * @param {Boolean} [options.ignoreUndefined=false] Specify if the BSON serializer should ignore undefined fields.
 * @param {boolean} [options.raw=false] Return document results as raw BSON buffers.
 * @param {boolean} [options.promoteLongs=true] Promotes Long values to number if they fit inside the 53 bits resolution.
 * @param {boolean} [options.promoteBuffers=false] Promotes Binary BSON values to native Node Buffers.
 * @param {boolean} [options.promoteValues=true] Promotes BSON values to native types where possible, set to false to only receive wrapper types.
 * @param {number} [options.bufferMaxEntries=-1] Sets a cap on how many operations the driver will buffer up before giving up on getting a working connection, default is -1 which is unlimited.
 * @param {(ReadPreference|string)} [options.readPreference=null] The preferred read preference (ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST).
 * @param {object} [options.pkFactory=null] A primary key factory object for generation of custom _id keys.
 * @param {object} [options.promiseLibrary=null] A Promise library class the application wishes to use such as Bluebird, must be ES6 compatible
 * @param {object} [options.readConcern=null] Specify a read concern for the collection. (only MongoDB 3.2 or higher supported)
 * @param {object} [options.readConcern.level='local'] Specify a read concern level for the collection operations, one of [local|majority]. (only MongoDB 3.2 or higher supported)
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
var Db = function(databaseName, topology, options) {
  options = options || {};
  if (!(this instanceof Db)) return new Db(databaseName, topology, options);
  EventEmitter.call(this);
  var self = this;

  // Get the promiseLibrary
  var promiseLibrary = options.promiseLibrary || Promise;

  // Filter the options
  options = filterOptions(options, legalOptionNames);

  // Ensure we put the promiseLib in the options
  options.promiseLibrary = promiseLibrary;

  // var self = this;  // Internal state of the db object
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
  validateDatabaseName(self.s.databaseName);

  // Add a read Only property
  getSingleProperty(this, 'serverConfig', self.s.topology);
  getSingleProperty(this, 'bufferMaxEntries', self.s.bufferMaxEntries);
  getSingleProperty(this, 'databaseName', self.s.databaseName);

  // This is a child db, do not register any listeners
  if (options.parentDb) return;
  if (this.s.noListener) return;

  // Add listeners
  topology.on('error', createListener(self, 'error', self));
  topology.on('timeout', createListener(self, 'timeout', self));
  topology.on('close', createListener(self, 'close', self));
  topology.on('parseError', createListener(self, 'parseError', self));
  topology.once('open', createListener(self, 'open', self));
  topology.once('fullsetup', createListener(self, 'fullsetup', self));
  topology.once('all', createListener(self, 'all', self));
  topology.on('reconnect', createListener(self, 'reconnect', self));
};

inherits(Db, EventEmitter);

var define = (Db.define = new Define('Db', Db, false));

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
    var ops = {};
    if (this.s.options.w != null) ops.w = this.s.options.w;
    if (this.s.options.j != null) ops.j = this.s.options.j;
    if (this.s.options.fsync != null) ops.fsync = this.s.options.fsync;
    if (this.s.options.wtimeout != null) ops.wtimeout = this.s.options.wtimeout;
    return ops;
  }
});

/**
 * Ensures provided read preference is properly converted into an object
 * @param {(ReadPreference|string|object)} readPreference the user provided read preference
 * @return {ReadPreference}
 */
const convertReadPreference = function(readPreference) {
  if (readPreference) {
    if (typeof readPreference === 'string') {
      return new ReadPreference(readPreference);
    } else if (
      readPreference &&
      !(readPreference instanceof ReadPreference) &&
      typeof readPreference === 'object'
    ) {
      const mode = readPreference.mode || readPreference.preference;
      if (mode && typeof mode === 'string') {
        return new ReadPreference(mode, readPreference.tags, {
          maxStalenessSeconds: readPreference.maxStalenessSeconds
        });
      }
    } else if (!(readPreference instanceof ReadPreference)) {
      throw new TypeError('Invalid read preference: ' + readPreference);
    }
  }

  return readPreference;
};

/**
 * The callback format for results
 * @callback Db~resultCallback
 * @param {MongoError} error An error instance representing the error during the execution.
 * @param {object} result The result object if the command was executed successfully.
 */
var executeCommand = function(self, command, options, callback) {
  // Did the user destroy the topology
  if (self.serverConfig && self.serverConfig.isDestroyed())
    return callback(new MongoError('topology was destroyed'));
  // Get the db name we are executing against
  var dbName = options.dbName || options.authdb || self.s.databaseName;

  // If we have a readPreference set
  if (options.readPreference == null && self.s.readPreference) {
    options.readPreference = self.s.readPreference;
  }

  // Convert the readPreference if its not a write
  if (options.readPreference) {
    options.readPreference = convertReadPreference(options.readPreference);
  } else {
    options.readPreference = ReadPreference.primary;
  }

  // Debug information
  if (self.s.logger.isDebug())
    self.s.logger.debug(
      f(
        'executing command %s against %s with options [%s]',
        JSON.stringify(command),
        f('%s.$cmd', dbName),
        JSON.stringify(debugOptions(debugFields, options))
      )
    );

  // Execute command
  self.s.topology.command(f('%s.$cmd', dbName), command, options, function(err, result) {
    if (err) return handleCallback(callback, err);
    if (options.full) return handleCallback(callback, null, result);
    handleCallback(callback, null, result.result);
  });
};

/**
 * Execute a command
 * @method
 * @param {object} command The command hash
 * @param {object} [options=null] Optional settings.
 * @param {(ReadPreference|string)} [options.readPreference=null] The preferred read preference (ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST).
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Db~resultCallback} [callback] The command result callback
 * @return {Promise} returns Promise if no callback passed
 */
Db.prototype.command = function(command, options, callback) {
  // Change the callback
  if (typeof options === 'function') (callback = options), (options = {});
  // Clone the options
  options = shallowClone(options);

  return executeOperation(this.s.topology, executeCommand, [this, command, options, callback]);
};

define.classMethod('command', { callback: true, promise: true });

/**
 * Return the Admin db instance
 * @method
 * @return {Admin} return the new Admin db instance
 */
Db.prototype.admin = function() {
  return new Admin(this, this.s.topology, this.s.promiseLibrary);
};

define.classMethod('admin', { callback: false, promise: false, returns: [Admin] });

/**
 * The callback format for the collection method, must be used if strict is specified
 * @callback Db~collectionResultCallback
 * @param {MongoError} error An error instance representing the error during the execution.
 * @param {Collection} collection The collection instance.
 */

var collectionKeys = [
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
 * Fetch a specific collection (containing the actual collection information). If the application does not use strict mode you can
 * can use it without a callback in the following way: `var collection = db.collection('mycollection');`
 *
 * @method
 * @param {string} name the collection name we wish to access.
 * @param {object} [options=null] Optional settings.
 * @param {(number|string)} [options.w=null] The write concern.
 * @param {number} [options.wtimeout=null] The write concern timeout.
 * @param {boolean} [options.j=false] Specify a journal write concern.
 * @param {boolean} [options.raw=false] Return document results as raw BSON buffers.
 * @param {object} [options.pkFactory=null] A primary key factory object for generation of custom _id keys.
 * @param {(ReadPreference|string)} [options.readPreference=null] The preferred read preference (ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST).
 * @param {boolean} [options.serializeFunctions=false] Serialize functions on any object.
 * @param {boolean} [options.strict=false] Returns an error if the collection does not exist
 * @param {object} [options.readConcern=null] Specify a read concern for the collection. (only MongoDB 3.2 or higher supported)
 * @param {object} [options.readConcern.level='local'] Specify a read concern level for the collection operations, one of [local|majority]. (only MongoDB 3.2 or higher supported)
 * @param {Db~collectionResultCallback} callback The collection result callback
 * @return {Collection} return the new Collection instance if not in strict mode
 */
Db.prototype.collection = function(name, options, callback) {
  var self = this;
  if (typeof options === 'function') (callback = options), (options = {});
  options = options || {};
  options = shallowClone(options);
  // Set the promise library
  options.promiseLibrary = this.s.promiseLibrary;

  // If we have not set a collection level readConcern set the db level one
  options.readConcern = options.readConcern || this.s.readConcern;

  // Do we have ignoreUndefined set
  if (this.s.options.ignoreUndefined) {
    options.ignoreUndefined = this.s.options.ignoreUndefined;
  }

  // Merge in all needed options and ensure correct writeConcern merging from db level
  options = mergeOptionsAndWriteConcern(options, this.s.options, collectionKeys, true);

  // Execute
  if (options == null || !options.strict) {
    try {
      var collection = new Collection(
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
      // if(err instanceof MongoError && callback) return callback(err);
      if (callback) return callback(err);
      throw err;
    }
  }

  // Strict mode
  if (typeof callback !== 'function') {
    throw toError(f('A callback is required in strict mode. While getting collection %s.', name));
  }

  // Did the user destroy the topology
  if (self.serverConfig && self.serverConfig.isDestroyed()) {
    return callback(new MongoError('topology was destroyed'));
  }

  // Strict mode
  this.listCollections({ name: name }, options).toArray(function(err, collections) {
    if (err != null) return handleCallback(callback, err, null);
    if (collections.length === 0)
      return handleCallback(
        callback,
        toError(f('Collection %s does not exist. Currently in strict mode.', name)),
        null
      );

    try {
      return handleCallback(
        callback,
        null,
        new Collection(self, self.s.topology, self.s.databaseName, name, self.s.pkFactory, options)
      );
    } catch (err) {
      return handleCallback(callback, err, null);
    }
  });
};

define.classMethod('collection', { callback: true, promise: false, returns: [Collection] });

function decorateWithWriteConcern(command, self, options) {
  // Do we support write concerns 3.4 and higher
  if (self.s.topology.capabilities().commandsTakeWriteConcern) {
    // Get the write concern settings
    var finalOptions = writeConcern(shallowClone(options), self, options);
    // Add the write concern to the command
    if (finalOptions.writeConcern) {
      command.writeConcern = finalOptions.writeConcern;
    }
  }
}

var createCollection = function(self, name, options, callback) {
  // Get the write concern options
  var finalOptions = writeConcern(shallowClone(options), self, options);
  // Did the user destroy the topology
  if (self.serverConfig && self.serverConfig.isDestroyed()) {
    return callback(new MongoError('topology was destroyed'));
  }

  // Check if we have the name
  self
    .listCollections({ name: name }, finalOptions)
    .setReadPreference(ReadPreference.PRIMARY)
    .toArray(function(err, collections) {
      if (err != null) return handleCallback(callback, err, null);
      if (collections.length > 0 && finalOptions.strict) {
        return handleCallback(
          callback,
          MongoError.create({
            message: f('Collection %s already exists. Currently in strict mode.', name),
            driver: true
          }),
          null
        );
      } else if (collections.length > 0) {
        try {
          return handleCallback(
            callback,
            null,
            new Collection(
              self,
              self.s.topology,
              self.s.databaseName,
              name,
              self.s.pkFactory,
              options
            )
          );
        } catch (err) {
          return handleCallback(callback, err);
        }
      }

      // Create collection command
      var cmd = { create: name };

      // Decorate command with writeConcern if supported
      decorateWithWriteConcern(cmd, self, options);
      // Add all optional parameters
      for (var n in options) {
        if (
          options[n] != null &&
          typeof options[n] !== 'function' &&
          illegalCommandFields.indexOf(n) === -1
        ) {
          cmd[n] = options[n];
        }
      }

      // Force a primary read Preference
      finalOptions.readPreference = ReadPreference.PRIMARY;

      // Execute command
      self.command(cmd, finalOptions, function(err) {
        if (err) return handleCallback(callback, err);
        handleCallback(
          callback,
          null,
          new Collection(
            self,
            self.s.topology,
            self.s.databaseName,
            name,
            self.s.pkFactory,
            options
          )
        );
      });
    });
};

/**
 * Create a new collection on a server with the specified options. Use this to create capped collections.
 * More information about command options available at https://docs.mongodb.com/manual/reference/command/create/
 *
 * @method
 * @param {string} name the collection name we wish to access.
 * @param {object} [options=null] Optional settings.
 * @param {(number|string)} [options.w=null] The write concern.
 * @param {number} [options.wtimeout=null] The write concern timeout.
 * @param {boolean} [options.j=false] Specify a journal write concern.
 * @param {boolean} [options.raw=false] Return document results as raw BSON buffers.
 * @param {object} [options.pkFactory=null] A primary key factory object for generation of custom _id keys.
 * @param {(ReadPreference|string)} [options.readPreference=null] The preferred read preference (ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST).
 * @param {boolean} [options.serializeFunctions=false] Serialize functions on any object.
 * @param {boolean} [options.strict=false] Returns an error if the collection does not exist
 * @param {boolean} [options.capped=false] Create a capped collection.
 * @param {boolean} [options.autoIndexId=true] Create an index on the _id field of the document, True by default on MongoDB 2.2 or higher off for version < 2.2.
 * @param {number} [options.size=null] The size of the capped collection in bytes.
 * @param {number} [options.max=null] The maximum number of documents in the capped collection.
 * @param {number} [options.flags=null] Optional. Available for the MMAPv1 storage engine only to set the usePowerOf2Sizes and the noPadding flag.
 * @param {object} [options.storageEngine=null] Allows users to specify configuration to the storage engine on a per-collection basis when creating a collection on MongoDB 3.0 or higher.
 * @param {object} [options.validator=null] Allows users to specify validation rules or expressions for the collection. For more information, see Document Validation on MongoDB 3.2 or higher.
 * @param {string} [options.validationLevel=null] Determines how strictly MongoDB applies the validation rules to existing documents during an update on MongoDB 3.2 or higher.
 * @param {string} [options.validationAction=null] Determines whether to error on invalid documents or just warn about the violations but allow invalid documents to be inserted on MongoDB 3.2 or higher.
 * @param {object} [options.indexOptionDefaults=null] Allows users to specify a default configuration for indexes when creating a collection on MongoDB 3.2 or higher.
 * @param {string} [options.viewOn=null] The name of the source collection or view from which to create the view. The name is not the full namespace of the collection or view; i.e. does not include the database name and implies the same database as the view to create on MongoDB 3.4 or higher.
 * @param {array} [options.pipeline=null] An array that consists of the aggregation pipeline stage. create creates the view by applying the specified pipeline to the viewOn collection or view on MongoDB 3.4 or higher.
 * @param {object} [options.collation=null] Specify collation (MongoDB 3.4 or higher) settings for update operation (see 3.4 documentation for available fields).
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Db~collectionResultCallback} [callback] The results callback
 * @return {Promise} returns Promise if no callback passed
 */
Db.prototype.createCollection = function(name, options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = options || {};
  options.promiseLibrary = options.promiseLibrary || this.s.promiseLibrary;

  return executeOperation(this.s.topology, createCollection, [this, name, options, callback]);
};

define.classMethod('createCollection', { callback: true, promise: true });

/**
 * Get all the db statistics.
 *
 * @method
 * @param {object} [options=null] Optional settings.
 * @param {number} [options.scale=null] Divide the returned sizes by scale value.
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Db~resultCallback} [callback] The collection result callback
 * @return {Promise} returns Promise if no callback passed
 */
Db.prototype.stats = function(options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = options || {};
  // Build command object
  var commandObject = { dbStats: true };
  // Check if we have the scale value
  if (options['scale'] != null) commandObject['scale'] = options['scale'];

  // If we have a readPreference set
  if (options.readPreference == null && this.s.readPreference) {
    options.readPreference = this.s.readPreference;
  }

  // Execute the command
  return this.command(commandObject, options, callback);
};

define.classMethod('stats', { callback: true, promise: true });

// Transformation methods for cursor results
var listCollectionsTranforms = function(databaseName) {
  var matching = f('%s.', databaseName);

  return {
    doc: function(doc) {
      var index = doc.name.indexOf(matching);
      // Remove database name if available
      if (doc.name && index === 0) {
        doc.name = doc.name.substr(index + matching.length);
      }

      return doc;
    }
  };
};

/**
 * Get the list of all collection information for the specified db.
 *
 * @method
 * @param {object} [filter={}] Query to filter collections by
 * @param {object} [options=null] Optional settings.
 * @param {number} [options.batchSize=null] The batchSize for the returned command cursor or if pre 2.8 the systems batch collection
 * @param {(ReadPreference|string)} [options.readPreference=null] The preferred read preference (ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST).
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @return {CommandCursor}
 */
Db.prototype.listCollections = function(filter, options) {
  filter = filter || {};
  options = options || {};

  // Shallow clone the object
  options = shallowClone(options);
  // Set the promise library
  options.promiseLibrary = this.s.promiseLibrary;

  // Ensure valid readPreference
  if (options.readPreference) {
    options.readPreference = convertReadPreference(options.readPreference);
  } else {
    options.readPreference = this.s.readPreference || ReadPreference.primary;
  }

  // We have a list collections command
  if (this.serverConfig.capabilities().hasListCollectionsCommand) {
    // Cursor options
    var cursor = options.batchSize ? { batchSize: options.batchSize } : {};
    // Build the command
    var command = { listCollections: true, filter: filter, cursor: cursor };
    // Set the AggregationCursor constructor
    options.cursorFactory = CommandCursor;
    // Create the cursor
    cursor = this.s.topology.cursor(f('%s.$cmd', this.s.databaseName), command, options);
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
      filter = shallowClone(filter);
      filter.name = f('%s.%s', this.s.databaseName, filter.name);
    }
  }

  // No filter, filter by current database
  if (filter == null) {
    filter.name = f('/%s/', this.s.databaseName);
  }

  // Rewrite the filter to use $and to filter out indexes
  if (filter.name) {
    filter = { $and: [{ name: filter.name }, { name: /^((?!\$).)*$/ }] };
  } else {
    filter = { name: /^((?!\$).)*$/ };
  }

  // Return options
  var _options = { transforms: listCollectionsTranforms(this.s.databaseName) };
  // Get the cursor
  cursor = this.collection(Db.SYSTEM_NAMESPACE_COLLECTION).find(filter, _options);
  // Do we have a readPreference, apply it
  if (options.readPreference) cursor.setReadPreference(options.readPreference);
  // Set the passed in batch size if one was provided
  if (options.batchSize) cursor = cursor.batchSize(options.batchSize);
  // We have a fallback mode using legacy systems collections
  return cursor;
};

define.classMethod('listCollections', {
  callback: false,
  promise: false,
  returns: [CommandCursor]
});

var evaluate = function(self, code, parameters, options, callback) {
  var finalCode = code;
  var finalParameters = [];

  // Did the user destroy the topology
  if (self.serverConfig && self.serverConfig.isDestroyed())
    return callback(new MongoError('topology was destroyed'));

  // If not a code object translate to one
  if (!(finalCode && finalCode._bsontype === 'Code')) finalCode = new Code(finalCode);
  // Ensure the parameters are correct
  if (parameters != null && !Array.isArray(parameters) && typeof parameters !== 'function') {
    finalParameters = [parameters];
  } else if (parameters != null && Array.isArray(parameters) && typeof parameters !== 'function') {
    finalParameters = parameters;
  }

  // Create execution selector
  var cmd = { $eval: finalCode, args: finalParameters };
  // Check if the nolock parameter is passed in
  if (options['nolock']) {
    cmd['nolock'] = options['nolock'];
  }

  // Set primary read preference
  options.readPreference = new ReadPreference(ReadPreference.PRIMARY);

  // Execute the command
  self.command(cmd, options, function(err, result) {
    if (err) return handleCallback(callback, err, null);
    if (result && result.ok === 1) return handleCallback(callback, null, result.retval);
    if (result)
      return handleCallback(
        callback,
        MongoError.create({ message: f('eval failed: %s', result.errmsg), driver: true }),
        null
      );
    handleCallback(callback, err, result);
  });
};

/**
 * Evaluate JavaScript on the server
 *
 * @method
 * @param {Code} code JavaScript to execute on server.
 * @param {(object|array)} parameters The parameters for the call.
 * @param {object} [options=null] Optional settings.
 * @param {boolean} [options.nolock=false] Tell MongoDB not to block on the evaulation of the javascript.
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Db~resultCallback} [callback] The results callback
 * @deprecated Eval is deprecated on MongoDB 3.2 and forward
 * @return {Promise} returns Promise if no callback passed
 */
Db.prototype.eval = function(code, parameters, options, callback) {
  var args = Array.prototype.slice.call(arguments, 1);
  callback = typeof args[args.length - 1] === 'function' ? args.pop() : undefined;
  parameters = args.length ? args.shift() : parameters;
  options = args.length ? args.shift() || {} : {};

  return executeOperation(this.s.topology, evaluate, [this, code, parameters, options, callback]);
};

define.classMethod('eval', { callback: true, promise: true });

/**
 * Rename a collection.
 *
 * @method
 * @param {string} fromCollection Name of current collection to rename.
 * @param {string} toCollection New name of of the collection.
 * @param {object} [options=null] Optional settings.
 * @param {boolean} [options.dropTarget=false] Drop the target name collection if it previously exists.
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Db~collectionResultCallback} [callback] The results callback
 * @return {Promise} returns Promise if no callback passed
 */
Db.prototype.renameCollection = function(fromCollection, toCollection, options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = options || {};
  // Add return new collection
  options.new_collection = true;

  const collection = this.collection(fromCollection);
  return executeOperation(this.s.topology, collection.rename.bind(collection), [
    toCollection,
    options,
    callback
  ]);
};

define.classMethod('renameCollection', { callback: true, promise: true });

/**
 * Drop a collection from the database, removing it permanently. New accesses will create a new collection.
 *
 * @method
 * @param {string} name Name of collection to drop
 * @param {Object} [options] Optional settings
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Db~resultCallback} [callback] The results callback
 * @return {Promise} returns Promise if no callback passed
 */
Db.prototype.dropCollection = function(name, options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = options || {};

  // Command to execute
  var cmd = { drop: name };

  // Decorate with write concern
  decorateWithWriteConcern(cmd, this, options);

  // options
  const opts = assign({}, this.s.options, { readPreference: ReadPreference.PRIMARY });
  if (options.session) opts.session = options.session;

  return executeOperation(this.s.topology, dropCollection, [this, cmd, opts, callback]);
};

const dropCollection = (self, cmd, options, callback) => {
  return self.command(cmd, options, function(err, result) {
    // Did the user destroy the topology
    if (self.serverConfig && self.serverConfig.isDestroyed()) {
      return callback(new MongoError('topology was destroyed'));
    }

    if (err) return handleCallback(callback, err);
    if (result.ok) return handleCallback(callback, null, true);
    handleCallback(callback, null, false);
  });
};

define.classMethod('dropCollection', { callback: true, promise: true });

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
  // Drop database command
  var cmd = { dropDatabase: 1 };

  // Decorate with write concern
  decorateWithWriteConcern(cmd, this, options);

  // Ensure primary only
  const finalOptions = assign({}, { readPreference: ReadPreference.PRIMARY }, this.s.options);
  if (options.session) {
    finalOptions.session = options.session;
  }

  return executeOperation(this.s.topology, dropDatabase, [this, cmd, finalOptions, callback]);
};

const dropDatabase = (self, cmd, options, callback) => {
  self.command(cmd, options, function(err, result) {
    // Did the user destroy the topology
    if (self.serverConfig && self.serverConfig.isDestroyed()) {
      return callback(new MongoError('topology was destroyed'));
    }

    if (callback == null) return;
    if (err) return handleCallback(callback, err, null);
    handleCallback(callback, null, result.ok ? true : false);
  });
};

define.classMethod('dropDatabase', { callback: true, promise: true });

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

  return executeOperation(this.s.topology, collections, [this, options, callback]);
};

var collections = function(self, options, callback) {
  // Let's get the collection names
  self.listCollections({}, options).toArray(function(err, documents) {
    if (err != null) return handleCallback(callback, err, null);
    // Filter collections removing any illegal ones
    documents = documents.filter(function(doc) {
      return doc.name.indexOf('$') === -1;
    });

    // Return the collection objects
    handleCallback(
      callback,
      null,
      documents.map(function(d) {
        return new Collection(
          self,
          self.s.topology,
          self.s.databaseName,
          d.name,
          self.s.pkFactory,
          self.s.options
        );
      })
    );
  });
};

define.classMethod('collections', { callback: true, promise: true });

/**
 * Runs a command on the database as admin.
 * @method
 * @param {object} command The command hash
 * @param {object} [options=null] Optional settings.
 * @param {(ReadPreference|string)} [options.readPreference=null] The preferred read preference (ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST).
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Db~resultCallback} [callback] The command result callback
 * @return {Promise} returns Promise if no callback passed
 */
Db.prototype.executeDbAdminCommand = function(selector, options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = options || {};

  // Convert read preference
  if (options.readPreference) {
    options.readPreference = convertReadPreference(options.readPreference);
  }

  return executeOperation(this.s.topology, executeDbAdminCommand, [
    this,
    selector,
    options,
    callback
  ]);
};

const executeDbAdminCommand = (self, selector, options, callback) => {
  self.s.topology.command('admin.$cmd', selector, options, function(err, result) {
    // Did the user destroy the topology
    if (self.serverConfig && self.serverConfig.isDestroyed()) {
      return callback(new MongoError('topology was destroyed'));
    }

    if (err) return handleCallback(callback, err);
    handleCallback(callback, null, result.result);
  });
};

define.classMethod('executeDbAdminCommand', { callback: true, promise: true });

/**
 * Creates an index on the db and collection collection.
 * @method
 * @param {string} name Name of the collection to create the index on.
 * @param {(string|object)} fieldOrSpec Defines the index.
 * @param {object} [options=null] Optional settings.
 * @param {(number|string)} [options.w=null] The write concern.
 * @param {number} [options.wtimeout=null] The write concern timeout.
 * @param {boolean} [options.j=false] Specify a journal write concern.
 * @param {boolean} [options.unique=false] Creates an unique index.
 * @param {boolean} [options.sparse=false] Creates a sparse index.
 * @param {boolean} [options.background=false] Creates the index in the background, yielding whenever possible.
 * @param {boolean} [options.dropDups=false] A unique index cannot be created on a key that has pre-existing duplicate values. If you would like to create the index anyway, keeping the first document the database indexes and deleting all subsequent documents that have duplicate value
 * @param {number} [options.min=null] For geospatial indexes set the lower bound for the co-ordinates.
 * @param {number} [options.max=null] For geospatial indexes set the high bound for the co-ordinates.
 * @param {number} [options.v=null] Specify the format version of the indexes.
 * @param {number} [options.expireAfterSeconds=null] Allows you to expire data on indexes applied to a data (MongoDB 2.2 or higher)
 * @param {number} [options.name=null] Override the autogenerated index name (useful if the resulting name is larger than 128 bytes)
 * @param {object} [options.partialFilterExpression=null] Creates a partial index based on the given filter object (MongoDB 3.2 or higher)
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Db~resultCallback} [callback] The command result callback
 * @return {Promise} returns Promise if no callback passed
 */
Db.prototype.createIndex = function(name, fieldOrSpec, options, callback) {
  var args = Array.prototype.slice.call(arguments, 2);
  callback = typeof args[args.length - 1] === 'function' ? args.pop() : undefined;
  options = args.length ? args.shift() || {} : {};
  options = typeof callback === 'function' ? options : callback;
  options = options == null ? {} : options;
  // Shallow clone the options
  options = shallowClone(options);

  return executeOperation(this.s.topology, createIndex, [
    this,
    name,
    fieldOrSpec,
    options,
    callback
  ]);
};

var createIndex = function(self, name, fieldOrSpec, options, callback) {
  // Get the write concern options
  var finalOptions = Object.assign({}, { readPreference: ReadPreference.PRIMARY }, options);
  finalOptions = writeConcern(finalOptions, self, options);

  // Ensure we have a callback
  if (finalOptions.writeConcern && typeof callback !== 'function') {
    throw MongoError.create({
      message: 'Cannot use a writeConcern without a provided callback',
      driver: true
    });
  }

  // Did the user destroy the topology
  if (self.serverConfig && self.serverConfig.isDestroyed())
    return callback(new MongoError('topology was destroyed'));

  // Attempt to run using createIndexes command
  createIndexUsingCreateIndexes(self, name, fieldOrSpec, options, function(err, result) {
    if (err == null) return handleCallback(callback, err, result);

    // 67 = 'CannotCreateIndex' (malformed index options)
    // 85 = 'IndexOptionsConflict' (index already exists with different options)
    // 11000 = 'DuplicateKey' (couldn't build unique index because of dupes)
    // 11600 = 'InterruptedAtShutdown' (interrupted at shutdown)
    // These errors mean that the server recognized `createIndex` as a command
    // and so we don't need to fallback to an insert.
    if (err.code === 67 || err.code === 11000 || err.code === 85 || err.code === 11600) {
      return handleCallback(callback, err, result);
    }

    // Create command
    var doc = createCreateIndexCommand(self, name, fieldOrSpec, options);
    // Set no key checking
    finalOptions.checkKeys = false;
    // Insert document
    self.s.topology.insert(
      f('%s.%s', self.s.databaseName, Db.SYSTEM_INDEX_COLLECTION),
      doc,
      finalOptions,
      function(err, result) {
        if (callback == null) return;
        if (err) return handleCallback(callback, err);
        if (result == null) return handleCallback(callback, null, null);
        if (result.result.writeErrors)
          return handleCallback(callback, MongoError.create(result.result.writeErrors[0]), null);
        handleCallback(callback, null, doc.name);
      }
    );
  });
};

define.classMethod('createIndex', { callback: true, promise: true });

/**
 * Ensures that an index exists, if it does not it creates it
 * @method
 * @deprecated since version 2.0
 * @param {string} name The index name
 * @param {(string|object)} fieldOrSpec Defines the index.
 * @param {object} [options=null] Optional settings.
 * @param {(number|string)} [options.w=null] The write concern.
 * @param {number} [options.wtimeout=null] The write concern timeout.
 * @param {boolean} [options.j=false] Specify a journal write concern.
 * @param {boolean} [options.unique=false] Creates an unique index.
 * @param {boolean} [options.sparse=false] Creates a sparse index.
 * @param {boolean} [options.background=false] Creates the index in the background, yielding whenever possible.
 * @param {boolean} [options.dropDups=false] A unique index cannot be created on a key that has pre-existing duplicate values. If you would like to create the index anyway, keeping the first document the database indexes and deleting all subsequent documents that have duplicate value
 * @param {number} [options.min=null] For geospatial indexes set the lower bound for the co-ordinates.
 * @param {number} [options.max=null] For geospatial indexes set the high bound for the co-ordinates.
 * @param {number} [options.v=null] Specify the format version of the indexes.
 * @param {number} [options.expireAfterSeconds=null] Allows you to expire data on indexes applied to a data (MongoDB 2.2 or higher)
 * @param {number} [options.name=null] Override the autogenerated index name (useful if the resulting name is larger than 128 bytes)
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Db~resultCallback} [callback] The command result callback
 * @return {Promise} returns Promise if no callback passed
 */
Db.prototype.ensureIndex = function(name, fieldOrSpec, options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = options || {};

  return executeOperation(this.s.topology, ensureIndex, [
    this,
    name,
    fieldOrSpec,
    options,
    callback
  ]);
};

var ensureIndex = function(self, name, fieldOrSpec, options, callback) {
  // Get the write concern options
  var finalOptions = writeConcern({}, self, options);
  // Create command
  var selector = createCreateIndexCommand(self, name, fieldOrSpec, options);
  var index_name = selector.name;

  // Did the user destroy the topology
  if (self.serverConfig && self.serverConfig.isDestroyed())
    return callback(new MongoError('topology was destroyed'));

  // Merge primary readPreference
  finalOptions.readPreference = ReadPreference.PRIMARY;

  // Check if the index allready exists
  self.indexInformation(name, finalOptions, function(err, indexInformation) {
    if (err != null && err.code !== 26) return handleCallback(callback, err, null);
    // If the index does not exist, create it
    if (indexInformation == null || !indexInformation[index_name]) {
      self.createIndex(name, fieldOrSpec, options, callback);
    } else {
      if (typeof callback === 'function') return handleCallback(callback, null, index_name);
    }
  });
};

define.classMethod('ensureIndex', { callback: true, promise: true });

Db.prototype.addChild = function(db) {
  if (this.s.parentDb) return this.s.parentDb.addChild(db);
  this.s.children.push(db);
};

var _executeAuthCreateUserCommand = function(self, username, password, options, callback) {
  // Special case where there is no password ($external users)
  if (typeof username === 'string' && password != null && typeof password === 'object') {
    options = password;
    password = null;
  }

  // Unpack all options
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }

  // Error out if we digestPassword set
  if (options.digestPassword != null) {
    throw toError(
      "The digestPassword option is not supported via add_user. Please use db.command('createUser', ...) instead for this option."
    );
  }

  // Get additional values
  var customData = options.customData != null ? options.customData : {};
  var roles = Array.isArray(options.roles) ? options.roles : [];
  var maxTimeMS = typeof options.maxTimeMS === 'number' ? options.maxTimeMS : null;

  // If not roles defined print deprecated message
  if (roles.length === 0) {
    console.log('Creating a user without roles is deprecated in MongoDB >= 2.6');
  }

  // Get the error options
  var commandOptions = { writeCommand: true };
  if (options['dbName']) commandOptions.dbName = options['dbName'];

  // Add maxTimeMS to options if set
  if (maxTimeMS != null) commandOptions.maxTimeMS = maxTimeMS;

  // Check the db name and add roles if needed
  if (
    (self.databaseName.toLowerCase() === 'admin' || options.dbName === 'admin') &&
    !Array.isArray(options.roles)
  ) {
    roles = ['root'];
  } else if (!Array.isArray(options.roles)) {
    roles = ['dbOwner'];
  }

  // Build the command to execute
  var command = {
    createUser: username,
    customData: customData,
    roles: roles,
    digestPassword: false
  };

  // Apply write concern to command
  command = writeConcern(command, self, options);

  // Use node md5 generator
  var md5 = crypto.createHash('md5');
  // Generate keys used for authentication
  md5.update(username + ':mongo:' + password);
  var userPassword = md5.digest('hex');

  // No password
  if (typeof password === 'string') {
    command.pwd = userPassword;
  }

  // Force write using primary
  commandOptions.readPreference = ReadPreference.primary;

  // Execute the command
  self.command(command, commandOptions, function(err, result) {
    if (err && err.ok === 0 && err.code === undefined)
      return handleCallback(callback, { code: -5000 }, null);
    if (err) return handleCallback(callback, err, null);
    handleCallback(
      callback,
      !result.ok ? toError(result) : null,
      result.ok ? [{ user: username, pwd: '' }] : null
    );
  });
};

var addUser = function(self, username, password, options, callback) {
  // Did the user destroy the topology
  if (self.serverConfig && self.serverConfig.isDestroyed())
    return callback(new MongoError('topology was destroyed'));
  // Attempt to execute auth command
  _executeAuthCreateUserCommand(self, username, password, options, function(err, r) {
    // We need to perform the backward compatible insert operation
    if (err && err.code === -5000) {
      var finalOptions = writeConcern(shallowClone(options), self, options);
      // Use node md5 generator
      var md5 = crypto.createHash('md5');
      // Generate keys used for authentication
      md5.update(username + ':mongo:' + password);
      var userPassword = md5.digest('hex');

      // If we have another db set
      var db = options.dbName ? new Db(options.dbName, self.s.topology, self.s.options) : self;

      // Fetch a user collection
      var collection = db.collection(Db.SYSTEM_USER_COLLECTION);

      // Check if we are inserting the first user
      collection.count({}, finalOptions, function(err, count) {
        // We got an error (f.ex not authorized)
        if (err != null) return handleCallback(callback, err, null);
        // Check if the user exists and update i
        collection
          .find({ user: username }, { dbName: options['dbName'] }, finalOptions)
          .toArray(function(err) {
            // We got an error (f.ex not authorized)
            if (err != null) return handleCallback(callback, err, null);
            // Add command keys
            finalOptions.upsert = true;

            // We have a user, let's update the password or upsert if not
            collection.update(
              { user: username },
              { $set: { user: username, pwd: userPassword } },
              finalOptions,
              function(err) {
                if (count === 0 && err)
                  return handleCallback(callback, null, [{ user: username, pwd: userPassword }]);
                if (err) return handleCallback(callback, err, null);
                handleCallback(callback, null, [{ user: username, pwd: userPassword }]);
              }
            );
          });
      });

      return;
    }

    if (err) return handleCallback(callback, err);
    handleCallback(callback, err, r);
  });
};

/**
 * Add a user to the database.
 * @method
 * @param {string} username The username.
 * @param {string} password The password.
 * @param {object} [options=null] Optional settings.
 * @param {(number|string)} [options.w=null] The write concern.
 * @param {number} [options.wtimeout=null] The write concern timeout.
 * @param {boolean} [options.j=false] Specify a journal write concern.
 * @param {object} [options.customData=null] Custom data associated with the user (only Mongodb 2.6 or higher)
 * @param {object[]} [options.roles=null] Roles associated with the created user (only Mongodb 2.6 or higher)
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Db~resultCallback} [callback] The command result callback
 * @return {Promise} returns Promise if no callback passed
 */
Db.prototype.addUser = function(username, password, options, callback) {
  // Unpack the parameters
  var args = Array.prototype.slice.call(arguments, 2);
  callback = typeof args[args.length - 1] === 'function' ? args.pop() : undefined;
  options = args.length ? args.shift() || {} : {};

  return executeOperation(this.s.topology, addUser, [this, username, password, options, callback]);
};

define.classMethod('addUser', { callback: true, promise: true });

var _executeAuthRemoveUserCommand = function(self, username, options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = options || {};

  // Did the user destroy the topology
  if (self.serverConfig && self.serverConfig.isDestroyed())
    return callback(new MongoError('topology was destroyed'));
  // Get the error options
  var commandOptions = { writeCommand: true };
  if (options['dbName']) commandOptions.dbName = options['dbName'];

  // Get additional values
  var maxTimeMS = typeof options.maxTimeMS === 'number' ? options.maxTimeMS : null;

  // Add maxTimeMS to options if set
  if (maxTimeMS != null) commandOptions.maxTimeMS = maxTimeMS;

  // Build the command to execute
  var command = {
    dropUser: username
  };

  // Apply write concern to command
  command = writeConcern(command, self, options);

  // Force write using primary
  commandOptions.readPreference = ReadPreference.primary;

  // Execute the command
  self.command(command, commandOptions, function(err, result) {
    if (err && !err.ok && err.code === undefined) return handleCallback(callback, { code: -5000 });
    if (err) return handleCallback(callback, err, null);
    handleCallback(callback, null, result.ok ? true : false);
  });
};

var removeUser = function(self, username, options, callback) {
  // Attempt to execute command
  _executeAuthRemoveUserCommand(self, username, options, function(err, result) {
    if (err && err.code === -5000) {
      var finalOptions = writeConcern(shallowClone(options), self, options);
      // If we have another db set
      var db = options.dbName ? new Db(options.dbName, self.s.topology, self.s.options) : self;

      // Fetch a user collection
      var collection = db.collection(Db.SYSTEM_USER_COLLECTION);

      // Locate the user
      collection.findOne({ user: username }, finalOptions, function(err, user) {
        if (user == null) return handleCallback(callback, err, false);
        collection.remove({ user: username }, finalOptions, function(err) {
          handleCallback(callback, err, true);
        });
      });

      return;
    }

    if (err) return handleCallback(callback, err);
    handleCallback(callback, err, result);
  });
};

define.classMethod('removeUser', { callback: true, promise: true });

/**
 * Remove a user from a database
 * @method
 * @param {string} username The username.
 * @param {object} [options=null] Optional settings.
 * @param {(number|string)} [options.w=null] The write concern.
 * @param {number} [options.wtimeout=null] The write concern timeout.
 * @param {boolean} [options.j=false] Specify a journal write concern.
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Db~resultCallback} [callback] The command result callback
 * @return {Promise} returns Promise if no callback passed
 */
Db.prototype.removeUser = function(username, options, callback) {
  var args = Array.prototype.slice.call(arguments, 1);
  callback = typeof args[args.length - 1] === 'function' ? args.pop() : undefined;
  options = args.length ? args.shift() || {} : {};

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
Db.prototype.setProfilingLevel = function(level, options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = options || {};

  return executeOperation(this.s.topology, setProfilingLevel, [this, level, options, callback]);
};

var setProfilingLevel = function(self, level, options, callback) {
  var command = {};
  var profile = 0;

  if (level === 'off') {
    profile = 0;
  } else if (level === 'slow_only') {
    profile = 1;
  } else if (level === 'all') {
    profile = 2;
  } else {
    return callback(new Error('Error: illegal profiling level value ' + level));
  }

  // Set up the profile number
  command['profile'] = profile;

  self.command(command, options, function(err, doc) {
    if (err == null && doc.ok === 1) return callback(null, level);
    return err != null
      ? callback(err, null)
      : callback(new Error('Error with profile command'), null);
  });
};

define.classMethod('setProfilingLevel', { callback: true, promise: true });

/**
 * Retrive the current profiling information for MongoDB
 *
 * @param {Object} [options] Optional settings
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Db~resultCallback} [callback] The command result callback.
 * @return {Promise} returns Promise if no callback passed
 * @deprecated Query the system.profile collection directly.
 */
Db.prototype.profilingInfo = function(options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = options || {};

  return executeOperation(this.s.topology, profilingInfo, [this, options, callback]);
};

var profilingInfo = function(self, options, callback) {
  try {
    self
      .collection('system.profile')
      .find({}, null, options)
      .toArray(callback);
  } catch (err) {
    return callback(err, null);
  }
};

define.classMethod('profilingInfo', { callback: true, promise: true });

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

  return executeOperation(this.s.topology, profilingLevel, [this, options, callback]);
};

var profilingLevel = function(self, options, callback) {
  self.command({ profile: -1 }, options, function(err, doc) {
    if (err == null && doc.ok === 1) {
      var was = doc.was;
      if (was === 0) return callback(null, 'off');
      if (was === 1) return callback(null, 'slow_only');
      if (was === 2) return callback(null, 'all');
      return callback(new Error('Error: illegal profiling level value ' + was), null);
    } else {
      err != null ? callback(err, null) : callback(new Error('Error with profile command'), null);
    }
  });
};

define.classMethod('profilingLevel', { callback: true, promise: true });

/**
 * Retrieves this collections index info.
 * @method
 * @param {string} name The name of the collection.
 * @param {object} [options=null] Optional settings.
 * @param {boolean} [options.full=false] Returns the full raw index information.
 * @param {(ReadPreference|string)} [options.readPreference=null] The preferred read preference (ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST).
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Db~resultCallback} [callback] The command result callback
 * @return {Promise} returns Promise if no callback passed
 */
Db.prototype.indexInformation = function(name, options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = options || {};

  return executeOperation(this.s.topology, indexInformation, [this, name, options, callback]);
};

var indexInformation = function(self, name, options, callback) {
  // If we specified full information
  var full = options['full'] == null ? false : options['full'];

  // Did the user destroy the topology
  if (self.serverConfig && self.serverConfig.isDestroyed())
    return callback(new MongoError('topology was destroyed'));
  // Process all the results from the index command and collection
  var processResults = function(indexes) {
    // Contains all the information
    var info = {};
    // Process all the indexes
    for (var i = 0; i < indexes.length; i++) {
      var index = indexes[i];
      // Let's unpack the object
      info[index.name] = [];
      for (var name in index.key) {
        info[index.name].push([name, index.key[name]]);
      }
    }

    return info;
  };

  // Get the list of indexes of the specified collection
  self
    .collection(name)
    .listIndexes(options)
    .toArray(function(err, indexes) {
      if (err) return callback(toError(err));
      if (!Array.isArray(indexes)) return handleCallback(callback, null, []);
      if (full) return handleCallback(callback, null, indexes);
      handleCallback(callback, null, processResults(indexes));
    });
};

define.classMethod('indexInformation', { callback: true, promise: true });

var createCreateIndexCommand = function(db, name, fieldOrSpec, options) {
  var indexParameters = parseIndexOptions(fieldOrSpec);
  var fieldHash = indexParameters.fieldHash;

  // Generate the index name
  var indexName = typeof options.name === 'string' ? options.name : indexParameters.name;
  var selector = {
    ns: db.databaseName + '.' + name,
    key: fieldHash,
    name: indexName
  };

  // Ensure we have a correct finalUnique
  var finalUnique = options == null || 'object' === typeof options ? false : options;
  // Set up options
  options = options == null || typeof options === 'boolean' ? {} : options;

  // Add all the options
  var keysToOmit = Object.keys(selector);
  for (var optionName in options) {
    if (keysToOmit.indexOf(optionName) === -1) {
      selector[optionName] = options[optionName];
    }
  }

  if (selector['unique'] == null) selector['unique'] = finalUnique;

  // Remove any write concern operations
  var removeKeys = ['w', 'wtimeout', 'j', 'fsync', 'readPreference'];
  for (var i = 0; i < removeKeys.length; i++) {
    delete selector[removeKeys[i]];
  }

  // Return the command creation selector
  return selector;
};

var createIndexUsingCreateIndexes = function(self, name, fieldOrSpec, options, callback) {
  // Build the index
  var indexParameters = parseIndexOptions(fieldOrSpec);
  // Generate the index name
  var indexName = typeof options.name === 'string' ? options.name : indexParameters.name;
  // Set up the index
  var indexes = [{ name: indexName, key: indexParameters.fieldHash }];
  // merge all the options
  var keysToOmit = Object.keys(indexes[0]).concat([
    'w',
    'wtimeout',
    'j',
    'fsync',
    'readPreference',
    'session'
  ]);

  for (var optionName in options) {
    if (keysToOmit.indexOf(optionName) === -1) {
      indexes[0][optionName] = options[optionName];
    }
  }

  // Get capabilities
  var capabilities = self.s.topology.capabilities();

  // Did the user pass in a collation, check if our write server supports it
  if (indexes[0].collation && capabilities && !capabilities.commandsTakeCollation) {
    // Create a new error
    var error = new MongoError(f('server/primary/mongos does not support collation'));
    error.code = 67;
    // Return the error
    return callback(error);
  }

  // Create command, apply write concern to command
  var cmd = writeConcern({ createIndexes: name, indexes: indexes }, self, options);

  // Decorate command with writeConcern if supported
  decorateWithWriteConcern(cmd, self, options);

  // ReadPreference primary
  options.readPreference = ReadPreference.PRIMARY;

  // Build the command
  self.command(cmd, options, function(err, result) {
    if (err) return handleCallback(callback, err, null);
    if (result.ok === 0) return handleCallback(callback, toError(result), null);
    // Return the indexName for backward compatibility
    handleCallback(callback, null, indexName);
  });
};

// Validate the database name
var validateDatabaseName = function(databaseName) {
  if (typeof databaseName !== 'string')
    throw MongoError.create({ message: 'database name must be a string', driver: true });
  if (databaseName.length === 0)
    throw MongoError.create({ message: 'database name cannot be the empty string', driver: true });
  if (databaseName === '$external') return;

  var invalidChars = [' ', '.', '$', '/', '\\'];
  for (var i = 0; i < invalidChars.length; i++) {
    if (databaseName.indexOf(invalidChars[i]) !== -1)
      throw MongoError.create({
        message: "database names cannot contain the character '" + invalidChars[i] + "'",
        driver: true
      });
  }
};

// Get write concern
var writeConcern = function(target, db, options) {
  if (options.w != null || options.j != null || options.fsync != null) {
    var opts = {};
    if (options.w) opts.w = options.w;
    if (options.wtimeout) opts.wtimeout = options.wtimeout;
    if (options.j) opts.j = options.j;
    if (options.fsync) opts.fsync = options.fsync;
    target.writeConcern = opts;
  } else if (
    db.writeConcern.w != null ||
    db.writeConcern.j != null ||
    db.writeConcern.fsync != null
  ) {
    target.writeConcern = db.writeConcern;
  }

  return target;
};

// Add listeners to topology
var createListener = function(self, e, object) {
  var listener = function(err) {
    if (object.listeners(e).length > 0) {
      object.emit(e, err, self);

      // Emit on all associated db's if available
      for (var i = 0; i < self.s.children.length; i++) {
        self.s.children[i].emit(e, err, self.s.children[i]);
      }
    }
  };
  return listener;
};

/**
 * Unref all sockets
 * @method
 */
Db.prototype.unref = function() {
  this.s.topology.unref();
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
