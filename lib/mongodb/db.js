var QueryCommand = require('./commands/query_command').QueryCommand,
  DbCommand = require('./commands/db_command').DbCommand,
  BinaryParser = require('./bson/binary_parser').BinaryParser,
  MongoReply = require('./responses/mongo_reply').MongoReply,
  Admin = require('./admin').Admin,
  Collection = require('./collection').Collection,
  Server = require('./connection/server').Server,
  ReplSetServers = require('./connection/repl_set_servers').ReplSetServers,
  Cursor = require('./cursor').Cursor,
  EventEmitter = require('events').EventEmitter,
  inherits = require('util').inherits,
  crypto = require('crypto'),
  debug = require('util').debug,
  inspect = require('util').inspect;

var Db = exports.Db = function(databaseName, serverConfig, options) {
  EventEmitter.call(this);
  this.databaseName = databaseName;
  this.serverConfig = serverConfig;
  this.options = options == null ? {} : options;  
  
  // Ensure we have a valid db name
  validateDatabaseName(databaseName);
  
  // Contains all the connections for the db
  try {
    this.native_parser = this.options.native_parser;
    var serializer = this.options.native_parser ? require('../../external-libs/bson') : require('./bson/bson');
    this.bson_serializer = serializer;
    this.bson_deserializer = serializer;
  } catch (err) {
    // If we tried to instantiate the native driver
    throw "Native bson parser not compiled, please compile or avoid using native_parser=true";
  }
  
  // State of the db connection
  this.state = 'notConnected';
  this.pkFactory = this.options.pk == null ? this.bson_serializer.ObjectID : this.options.pk;  
  this.forceServerObjectId = this.options.forceServerObjectId != null ? this.options.forceServerObjectId : false;
  // Added strict
  this.operationTimeout = this.options.operationTimeout == null ? 1000 :  parseInt(this.options.operationTimeout);
  this.strict = this.options.strict == null ? false : this.options.strict;
  this.notReplied ={};
  this.isInitializing = true;
  this.auths = [];
  
  this.logger = this.options.logger != null 
    && (typeof this.options.logger.debug == 'function') 
    && (typeof this.options.logger.error == 'function') 
    && (typeof this.options.logger.debug == 'function') 
      ? this.options.logger : {error:function(message, object) {}, log:function(message, object) {}, debug:function(message, object) {}};
  // Allow slaveOk
  this.slaveOk = this.options["slave_ok"] == null ? false : this.options["slave_ok"];
  
  var self = this;
  // Associate the logger with the server config
  this.serverConfig.logger = this.logger;
  
  this.tag = new Date().getTime();
  
  // Contains the callbacks
  this._mongodbHandlers = {_mongodbCallbacks : {}, _notReplied : {}};  
  // Just keeps list of events we allow
  this.eventHandlers = {error:[], parseError:[], poolReady:[], message:[], close:[]};

  // Controls serialization options
  this.serializeFunctions = this.options.serializeFunctions != null ? this.options.serializeFunctions : false;
  
  // Raw mode
  this.raw = this.options.raw != null ? this.options.raw : false;
  
  // Retry information
  this.retryMiliSeconds = this.options.retryMiliSeconds != null ? this.options.retryMiliSeconds : 5000;
  this.numberOfRetries = this.options.numberOfRetries != null ? this.options.numberOfRetries : 5;
  
  // Reaper information
  this.reaperInterval = this.options.reaperInterval != null ? this.options.reaperInterval : 1000;
  this.reaperTimeout = this.options.reaperTimeout != null ? this.options.reaperTimeout : 30000;
  // Start reaper, cleans up timed out calls
  this.reaperIntervalId = setInterval(reaper(this, this.reaperTimeout), this.reaperInterval);  
};

// Does forced cleanup of callbacks if a call never returns
var reaper = function(dbInstance, timeout) {
  return function() {
    // Only trigger reaper if it's still valid and we have a proper connection pool
    if(dbInstance.reaperIntervalId != null) {
      // Current time
      var currentTime = new Date().getTime();
      // If it's no longer connected clear out the interval
      if(dbInstance.serverConfig.connectionPool != null && !dbInstance.serverConfig.isConnected() && dbInstance.reaperIntervalId != null) {
        // Clear the interval
        clearInterval(dbInstance.reaperIntervalId);
        // this._mongodbHandlers = {_mongodbCallbacks : {}, _notReplied : {}};  
        // Trigger all remaining callbacks with timeout error
        if(dbInstance._mongodbHandlers != null && dbInstance._mongodbHandlers._notReplied != null) {
          var keys = Object.keys(dbInstance._mongodbHandlers._notReplied);
          // Iterate over all callbacks
          for(var i = 0; i < keys.length; i++) {
            // Get callback
            var callback = dbInstance._mongodbHandlers._mongodbCallbacks[keys[i]];
            // Cleanup
            delete dbInstance._mongodbHandlers._notReplied[keys[i]];
            delete dbInstance._mongodbHandlers._mongodbCallbacks[keys[i]];
            // Perform callback
            callback(new Error("operation timed out"), null);
          }
        }
      } else {
        // Trigger all callbacks that went over timeout period
        if(dbInstance._mongodbHandlers != null && dbInstance._mongodbHandlers._notReplied != null) {
          var keys = Object.keys(dbInstance._mongodbHandlers._notReplied);
          // Iterate over all callbacks
          for(var i = 0; i < keys.length; i++) {
            // Get info element
            var info = dbInstance._mongodbHandlers._notReplied[keys[i]];
            // If it's timed out let's remove the callback and return an error
            if((currentTime - info.start) > timeout) {
              // Get callback
              var callback = dbInstance._mongodbHandlers._mongodbCallbacks[keys[i]];
              // Cleanup
              delete dbInstance._mongodbHandlers._notReplied[keys[i]];
              delete dbInstance._mongodbHandlers._mongodbCallbacks[keys[i]];
              // Perform callback
              callback(new Error("operation timed out"), null);            
            }
          }
        }      
      }      
    }
  }
}

function validateDatabaseName(databaseName) {
  if(typeof databaseName !== 'string') throw new Error("database name must be a string");
  if(databaseName.length === 0) throw new Error("database name cannot be the empty string");
  
  var invalidChars = [" ", ".", "$", "/", "\\"];
  for(var i = 0; i < invalidChars.length; i++) {
    if(databaseName.indexOf(invalidChars[i]) != -1) throw new Error("database names cannot contain the character '" + invalidChars[i] + "'");
  }
}

inherits(Db, EventEmitter);

Db.prototype.open = function(callback) {
  var self = this;  
  // Set up connections
  if(self.serverConfig instanceof Server || self.serverConfig instanceof ReplSetServers) {
    self.serverConfig.connect(self, {firstCall: true}, function(err, result) {
      if(err != null) {
        // Clear reaper interval
        if(self.reaperIntervalId != null) clearInterval(self.reaperIntervalId);
        // Return error from connection
        return callback(err, null);            
      }
      // Callback
      return callback(null, self);
    });
  } else {
    return callback(Error("Server parameter must be of type Server or ReplSetServers"), null);
  }
};

Db.prototype.db = function(dbName) {  
  // Create a new db instance
  var newDbInstance = new Db(dbName, this.serverConfig, this.options);
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

Db.prototype.close = function(callback) {  
  // Clear reaperId if it's set
  if(this.reaperIntervalId != null) {
    clearInterval(this.reaperIntervalId);
  }
  // Remove all listeners and close the connection
  this.serverConfig.close(callback);
  // Emit the close event
  if(typeof callback !== 'function') this.emit("close");
  // Remove all listeners
  this.removeAllEventListeners();
  // Clear out state of the connection
  this.state = "notConnected";
};

Db.prototype.admin = function(callback) {
  if(callback == null) return new Admin(this);
  callback(null, new Admin(this));
};

/**
  Get the list of all collections for a mongo master server
**/
Db.prototype.collectionsInfo = function(collection_name, callback) {
  if(callback == null) { callback = collection_name; collection_name = null; }
  // Create selector
  var selector = {};
  // If we are limiting the access to a specific collection name
  if(collection_name != null) selector.name = this.databaseName + "." + collection_name;

  // Return Cursor
  // callback for backward compatibility
  if (callback) {
    callback(null, new Cursor(this, new Collection(this, DbCommand.SYSTEM_NAMESPACE_COLLECTION), selector));
  } else {
    return new Cursor(this, new Collection(this, DbCommand.SYSTEM_NAMESPACE_COLLECTION), selector);
  }    
};

/**
  Get the list of all collection names for the specified db
**/
Db.prototype.collectionNames = function(collection_name, callback) {
  if(callback == null) { callback = collection_name; collection_name = null; }
  var self = this;
  // Let's make our own callback to reuse the existing collections info method
  self.collectionsInfo(collection_name, function(err, cursor) {
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
  Fetch a specific collection (containing the actual collection information)
**/
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
      return callback(err, null);
    }
    return callback(null, collection);
  }
};

/**
  Fetch all collections for the given db
**/
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
  Evaluate javascript on the server
**/
Db.prototype.eval = function(code, parameters, callback) {
  if(typeof parameters === "function") { callback = parameters; parameters = null; }
  var finalCode = code;
  var finalParameters = [];
  // If not a code object translate to one
  if(!(finalCode instanceof this.bson_serializer.Code)) {
    finalCode = new this.bson_serializer.Code(finalCode);
  }

  // Ensure the parameters are correct
  if(parameters != null && parameters.constructor != Array) {
    finalParameters = [parameters];
  } else if(parameters != null && parameters.constructor == Array) {
    finalParameters = parameters;
  }
  // Create execution selector
  var selector = {'$eval':finalCode, 'args':finalParameters};
  // Iterate through all the fields of the index
  new Cursor(this, new Collection(this, DbCommand.SYSTEM_COMMAND_COLLECTION), selector, {}, 0, -1).nextObject(function(err, result) {
    if(err != null) return callback(err, null);

    if(result.ok == 1) {
      callback(null, result.retval);
    } else {
      callback(new Error("eval failed: " + result.errmsg), null); return;
    }
  });
};

Db.prototype.dereference = function(dbRef, callback) {
  this.collection(dbRef.namespace, function(err, collection) {
    if(err != null) return callback(err, null);

    collection.findOne({'_id':dbRef.oid}, function(err, result) {
      callback(err, result);
    });
  });
};

/**
  Logout user from server
  Fire off on all connections and remove all auth info
**/
Db.prototype.logout = function(options, callback) {
  var self = this;
  // If the first object is a function
  if(typeof options === "function") { callback = options; options = {}}
  
  // Let's generate the logout command object
  var logoutCommand = DbCommand.logoutCommand(self, {logout:1, socket:options['socket']});
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
  Authenticate against server
**/
Db.prototype.authenticate = function(username, password, callback) {
  var self = this;
  
  // Push the new auth if we have no previous record
  self.auths = [{'username':username, 'password':password}];
  // Get the amount of connections in the pool to ensure we have authenticated all comments
  var numberOfConnections = Object.keys(this.serverConfig.allRawConnections()).length;  
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
    } else {
          
    }    
  });
};

/**
  Add a user
**/
Db.prototype.addUser = function(username, password, callback) {
  // Use node md5 generator
  var md5 = crypto.createHash('md5');
  // Generate keys used for authentication
  md5.update(username + ":mongo:" + password);
  var userPassword = md5.digest('hex');
  // Fetch a user collection
  this.collection(DbCommand.SYSTEM_USER_COLLECTION, function(err, collection) {
    // Insert the user into the system users collections
    collection.insert({user: username, pwd: userPassword}, {safe:true}, function(err, documents) {
      callback(err, documents);
    });
  });
};

/**
  Remove a user
**/
Db.prototype.removeUser = function(username, callback) {
  // Fetch a user collection
  this.collection(DbCommand.SYSTEM_USER_COLLECTION, function(err, collection) {
    collection.findOne({user: username}, function(err, user) {
      if(user != null) {
        collection.remove({user: username}, function(err, result) {
          callback(err, true);
        });
      } else {
        callback(err, false);
      }
    });
  });
};

/**
  Create Collection
**/
Db.prototype.createCollection = function(collectionName, options, callback) {
  var args = Array.prototype.slice.call(arguments, 1);
  callback = args.pop();
  options = args.length ? args.shift() : null;
  var self = this;
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
    self._executeQueryCommand(DbCommand.createCreateCollectionCommand(self, collectionName, options), {read:false, safe:true}, function(err, result) {
      if(err == null && result.documents[0].ok == 1) {
        try {
          var collection = new Collection(self, collectionName, self.pkFactory, options);
        } catch(err) {
          return callback(err, null);
        }
        return callback(null, collection);
      } else {
        err != null ? callback(err, null) : callback(new Error("Error creating collection: " + collectionName), null);
      }
    });
  });
};

Db.prototype.command = function(selector, callback) {
  var cursor = new Cursor(this, new Collection(this, DbCommand.SYSTEM_COMMAND_COLLECTION), selector, {}, 0, -1, null, null, null, null, QueryCommand.OPTS_NO_CURSOR_TIMEOUT);
  cursor.nextObject(callback);
};

/**
  Drop Collection
**/
Db.prototype.dropCollection = function(collectionName, callback) {
  this._executeQueryCommand(DbCommand.createDropCollectionCommand(this, collectionName), function(err, result) {
    if(err == null && result.documents[0].ok == 1) {
      if(callback != null) return callback(null, true);
    } else {
      if(callback != null) err != null ? callback(err, null) : callback(new Error(result.documents[0].errmsg), null);
    }
  });
};

/**
  Rename Collection
**/
Db.prototype.renameCollection = function(fromCollection, toCollection, callback) {
  this._executeQueryCommand(DbCommand.createRenameCollectionCommand(this, fromCollection, toCollection), function(err, doc) { callback(err, doc); });
};

/**
  Return last error message for the given connection
**/
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

Db.prototype.error = function(options, callback) {
  // Unpack call parameters
  var args = Array.prototype.slice.call(arguments, 0);
  callback = args.pop();
  options = args.length ? args.shift() : {};
  // Execute last error
  this.lastError(options, {}, callback);
};

/**
  Return the status for the last operation on the given connection
**/
Db.prototype.lastStatus = function(callback) {
  this._executeQueryCommand(DbCommand.createGetLastStatusCommand(this), callback);
};

/**
  Return all errors up to the last time db reset_error_history was called
**/
Db.prototype.previousErrors = function(callback) {
  this._executeQueryCommand(DbCommand.createGetPreviousErrorsCommand(this), function(err, error) {
    callback(err, error.documents);
  });
};

/**
  Runs a command on the database
**/
Db.prototype.executeDbCommand = function(command_hash, options, callback) {
  if(callback == null) { callback = options; options = {}; }  
  this._executeQueryCommand(DbCommand.createDbCommand(this, command_hash, options), options, callback);
};

/**
  Runs a command on the database as admin
**/
Db.prototype.executeDbAdminCommand = function(command_hash, callback) {
  this._executeQueryCommand(DbCommand.createAdminDbCommand(this, command_hash), callback);
};

/**
  Resets the error history of the mongo instance
**/
Db.prototype.resetErrorHistory = function(callback) {
  this._executeQueryCommand(DbCommand.createResetErrorHistoryCommand(this), callback);
};

/**
  Create an index on a collection
**/
Db.prototype.createIndex = function(collectionName, fieldOrSpec, options, callback) {
  if(callback == null) { callback = options; options = null; }
  var command = DbCommand.createCreateIndexCommand(this, collectionName, fieldOrSpec, options);
  this._executeInsertCommand(command, {read:false, safe:true}, function(err, result) {
    if(err != null) return callback(err, null);

    result = result && result.documents;
    if (result[0].err) {
      callback(this.wrap(result[0]));
    } else {
      callback(null, command.documents[0].name);
    }      
  });
};

/**
  Ensure index, create an index if it does not exist
**/
Db.prototype.ensureIndex = function(collectionName, fieldOrSpec, options, callback) {
  if(callback == null) { callback = options; options = null; }
  var command = DbCommand.createCreateIndexCommand(this, collectionName, fieldOrSpec, options);
  var index_name = command.documents[0].name;
  var self = this;
  // Check if the index allready exists
  this.indexInformation(collectionName, function(err, collectionInfo) {
    if(err != null) return callback(err, null);

    if(!collectionInfo[index_name])  {
      self._executeInsertCommand(command, {read:false, safe:true}, function(err, result) {
        if(err != null) return callback(err, null);

        result = result && result.documents;
        if (result[0].err) {
          callback(this.wrap(result[0]));
        } else {
          callback(null, command.documents[0].name);
        }      
      });      
    } else {
      return callback(null, index_name);      
    }
  });
};

/**
  Fetch the cursor information
**/
Db.prototype.cursorInfo = function(callback) {
  this._executeQueryCommand(DbCommand.createDbCommand(this, {'cursorInfo':1}), function(err, result) {
    callback(err, result.documents[0]);
  });
};

/**
  Drop Index on a collection
**/
Db.prototype.dropIndex = function(collectionName, indexName, callback) {
  this._executeQueryCommand(DbCommand.createDropIndexCommand(this, collectionName, indexName), callback);
};

/**
  Index Information
**/
Db.prototype.indexInformation = function(collectionName, options, callback) {
  // Unpack calls
  var args = Array.prototype.slice.call(arguments, 0);
  callback = args.pop();
  collectionName = args.length ? args.shift() : null;
  options = args.length ? args.shift() : {};

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
  Database Drop Command
**/
Db.prototype.dropDatabase = function(callback) {
  this._executeQueryCommand(DbCommand.createDropDatabaseCommand(this), function(err, result) {
    callback(err, result);
  });
};

// Register a handler
Db.prototype._registerHandler = function(db_command, raw, connection, callback) {
  // Add the callback to the list of handlers
  this._mongodbHandlers._mongodbCallbacks[db_command.getRequestId().toString()] = callback;
  // Add the information about the reply
  this._mongodbHandlers._notReplied[db_command.getRequestId().toString()] = {start: new Date().getTime(), 'raw': raw, 'connection':connection};
}

// Remove a handler
Db.prototype._removeHandler = function(db_command) {
  var id = typeof db_command === 'number' || typeof db_command === 'string' ? db_command.toString() : db_command.getRequestId().toString();  
  // Ensure we have an entry (might have been removed by the reaper)
  if(this._mongodbHandlers != null && this._mongodbHandlers._mongodbCallbacks[id] != null) {
    var callback = this._mongodbHandlers._mongodbCallbacks[id];
    var info = this._mongodbHandlers._notReplied[id];
    // Remove the handler
    delete this._mongodbHandlers._mongodbCallbacks[id];
    delete this._mongodbHandlers._notReplied[id]
    // Return the callback
    return {'callback':callback, 'info':info};    
  } else {
    return null;
  }
}

Db.prototype._findHandler = function(id) {
  var callback = this._mongodbHandlers._mongodbCallbacks[id.toString()];
  var info = this._mongodbHandlers._notReplied[id.toString()];
  // Return the callback
  return {'callback':callback, 'info':info};
}

var __executeQueryCommand = function(self, db_command, options, callback) {
  // Options unpacking
  var read = options['read'] != null ? options['read'] : false;
  var raw = options['raw'] != null ? options['raw'] : self.raw;
  var onAll = options['onAll'] != null ? options['onAll'] : false;
  var specifiedConnection = options['connection'] != null ? options['connection'] : null;
  
  // If we got a callback object
  if(callback instanceof Function && !onAll) {
    // Let's the out outgoing request Id
    var requestId = db_command.getRequestId().toString();
    // Fetch either a reader or writer dependent on the specified read option
    var connection = read ? self.serverConfig.checkoutReader() : self.serverConfig.checkoutWriter();    
    // Override connection if needed
    connection = specifiedConnection != null ? specifiedConnection : connection;
    // Ensure we have a valid connection
    if(connection == null) return callback(new Error("no open connections"));        

    // Register the handler in the data structure
    self._registerHandler(db_command, raw, connection, callback);
    
    // Write the message out and handle any errors if there are any
    connection.write(db_command, function(err) {
      if(err != null) {
        // Clean up listener and return error
        var callbackInstance = self._removeHandler(db_command);
        // Only call if the reaper has not removed it
        if(callbackInstance != null) {
          callbackInstance.callback(err);
        }        
      }
    });    
  } else if(callback instanceof Function && onAll) {
    var connections = self.serverConfig.allRawConnections();
    var keys = Object.keys(connections);
    var numberOfEntries = keys.length;

    // Go through all the connections
    for(var i = 0; i < keys.length; i++) {
      // Fetch a connection
      var connection = connections[keys[i]];
      // Override connection if needed
      connection = specifiedConnection != null ? specifiedConnection : connection;
      // Ensure we have a valid connection
      if(connection == null) return callback(new Error("no open connections"));

      // Register the handler in the data structure
      self._registerHandler(db_command, raw, connection, callback);

      // Write the message out
      connection.write(db_command, function(err) {
        // Adjust the number of entries we need to process
        numberOfEntries = numberOfEntries - 1;
        // Remove listener
        if(err != null) {
          // Clean up listener and return error
          self._removeHandler(db_command);
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
    // Let's the out outgoing request Id
    var requestId = db_command.getRequestId().toString();
    // Fetch either a reader or writer dependent on the specified read option
    var connection = read ? self.serverConfig.checkoutReader() : self.serverConfig.checkoutWriter();
    // Override connection if needed
    connection = specifiedConnection != null ? specifiedConnection : connection;
    // Ensure we have a valid connection
    if(connection == null) return null;
    // Write the message out
    connection.write(db_command, function(err) {
      if(err != null) {
        // Emit the error
        self.emit("error", err);
      }
    });    
  }  
}

var __retryCommandOnFailure = function(self, retryInMilliseconds, numberOfTimes, command, db_command, options, callback) {
  // Number of retries done
  var numberOfRetriesDone = numberOfTimes;
  // The interval function triggers retries
  var intervalId = setInterval(function() {
    // Attemp a reconnect
    self.serverConfig.connect(self, {firstCall: false}, function(err, result) {
      // Adjust the number of retries done
      numberOfRetriesDone = numberOfRetriesDone - 1;
      // If we have no error, we are done
      if(err != null && numberOfRetriesDone <= 0) {
        // No more retries, clear interval retries and fire an error
        clearInterval(intervalId);
        callback(err, null);
      } else if(err == null) {
        // Clear retries and fire message
        clearInterval(intervalId);
        
        // If we have auths we need to replay them
        if(Array.isArray(self.auths) && self.auths.length > 0) {
          // Get number of auths we need to execute
          var numberOfAuths = self.auths.length;
          // Apply all auths
          for(var i = 0; i < self.auths.length; i++) {
            
            self.authenticate(self.auths[i].username, self.auths[i].password, function(err, authenticated) {              
              numberOfAuths = numberOfAuths - 1;
              
              // If we have no more authentications to replay
              if(numberOfAuths == 0) {                                
                if(err != null || !authenticated) {
                  return callback(err, null);
                } else {
                  command(self, db_command, options, callback);                            
                }
              }
            })
          }
        } else {
          command(self, db_command, options, callback);          
        }        
      }
    });
  }, retryInMilliseconds);
}

/**
  Execute db query command (not safe)
**/
Db.prototype._executeQueryCommand = function(db_command, options, callback) {
  var self = this;  
  // Unpack the parameters
  var args = Array.prototype.slice.call(arguments, 1);
  callback = args.pop();
  options = args.length ? args.shift() : {};
  
  // If the pool is not connected, attemp to reconnect to send the message
  if(!this.serverConfig.isConnected() && this.serverConfig.autoReconnect) {    
    __retryCommandOnFailure(this, this.retryMiliSeconds, this.numberOfRetries, __executeQueryCommand, db_command, options, callback);
  } else {
    __executeQueryCommand(self, db_command, options, callback)
  }
};

var __executeInsertCommand = function(self, db_command, options, callback) {
  // Always checkout a writer for this kind of operations
  var connection = self.serverConfig.checkoutWriter();
  var safe = options['safe'] != null ? options['safe'] : false;
  var raw = options['raw'] != null ? options['raw'] : self.raw;
  var specifiedConnection = options['connection'] != null ? options['connection'] : null;
  // Override connection if needed
  connection = specifiedConnection != null ? specifiedConnection : connection;
  // Ensure we have a valid connection  
  if(callback instanceof Function) {
    // Ensure we have a valid connection
    if(connection == null) return callback(new Error("no open connections"));
    
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

  // Write the message out
  connection.write(db_command, function(err) {
    // Return the callback if it's not a safe operation and the callback is defined
    if(callback instanceof Function && (safe == null || safe == false)) {
      callback(err, null);
    } else if(callback instanceof Function){
      // Clean up listener and return error
      var callbackInstance = self._removeHandler(db_command[1]);
      // Only call if the reaper has not removed it
      if(callbackInstance != null) {
        callbackInstance.callback(err, null);
      }        
    } else {
      self.emit("error", err);
    }
  });
}

/**
  Execute an insert Command
**/
Db.prototype._executeInsertCommand = function(db_command, options, callback) {  
  var self = this;
  // Unpack the parameters
  var args = Array.prototype.slice.call(arguments, 1);
  callback = args.pop();
  options = args.length ? args.shift() : {};

  // If the pool is not connected, attemp to reconnect to send the message
  if(!this.serverConfig.isConnected() && this.serverConfig.autoReconnect) {
    __retryCommandOnFailure(this, this.retryMiliSeconds, this.numberOfRetries, __executeInsertCommand, db_command, options, callback);
  } else {
    __executeInsertCommand(self, db_command, options, callback)
  }
}

// Update command is the same
Db.prototype._executeUpdateCommand = Db.prototype._executeInsertCommand;
Db.prototype._executeRemoveCommand = Db.prototype._executeInsertCommand;

/**
 * Wrap a Mongo error document into an Error instance
 */
Db.prototype.wrap = function(error) {
  var e = new Error(error.err != null ? error.err : error.errmsg);
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
 * Connect to URL
 *
 * The mongodb URL scheme is documented at:
 *   http://www.mongodb.org/display/DOCS/Connections
**/
Db.DEFAULT_URL = 'mongodb://localhost:27017/default';

exports.connect = function(url, options, callback) {
  var args = Array.prototype.slice.call(arguments, 1);
  callback = args.pop();
  options = args.length ? args.shift() : null;
  options = options || {};
  var serverOptions = options.server || {};
  var replSetServersOptions = options.replSetServers || {};
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

    // ReplSetServers options:
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
    server = new ReplSetServers(servers, replSetServersOptions);
  }

  var db = new Db(dbname, server, dbOptions);
  if (options.noOpen)
    return db;

  db.open(function(err, db){
    if(!err && authPart){
      db.authenticate(auth[0], auth[1], function(err, success){
        if(success){
          callback(null, db);
        }
        else {
          callback(err ? err : new Error('Could not authenticate user ' + auth[0]), null);
        }
      });
    } else {
      callback(err, db);
    }
  });
}

Db.prototype.removeAllEventListeners = function() {
  this.removeAllListeners("close");
  this.removeAllListeners("error");
  this.removeAllListeners("parseError");
  this.removeAllListeners("poolReady");
  this.removeAllListeners("message");
}