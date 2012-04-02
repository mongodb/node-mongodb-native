/**
 * Module dependencies.
 * @ignore
 */
var QueryCommand = require('./commands/query_command').QueryCommand,
  DbCommand = require('./commands/db_command').DbCommand,
  MongoReply = require('./responses/mongo_reply').MongoReply,
  Admin = require('./admin').Admin,
  Collection = require('./collection').Collection,
  Server = require('./connection/server').Server,
  ReplSet = require('./connection/repl_set').ReplSet,
  Cursor = require('./cursor').Cursor,
  EventEmitter = require('events').EventEmitter,
  inherits = require('util').inherits,
  crypto = require('crypto');

/**
 * Internal class for callback storage 
 * @ignore
 */
var CallbackStore = function() {
  // Make class an event emitter
  EventEmitter.call(this);
  // Add a info about call variable
  this._notReplied = {};
}

/**
 * @ignore
 */
inherits(CallbackStore, EventEmitter);

/**
 * Create a new Db instance.
 *
 * Options
 *  - **strict** {true | {w:n, wtimeout:n} | {fsync:true}, default:false}, execute insert with a getLastError command returning the result of the insert command.
 *  - **native_parser** {Boolean, default:false}, use c++ bson parser.
 *  - **forceServerObjectId** {Boolean, default:false}, force server to create _id fields instead of client.
 *  - **pkFactory** {Object}, object overriding the basic ObjectID primary key generation.
 *  - **slaveOk** {Boolean, default:false}, allow reads from secondaries.
 *  - **serializeFunctions** {Boolean, default:false}, serialize functions.
 *  - **raw** {Boolean, default:false}, peform operations using raw bson buffers.
 *  - **recordQueryStats** {Boolean, default:false}, record query statistics during execution.
 *  - **reaper** {Boolean, default:false}, enables the reaper, timing out calls that never return.
 *  - **reaperInterval** {Number, default:10000}, number of miliseconds between reaper wakups.
 *  - **reaperTimeout** {Number, default:30000}, the amount of time before a callback times out.
 *  - **retryMiliSeconds** {Number, default:5000}, number of miliseconds between retries.
 *  - **numberOfRetries** {Number, default:5}, number of retries off connection.
 *
 * @class Represents a Collection
 * @param {String} databaseName name of the database.
 * @param {Object} serverConfig server config object.
 * @param {Object} [options] additional options for the collection.
 */
function Db(databaseName, serverConfig, options) {

  if(!(this instanceof Db)) return new Db(databaseName, serverConfig, options);
  
  EventEmitter.call(this);
  this.databaseName = databaseName;
  this.serverConfig = serverConfig;  
  this.options = options == null ? {} : options;  
  // State to check against if the user force closed db
  this._applicationClosed = false;
  // Fetch the override flag if any
  var overrideUsedFlag = this.options['override_used_flag'] == null ? false : this.options['override_used_flag'];  
  // Verify that nobody is using this config
  if(!overrideUsedFlag && typeof this.serverConfig == 'object' && this.serverConfig._isUsed()) {
    throw new Error("A Server or ReplSet instance cannot be shared across multiple Db instances");
  } else if(!overrideUsedFlag && typeof this.serverConfig == 'object'){
    // Set being used
    this.serverConfig._used = true;    
  }
  
  // Ensure we have a valid db name
  validateDatabaseName(databaseName);
  
  // Contains all the connections for the db
  try {
    this.native_parser = this.options.native_parser;
    // The bson lib
    var bsonLib = this.bsonLib = this.options.native_parser ? require('bson').BSONNative : new require('bson').BSONPure;
    // Fetch the serializer object
    var BSON = bsonLib.BSON;
    // Create a new instance
    this.bson = new BSON([bsonLib.Long, bsonLib.ObjectID, bsonLib.Binary, bsonLib.Code, bsonLib.DBRef, bsonLib.Symbol, bsonLib.Double, bsonLib.Timestamp, bsonLib.MaxKey, bsonLib.MinKey]);
    // Backward compatibility to access types
    this.bson_deserializer = bsonLib;
    this.bson_serializer = bsonLib;
  } catch (err) {
    // If we tried to instantiate the native driver
    var msg = "Native bson parser not compiled, please compile "
            + "or avoid using native_parser=true";
    throw Error(err);
  }

  // Internal state of the server
  this._state = 'disconnected';
  
  this.pkFactory = this.options.pk == null ? bsonLib.ObjectID : this.options.pk;  
  this.forceServerObjectId = this.options.forceServerObjectId != null ? this.options.forceServerObjectId : false;
  // Added strict
  this.strict = this.options.strict == null ? false : this.options.strict;
  this.notReplied ={};
  this.isInitializing = true;
  this.auths = [];
  this.openCalled = false;
  
  // Command queue, keeps a list of incoming commands that need to be executed once the connection is up
  this.commands = [];  
  
  // Contains all the callbacks
  this._callBackStore = new CallbackStore();
  
  // Set up logger
  this.logger = this.options.logger != null 
    && (typeof this.options.logger.debug == 'function') 
    && (typeof this.options.logger.error == 'function') 
    && (typeof this.options.logger.log == 'function') 
      ? this.options.logger : {error:function(message, object) {}, log:function(message, object) {}, debug:function(message, object) {}};
  // Allow slaveOk
  this.slaveOk = this.options["slave_ok"] == null ? false : this.options["slave_ok"];
  
  var self = this;
  // Associate the logger with the server config
  this.serverConfig.logger = this.logger;  
  this.tag = new Date().getTime();  
  // Just keeps list of events we allow
  this.eventHandlers = {error:[], parseError:[], poolReady:[], message:[], close:[]};

  // Controls serialization options
  this.serializeFunctions = this.options.serializeFunctions != null ? this.options.serializeFunctions : false;
  
  // Raw mode
  this.raw = this.options.raw != null ? this.options.raw : false;

  // Record query stats
  this.recordQueryStats = this.options.recordQueryStats != null ? this.options.recordQueryStats : false;
  
  // If we have server stats let's make sure the driver objects have it enabled
  if(this.recordQueryStats == true) {
    this.serverConfig.enableRecordQueryStats(true);
  }
  
  // Reaper enable setting
  this.reaperEnabled = this.options.reaper != null ? this.options.reaper : false;
  this._lastReaperTimestamp = new Date().getTime();
  
  // Retry information
  this.retryMiliSeconds = this.options.retryMiliSeconds != null ? this.options.retryMiliSeconds : 5000;
  this.numberOfRetries = this.options.numberOfRetries != null ? this.options.numberOfRetries : 5;
  
  // Reaper information
  this.reaperInterval = this.options.reaperInterval != null ? this.options.reaperInterval : 10000;
  this.reaperTimeout = this.options.reaperTimeout != null ? this.options.reaperTimeout : 30000;

  // get self
  var self = this;
  // State of the db connection
  Object.defineProperty(this, "state", { enumerable: true
    , get: function () {
        return this.serverConfig._serverState;
      }
  });  
};

/**
 * The reaper cleans up any callbacks that have not returned inside the space set by
 * the parameter reaperTimeout, it will only attempt to reap if the time since last reap
 * is bigger or equal to the reaperInterval value
 * @ignore
 */
var reaper = function(dbInstance, reaperInterval, reaperTimeout) {
  // Get current time, compare to reaper interval
  var currentTime = new Date().getTime();
  // Now calculate current time difference to check if it's time to reap
  if((currentTime - dbInstance._lastReaperTimestamp) >= reaperInterval) {
    // Save current timestamp for next reaper iteration
    dbInstance._lastReaperTimestamp = currentTime;      
    // Get all non-replied to messages
    var keys = Object.keys(dbInstance._callBackStore._notReplied);
    // Iterate over all callbacks
    for(var i = 0; i < keys.length; i++) {
      // Fetch the current key
      var key = keys[i];
      // Get info element
      var info = dbInstance._callBackStore._notReplied[key];
      // If it's timed out let's remove the callback and return an error
      if((currentTime - info.start) > reaperTimeout) {
        // Cleanup
        delete dbInstance._callBackStore._notReplied[key];
        // Perform callback in next Tick
        process.nextTick(function() {
          dbInstance._callBackStore.emit(key, new Error("operation timed out"), null);                        
        });
      }
    }
    // Return reaping was done
    return true;
  } else {
    // No reaping done
    return false;
  }
}

/**
 * @ignore
 */
function validateDatabaseName(databaseName) {
  if(typeof databaseName !== 'string') throw new Error("database name must be a string");
  if(databaseName.length === 0) throw new Error("database name cannot be the empty string");
  
  var invalidChars = [" ", ".", "$", "/", "\\"];
  for(var i = 0; i < invalidChars.length; i++) {
    if(databaseName.indexOf(invalidChars[i]) != -1) throw new Error("database names cannot contain the character '" + invalidChars[i] + "'");
  }
}

/**
 * @ignore
 */
inherits(Db, EventEmitter);

/**
 * Initialize the database connection.
 *
 * @param {Function} callback returns index information.
 * @return {null}
 * @api public
 */
Db.prototype.open = function(callback) {
  var self = this; 
  
  // Check that the user has not called this twice
  if(this.openCalled) {
    // Close db
    this.close();
    // Throw error
    throw new Error("db object already connecting, open cannot be called multiple times");
  }
  
  // Set that db has been opened
  this.openCalled = true;
       
  // Set the status of the server
  self._state = 'connecting';
  // Set up connections
  if(self.serverConfig instanceof Server || self.serverConfig instanceof ReplSet) {
    self.serverConfig.connect(self, {firstCall: true}, function(err, result) {
      if(err != null) {
        // Return error from connection
        return callback(err, null);            
      }
      // Set the status of the server
      self._state = 'connected';      
      // Callback
      return callback(null, self);
    });
  } else {
    return callback(Error("Server parameter must be of type Server or ReplSet"), null);
  }
};

/**
 * Create a new Db instance sharing the current socket connections.
 *
 * @param {String} dbName the name of the database we want to use.
 * @return {Db} a db instance using the new database.
 * @api public
 */
Db.prototype.db = function(dbName) {
  // Copy the options and add out internal override of the not shared flag
  var options = {};
  for(var key in this.options) {
    options[key] = this.options[key];
  }
  // Add override flag
  options['override_used_flag'] = true;
  // Create a new db instance
  var newDbInstance = new Db(dbName, this.serverConfig, options);
  // Add the instance to the list of approved db instances
  var allServerInstances = this.serverConfig.allServerInstances();
  // Add ourselves to all server callback instances
  for(var i = 0; i < allServerInstances.length; i++) {
    var server = allServerInstances[i];
    server.dbInstances.push(newDbInstance);
  }  
  // Return new db object
  return newDbInstance;
}

/**
 * Close the current db connection, including all the child db instances. Emits close event if no callback is provided.
 *
 * @param {Boolean} [forceClose] connection can never be reused.
 * @param {Function} [callback] returns the results.
 * @return {null}
 * @api public
 */
Db.prototype.close = function(forceClose, callback) {  
  // Unpack calls
  var args = Array.prototype.slice.call(arguments, 0);
  callback = args.pop();
  // Ensure we force close all connections
  this._applicationClosed = args.length ? args.shift() : false;
  // Remove all listeners and close the connection
  this.serverConfig.close(callback);
  // Emit the close event
  if(typeof callback !== 'function') this.emit("close");
  
  // Emit close event across all db instances sharing the sockets
  var allServerInstances = this.serverConfig.allServerInstances();
  // Fetch the first server instance
  if(Array.isArray(allServerInstances) && allServerInstances.length > 0) {
    var server = allServerInstances[0];  
    // For all db instances signal all db instances
    if(Array.isArray(server.dbInstances) && server.dbInstances.length > 1) {
  	  for(var i = 0; i < server.dbInstances.length; i++) {
        var dbInstance = server.dbInstances[i];
        // Check if it's our current db instance and skip if it is
        if(dbInstance.databaseName !== this.databaseName && dbInstance.tag !== this.tag) {
          server.dbInstances[i].emit("close");
        }        
      }
    }
  }
  
  // Remove all listeners
  this.removeAllEventListeners();
  // You can reuse the db as everything is shut down
  this.openCalled = false;
};

/**
 * Access the Admin database
 *
 * @param {Function} [callback] returns the results.
 * @return {Admin} the admin db object.
 * @api public
 */
Db.prototype.admin = function(callback) {
  if(callback == null) return new Admin(this);
  callback(null, new Admin(this));
};

/**
 * Returns a cursor to all the collection information.
 *
 * @param {String} [collectionName] the collection name we wish to retrieve the information from.
 * @param {Function} callback returns option results.
 * @return {null}
 * @api public
 */
Db.prototype.collectionsInfo = function(collectionName, callback) {
  if(callback == null && typeof collectionName == 'function') { callback = collectionName; collectionName = null; }
  // Create selector
  var selector = {};
  // If we are limiting the access to a specific collection name
  if(collectionName != null) selector.name = this.databaseName + "." + collectionName;

  // Return Cursor
  // callback for backward compatibility
  if(callback) {
    callback(null, new Cursor(this, new Collection(this, DbCommand.SYSTEM_NAMESPACE_COLLECTION), selector));
  } else {
    return new Cursor(this, new Collection(this, DbCommand.SYSTEM_NAMESPACE_COLLECTION), selector);
  }    
};

/**
 * Get the list of all collection names for the specified db
 * 
 * @param {String} [collectionName] the collection name we wish to filter by.
 * @param {Function} callback returns option results.
 * @return {null}
 * @api public
 */
Db.prototype.collectionNames = function(collectionName, callback) {
  if(callback == null && typeof collectionName == 'function') { callback = collectionName; collectionName = null; }
  var self = this;
  // Let's make our own callback to reuse the existing collections info method
  self.collectionsInfo(collectionName, function(err, cursor) {
    if(err != null) return callback(err, null);
    
    cursor.toArray(function(err, documents) {
      if(err != null) return callback(err, null);

      // List of result documents that have been filtered
      var filtered_documents = [];
      // Remove any collections that are not part of the db or a system db signed with $
      documents.forEach(function(document) {
        if(!(document.name.indexOf(self.databaseName) == -1 || document.name.indexOf('$') != -1))
          filtered_documents.push(document);
      });
      // Return filtered items
      callback(null, filtered_documents);
    });
  });
};

/**
 * Fetch a specific collection (containing the actual collection information)
 * 
 * Options
 *  - **safe** {true | {w:n, wtimeout:n} | {fsync:true}, default:false}, executes with a getLastError command returning the results of the command on MongoDB.
 *  - **slaveOk** {Boolean, default:false}, Allow reads from secondaries.
 *  - **serializeFunctions** {Boolean, default:false}, serialize functions on the document.
 *  - **raw** {Boolean, default:false}, perform all operations using raw bson objects.
 *  - **pkFactory** {Object}, object overriding the basic ObjectID primary key generation.
 *
 * @param {String} collectionName the collection name we wish to access.
 * @param {Object} [options] returns option results.
 * @param {Function} [callback] returns the results.
 * @return {null}
 * @api public
 */
Db.prototype.collection = function(collectionName, options, callback) {
  var self = this;
  if(typeof options === "function") { callback = options; options = {}; }
  // Execute safe
  if(options && options.safe || this.strict) {
    self.collectionNames(collectionName, function(err, collections) {
      if(err != null) return callback(err, null);

      if(collections.length == 0) {
        return callback(new Error("Collection " + collectionName + " does not exist. Currently in strict mode."), null);
      } else {
        try {
          var collection = new Collection(self, collectionName, self.pkFactory, options);
        } catch(err) {
          return callback(err, null);
        }
        return callback(null, collection);
      }
    });
  } else {
    try {
      var collection = new Collection(self, collectionName, self.pkFactory, options);
    } catch(err) {
      if(callback == null) {
        throw err;
      } else {
        return callback(err, null);
      }
    }
    
    // If we have no callback return collection object
    return callback == null ? collection : callback(null, collection);
  }
};

/**
 * Fetch all collections for the current db.
 *
 * @param {Function} callback returns the results.
 * @return {null}
 * @api public
 */
Db.prototype.collections = function(callback) {
  var self = this;
  // Let's get the collection names
  self.collectionNames(function(err, documents) {
    if(err != null) return callback(err, null);
    var collections = [];
    documents.forEach(function(document) {
      collections.push(new Collection(self, document.name.replace(self.databaseName + ".", ''), self.pkFactory));
    });
    // Return the collection objects
    callback(null, collections);
  });
};

/**
 * Evaluate javascript on the server
 *
 * Options
 *  - **nolock** {Boolean, default:false}, Tell MongoDB not to block on the evaulation of the javascript.
 *
 * @param {Code} code javascript to execute on server.
 * @param {Object|Array} [parameters] the parameters for the call.
 * @param {Object} [options] the options
 * @param {Function} callback returns the results.
 * @return {null}
 * @api public
 */
Db.prototype.eval = function(code, parameters, options, callback) {
  // Unpack calls
  var args = Array.prototype.slice.call(arguments, 1);
  callback = args.pop();
  parameters = args.length ? args.shift() : parameters;
  options = args.length ? args.shift() : {};

  var finalCode = code;
  var finalParameters = [];
  // If not a code object translate to one
  if(!(finalCode instanceof this.bsonLib.Code)) {
    finalCode = new this.bsonLib.Code(finalCode);
  }

  // Ensure the parameters are correct
  if(parameters != null && parameters.constructor != Array && typeof parameters !== 'function') {
    finalParameters = [parameters];
  } else if(parameters != null && parameters.constructor == Array && typeof parameters !== 'function') {
    finalParameters = parameters;
  }
  // Create execution selector
  var selector = {'$eval':finalCode, 'args':finalParameters};
  // Check if the nolock parameter is passed in
  if(options['nolock']) {
    selector['nolock'] = options['nolock'];
  }

  // Iterate through all the fields of the index
  new Cursor(this, new Collection(this, DbCommand.SYSTEM_COMMAND_COLLECTION), selector, options, 0, -1).nextObject(function(err, result) {
    if(err != null) return callback(err, null);

    if(result.ok == 1) {
      callback(null, result.retval);
    } else {
      callback(new Error("eval failed: " + result.errmsg), null); return;
    }
  });
};

/**
 * Dereference a dbref, against a db
 *
 * @param {DBRef} dbRef db reference object we wish to resolve.
 * @param {Function} callback returns the results.
 * @return {null}
 * @api public
 */
Db.prototype.dereference = function(dbRef, callback) {
  var db = this;
  // If we have a db reference then let's get the db first
  if(dbRef.db != null) db = this.db(dbRef.db);  
  // Fetch the collection and find the reference
  db.collection(dbRef.namespace, function(err, collection) {
    if(err != null) return callback(err, null);

    collection.findOne({'_id':dbRef.oid}, function(err, result) {
      callback(err, result);
    });
  });    
};

/**
 * Logout user from server, fire off on all connections and remove all auth info
 *
 * @param {Function} callback returns the results.
 * @return {null}
 * @api public
 */
Db.prototype.logout = function(callback) {
  var self = this;
  // Let's generate the logout command object
  var logoutCommand = DbCommand.logoutCommand(self, {logout:1});
  self._executeQueryCommand(logoutCommand, {onAll:true}, function(err, result) {      
    // Reset auth
    self.auths = [];    
    // Handle any errors
    if(err == null && result.documents[0].ok == 1) {
      callback(null, true);
    } else {
      err != null ? callback(err, false) : callback(new Error(result.documents[0].errmsg), false);
    }            
  });
}

/**
 * Authenticate a user against the server.
 *
 * @param {String} username username.
 * @param {String} password password.
 * @param {Function} callback returns the results.
 * @return {null}
 * @api public
 */
Db.prototype.authenticate = function(username, password, callback) {
  var self = this;
  
  // Push the new auth if we have no previous record
  self.auths = [{'username':username, 'password':password}];
  // Get the amount of connections in the pool to ensure we have authenticated all comments
  var numberOfConnections = this.serverConfig.allRawConnections().length;  
  var errorObject = null;  
  
  // Execute all four
  this._executeQueryCommand(DbCommand.createGetNonceCommand(self), {onAll:true}, function(err, result, connection) {
    // Execute on all the connections
    if(err == null) {
      // Nonce used to make authentication request with md5 hash
      var nonce = result.documents[0].nonce;
      // Execute command
      self._executeQueryCommand(DbCommand.createAuthenticationCommand(self, username, password, nonce), {connection:connection}, function(err, result) {
        // Ensure we save any error
        if(err) {
          errorObject = err;
        } else if(result.documents[0].err != null || result.documents[0].errmsg != null){
          errorObject = self.wrap(result.documents[0]);
        }
        
        // Count down
        numberOfConnections = numberOfConnections - 1;
        
        // If we are done with the callbacks return
        if(numberOfConnections <= 0) {
          if(errorObject == null && result.documents[0].ok == 1) {
            callback(errorObject, true);           
          } else {
            callback(errorObject, false);
          }
        }
      });
    }    
  });
};

/**
 * Add a user to the database.
 *
 * Options
 *  - **safe** {true | {w:n, wtimeout:n} | {fsync:true}, default:false}, executes with a getLastError command returning the results of the command on MongoDB.
 *
 * @param {String} username username.
 * @param {String} password password.
 * @param {Object} [options] additional options during update.
 * @param {Function} callback returns the results.
 * @return {null}
 * @api public
 */
Db.prototype.addUser = function(username, password, options, callback) {
  var self = this;
  var args = Array.prototype.slice.call(arguments, 2);
  callback = args.pop();
  options = args.length ? args.shift() : {};

  // Figure out the safe mode settings
  var safe = self.strict != null && self.strict == false ? true : self.strict;
  // Override with options passed in if applicable
  safe = options != null && options['safe'] != null ? options['safe'] : safe;
  // Ensure it's at least set to safe
  safe = safe == null ? true : safe;

  // Use node md5 generator
  var md5 = crypto.createHash('md5');
  // Generate keys used for authentication
  md5.update(username + ":mongo:" + password);
  var userPassword = md5.digest('hex');
  // Fetch a user collection
  this.collection(DbCommand.SYSTEM_USER_COLLECTION, function(err, collection) {
    collection.find({user: username}).toArray(function(err, documents) {
      // We got an error (f.ex not authorized)
      if(err != null) return callback(err, null);
      // We have a user, let's update the password
      if(documents.length > 0) {
        collection.update({user: username},{user: username, pwd: userPassword}, {safe:safe}, function(err, results) {
          callback(err, documents);
        });
      } else {
        collection.insert({user: username, pwd: userPassword}, {safe:safe}, function(err, documents) {
          callback(err, documents);
        });            
      }      
    });
  });
};

/**
 * Remove a user from a database
 *
 * Options
 *  - **safe** {true | {w:n, wtimeout:n} | {fsync:true}, default:false}, executes with a getLastError command returning the results of the command on MongoDB.
 *
 * @param {String} username username.
 * @param {Object} [options] additional options during update.
 * @param {Function} callback returns the results.
 * @return {null}
 * @api public
 */
Db.prototype.removeUser = function(username, options, callback) {
  var self = this;
  var args = Array.prototype.slice.call(arguments, 1);
  callback = args.pop();
  options = args.length ? args.shift() : {};

  // Figure out the safe mode settings
  var safe = self.strict != null && self.strict == false ? true : self.strict;
  // Override with options passed in if applicable
  safe = options != null && options['safe'] != null ? options['safe'] : safe;
  // Ensure it's at least set to safe
  safe = safe == null ? true : safe;

  // Fetch a user collection
  this.collection(DbCommand.SYSTEM_USER_COLLECTION, function(err, collection) {
    collection.findOne({user: username}, function(err, user) {
      if(user != null) {
        collection.remove({user: username}, {safe:safe}, function(err, result) {
          callback(err, true);
        });
      } else {
        callback(err, false);
      }
    });
  });
};

/**
 * Creates a collection on a server pre-allocating space, need to create f.ex capped collections.
 * 
 * Options
 *  - **safe** {true | {w:n, wtimeout:n} | {fsync:true}, default:false}, executes with a getLastError command returning the results of the command on MongoDB.
 *  - **slaveOk** {Boolean, default:false}, Allow reads from secondaries.
 *  - **serializeFunctions** {Boolean, default:false}, serialize functions on the document.
 *  - **raw** {Boolean, default:false}, perform all operations using raw bson objects.
 *  - **pkFactory** {Object}, object overriding the basic ObjectID primary key generation.
 *  - **capped** {Boolean, default:false}, create a capped collection.
 *  - **size** {Number}, the size of the capped collection in bytes.
 *  - **max** {Number}, the maximum number of documents in the capped collection.
 *  - **autoIndexId** {Boolean, default:false}, create an index on the _id field of the document, not created automatically on capped collections.
 *
 * @param {String} collectionName the collection name we wish to access.
 * @param {Object} [options] returns option results.
 * @param {Function} callback returns the results.
 * @return {null}
 * @api public
 */
Db.prototype.createCollection = function(collectionName, options, callback) {
  var args = Array.prototype.slice.call(arguments, 1);
  callback = args.pop();
  options = args.length ? args.shift() : null;
  var self = this;
  
  // Figure out the safe mode settings
  var safe = self.strict != null && self.strict == false ? true : self.strict;
  // Override with options passed in if applicable
  safe = options != null && options['safe'] != null ? options['safe'] : safe;
  // Ensure it's at least set to safe
  safe = safe == null ? true : safe;
  
  // Check if we have the name
  this.collectionNames(collectionName, function(err, collections) {    
    if(err != null) return callback(err, null);

    var found = false;
    collections.forEach(function(collection) {
      if(collection.name == self.databaseName + "." + collectionName) found = true;
    });

    // If the collection exists either throw an exception (if db in strict mode) or return the existing collection
    if(found && ((options && options.safe) || self.strict)) {
      return callback(new Error("Collection " + collectionName + " already exists. Currently in strict mode."), null);
    } else if(found){
      try {
        var collection = new Collection(self, collectionName, self.pkFactory, options);
      } catch(err) {
        return callback(err, null);
      }
      return callback(null, collection);
    }
    
    // Create a new collection and return it
    self._executeQueryCommand(DbCommand.createCreateCollectionCommand(self, collectionName, options), {read:false, safe:safe}, function(err, result) {
      var document = result.documents[0];
      // If we have no error let's return the collection
      if(err == null && document.ok == 1) {
        try {
          var collection = new Collection(self, collectionName, self.pkFactory, options);
        } catch(err) {
          return callback(err, null);
        }
        return callback(null, collection);
      } else {
        err != null ? callback(err, null) : callback(self.wrap(document), null);
      }
    });
  });
};

/**
 * Execute a command hash against MongoDB. This lets you acess any commands not available through the api on the server.
 * 
 * @param {Object} selector the command hash to send to the server, ex: {ping:1}.
 * @param {Function} callback returns the results.
 * @return {null}
 * @api public
 */
Db.prototype.command = function(selector, callback) {
  var cursor = new Cursor(this, new Collection(this, DbCommand.SYSTEM_COMMAND_COLLECTION), selector, {}, 0, -1, null, null, null, null, QueryCommand.OPTS_NO_CURSOR_TIMEOUT);
  cursor.nextObject(callback);
};

/**
 * Drop a collection from the database, removing it permanently. New accesses will create a new collection.
 * 
 * @param {String} collectionName the name of the collection we wish to drop.
 * @param {Function} callback returns the results.
 * @return {null}
 * @api public
 */
Db.prototype.dropCollection = function(collectionName, callback) {
  var self = this;
  
  // Drop the collection
  this._executeQueryCommand(DbCommand.createDropCollectionCommand(this, collectionName), function(err, result) {
    if(err == null && result.documents[0].ok == 1) {
      if(callback != null) return callback(null, true);
    } else {
      if(callback != null) err != null ? callback(err, null) : callback(self.wrap(result.documents[0]), null);
    }
  });
};

/**
 * Rename a collection.
 * 
 * @param {String} fromCollection the name of the current collection we wish to rename.
 * @param {String} toCollection the new name of the collection.
 * @param {Function} callback returns the results.
 * @return {null}
 * @api public
 */
Db.prototype.renameCollection = function(fromCollection, toCollection, callback) {
  var self = this;
  
  // Execute the command, return the new renamed collection if successful
  this._executeQueryCommand(DbCommand.createRenameCollectionCommand(this, fromCollection, toCollection), function(err, result) {    
    if(err == null && result.documents[0].ok == 1) {
      if(callback != null) return callback(null, new Collection(self, toCollection, self.pkFactory));
    } else {
      if(callback != null) err != null ? callback(err, null) : callback(self.wrap(result.documents[0]), null);
    }
  });
};

/**
 * Return last error message for the given connection, note options can be combined.
 * 
 * Options
 *  - **fsync** {Boolean, default:false}, option forces the database to fsync all files before returning.
 *  - **j** {Boolean, default:false}, awaits the journal commit before returning, > MongoDB 2.0.
 *  - **w** {Number}, until a write operation has been replicated to N servers.
 *  - **wtimeout** {Number}, number of miliseconds to wait before timing out.
 * 
 * Connection Options
 *  - **connection** {Connection}, fire the getLastError down a specific connection.
 *
 * @param {Object} [options] returns option results.
 * @param {Object} [connectionOptions] returns option results.
 * @param {Function} callback returns the results.
 * @return {null}
 * @api public
 */
Db.prototype.lastError = function(options, connectionOptions, callback) {
  // Unpack calls
  var args = Array.prototype.slice.call(arguments, 0);
  callback = args.pop();
  options = args.length ? args.shift() : {};
  connectionOptions = args.length ? args.shift() : {};

  this._executeQueryCommand(DbCommand.createGetLastErrorCommand(options, this), connectionOptions, function(err, error) {
    callback(err, error && error.documents);
  });
};

/**
 * Legacy method calls.
 *
 * @ignore
 * @api private
 */
Db.prototype.error = Db.prototype.lastError;
Db.prototype.lastStatus = Db.prototype.lastError;

/**
 * Return all errors up to the last time db reset_error_history was called.
 * 
 * Options
 *  - **connection** {Connection}, fire the getLastError down a specific connection.
 *
 * @param {Object} [options] returns option results.
 * @param {Function} callback returns the results.
 * @return {null}
 * @api public
 */
Db.prototype.previousErrors = function(options, callback) {
  // Unpack calls
  var args = Array.prototype.slice.call(arguments, 0);
  callback = args.pop();
  options = args.length ? args.shift() : {};

  this._executeQueryCommand(DbCommand.createGetPreviousErrorsCommand(this), options, function(err, error) {
    callback(err, error.documents);
  });
};

/**
 * Runs a command on the database.
 * @ignore
 * @api private
 */
Db.prototype.executeDbCommand = function(command_hash, options, callback) {
  if(callback == null) { callback = options; options = {}; }  
  this._executeQueryCommand(DbCommand.createDbSlaveOkCommand(this, command_hash, options), options, callback);
};

/**
 * Runs a command on the database as admin.
 * @ignore
 * @api private
 */
Db.prototype.executeDbAdminCommand = function(command_hash, options, callback) {
  if(callback == null) { callback = options; options = {}; }  
  this._executeQueryCommand(DbCommand.createAdminDbCommand(this, command_hash), options, callback);
};

/**
 * Resets the error history of the mongo instance.
 * 
 * Options
 *  - **connection** {Connection}, fire the getLastError down a specific connection.
 *
 * @param {Object} [options] returns option results.
 * @param {Function} callback returns the results.
 * @return {null}
 * @api public
 */
Db.prototype.resetErrorHistory = function(options, callback) {
  // Unpack calls
  var args = Array.prototype.slice.call(arguments, 0);
  callback = args.pop();
  options = args.length ? args.shift() : {};

  this._executeQueryCommand(DbCommand.createResetErrorHistoryCommand(this), options, function(err, error) {
    callback(err, error.documents);
  });
};

/**
 * Creates an index on the collection.
 *
 * Options
 *  - **safe** {true | {w:n, wtimeout:n} | {fsync:true}, default:false}, executes with a getLastError command returning the results of the command on MongoDB.
 *  - **unique** {Boolean, default:false}, creates an unique index.
 *  - **sparse** {Boolean, default:false}, creates a sparse index.
 *  - **background** {Boolean, default:false}, creates the index in the background, yielding whenever possible.
 *  - **dropDups** {Boolean, default:false}, a unique index cannot be created on a key that has pre-existing duplicate values. If you would like to create the index anyway, keeping the first document the database indexes and deleting all subsequent documents that have duplicate value
 *  - **min** {Number}, for geospatial indexes set the lower bound for the co-ordinates.
 *  - **max** {Number}, for geospatial indexes set the high bound for the co-ordinates.
 *
 * @param {String} collectionName name of the collection to create the index on.
 * @param {Object} fieldOrSpec fieldOrSpec that defines the index.
 * @param {Object} [options] additional options during update.
 * @param {Function} callback for results.
 * @return {null}
 * @api public
 */
Db.prototype.createIndex = function(collectionName, fieldOrSpec, options, callback) {
  var self = this;
  var args = Array.prototype.slice.call(arguments, 2);
  callback = args.pop();
  options = args.length ? args.shift() : {};
  options = typeof callback === 'function' ? options : callback;
  options = options == null ? {} : options;

  // Collect errorOptions
  var errorOptions = options.safe != null ? options.safe : null;
  errorOptions = errorOptions == null && self.strict != null ? self.strict : errorOptions;
  
  // If we have a write concern set and no callback throw error
  if(errorOptions != null && errorOptions != false && (typeof callback !== 'function' && typeof options !== 'function')) throw new Error("safe cannot be used without a callback");
  
  // Create command
  var command = DbCommand.createCreateIndexCommand(this, collectionName, fieldOrSpec, options);
  // Default command options
  var commandOptions = {};    

  // If we have error conditions set handle them
  if(errorOptions && errorOptions != false) {
    // Insert options
    commandOptions['read'] = false;
    // If we have safe set set async to false
    if(errorOptions == null) commandOptions['async'] = true;
    
    // Set safe option
    commandOptions['safe'] = errorOptions;
    // If we have an error option
    if(typeof errorOptions == 'object') {
      var keys = Object.keys(errorOptions);
      for(var i = 0; i < keys.length; i++) {
        commandOptions[keys[i]] = errorOptions[keys[i]];
      }
    }

    // Execute insert command
    this._executeInsertCommand(command, commandOptions, function(err, result) {
      if(err != null) return callback(err, null);
  
      result = result && result.documents;
      if (result[0].err) {
        callback(self.wrap(result[0]));
      } else {
        callback(null, command.documents[0].name);
      }      
    });
  } else {
    // Execute insert command
    var result = this._executeInsertCommand(command, commandOptions);
    // If no callback just return
    if(!callback) return;
    // If error return error
    if(result instanceof Error) {
      return callback(result);
    }
    // Otherwise just return
    return callback(null, null);
  }
};

/**
 * Ensures that an index exists, if it does not it creates it
 *
 * Options
 *  - **safe** {true | {w:n, wtimeout:n} | {fsync:true}, default:false}, executes with a 
 *  - **unique** {Boolean, default:false}, creates an unique index.
 *  - **sparse** {Boolean, default:false}, creates a sparse index.
 *  - **background** {Boolean, default:false}, creates the index in the background, yielding whenever possible.
 *  - **dropDups** {Boolean, default:false}, a unique index cannot be created on a key that has pre-existing duplicate values. If you would like to create the index anyway, keeping the first document the database indexes and deleting all subsequent documents that have duplicate value
 *  - **min** {Number}, for geospatial indexes set the lower bound for the co-ordinates.
 *  - **max** {Number}, for geospatial indexes set the high bound for the co-ordinates.
 *  - **v** {Number}, specify the format version of the indexes.
 *
 * @param {String} collectionName name of the collection to create the index on.
 * @param {Object} fieldOrSpec fieldOrSpec that defines the index.
 * @param {Object} [options] additional options during update.
 * @param {Function} callback for results.
 * @return {null}
 * @api public
 */
Db.prototype.ensureIndex = function(collectionName, fieldOrSpec, options, callback) {
  var self = this;

  if (typeof callback === 'undefined' && typeof options === 'function') {
    callback = options;
    options = {};
  }

  if (options == null) {
    options = {};
  }
  
  // Collect errorOptions
  var errorOptions = options.safe != null ? options.safe : null;
  errorOptions = errorOptions == null && self.strict != null ? self.strict : errorOptions;
  
  // If we have a write concern set and no callback throw error
  if(errorOptions != null && errorOptions != false && (typeof callback !== 'function' && typeof options !== 'function')) throw new Error("safe cannot be used without a callback");

  // Create command
  var command = DbCommand.createCreateIndexCommand(this, collectionName, fieldOrSpec, options);
  var index_name = command.documents[0].name;
  
  // Default command options
  var commandOptions = {};    
  // Check if the index allready exists
  this.indexInformation(collectionName, function(err, collectionInfo) {
    if(err != null) return callback(err, null);

    if(!collectionInfo[index_name])  {         
      // If we have error conditions set handle them
      if(errorOptions && errorOptions != false) {
        // Insert options
        commandOptions['read'] = false;
        // If we have safe set set async to false
        if(errorOptions == null) commandOptions['async'] = true;

        // Set safe option
        commandOptions['safe'] = errorOptions;
        // If we have an error option
        if(typeof errorOptions == 'object') {
          var keys = Object.keys(errorOptions);
          for(var i = 0; i < keys.length; i++) {
            commandOptions[keys[i]] = errorOptions[keys[i]];
          }
        }
         
        self._executeInsertCommand(command, commandOptions, function(err, result) {
          // Only callback if we have one specified
          if(typeof callback === 'function') {
            if(err != null) return callback(err, null);

            result = result && result.documents;
            if (result[0].err) {
              callback(self.wrap(result[0]));
            } else {
              callback(null, command.documents[0].name);
            }      
          }
        });      
      } else {
        // Execute insert command
        var result = self._executeInsertCommand(command, commandOptions);        
        // If no callback just return
        if(!callback) return;
        // If error return error
        if(result instanceof Error) {
          return callback(result);
        }
        // Otherwise just return
        return callback(null, index_name);        
      }
    } else {
      if(typeof callback === 'function') return callback(null, index_name);      
    }
  });
};

/**
 * Returns the information available on allocated cursors.
 *
 * @param {Function} callback for results.
 * @return {null}
 * @api public
 */
Db.prototype.cursorInfo = function(callback) {
  this._executeQueryCommand(DbCommand.createDbSlaveOkCommand(this, {'cursorInfo':1}), function(err, result) {
    callback(err, result.documents[0]);
  });
};

/**
 * Drop an index on a collection.
 *
 * @param {String} collectionName the name of the collection where the command will drop an index.
 * @param {String} indexName name of the index to drop.
 * @param {Function} callback for results.
 * @return {null}
 * @api public
 */
Db.prototype.dropIndex = function(collectionName, indexName, callback) {
  this._executeQueryCommand(DbCommand.createDropIndexCommand(this, collectionName, indexName), callback);
};

/**
 * Reindex all indexes on the collection
 * Warning: reIndex is a blocking operation (indexes are rebuilt in the foreground) and will be slow for large collections.
 *
 * @param {String} collectionName the name of the collection.
 * @param {Function} callback returns the results.
 * @api public 
**/
Db.prototype.reIndex = function(collectionName, callback) {
  this._executeQueryCommand(DbCommand.createReIndexCommand(this, collectionName), function(err, result) {
    if(err != null) {
      callback(err, false);
    } else if(result.documents[0].errmsg == null) {
      callback(null, true);
    } else {
      callback(new Error(result.documents[0].errmsg), false);
    }    
  });
};

/**
 * Retrieves this collections index info.
 *
 * Options
 *  - **full** {Boolean, default:false}, returns the full raw index information.
 *
 * @param {String} collectionName the name of the collection.
 * @param {Object} [options] additional options during update.
 * @param {Function} callback returns the index information.
 * @return {null}
 * @api public
 */
Db.prototype.indexInformation = function(collectionName, options, callback) {
  // Unpack calls
  /*var args = Array.prototype.slice.call(arguments, 0);
  callback = args.pop();
  collectionName = args.length ? args.shift() : null;
  options = args.length ? args.shift() : {};*/

  if (typeof callback === 'undefined') {

    if (typeof options === 'undefined') {
      callback = collectionName;
      collectionName = null;
    } else {
      callback = options;
    }

    options = {};
  }

  // If we specified full information
  var full = options['full'] == null ? false : options['full'];  
  // Build selector for the indexes
  var selector = collectionName != null ? {ns: (this.databaseName + "." + collectionName)} : {};
  // Iterate through all the fields of the index
  new Cursor(this, new Collection(this, DbCommand.SYSTEM_INDEX_COLLECTION), selector).toArray(function(err, indexes) {
    if(err != null) return callback(err, null);
    // Contains all the information
    var info = {};

    // if full defined just return all the indexes directly
    if(full) return callback(null, indexes);
        
    // Process all the indexes
    for(var i = 0; i < indexes.length; i++) {
      var index = indexes[i];
      // Let's unpack the object
      info[index.name] = [];
      for(var name in index.key) {
        info[index.name].push([name, index.key[name]]);
      }
    }
    
    // Return all the indexes
    callback(null, info);
  });
};

/**
 * Drop a database.
 *
 * @param {Function} callback returns the index information.
 * @return {null}
 * @api public
 */
Db.prototype.dropDatabase = function(callback) {
  var self = this;

  this._executeQueryCommand(DbCommand.createDropDatabaseCommand(this), function(err, result) {
    if (err == null && result.documents[0].ok == 1) {
      callback(null, true);
    } else {
      if (err) {
        callback(err, false);
      } else {
        callback(self.wrap(result.documents[0]), false);
      }
    }
  });
};

/**
 * Register a handler
 * @ignore
 * @api private
 */
Db.prototype._registerHandler = function(db_command, raw, connection, callback) {
  // If we have an array of commands, chain them
  var chained = Array.isArray(db_command);
    
  // If they are chained we need to add a special handler situation
  if(chained) {
    // List off chained id's
    var chainedIds = [];
    // Add all id's 
    for(var i = 0; i < db_command.length; i++) chainedIds.push(db_command[i].getRequestId().toString());    
    
    // Register all the commands together
    for(var i = 0; i < db_command.length; i++) {
      var command = db_command[i];
      // Add the callback to the store
      this._callBackStore.once(command.getRequestId(), callback);
      // Add the information about the reply
      this._callBackStore._notReplied[command.getRequestId().toString()] = {start: new Date().getTime(), 'raw': raw, chained:chainedIds, connection:connection};
    }
  } else {
    // Add the callback to the list of handlers
    this._callBackStore.once(db_command.getRequestId(), callback);
    // Add the information about the reply
    this._callBackStore._notReplied[db_command.getRequestId().toString()] = {start: new Date().getTime(), 'raw': raw, connection:connection};    
  }  
}

/**
 * 
 * @ignore
 * @api private
 */
Db.prototype._callHandler = function(id, document, err) {
  // If there is a callback peform it
  if(this._callBackStore.listeners(id).length >= 1) {
    // Get info object
    var info = this._callBackStore._notReplied[id];
    // Delete the current object
    delete this._callBackStore._notReplied[id];
    // Emit to the callback of the object
    this._callBackStore.emit(id, err, document, info.connection);
  }
}

/**
 * 
 * @ignore
 * @api private
 */
Db.prototype._hasHandler = function(id) {
  // If there is a callback peform it
  return this._callBackStore.listeners(id).length >= 1;
}

/**
 * 
 * @ignore
 * @api private
 */
Db.prototype._removeHandler = function(id) {
  // Remove the information
  if(this._callBackStore._notReplied[id] != null) delete this._callBackStore._notReplied[id];
  // Remove the callback if it's registered
  this._callBackStore.removeAllListeners(id);
  // Force cleanup _events, node.js seems to set it as a null value
  if(this._callBackStore._events != null) delete this._callBackStore._events[id];
}

/**
 * 
 * @ignore
 * @api private
 */
Db.prototype._findHandler = function(id) {  
  var info = this._callBackStore._notReplied[id];
  // Return the callback
  return {info:info, callback:(this._callBackStore.listeners(id).length >= 1)}
}

/**
 * @ignore
 */
var __executeQueryCommand = function(self, db_command, options, callback) {
  // Options unpacking
  var read = options['read'] != null ? options['read'] : false;
  var raw = options['raw'] != null ? options['raw'] : self.raw;
  var onAll = options['onAll'] != null ? options['onAll'] : false;
  var specifiedConnection = options['connection'] != null ? options['connection'] : null;
  
  // If we got a callback object
  if(typeof callback === 'function' && !onAll) {
    // Fetch either a reader or writer dependent on the specified read option
    var connection = read == true || read === 'secondary' ? self.serverConfig.checkoutReader() : self.serverConfig.checkoutWriter(true);
    // Override connection if needed
    connection = specifiedConnection != null ? specifiedConnection : connection;
    // Ensure we have a valid connection
    if(connection == null) {
      return callback(new Error("no open connections"));
    } else if(connection instanceof Error) {
      return callback(connection);
    }

    // Perform reaping of any dead connection
    if(self.reaperEnabled) reaper(self, self.reaperInterval, self.reaperTimeout);

    // Register the handler in the data structure
    self._registerHandler(db_command, raw, connection, callback);
    
    // Write the message out and handle any errors if there are any
    connection.write(db_command, function(err) {
      if(err != null) {
        // Call the handler with an error
        self._callHandler(db_command.getRequestId(), null, err);
      }
    });    
  } else if(typeof callback === 'function' && onAll) {
    var connections = self.serverConfig.allRawConnections();
    var numberOfEntries = connections.length;
    // Go through all the connections
    for(var i = 0; i < connections.length; i++) {
      // Fetch a connection
      var connection = connections[i];
      // Override connection if needed
      connection = specifiedConnection != null ? specifiedConnection : connection;
      // Ensure we have a valid connection
      if(connection == null) {
        return callback(new Error("no open connections"));
      } else if(connection instanceof Error) {
        return callback(connection);
      }

      // Register the handler in the data structure
      self._registerHandler(db_command, raw, connection, callback);
      
      // Write the message out
      connection.write(db_command, function(err) {
        // Adjust the number of entries we need to process
        numberOfEntries = numberOfEntries - 1;
        // Remove listener
        if(err != null) {
          // Clean up listener and return error
          self._removeHandler(db_command.getRequestId());
        }
        
        // No more entries to process callback with the error
        if(numberOfEntries <= 0) {
          callback(err);
        }
      });

      // Update the db_command request id
      db_command.updateRequestId();
    }
  } else {
    // Fetch either a reader or writer dependent on the specified read option
    var connection = read == true || read === 'secondary' ? self.serverConfig.checkoutReader() : self.serverConfig.checkoutWriter();
    // Override connection if needed
    connection = specifiedConnection != null ? specifiedConnection : connection;
    // Ensure we have a valid connection
    if(connection == null || connection instanceof Error) return null;
    // Write the message out
    connection.write(db_command, function(err) {
      if(err != null) {
        // Emit the error
        self.emit("error", err);
      }
    });    
  }  
}

/**
 * @ignore
 */
var __retryCommandOnFailure = function(self, retryInMilliseconds, numberOfTimes, command, db_command, options, callback) {
  if(this._state == 'connected' || this._state == 'disconnected') this._state = 'connecting';
  // Number of retries done
  var numberOfRetriesDone = numberOfTimes;
  // Retry function, execute once
  var retryFunction = function(_self, _numberOfRetriesDone, _retryInMilliseconds, _numberOfTimes, _command, _db_command, _options, _callback) {
    _self.serverConfig.connect(_self, {}, function(err, result) {    
      // Adjust the number of retries left
      _numberOfRetriesDone = _numberOfRetriesDone - 1;
      // Definitively restart
      if(err != null && _numberOfRetriesDone > 0) {        
        _self._state = 'connecting';
        // Force close the current connections
        _self.serverConfig.close(function(err) {
          // Retry the connect
          setTimeout(function() {
            retryFunction(_self, _numberOfRetriesDone, _retryInMilliseconds, _numberOfTimes, _command, _db_command, _options, _callback);
          }, _retryInMilliseconds);
        });
      } else if(err != null && _numberOfRetriesDone <= 0) {
        _self._state = 'disconnected';
        // Force close the current connections
        _self.serverConfig.close(function(_err) {
          // Force close the current connections
          if(typeof _callback == 'function') _callback(err, null);
        });
      } else if(err == null && _self.serverConfig.isConnected() == true && Array.isArray(_self.auths) && _self.auths.length > 0) {
        _self._state = 'connected';
        // Get number of auths we need to execute
        var numberOfAuths = _self.auths.length;
        // Apply all auths
        for(var i = 0; i < _self.auths.length; i++) {
          _self.authenticate(_self.auths[i].username, _self.auths[i].password, function(err, authenticated) {
            numberOfAuths = numberOfAuths - 1;

            // If we have no more authentications to replay
            if(numberOfAuths == 0) {
              if(err != null || !authenticated) {
                if(typeof _callback == 'function') _callback(err, null);
                return;
              } else {
                // Execute command
                command(_self, _db_command, _options, _callback);

                // Execute any backed up commands
                process.nextTick(function() {
                  // Execute any backed up commands
                  while(_self.commands.length > 0) {
                    // Fetch the command
                    var command = _self.commands.shift();
                    // Execute based on type
                    if(command['type'] == 'query') {
                      __executeQueryCommand(_self, command['db_command'], command['options'], command['callback']);
                    } else if(command['type'] == 'insert') {
                      __executeInsertCommand(_self, command['db_command'], command['options'], command['callback']);
                    }
                  }
                });
              }
            }
          });
        }
      } else if(err == null && _self.serverConfig.isConnected() == true) {
        _self._state = 'connected';
        // Execute command
        command(_self, _db_command, _options, _callback);

        process.nextTick(function() {
          // Execute any backed up commands
          while(_self.commands.length > 0) {
            // Fetch the command
            var command = _self.commands.shift();
            // Execute based on type
            if(command['type'] == 'query') {
              __executeQueryCommand(_self, command['db_command'], command['options'], command['callback']);
            } else if(command['type'] == 'insert') {
              __executeInsertCommand(_self, command['db_command'], command['options'], command['callback']);
            }
          }
        });
      } else {
        _self._state = 'connecting';
        // Force close the current connections
        _self.serverConfig.close(function(err) {
          // Retry the connect
          setTimeout(function() {
            retryFunction(_self, _numberOfRetriesDone, _retryInMilliseconds, _numberOfTimes, _command, _db_command, _options, _callback);
          }, _retryInMilliseconds);
        });
      }
    });
  };
  
  // Execute function first time
  retryFunction(self, numberOfRetriesDone, retryInMilliseconds, numberOfTimes, command, db_command, options, callback);
}

/**
 * Execute db query command (not safe)
 * @ignore
 * @api private
 */
Db.prototype._executeQueryCommand = function(db_command, options, callback) {
  var self = this;

  // Unpack the parameters
  if (typeof callback === 'undefined') {
    callback = options;
    options = {};
  }

  // Check if the user force closed the command
  if(this._applicationClosed) {
    if(typeof callback == 'function') {
      return callback(new Error("db closed by application"), null);
    } else {
      throw new Error("db closed by application");
    }
  }
  
  // If the pool is not connected, attemp to reconnect to send the message
  if(this._state == 'connecting' && this.serverConfig.autoReconnect) {
    process.nextTick(function() {
      self.commands.push({type:'query', 'db_command':db_command, 'options':options, 'callback':callback});      
    })
  } else if(!this.serverConfig.isConnected() && this.serverConfig.autoReconnect) {    
    this._state = 'connecting';
    // Retry command
    __retryCommandOnFailure(this, this.retryMiliSeconds, this.numberOfRetries, __executeQueryCommand, db_command, options, callback);
  } else {
    __executeQueryCommand(self, db_command, options, callback)
  }
};

/**
 * @ignore
 */
var __executeInsertCommand = function(self, db_command, options, callback) {
  // Always checkout a writer for this kind of operations
  var connection = self.serverConfig.checkoutWriter();  
  // Get strict mode
  var safe = options['safe'] != null ? options['safe'] : false;
  var raw = options['raw'] != null ? options['raw'] : self.raw;
  var specifiedConnection = options['connection'] != null ? options['connection'] : null;
  // Override connection if needed
  connection = specifiedConnection != null ? specifiedConnection : connection;

  // Ensure we have a valid connection  
  if(typeof callback === 'function') {
    // Ensure we have a valid connection
    if(connection == null) {
      return callback(new Error("no open connections"));
    } else if(connection instanceof Error) {
      return callback(connection);
    }
    
    // We are expecting a check right after the actual operation
    if(safe != null && safe != false) {
      // db command is now an array of commands (original command + lastError)
      db_command = [db_command, DbCommand.createGetLastErrorCommand(safe, self)];

      // Register the handler in the data structure
      self._registerHandler(db_command[1], raw, connection, callback);
    }
  }
  
  // If we have no callback and there is no connection
  if(connection == null) return null;  
  if(connection instanceof Error && typeof callback == 'function') return callback(connection, null);
  if(connection instanceof Error) return null;
  if(connection == null && typeof callback == 'function') return callback(new Error("no primary server found"), null);

  // Write the message out
  connection.write(db_command, function(err) {
    // Return the callback if it's not a safe operation and the callback is defined
    if(typeof callback === 'function' && (safe == null || safe == false)) {
      // Perform reaping
      if(self.reaperEnabled) reaper(self, self.reaperInterval, self.reaperTimeout);
      // Perform the callback
      callback(err, null);
    } else if(typeof callback === 'function'){      
      // Call the handler with an error
      self._callHandler(db_command[1].getRequestId(), null, err);
    } else {
      self.emit("error", err);
    }
  });
}

/**
 * Execute an insert Command
 * @ignore
 * @api private
 */
Db.prototype._executeInsertCommand = function(db_command, options, callback) {  
  var self = this;

  // Unpack the parameters
  if (typeof callback === 'undefined') {
    callback = options;
    options = {};
  }

  // Check if the user force closed the command
  if(this._applicationClosed) {
    if(typeof callback == 'function') {
      return callback(new Error("db closed by application"), null);
    } else {
      throw new Error("db closed by application");
    }
  }

  // If the pool is not connected, attemp to reconnect to send the message
  if(self._state == 'connecting' && this.serverConfig.autoReconnect) {
    process.nextTick(function() {
      self.commands.push({type:'insert', 'db_command':db_command, 'options':options, 'callback':callback});      
    })
  } else if(!this.serverConfig.isConnected() && this.serverConfig.autoReconnect) {
    this._state = 'connecting';
    // Retry command
    __retryCommandOnFailure(this, this.retryMiliSeconds, this.numberOfRetries, __executeInsertCommand, db_command, options, callback);  
  } else {
    __executeInsertCommand(self, db_command, options, callback)
  }
}

/**
 * Update command is the same
 * @ignore
 * @api private
 */
Db.prototype._executeUpdateCommand = Db.prototype._executeInsertCommand;
/**
 * Remove command is the same
 * @ignore
 * @api private
 */
Db.prototype._executeRemoveCommand = Db.prototype._executeInsertCommand;

/**
 * Wrap a Mongo error document into an Error instance
 * @ignore
 * @api private
 */
Db.prototype.wrap = function(error) {
  var msg = error.err || error.errmsg || error;
  var e = new Error(msg);
  e.name = 'MongoError';

  // Get all object keys
  var keys = Object.keys(error);  
  // Populate error object with properties
  for(var i = 0; i < keys.length; i++) {
    e[keys[i]] = error[keys[i]];
  }
  
  return e;
}

/**
 * Default URL
 *  
 * @classconstant DEFAULT_URL
 **/
Db.DEFAULT_URL = 'mongodb://localhost:27017/default';

/**
 * Connect to MongoDB using a url as documented at
 *
 *  www.mongodb.org/display/DOCS/Connections
 *
 * @param {String} url connection url for MongoDB.
 * @param {Object} options additional options not covered by the url.
 * @param {Function} callback callback returns the initialized db.
 * @return {null}
 * @api public
 */
Db.connect = function(url, options, callback) {
  var args = Array.prototype.slice.call(arguments, 1);
  callback = typeof args[args.length - 1] == 'function' ? args.pop() : null;
  options = args.length ? args.shift() : null;
  options = options || {};
  var serverOptions = options.server || {};
  var replSetServersOptions = options.replSet || options.replSetServers || {};
  var dbOptions = options.db || {};

  var urlRE = new RegExp('^mongo(?:db)?://(?:|([^@/]*)@)([^@/]*)(?:|/([^?]*)(?:|\\?([^?]*)))$');
  var match = (url || Db.DEFAULT_URL).match(urlRE);
  if (!match)
    throw Error("URL must be in the format mongodb://user:pass@host:port/dbname");

  var authPart = match[1] || '';
  var auth = authPart.split(':', 2);
  var hostPart = match[2];
  var dbname = match[3] || 'default';
  var urlOptions = (match[4] || '').split(/[&;]/);

  // Ugh, we have to figure out which options go to which constructor manually.
  urlOptions.forEach(function(opt) {
    if (!opt) return;
    var splitOpt = opt.split('='), name = splitOpt[0], value = splitOpt[1];

    // Server options:
    if (name == 'slaveOk' || name == 'slave_ok')
      serverOptions.slave_ok = (value == 'true');
    if (name == 'poolSize')
      serverOptions.poolSize = Number(value);
    if (name == 'autoReconnect' || name == 'auto_reconnect')
      serverOptions.auto_reconnect = (value == 'true');
    if (name == 'ssl' || name == 'ssl')
      serverOptions.ssl = (value == 'true');

    // ReplSet options:
    if (name == 'replicaSet' || name == 'rs_name')
      replSetServersOptions.rs_name = value;
    if (name == 'reconnectWait')
      replSetServersOptions.reconnectWait = Number(value);
    if (name == 'retries')
      replSetServersOptions.retries = Number(value);
    if (name == 'readSecondary' || name == 'read_secondary')
      replSetServersOptions.read_secondary = (value == 'true');

    // DB options:
    if (name == 'safe')
      dbOptions.safe = (value == 'true');
    // Not supported by Db: safe, w, wtimeoutMS, fsync, journal, connectTimeoutMS, socketTimeoutMS
    if (name == 'nativeParser' || name == 'native_parser')
      dbOptions.native_parser = (value == 'true');
    if (name == 'strict')
      dbOptions.strict = (value == 'true');
  });

  var servers = hostPart.split(',').map(function(h) {
    var hostPort = h.split(':', 2);
    return new Server(hostPort[0] || 'localhost', hostPort[1] != null ? parseInt(hostPort[1]) : 27017, serverOptions);
  });

  var server;
  if (servers.length == 1) {
    server = servers[0];
  } else {
    server = new ReplSet(servers, replSetServersOptions);
  }

  var db = new Db(dbname, server, dbOptions);
  if(options.noOpen)
    return db;
    
  // If callback is null throw an exception
  if(callback == null) throw new Error("no callback function provided");

  db.open(function(err, db){
    if(err == null && authPart){
      db.authenticate(auth[0], auth[1], function(err, success){
        if(success){
          callback(null, db);
        } else {
          callback(err ? err : new Error('Could not authenticate user ' + auth[0]), db);
        }
      });
    } else {
      callback(err, db);
    }
  });
}

/**
 * Legacy support 
 *
 * @ignore
 * @api private
 */
exports.connect = Db.connect;
exports.Db = Db;

/**
 * Remove all listeners to the db instance.
 * @ignore
 * @api private
 */
Db.prototype.removeAllEventListeners = function() {
  this.removeAllListeners("close");
  this.removeAllListeners("error");
  this.removeAllListeners("timeout");
  this.removeAllListeners("parseError");
  this.removeAllListeners("poolReady");
  this.removeAllListeners("message");
}
