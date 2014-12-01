"use strict";

var EventEmitter = require('events').EventEmitter
  , inherits = require('util').inherits
  , getSingleProperty = require('./utils').getSingleProperty
  , shallowClone = require('./utils').shallowClone
  , parseIndexOptions = require('./utils').parseIndexOptions
  , debugOptions = require('./utils').debugOptions
  , handleCallback = require('./utils').handleCallback
  , toError = require('./utils').toError
  , ReadPreference = require('./read_preference')
  , f = require('util').format
  , Admin = require('./admin')
  , Code = require('mongodb-core').BSON.Code
  , CoreReadPreference = require('mongodb-core').ReadPreference
  , MongoError = require('mongodb-core').MongoError
  , ObjectID = require('mongodb-core').ObjectID
  , Logger = require('mongodb-core').Logger
  , Collection = require('./collection')
  , crypto = require('crypto');

var debugFields = ['authSource', 'w', 'wtimeout', 'j', 'native_parser', 'forceServerObjectId'
  , 'serializeFunctions', 'raw', 'promoteLongs', 'bufferMaxEntries', 'numberOfRetries', 'retryMiliSeconds'
  , 'readPreference', 'pkFactory'];

/**
 * @fileOverview The **Db** class is a class that represents a MongoDB Database.
 * 
 * @example
 * var MongoClient = require('mongodb').MongoClient,
 *   test = require('assert');
 * // Connection url
 * var url = 'mongodb://localhost:27017/test';
 * // Connect using MongoClient
 * MongoClient.connect(url, function(err, db) {
 *   // Get an additional db
 *   var testDb = db.db('test');
 *   db.close();
 * });
 */

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
 * @param {boolean} [options.native_parser=true] Select C++ bson parser instead of JavaScript parser.
 * @param {boolean} [options.forceServerObjectId=false] Force server to assign _id values instead of driver.
 * @param {boolean} [options.serializeFunctions=false] Serialize functions on any object.
 * @param {boolean} [options.raw=false] Return document results as raw BSON buffers.
 * @param {boolean} [options.promoteLongs=true] Promotes Long values to number if they fit inside the 53 bits resolution.
 * @param {number} [options.bufferMaxEntries=-1] Sets a cap on how many operations the driver will buffer up before giving up on getting a working connection, default is -1 which is unlimited.
 * @param {number} [options.numberOfRetries=5] Number of retries off connection.
 * @param {number} [options.retryMiliSeconds=500] Number of milliseconds between retries.
 * @param {(ReadPreference|string)} [options.readPreference=null] The preferred read preference (ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST).
 * @param {object} [options.pkFactory=null] A primary key factory object for generation of custom _id keys.
 * @property {(Server|ReplSet|Mongos)} serverConfig Get the current db topology.
 * @property {number} bufferMaxEntries Current bufferMaxEntries value for the database
 * @property {string} databaseName The name of the database this instance represents.
 * @property {object} options The options associated with the db instance.
 * @property {boolean} native_parser The current value of the parameter native_parser.
 * @property {boolean} slaveOk The current slaveOk value for the db instance.
 * @property {object} writeConcern The current write concern values.
 * @fires Db#close
 * @fires Db#authenticated
 * @fires Db#reconnect
 * @fires Db#error
 * @fires Db#timeout
 * @fires Db#parseError
 * @fires Db#fullsetup
 * @return {Db} a Db instance.
 */
var Db = function(databaseName, topology, options) {
  options = options || {};
  if(!(this instanceof Db)) return new Db(databaseName, topology, options);  
  EventEmitter.call(this);
  var self = this;
  // var self = this;  // Internal state of the db object
  this.s = {
    // Database name
      databaseName: databaseName
    // Topology
    , topology: topology
    // Options
    , options: options
    // Logger instance
    , logger: Logger('Db', options)
    // Get the bson parser
    , bson: topology ? topology.bson : null
    // Authsource if any
    , authSource: options.authSource
    // Unpack read preference
    , readPreference: options.readPreference
    // Set buffermaxEntries
    , bufferMaxEntries: typeof options.bufferMaxEntries == 'number' ? options.bufferMaxEntries : -1
    // Parent db (if chained)
    , parentDb: options.parentDb || null
    // Set up the primary key factory or fallback to ObjectID
    , pkFactory: options.pkFactory || ObjectID
    // Get native parser
    , nativeParser: options.nativeParser || options.native_parser
  }

  // Ensure we have a valid db name
  validateDatabaseName(self.s.databaseName);

  // If we have specified the type of parser
  if(typeof self.s.nativeParser == 'boolean') {
    if(self.s.nativeParser) {
      topology.setBSONParserType("c++");
    } else {
      topology.setBSONParserType("js");
    }
  }

  // Add a read Only property
  getSingleProperty(this, 'serverConfig', self.s.topology);
  getSingleProperty(this, 'bufferMaxEntries', self.s.bufferMaxEntries);
  getSingleProperty(this, 'databaseName', self.s.databaseName);

  // Last ismaster
  Object.defineProperty(this, 'options', {
    enumerable:true,
    get: function() { return self.s.options; }
  });  

  // Last ismaster
  Object.defineProperty(this, 'native_parser', {
    enumerable:true,
    get: function() { return self.s.topology.parserType() == 'c++'; }
  });

  // Last ismaster
  Object.defineProperty(this, 'slaveOk', {
    enumerable:true,
    get: function() {
      if(self.s.options.readPreference != null
        && (self.s.options.readPreference != 'primary' || self.s.options.readPreference.mode != 'primary')) {
        return true;
      }
      return false;
    }
  });  

  Object.defineProperty(this, 'writeConcern', {
    enumerable:true,
    get: function() { 
      var ops = {};
      if(self.s.options.w != null) ops.w = self.s.options.w;
      if(self.s.options.j != null) ops.j = self.s.options.j;
      if(self.s.options.fsync != null) ops.fsync = self.s.options.fsync;
      if(self.s.options.wtimeout != null) ops.wtimeout = self.s.options.wtimeout;
      return ops;
    }
  });  

  topology.once('error', createListener(self, 'error', self));
  topology.once('timeout', createListener(self, 'timeout', self));
  topology.once('close', createListener(self, 'close', self));
  topology.once('parseError', createListener(self, 'parseError', self));
  topology.once('open', createListener(self, 'open', self));
  topology.once('fullsetup', createListener(self, 'fullsetup', self));
  topology.once('all', createListener(self, 'all', self));
}

inherits(Db, EventEmitter);

/**
 * The callback format for the Db.open method
 * @callback Db~openCallback
 * @param {MongoError} error An error instance representing the error during the execution.
 * @param {Db} db The Db instance if the open method was successful.
 */

/**
 * Open the database
 * @method
 * @param {Db~openCallback} callback Callback
 * @return {null}
 */
Db.prototype.open = function(callback) {
  var self = this;
  self.s.topology.connect(self, self.s.options, function(err, topology) {
    if(callback == null) returnl
    var internalCallback = callback;
    callback == null;

    if(err) {
      self.close();
      return internalCallback(err);
    }

    internalCallback(null, self);
  });
}

/**
 * The callback format for results
 * @callback Db~resultCallback
 * @param {MongoError} error An error instance representing the error during the execution.
 * @param {object} result The result object if the command was executed successfully.
 */

/**
 * Execute a command
 * @method
 * @param {object} command The command hash
 * @param {object} [options=null] Optional settings.
 * @param {(ReadPreference|string)} [options.readPreference=null] The preferred read preference (ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST).
 * @param {number} [options.maxTimeMS=null] Number of milliseconds to wait before aborting the query.
 * @param {Db~resultCallback} callback The command result callback
 * @return {null}
 */
Db.prototype.command = function(command, options, callback) {
  var self = this;
  if(typeof options == 'function') callback = options, options = {};
  var dbName = options.dbName || options.authdb || self.s.databaseName;
  // Clone the options
  options = shallowClone(options);
  // If we have a readPreference set
  if(options.readPreference == null && self.s.readPreference) {      
    options.readPreference = self.s.readPreference;
  }

  // Convert the readPreference
  if(options.readPreference && typeof options.readPreference == 'string') {
    options.readPreference = new CoreReadPreference(options.readPreference);
  } else if(options.readPreference instanceof ReadPreference) {
    options.readPreference = new CoreReadPreference(options.readPreference.mode
      , options.readPreference.tags);
  }

  // Debug information
  if(self.s.logger.isDebug()) self.s.logger.debug(f('executing command %s against %s with options [%s]'
    , JSON.stringify(command), f('%s.$cmd', dbName), JSON.stringify(debugOptions(debugFields, options))));

  // Execute command
  self.s.topology.command(f('%s.$cmd', dbName), command, options, function(err, result) {
    if(err) return handleCallback(callback, err);
    handleCallback(callback, null, result.result);
  });
}

/**
 * The callback format for results
 * @callback Db~noResultCallback
 * @param {MongoError} error An error instance representing the error during the execution.
 * @param {null} result Is not set to a value
 */

/**
 * Close the db and it's underlying connections
 * @method
 * @param {boolean} force Force close, emitting no events
 * @param {Db~noResultCallback} callback The result callback
 * @return {null}
 */
Db.prototype.close = function(force, callback) {
  if(typeof force == 'function') callback = force, force = false;
  this.s.topology.close(force);
  if(this.listeners('close').length > 0) this.emit('close');
  this.removeAllListeners('close');
  if(this.s.parentDb) this.s.parentDb.close();
  if(typeof callback == 'function') handleCallback(callback, null);
}

/**
 * Return the Admin db instance
 * @method
 * @return {Admin} return the new Admin db instance
 */
Db.prototype.admin = function() {
  return new Admin(this, this.s.topology);
};

/**
 * The callback format for the collection method, must be used if strict is specified
 * @callback Db~collectionResultCallback
 * @param {MongoError} error An error instance representing the error during the execution.
 * @param {Collection} collection The collection instance.
 */

/**
 * Fetch a specific collection (containing the actual collection information). If the application does not use strict mode you can
 * can use it without a callback in the following way. var collection = db.collection('mycollection');
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
 * @param {Db~collectionResultCallback} callback The collection result callback
 * @return {Collection} return the new Collection instance if not in strict mode
 */
Db.prototype.collection = function(name, options, callback) {
  var self = this;
  if(typeof options == 'function') callback = options, options = {};
  options = options || {};

  if(options == null || !options.strict) {
    try {
      var collection = new Collection(this, this.s.topology, this.s.databaseName, name, this.s.pkFactory, options);
      if(callback) callback(null, collection);
      return collection;
    } catch(err) {
      if(callback) return callback(err);
      throw err;
    }      
  }

  // Strict mode
  if(typeof callback != 'function') {
    throw toError(f("A callback is required in strict mode. While getting collection %s.", name));
  }

  // Strict mode
  this.listCollections(name, function(err, collections) {
    if(err != null) return handleCallback(callback, err, null);
    if(collections.length == 0) return handleCallback(callback, toError(f("Collection %s does not exist. Currently in strict mode.", name)), null);

    try {
      return handleCallback(callback, null, new Collection(self, self.s.topology, self.s.databaseName, name, self.s.pkFactory, options));
    } catch(err) {
      return handleCallback(callback, err, null);
    }
  });    
}

/**
 * Creates a collection on a server pre-allocating space, need to create f.ex capped collections.
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
 * @param {number} [options.size=null] The size of the capped collection in bytes.
 * @param {number} [options.max=null] The maximum number of documents in the capped collection.
 * @param {boolean} [options.autoIndexId=true] Create an index on the _id field of the document, True by default on MongoDB 2.2 or higher off for version < 2.2.
 * @param {Db~collectionResultCallback} callback The results callback
 * @return {null}
 */
Db.prototype.createCollection = function(name, options, callback) {
  var self = this;
  var args = Array.prototype.slice.call(arguments, 0);
  callback = args.pop();
  name = args.length ? args.shift() : null;
  options = args.length ? args.shift() || {} : {};

  // Get the write concern options
  var finalOptions = writeConcern(shallowClone(options), this, options);

  // Check if we have the name
  this.listCollections(name, function(err, collections) {
    if(err != null) return handleCallback(callback, err, null);
    if(collections.length > 0 && finalOptions.strict) {
      return handleCallback(callback, new MongoError(f("Collection %s already exists. Currently in strict mode.", name)), null);
    } else if (collections.length > 0) {
      try { return handleCallback(callback, null, new Collection(self, self.s.topology, self.s.databaseName, name, self.s.pkFactory, options)); }
      catch(err) { return handleCallback(callback, err); }
    }

    // Create collection command
    var cmd = {'create':name};
    
    // Add all optional parameters
    for(var n in options) {
      if(options[n] != null && typeof options[n] != 'function') 
        cmd[n] = options[n];
    }

    // Execute command
    self.command(cmd, finalOptions, function(err, result) {
      if(err) return handleCallback(callback, err);
      handleCallback(callback, null, new Collection(self, self.s.topology, self.s.databaseName, name, self.s.pkFactory, options));
    });
  });
}  

/**
 * Get all the db statistics.
 *
 * @method
 * @param {object} [options=null] Optional settings.
 * @param {number} [options.scale=null] Divide the returned sizes by scale value.
 * @param {Db~resultCallback} callback The collection result callback
 * @return {null}
 */
Db.prototype.stats = function(options, callback) {
  if(typeof options == 'function') callback = options, options = {};
  options = options || {};
  // Build command object
  var commandObject = { dbStats:true };
  // Check if we have the scale value
  if(options['scale'] != null) commandObject['scale'] = options['scale'];
  // Execute the command
  this.command(commandObject, options, callback);
}

/**
 * Get the list of all collection information for the specified db.
 *
 * @method
 * @param {string} [name=null] Filter by a specific collection name.
 * @param {object} [options=null] Optional settings.
 * @param {string|object} [options.filter=null] Filter collections by this filter (string or object)
 * @param {boolean} [options.namesOnly=false] Return only the full collection namespace.
 * @param {Db~resultCallback} callback The results callback
 * @return {null}
 */
Db.prototype.listCollections = function(name, options, callback) {
  var self = this;
  var args = Array.prototype.slice.call(arguments, 0);
  callback = args.pop();
  name = args.length ? args.shift() : null;
  options = args.length ? args.shift() || {} : {};

  // Only passed in options
  if(name != null && typeof name == 'object') options = name, name = null;
  // Do we have a filter
  var filter = options.filter || {};

  // Fallback to pre 2.8 list collections
  var fallbackListCollections = function() {
    // Ensure we have a filter
    filter = filter || {};
    // Set the name variable for the filter
    if(typeof name == 'string') filter.name = f("%s.%s", self.s.databaseName, name);
    // Get the system namespace collection as a cursor
    var cursor = self.collection(Db.SYSTEM_NAMESPACE_COLLECTION).find(filter);
    // Get all documents
    cursor.toArray(function(err, documents) {
      if(err != null) return handleCallback(callback, err, null);

      // Filter out all the non valid names
      var filtered_documents = documents.filter(function(document) {
        if(document.name.indexOf('$') != -1) return false;
        return true;
      });     

      // If we are returning only the names
      if(options.namesOnly) {
        filtered_documents = filtered_documents.map(function(document) { return document.name });
      }

      // Return filtered items
      handleCallback(callback, null, filtered_documents);
    });      
  }

  // Set up the listCollectionsCommand
  var listCollectionsCommand = {listCollections:1};
  // Add the optional filter if available
  if(filter) listCollectionsCommand.filter = filter;
  // Set the name variable for the filter
  if(typeof name == 'string') filter.name = name;

  // Attempt to execute the collection list
  self.command(listCollectionsCommand, function(err, result) {
    if(err) return fallbackListCollections();
    // List of result documents that have been filtered
    var filtered_documents = result.collections.filter(function(document) {
      if(name && document.name != name) return false;
      if(document.name.indexOf('$') != -1) return false;
      return true;
    });

    // If we are returning only the names
    if(options.namesOnly) {
      filtered_documents = filtered_documents.map(function(document) { return document.name });
    }

    // Return filtered items
    handleCallback(callback, null, filtered_documents);
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
 * @param {Db~resultCallback} callback The results callback
 * @return {null}
 */
Db.prototype.eval = function(code, parameters, options, callback) {
  var self = this;
  var args = Array.prototype.slice.call(arguments, 1);
  callback = args.pop();
  parameters = args.length ? args.shift() : parameters;
  options = args.length ? args.shift() || {} : {};

  var finalCode = code;
  var finalParameters = [];
  
  // If not a code object translate to one
  if(!(finalCode instanceof Code)) finalCode = new Code(finalCode);
  // Ensure the parameters are correct
  if(parameters != null && !Array.isArray(parameters) && typeof parameters !== 'function') {
    finalParameters = [parameters];
  } else if(parameters != null && Array.isArray(parameters) && typeof parameters !== 'function') {
    finalParameters = parameters;
  }

  // Create execution selector
  var cmd = {'$eval':finalCode, 'args':finalParameters};
  // Check if the nolock parameter is passed in
  if(options['nolock']) {
    cmd['nolock'] = options['nolock'];
  }

  // Set primary read preference
  options.readPreference = new CoreReadPreference(ReadPreference.PRIMARY);

  // Execute the command
  self.command(cmd, options, function(err, result) {
    if(err) return handleCallback(callback, err, null);
    if(result && result.ok == 1) return handleCallback(callback, null, result.retval);
    if(result) return handleCallback(callback, new MongoError(f("eval failed: %s", result.errmsg)), null);
    handleCallback(callback, err, result);
  });
};

/**
 * Rename a collection.
 *
 * @method
 * @param {string} fromCollection Name of current collection to rename.
 * @param {string} toCollection New name of of the collection.
 * @param {object} [options=null] Optional settings.
 * @param {boolean} [options.dropTarget=false] Drop the target name collection if it previously exists.
 * @param {Db~collectionResultCallback} callback The results callback
 * @return {null}
 */
Db.prototype.renameCollection = function(fromCollection, toCollection, options, callback) {
  if(typeof options == 'function') callback = options, options = {};
  // Add return new collection
  options.new_collection = true;
  // Execute using the collection method
  this.collection(fromCollection).rename(toCollection, options, callback);
};

/**
 * Drop a collection from the database, removing it permanently. New accesses will create a new collection.
 *
 * @method
 * @param {string} name Name of collection to drop
 * @param {Db~resultCallback} callback The results callback
 * @return {null}
 */
Db.prototype.dropCollection = function(name, callback) {
  callback || (callback = function(){});

  // Command to execute
  var cmd = {'drop':name}

  // Execute command
  this.command(cmd, this.s.options, function(err, result) {
    if(err) return handleCallback(callback, err);
    if(result.ok) return handleCallback(callback, null, true);
    handleCallback(callback, null, false);
  });
};

/**
 * Drop a database.
 *
 * @method
 * @param {Db~resultCallback} [callback] The results callback
 * @return {null}
 */
Db.prototype.dropDatabase = function(callback) {
  if(typeof options == 'function') callback = options, options = {};
  // Drop database command
  var cmd = {'dropDatabase':1};

  // Execute the command
  this.command(cmd, this.s.options, function(err, result) {
    if(callback == null) return;
    if(err) return handleCallback(callback, err, null);
    handleCallback(callback, null, result.ok ? true : false);
  });
}  

/**
 * The callback format for the collections method.
 * @callback Db~collectionsResultCallback
 * @param {MongoError} error An error instance representing the error during the execution.
 * @param {Collection[]} collections An array of all the collections objects for the db instance.
 */

/**
 * Fetch all collections for the current db.
 *
 * @method
 * @param {Db~collectionsResultCallback} [callback] The results callback
 * @return {null}
 */
Db.prototype.collections = function(callback) {
  var self = this;
  // Let's get the collection names
  this.listCollections(function(err, documents) {
    if(err != null) return handleCallback(callback, err, null);
    // Return the collection objects
    handleCallback(callback, null, documents.map(function(d) {
      return new Collection(self, self.s.topology, self.s.databaseName, d.name.replace(self.s.databaseName + ".", ''), self.s.pkFactory, self.s.options);
    }));
  });
};  

/**
 * Runs a command on the database as admin.
 * @method
 * @param {object} command The command hash
 * @param {object} [options=null] Optional settings.
 * @param {(ReadPreference|string)} [options.readPreference=null] The preferred read preference (ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST).
 * @param {number} [options.maxTimeMS=null] Number of milliseconds to wait before aborting the query.
 * @param {Db~resultCallback} callback The command result callback
 * @return {null}
 */
Db.prototype.executeDbAdminCommand = function(selector, options, callback) {
  if(typeof options == 'function') callback = options, options = {};
  if(options.readPreference) {
    options.readPreference = options.readPreference;
  }

  // Execute command
  this.s.topology.command('admin.$cmd', selector, options, function(err, result) {
    if(err) return handleCallback(callback, err);
    handleCallback(callback, null, result.result);
  });
};

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
 * @param {Db~resultCallback} callback The command result callback
 * @return {null}
 */
Db.prototype.createIndex = function(name, fieldOrSpec, options, callback) {
  var self = this;
  var args = Array.prototype.slice.call(arguments, 2);
  callback = args.pop();
  options = args.length ? args.shift() || {} : {};
  options = typeof callback === 'function' ? options : callback;
  options = options == null ? {} : options;

  // Get the write concern options
  var finalOptions = writeConcern({}, self, options);
  // Ensure we have a callback
  if(finalOptions.writeConcern && typeof callback != 'function') {
    throw new MongoError("Cannot use a writeConcern without a provided callback");
  }

  // Shallow clone the options
  options = shallowClone(options);

  // Always set read preference to primary
  options.readPreference = ReadPreference.PRIMARY;

  // Attempt to run using createIndexes command
  createIndexUsingCreateIndexes(self, name, fieldOrSpec, options, function(err, result) {
    if(err == null) return handleCallback(callback, err, result);
    // Create command
    var doc = createCreateIndexCommand(self, name, fieldOrSpec, options);
    // Insert document
    self.s.topology.insert(f("%s.%s", self.s.databaseName, Db.SYSTEM_INDEX_COLLECTION), doc, finalOptions, function(err, result) {
      if(callback == null) return;
      if(err) return handleCallback(callback, err);
      if(result == null) return handleCallback(callback, null, null);
      if(result.result.writeErrors) return handleCallback(callback, MongoError.create(result.result), null);
      handleCallback(callback, null, doc.name);
    });
  });
};

/**
 * Ensures that an index exists, if it does not it creates it
 * @method
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
 * @param {Db~resultCallback} callback The command result callback
 * @return {null}
 */
Db.prototype.ensureIndex = function(name, fieldOrSpec, options, callback) {
  var self = this;
  if(typeof options == 'function') callback = options, options = {};
  options = options || {};

  // Get the write concern options
  var finalOptions = writeConcern({}, self, options);
  // Create command
  var selector = createCreateIndexCommand(self, name, fieldOrSpec, options);
  var index_name = selector.name;

  // Default command options
  var commandOptions = {};
  // Check if the index allready exists
  this.indexInformation(name, writeConcern, function(err, indexInformation) {
    if(err != null) return handleCallback(callback, err, null);
    // If the index does not exist, create it
    if(!indexInformation[index_name])  {
      self.createIndex(name, fieldOrSpec, options, callback);
    } else {
      if(typeof callback === 'function') return handleCallback(callback, null, index_name);
    }
  });
};  

/**
 * Create a new Db instance sharing the current socket connections.
 * @method
 * @param {string} name The name of the database we want to use.
 * @return {Db}
 */
Db.prototype.db = function(dbName) {
  // Copy the options and add out internal override of the not shared flag
  var options = {};
  for(var key in this.options) {
    options[key] = this.options[key];
  }

  // Add current db as parentDb
  options.parentDb = this;

  // Return the db object
  var db = new Db(dbName, this.s.topology, options)
  // Add listeners to the parent database
  this.once('error', createListener(this, 'error', db));
  this.once('timeout', createListener(this, 'timeout', db));
  this.once('close', createListener(this, 'close', db));
  this.once('parseError', createListener(this, 'parseError', db));
  // Return the database
  return db;    
};

var _executeAuthCreateUserCommand = function(self, username, password, options, callback) {
  // Special case where there is no password ($external users)
  if(typeof username == 'string' 
    && password != null && typeof password == 'object') {
    options = password;
    password = null;
  }

  // Unpack all options
  if(typeof options == 'function') {
    callback = options;
    options = {};
  }  

  // Error out if we digestPassword set
  if(options.digestPassword != null) {
    throw toError("The digestPassword option is not supported via add_user. Please use db.command('createUser', ...) instead for this option.");
  }

  // Get additional values
  var customData = options.customData != null ? options.customData : {};
  var roles = Array.isArray(options.roles) ? options.roles : [];
  var maxTimeMS = typeof options.maxTimeMS == 'number' ? options.maxTimeMS : null;

  // If not roles defined print deprecated message
  if(roles.length == 0) {
    console.log("Creating a user without roles is deprecated in MongoDB >= 2.6");
  }

  // Get the error options
  var commandOptions = {writeCommand:true};
  if(options['dbName']) commandOptions.dbName = options['dbName'];

  // Add maxTimeMS to options if set
  if(maxTimeMS != null) commandOptions.maxTimeMS = maxTimeMS;

  // Check the db name and add roles if needed
  if((self.databaseName.toLowerCase() == 'admin' || options.dbName == 'admin') && !Array.isArray(options.roles)) {
    roles = ['root']
  } else if(!Array.isArray(options.roles)) {
    roles = ['dbOwner']
  }

  // Build the command to execute
  var command = {
      createUser: username
    , customData: customData
    , roles: roles
    , digestPassword:false
  }

  // Apply write concern to command
  command = writeConcern(command, self, options);

  // Use node md5 generator
  var md5 = crypto.createHash('md5');
  // Generate keys used for authentication
  md5.update(username + ":mongo:" + password);
  var userPassword = md5.digest('hex');

  // No password
  if(typeof password == 'string') {
    command.pwd = userPassword;
  }

  // Force write using primary
  commandOptions.readPreference = CoreReadPreference.primary;

  // Execute the command
  self.command(command, commandOptions, function(err, result) {
    if(err && err.ok == 0 && err.code == undefined) return handleCallback(callback, {code: -5000}, null);
    if(err) return handleCallback(callback, err, null);
    handleCallback(callback, !result.ok ? toError(result) : null
      , result.ok ? [{user: username, pwd: ''}] : null);
  })
}

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
 * @param {Db~resultCallback} callback The command result callback
 * @return {null}
 */
Db.prototype.addUser = function(username, password, options, callback) {
  // Unpack the parameters
  var self = this;
  var args = Array.prototype.slice.call(arguments, 2);
  callback = args.pop();
  options = args.length ? args.shift() || {} : {};

  // Attempt to execute auth command
  _executeAuthCreateUserCommand(this, username, password, options, function(err, r) {
    // We need to perform the backward compatible insert operation
    if(err && err.code == -5000) {        
      var finalOptions = writeConcern(shallowClone(options), self, options);
      // Use node md5 generator
      var md5 = crypto.createHash('md5');
      // Generate keys used for authentication
      md5.update(username + ":mongo:" + password);
      var userPassword = md5.digest('hex');
      
      // If we have another db set
      var db = options.dbName ? self.db(options.dbName) : self;

      // Fetch a user collection
      var collection = db.collection(Db.SYSTEM_USER_COLLECTION);
      
      // Check if we are inserting the first user
      collection.count({}, function(err, count) {
        // We got an error (f.ex not authorized)
        if(err != null) return handleCallback(callback, err, null);
        // Check if the user exists and update i
        collection.find({user: username}, {dbName: options['dbName']}).toArray(function(err, documents) {
          // We got an error (f.ex not authorized)
          if(err != null) return handleCallback(callback, err, null);
          // Add command keys
          finalOptions.upsert = true;

          // We have a user, let's update the password or upsert if not
          collection.update({user: username},{$set: {user: username, pwd: userPassword}}, finalOptions, function(err, results, full) {
            if(count == 0 && err) return handleCallback(callback, null, [{user:username, pwd:userPassword}]);
            if(err) return handleCallback(callback, err, null)
            handleCallback(callback, null, [{user:username, pwd:userPassword}]);
          });
        });
      });

      return;
    }

    if(err) return handleCallback(callback, err);
    handleCallback(callback, err, r);
  });
};

var _executeAuthRemoveUserCommand = function(self, username, options, callback) {
  if(typeof options == 'function') callback = options, options = {};
  // Get the error options
  var commandOptions = {writeCommand:true};
  if(options['dbName']) commandOptions.dbName = options['dbName'];

  // Get additional values
  var maxTimeMS = typeof options.maxTimeMS == 'number' ? options.maxTimeMS : null;

  // Add maxTimeMS to options if set
  if(maxTimeMS != null) commandOptions.maxTimeMS = maxTimeMS;

  // Build the command to execute
  var command = {
    dropUser: username
  }

  // Apply write concern to command
  command = writeConcern(command, self, options);

  // Force write using primary
  commandOptions.readPreference = CoreReadPreference.primary;

  // Execute the command
  self.command(command, commandOptions, function(err, result) {
    if(err && !err.ok && err.code == undefined) return handleCallback(callback, {code: -5000});
    if(err) return handleCallback(callback, err, null);
    handleCallback(callback, null, result.ok ? true : false);
  })
}

/**
 * Remove a user from a database
 * @method
 * @param {string} username The username.
 * @param {object} [options=null] Optional settings.
 * @param {(number|string)} [options.w=null] The write concern.
 * @param {number} [options.wtimeout=null] The write concern timeout.
 * @param {boolean} [options.j=false] Specify a journal write concern.
 * @param {Db~resultCallback} callback The command result callback
 * @return {null}
 */
Db.prototype.removeUser = function(username, options, callback) {
  // Unpack the parameters
  var self = this;
  var args = Array.prototype.slice.call(arguments, 1);
  callback = args.pop();
  options = args.length ? args.shift() || {} : {};

  // Attempt to execute command
  _executeAuthRemoveUserCommand(this, username, options, function(err, result) {
    if(err && err.code == -5000) {        
      var finalOptions = writeConcern(shallowClone(options), self, options);
      // If we have another db set
      var db = options.dbName ? self.db(options.dbName) : self;

      // Fetch a user collection
      var collection = db.collection(Db.SYSTEM_USER_COLLECTION);

      // Locate the user
      collection.findOne({user: username}, {}, function(err, user) {
        if(user == null) return handleCallback(callback, err, false);
        collection.remove({user: username}, finalOptions, function(err, result) {
          handleCallback(callback, err, true);
        });
      });
    
      return;
    }

    if(err) return handleCallback(callback, err);
    handleCallback(callback, err, result);      
  });
};

/**
 * Authenticate a user against the server.
 * @method
 * @param {string} username The username.
 * @param {string} [password] The password.
 * @param {object} [options=null] Optional settings.
 * @param {string} [options.authMechanism=MONGODB-CR] The authentication mechanism to use, GSSAPI, MONGODB-CR, MONGODB-X509, PLAIN
 * @param {Db~resultCallback} callback The command result callback
 * @return {null}
 */
Db.prototype.authenticate = function(username, password, options, callback) {
  if(typeof options == 'function') callback = options, options = {};
  var self = this;
  // Set default mechanism
  if(!options.authMechanism) {
    options.authMechanism = 'DEFAULT';
  } else if(options.authMechanism != 'GSSAPI' 
    && options.authMechanism != 'MONGODB-CR'
    && options.authMechanism != 'MONGODB-X509'
    && options.authMechanism != 'SCRAM-SHA-1'
    && options.authMechanism != 'PLAIN') {
      return handleCallback(callback, new MongoError("only GSSAPI, PLAIN, MONGODB-X509, SCRAM-SHA-1 or MONGODB-CR is supported by authMechanism"));
  }

  // the default db to authenticate against is 'this'
  // if authententicate is called from a retry context, it may be another one, like admin
  var authdb = options.authdb ? options.authdb : options.dbName;
  authdb = options.authSource ? options.authSource : authdb;
  authdb = authdb ? authdb : this.databaseName; 

  // Callback
  var _callback = function(err, result) {
    if(self.listeners('authenticated').length > 0) {
      self.emit('authenticated', err, result);
    }

    // Return to caller
    handleCallback(callback, err, result);
  }

  // authMechanism
  var authMechanism = options.authMechanism || '';
  authMechanism = authMechanism.toUpperCase();

  // If classic auth delegate to auth command
  if(authMechanism == 'MONGODB-CR') {
    this.s.topology.auth('mongocr', authdb, username, password, function(err, result) {
      if(err) return handleCallback(callback, err, false);
      _callback(null, true);
    });
  } else if(authMechanism == 'PLAIN') {
    this.s.topology.auth('plain', authdb, username, password, function(err, result) {
      if(err) return handleCallback(callback, err, false);
      _callback(null, true);
    });
  } else if(authMechanism == 'MONGODB-X509') {
    this.s.topology.auth('x509', authdb, username, password, function(err, result) {
      if(err) return handleCallback(callback, err, false);
      _callback(null, true);
    });
  } else if(authMechanism == 'SCRAM-SHA-1') {
    this.s.topology.auth('scram-sha-1', authdb, username, password, function(err, result) {
      if(err) return handleCallback(callback, err, false);
      _callback(null, true);
    });
  } else if(authMechanism == 'GSSAPI') {
    if(process.platform == 'win32') {
      this.s.topology.auth('sspi', authdb, username, password, options, function(err, result) {
        if(err) return handleCallback(callback, err, false);
        _callback(null, true);
      });
    } else {
      this.s.topology.auth('gssapi', authdb, username, password, options, function(err, result) {
        if(err) return handleCallback(callback, err, false);
        _callback(null, true);
      });
    }
  } else if(authMechanism == 'DEFAULT') {
    this.s.topology.auth('default', authdb, username, password, function(err, result) {
      if(err) return handleCallback(callback, err, false);
      _callback(null, true);
    });      
  } else {
    handleCallback(callback, new MongoError(f("authentication mechanism %s not supported", options.authMechanism), false));
  }
};

/**
 * Logout user from server, fire off on all connections and remove all auth info
 * @method
 * @param {object} [options=null] Optional settings.
 * @param {string} [options.dbName=null] Logout against different database than current.
 * @param {Db~resultCallback} callback The command result callback
 * @return {null}
 */
Db.prototype.logout = function(options, callback) {    
  var args = Array.prototype.slice.call(arguments, 0);
  callback = args.pop();
  options = args.length ? args.shift() || {} : {};

  // logout command
  var cmd = {'logout':1};
  
  // Add onAll to login to ensure all connection are logged out
  options.onAll = true;

  // We authenticated against a different db use that
  if(this.s.authSource) options.dbName = this.s.authSource;

  // Execute the command
  this.command(cmd, options, function(err, result) {
    if(err) return handleCallback(callback, err, false);
    handleCallback(callback, null, true)
  });
}

// Figure out the read preference
var getReadPreference = function(options, db) {
  if(options.readPreference) return options;
  if(db.readPreference) options.readPreference = db.readPreference;
  return options;
}

/**
 * Retrieves this collections index info.
 * @method
 * @param {string} name The name of the collection.
 * @param {object} [options=null] Optional settings.
 * @param {boolean} [options.full=false] Returns the full raw index information.
 * @param {(ReadPreference|string)} [options.readPreference=null] The preferred read preference (ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST).
 * @param {Db~resultCallback} callback The command result callback
 * @return {null}
 */
Db.prototype.indexInformation = function(name, options, callback) {
  if(typeof callback === 'undefined') {
    if(typeof options === 'undefined') {
      callback = name;
      name = null;
    } else {
      callback = options;
    }
    options = {};
  }

  // If we specified full information
  var full = options['full'] == null ? false : options['full'];
  var self = this;

  // Process all the results from the index command and collection
  var processResults = function(indexes) {
    // Contains all the information
    var info = {};
    // Process all the indexes
    for(var i = 0; i < indexes.length; i++) {
      var index = indexes[i];
      // Let's unpack the object
      info[index.name] = [];
      for(var name in index.key) {
        info[index.name].push([name, index.key[name]]);
      }
    }

    return info;
  }

  // Fallback to pre 2.8 getting the index information
  var fallbackListIndexes = function() {
    // Build selector for the indexes
    var selector = name != null ? {ns: (self.s.databaseName + "." + name)} : {};

    // Get read preference if we set one
    var readPreference = ReadPreference.PRIMARY;

    // Iterate through all the fields of the index
    var collection = self.collection(Db.SYSTEM_INDEX_COLLECTION);
    // Perform the find for the collection
    collection.find(selector).setReadPreference(readPreference).toArray(function(err, indexes) {
      if(err != null) return handleCallback(callback, err, null);
      // if full defined just return all the indexes directly
      if(full) return handleCallback(callback, null, indexes);
      // Return all the indexes
      handleCallback(callback, null, processResults(indexes));
    });
  }

  // Attempt to execute the listIndexes command
  self.command({listIndexes: name}, function(err, result) {
    if(err) return fallbackListIndexes();
    // if full defined just return all the indexes directly
    if(full) return handleCallback(callback, null, result.indexes);
    // Return all the indexes
    handleCallback(callback, null, processResults(result.indexes));
  });
};

var createCreateIndexCommand = function(db, name, fieldOrSpec, options) {
  var indexParameters = parseIndexOptions(fieldOrSpec);
  var fieldHash = indexParameters.fieldHash;
  var keys = indexParameters.keys;

  // Generate the index name
  var indexName = typeof options.name == 'string' ? options.name : indexParameters.name;
  var selector = {
    'ns': db.databaseName + "." + name, 'key': fieldHash, 'name': indexName
  }

  // Ensure we have a correct finalUnique
  var finalUnique = options == null || 'object' === typeof options ? false : options;
  // Set up options
  options = options == null || typeof options == 'boolean' ? {} : options;

  // Add all the options
  var keysToOmit = Object.keys(selector);
  for(var optionName in options) {
    if(keysToOmit.indexOf(optionName) == -1) {
      selector[optionName] = options[optionName];
    }
  }

  if(selector['unique'] == null) selector['unique'] = finalUnique;

  // Remove any write concern operations
  var removeKeys = ['w', 'wtimeout', 'j', 'fsync', 'readPreference'];
  for(var i = 0; i < removeKeys.length; i++) {
    delete selector[removeKeys[i]];
  }

  // Return the command creation selector
  return selector;
}

var createIndexUsingCreateIndexes = function(self, name, fieldOrSpec, options, callback) {
  // Build the index
  var indexParameters = parseIndexOptions(fieldOrSpec);
  // Generate the index name
  var indexName = typeof options.name == 'string' ? options.name : indexParameters.name;
  // Set up the index
  var indexes = [{ name: indexName, key: indexParameters.fieldHash }];
  // merge all the options
  var keysToOmit = Object.keys(indexes[0]);
  for(var optionName in options) {
    if(keysToOmit.indexOf(optionName) == -1) {
      indexes[0][optionName] = options[optionName];
    }

    // Remove any write concern operations
    var removeKeys = ['w', 'wtimeout', 'j', 'fsync', 'readPreference'];
    for(var i = 0; i < removeKeys.length; i++) {
      delete indexes[0][removeKeys[i]];
    }
  }

  // Create command
  var cmd = {createIndexes: name, indexes: indexes};

  // Apply write concern to command
  cmd = writeConcern(cmd, self, options);

  // Build the command
  self.command(cmd, options, function(err, result) {
    if(err) return handleCallback(callback, err, null);
    if(result.ok == 0) return handleCallback(callback, toError(result), null);
    // Return the indexName for backward compatibility
    handleCallback(callback, null, indexName);
  });
}

// Validate the database name
var validateDatabaseName = function(databaseName) {
  if(typeof databaseName !== 'string') throw new MongoError("database name must be a string");
  if(databaseName.length === 0) throw new MongoError("database name cannot be the empty string");
  if(databaseName == '$external') return;

  var invalidChars = [" ", ".", "$", "/", "\\"];
  for(var i = 0; i < invalidChars.length; i++) {
    if(databaseName.indexOf(invalidChars[i]) != -1) throw new MongoError("database names cannot contain the character '" + invalidChars[i] + "'");
  }
}

// Get write concern
var writeConcern = function(target, db, options) {
  if(options.w != null || options.j != null || options.fsync != null) {
    var opts = {};
    if(options.w) opts.w = options.w;
    if(options.wtimeout) opts.wtimeout = options.wtimeout;
    if(options.j) opts.j = options.j;
    if(options.fsync) opts.fsync = options.fsync;
    target.writeConcern = opts;
  } else if(db.writeConcern.w != null || db.writeConcern.j != null || db.writeConcern.fsync != null) {
    target.writeConcern = db.writeConcern;
  }

  return target
}

// Add listeners to topology
var createListener = function(self, e, object) {
  var listener = function(err) {
    if(e != 'error') {
      object.emit(e, err, self);
    }
  }
  return listener;
}

/**
 * Db close event
 *
 * @event Db#close
 * @type {object}
 */

/**
 * Db authenticated event
 *
 * @event Db#authenticated
 * @type {object}
 */

/**
 * Db reconnect event
 *
 * @event Db#reconnect
 * @type {object}
 */

/**
 * Db error event
 *
 * @event Db#error
 * @type {MongoError}
 */

/**
 * Db timeout event
 *
 * @event Db#timeout
 * @type {object}
 */

/**
 * Db parseError event
 *
 * @event Db#parseError
 * @type {object}
 */

/**
 * Db fullsetup event, emitted when all servers in the topology have been connected to.
 *
 * @event Db#fullsetup
 * @type {Db}
 */

// Constants
Db.SYSTEM_NAMESPACE_COLLECTION = "system.namespaces";
Db.SYSTEM_INDEX_COLLECTION = "system.indexes";
Db.SYSTEM_PROFILE_COLLECTION = "system.profile";
Db.SYSTEM_USER_COLLECTION = "system.users";
Db.SYSTEM_COMMAND_COLLECTION = "$cmd";
Db.SYSTEM_JS_COLLECTION = "system.js";

module.exports = Db;
