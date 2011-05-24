var QueryCommand = require('./commands/query_command').QueryCommand,
  DbCommand = require('./commands/db_command').DbCommand,
  BinaryParser = require('./bson/binary_parser').BinaryParser,
  MongoReply = require('./responses/mongo_reply').MongoReply,
  Admin = require('./admin').Admin,
  Connection = require('./connection').Connection,
  Collection = require('./collection').Collection,
  Server = require('./connections/server').Server,
  ServerPair = require('./connections/server_pair').ServerPair,
  ServerCluster = require('./connections/server_cluster').ServerCluster,
  ReplSetServers = require('./connections/repl_set_servers').ReplSetServers,
  Cursor = require('./cursor').Cursor,
  MD5 = require('./crypto/md5').MD5,
  EventEmitter = require('events').EventEmitter,
  inherits = require('util').inherits,
  debug = require('util').debug,
  inspect = require('util').inspect;

var Db = exports.Db = function(databaseName, serverConfig, options) {
  EventEmitter.call(this);
  this.databaseName = databaseName;
  this.serverConfig = serverConfig;
  this.options = options == null ? {} : options;
  
  // Contains all the connections for the db
  try {
    var serializer = this.options.native_parser ? require('../../external-libs/bson') : require('./bson/bson');
    this.bson_serializer = serializer;
    this.bson_deserializer = serializer;
  } catch (err) {
    // If we tried to instantiate the native driver
    throw "Native bson parser not compiled, please compile or avoud using native_parser=true";
  }
  // this.connections = [];
  // State of the db connection
  this.state = 'notConnected';
  this.pkFactory = this.options.pk == null ? this.bson_serializer.ObjectID : this.options.pk;  
  // Added strict
  this.strict = this.options.strict == null ? false : this.options.strict;
  this.notReplied ={};
  this.slaveOk = false;
  this.isInitializing = true;
};

inherits(Db, EventEmitter);

Db.prototype.open = function(callback) {
  var self = this;

  // Set up connections
  if(self.serverConfig instanceof Server || self.serverConfig instanceof ServerPair || self.serverConfig instanceof ServerCluster || self.serverConfig instanceof ReplSetServers) {
    self.serverConfig.connect(this, function(err, result) {
      if(err != null) return callback(err, null);      
      return callback(null, self);
    });
  } else {
    return callback(Error("Server parameter must be of type Server, ServerPair, ServerCluster or ReplSetServers"), null);
  }
};

Db.prototype.close = function() {
  this.serverConfig.close();
  // Clear out state of the connection
  this.state = "notConnected"
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
    cursor.toArray(function(err, documents) {
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

  try {
    if(self.strict) {
      self.collectionNames(collectionName, function(err, collections) {
        if(collections.length == 0) {
          return callback(new Error("Collection " + collectionName + " does not exist. Currently in strict mode."), null);
        } else {
          return callback(null, new Collection(self, collectionName, self.pkFactory, options));
        }
      });
    } else {
      return callback(null, new Collection(self, collectionName, self.pkFactory, options));
    }
  } catch(err) {
    return callback(err, null);
  }
};

/**
  Fetch all collections for the given db
**/
Db.prototype.collections = function(callback) {
  var self = this;
  // Let's get the collection names
  self.collectionNames(function(err, documents) {
    var collections = [];
    documents.forEach(function(document) {
      collections.push(new Collection(self, document.name.replace(self.databaseName + ".", '')));
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
    if(result.ok == 1) {
      callback(null, result.retval);
    } else {
      callback(new Error("eval failed: " + result.errmsg), null); return;
    }
  });
};

Db.prototype.dereference = function(dbRef, callback) {
  this.collection(dbRef.namespace, function(err, collection) {
    collection.findOne({'_id':dbRef.oid}, function(err, result) {
      callback(err, result);
    });
  });
};

/**
  Authenticate against server
**/
Db.prototype.authenticate = function(username, password, callback) {
  var self = this;
  // Execute command
  this.executeCommand(DbCommand.createGetNonceCommand(self), function(err, reply) {
    if(err == null) {
      // Nonce used to make authentication request with md5 hash
      var nonce = reply.documents[0].nonce;
      // Execute command
      self.executeCommand(DbCommand.createAuthenticationCommand(self, username, password, nonce), function(err, result) {
        if(err == null && result.documents[0].ok == 1) {
          callback(null, true);
        } else {
          err != null ? callback(err, false) : callback(new Error(result.documents[0].errmsg), false);
        }
      });      
    } else {
      callback(err, null);
    }
  });
};

/**
  Add a user
**/
Db.prototype.addUser = function(username, password, callback) {
  var userPassword = MD5.hex_md5(username + ':mongo:' + password);
  // Fetch a user collection
  this.collection(DbCommand.SYSTEM_USER_COLLECTION, function(err, collection) {
    // Insert the user into the system users collections
    collection.insert({user: username, pwd: userPassword}, function(err, documents) {
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
  Logout user (if authenticated)
**/
Db.prototype.logout = function(callback) {
  this.executeCommand(DbCommand.createLogoutCommand(this), callback);
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
    var found = false;
    collections.forEach(function(collection) {
      if(collection.name == self.databaseName + "." + collectionName) found = true;
    });

    // If the collection exists either throw an exception (if db in strict mode) or return the existing collection
    if(found && self.strict) {
      callback(new Error("Collection " + collectionName + " already exists. Currently in strict mode."), null); return;
    } else if(found){
      callback(null, new Collection(self, collectionName, self.pkFactory)); return;
    }

    // Create a new collection and return it
    self.executeCommand(DbCommand.createCreateCollectionCommand(self, collectionName, options), function(err, result) {
      if(err == null && result.documents[0].ok == 1) {
        callback(null, new Collection(self, collectionName, self.pkFactory));
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
  this.executeCommand(DbCommand.createDropCollectionCommand(this, collectionName), function(err, result) {
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
  this.executeCommand(DbCommand.createRenameCollectionCommand(this, fromCollection, toCollection), function(err, doc) { callback(err, doc); });
};

/**
  Return last error message for the given connection
**/
Db.prototype.lastError = function(options, callback) {
  // debug("===================== options :: " + inspect(options))
  // debug("===================== callback :: " + inspect(callback))
  // 
  // var args = Array.prototype.slice.call(arguments, 1);
  // callback = args.pop();
  // options = args.length ? args.shift() : {};
  // 
  // debug("===================== callback :: " + inspect(callback))

  if ('function' === typeof options) callback = options, options = {};

  // debug("===================== callback :: " + inspect(callback))

  this.executeCommand(DbCommand.createGetLastErrorCommand(options, this), function(err, error) {
    // debug("============== err::" + err)
    // debug("============== error::" + inspect(error))
    // debug("============== callback::" + inspect(callback))
    
    callback(err, error.documents);
  });
};

Db.prototype.error = function(options, callback) {
  this.lastError(options, callback);
};

/**
  Return the status for the last operation on the given connection
**/
Db.prototype.lastStatus = function(callback) {
  this.executeCommand(DbCommand.createGetLastStatusCommand(this), callback);
};

/**
  Return all errors up to the last time db reset_error_history was called
**/
Db.prototype.previousErrors = function(callback) {
  this.executeCommand(DbCommand.createGetPreviousErrorsCommand(this), function(err, error) {
    callback(err, error.documents);
  });
};

/**
  Runs a command on the database
**/
Db.prototype.executeDbCommand = function(command_hash, callback) {
  this.executeCommand(DbCommand.createDbCommand(this, command_hash), callback);
};

/**
  Runs a command on the database as admin
**/
Db.prototype.executeDbAdminCommand = function(command_hash, callback) {
  this.executeCommand(DbCommand.createAdminDbCommand(this, command_hash), callback);
};

/**
  Resets the error history of the mongo instance
**/
Db.prototype.resetErrorHistory = function(callback) {
  this.executeCommand(DbCommand.createResetErrorHistoryCommand(this), callback);
};

/**
  Create an index on a collection
**/
Db.prototype.createIndex = function(collectionName, fieldOrSpec, options, callback) {
  if(callback == null) { callback = options; options = null; }
  var command = DbCommand.createCreateIndexCommand(this, collectionName, fieldOrSpec, options);
  this.executeCommand(command, function(result) {});
  callback(null, command.documents[0].name);
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
    if(!collectionInfo[index_name]) self.executeCommand(command, function(result) {});
    return callback(null, index_name);
  });
};

/**
  Fetch the cursor information
**/
Db.prototype.cursorInfo = function(callback) {
  this.executeCommand(DbCommand.createDbCommand(this, {'cursorInfo':1}), function(err, result) {
    callback(err, result.documents[0]);
  });
};

/**
  Drop Index on a collection
**/
Db.prototype.dropIndex = function(collectionName, indexName, callback) {
  this.executeCommand(DbCommand.createDropIndexCommand(this, collectionName, indexName), callback);
};

/**
  Index Information
**/
Db.prototype.indexInformation = function(collectionName, callback) {
  if(typeof collectionName === "function") { callback = collectionName; collectionName = null;}
  // Build selector for the indexes
  var selector = collectionName != null ? {ns: (this.databaseName + "." + collectionName)} : {};
  var info = {};
  // Iterate through all the fields of the index
  new Cursor(this, new Collection(this, DbCommand.SYSTEM_INDEX_COLLECTION), selector).each(function(err, index) {
    // Return the info when finished
    if(index == null) {
      callback(null, info);
    } else {
      info[index.name] = [];
      for(var name in index.key) {
        info[index.name].push([name, index.key[name]]);
      }
    }
  });
};

/**
  Database Drop Command
**/
Db.prototype.dropDatabase = function(callback) {
  this.executeCommand(DbCommand.createDropDatabaseCommand(this), function(err, result) {
    callback(err, result);
  });
};

/**
  Execute db command
**/
Db.prototype.executeCommand = function(db_command, read, callback) {
    var self = this;
    
    var args = Array.prototype.slice.call(arguments, 1);
    callback = args.pop();
    read = args.length ? args.shift() : false;
        
    if(callback instanceof Function) {
      // Add the callback to the list of callbacks by the request id (mapping outgoing messages to correct callbacks)
      this.on(db_command.getRequestId().toString(), callback);    
      if(self.serverConfig.primary != null) {
	      this.notReplied[db_command.getRequestId().toString()] = self.serverConfig.primary;
	    }
    }

    // Correctly handle serialization errors
    var checkMasterHandler = function(err, reply, dbinstance){ 
      if (err == null){
        try{ 
          if ( dbinstance.backup.server ) { // use slave this ONE time 
	          self.notReplied[db_command.getRequestId().toString()] = dbinstance.backup.server.connection;

            // debug("========================================================= 1");

	          var writer = read ? dbinstance.backup.server.checkoutReader() : dbinstance.backup.server.checkoutWriter();
            writer.send(db_command)

            // dbinstance.backup.server.connection.send(db_command);
            dbinstance.backup.server = null;
          } else {
	          self.notReplied[db_command.getRequestId().toString()] = dbinstance.serverConfig.primary;

            // debug("========================================================= 2");
	          
	          var writer = read ? dbinstance.serverConfig.checkoutReader() : dbinstance.serverConfig.checkoutWriter();
            writer.send(db_command)
	          
            // dbinstance.serverConfig.primary.send(db_command);          
          }
        } catch ( err ) {
          // Clean up callback if it exists
          if(this.notReplied[db_command.getRequestId().toString()] != null) {
            delete self.notReplied[db_command.getRequestId().toString()];                    
          }
          
          if(callback instanceof Function) {
            return callback(err, null);
          }          
        }
      } else {
        // XXX : LOOP!!!!!!
        setTimeout( self.checkMaster_(self, checkMasterHandler), 50 );
      }
    };
    
    try{
      var writer = read ? self.serverConfig.checkoutReader() : self.serverConfig.checkoutWriter();
      // debug(inspect(writer))
      
      writer.send(db_command)
      // self.serverConfig.primary.send(db_command);   
    } catch(err){
      if(callback instanceof Function) {        
        delete self.notReplied[db_command.getRequestId().toString()];        
        return callback(err, null);
      }

      // Return error object
      return err;
    }
};

/**
  Connect to URL
**/
Db.DEFAULT_URL = 'mongo://localhost:27017/default';

exports.connect = function(url, callback) {
  config = require('url').parse(url || Db.DEFAULT_URL);

  if (!config['protocol'].match(/^mongo/))
    throw Error("URL must be in the format mongo://user:pass@host:port/dbname");

  var host = config['hostname'] || 'localhost';
  var port = config['port'] || Connection.DEFAULT_PORT;
  var dbname = config['pathname'].replace(/^\//, '');

  if (config['auth']){
    var auth = config['auth'].split(':', 2);
  }

  var db = new Db(dbname, new Server(host, port, {}), {});
  db.open(function(err, db){
    if(!err && auth){
      db.authenticate(auth[0], auth[1], function(err, success){
        if(success){
          callback(null, db);
        }
        else {
          callback(err ? err : new Error('Could not authenticate user ' + user), null);
        }
      });
    } else {
      callback(err, db);
    }
  });
}


/**
* Checks for latest master by calling isMasterCommand on each server
* of serverConfig
* @param dbcopy{instance of db}
*
**/
Db.prototype.checkMaster_ = function(dbcopy, returnback) {
  var self = dbcopy;
  var hasReturned = false;
  var answers = 0;
  dbcopy.backup = {};  
  var servers = dbcopy.serverConfig.servers;
  
  if(Array.isArray(servers)) {
    for(var serveri = 0; serveri < servers.length; serveri++) {      
      var server = servers[serveri];
      server.master = false;
      
      if(server.connection.connection.readyState == "open" || server.connection.autoReconnect) {
        var db_cmnd = DbCommand.createIsMasterCommand(dbcopy);
        var connect_Callback = function(err, reply) {        
          if(err != null) {
            if (!hasReturned && ( ++answers == dbcopy.serverConfig.servers.length)) {
              if (dbcopy.backup.server && dbcopy.backup.reply) { 
                dbcopy.primary = dbcopy.backup.server.connection;
                return returnback( null, dbcopy.backup.reply, dbcopy );
              } else {
                return returnback( new Error( 'No master found' ) );
              }
            }
          } else {           
            if(reply.documents[0].ismaster == 1) {
              // Locate the master connection and save it
              dbcopy.primary = server.connection;
              server.master = true;
              hasReturned = true;
              return returnback(null, reply, dbcopy);
            } else {
              server.master = false;
              // we may not have a master so we keep a secondary server,
              // that is able to respond, just in case
              dbcopy.backup.server = server;
              dbcopy.backup.reply = reply;
              if ( !hasReturned && ( ++answers == dbcopy.serverConfig.servers.length )) {
                if ( dbcopy.backup.server && dbcopy.backup.reply ) { 
                  dbcopy.primary = dbcopy.backup.server.connection;
                  return returnback( null, dbcopy.backup.reply, dbcopy );
                } else {
                  return returnback(new Error( 'No master found' ));
                }
              }
            }         
          }
        }
      
        dbcopy.on(db_cmnd.getRequestId().toString(), connect_Callback);
        self.notReplied[db_cmnd.getRequestId().toString()] = server.connection;  
      
        if(server.connection.connection.readyState == "open") {
          server.connection.sendwithoutReconnect(db_cmnd); 
        } else {
           // This if it's closed it may not have a listener
          // The listener is of general use so we need not use one for every command
          if (!server.connection.listeners("data").length) { 
            server.connection.on("data", function(message) {
              // Parse the data as a reply object
              var reply = null;    
              if ( message ) {
                reply = new MongoReply(self, message);
              } else {
                reply = {};
                reply.responseHasError = true;
                reply.documents = ['Error connecting'];
              }
              // Emit error if there is one       
              reply.responseHasError ? self.emit(reply.responseTo.toString(), reply.documents[0], reply) : self.emit(reply.responseTo.toString(), null, reply);
              // Remove the listener
              if(self.notReplied[ reply.responseTo.toString()]) {
                delete self.notReplied[ reply.responseTo.toString()];
                self.removeListener(reply.responseTo.toString(), self.listeners( reply.responseTo.toString())[0]);
              }
            });
          }
      
          if (server.connection.listeners("error").length == 0) {
            server.connection.on("error", function(err) {
              dbcopy.emit("error", err);
              server.master = false;
            });      
          }
          
          // Emit timeout and close events so the client using db can figure do proper error handling (emit contains the connection that triggered the event)
          if (server.connection.listeners("timeout").length == 0) {
            server.connection.on("timeout", function() { dbcopy.emit("timeout", this); });          
          }
          
          if (server.connection.listeners("close").length == 0) {
            server.connection.on("close", function() { dbcopy.emit("close", this); });          
          }
          
          // debug("========================================================= 4");

          var writer = read ? server.checkoutReader() : server.checkoutWriter();
          writer.send(db_cmnd);
          // server.connection.send(db_cmnd); 
        } 
      } else {
        server.master = false;
      
        if (!hasReturned && ( ++answers == dbcopy.serverConfig.servers.length)) {
          if (dbcopy.backup.server && dbcopy.backup.reply) { 
            dbcopy.primary = dbcopy.backup.server.connection;
            return returnback( null, dbcopy.backup.reply, dbcopy );
          } else {
            return returnback( new Error( 'No master found' ) );
          }
        }
      }
    }          
  }
}
