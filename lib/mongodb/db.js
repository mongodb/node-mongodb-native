require("mongodb/bson/bson");
require("mongodb/bson/collections");
require("mongodb/bson/binary_parser");
require("mongodb/commands/base_command");
require("mongodb/commands/query_command");
require("mongodb/commands/db_command");
require("mongodb/responses/mongo_reply");
require("mongodb/connection");
require("mongodb/collection");
require("mongodb/admin");

require("goog/math/integer");
require("goog/math/long");

sys = require("sys");

Db = function(databaseName, serverObject, options) {  
  this.databaseName = databaseName;
  this.serverObject = serverObject;
  this.options = options == null ? {} : options;
  // State of the db connection
  this.state = 'notConnected';
  this.pkFactory = this.options['pk'] == null ? ObjectID : this.options['pk'];
  // Set up this object as an emitter
  process.EventEmitter.call(this);  
  // // Contains all the connections for the db
  this.connections = [];
  // Queued up callbacks (used to ensure execution happens in the right order)
  this.callbacks = {};
  // Stores the master server if any
  this.masterConnection = null;
  // Added strict 
  this.strict = this.options['strict'] == null ? false : this.options['strict'];
}

// Set basic prototype
Db.prototype = new process.EventEmitter();
Db.prototype.open = function() {
  var self = this;
    
  // Set up connections
  if(self.serverObject instanceof Server) {
    // var emitter = new process.EventEmitter();
    self.serverObject.connection = new Connection(self.serverObject.host, self.serverObject.port, self.serverObject.autoReconnect);
    self.connections.push(self.serverObject.connection);
    var server = self.serverObject;
    
    self.serverObject.connection.addListener("connect", function() {
      // Create a callback function for a given connection
      var callback = function(reply) {
        // Locate the master connection and save it
        if(reply[0].documents[0].get('ismaster') == 1) {
          self.masterConnection = server.connection;
          self.serverObject.master = true;
          // emit a message saying we got a master and are ready to go and change state to reflect it
          if(self.state == 'notConnected') {
            self.state = 'connected';
            self.emit("connect");                      
          }
        }
      };    
      // Create db command and Add the callback to the list of callbacks by the request id (mapping outgoing messages to correct callbacks)
      var db_command = DbCommand.createIsMasterCommand(self.databaseName);
      // self.callbacks[db_command.getRequestId()] = callback;
      self.addListener(db_command.getRequestId().toString(), callback);
      // Let's send a request to identify the state of the server
      this.send(db_command);
    });
    
    self.serverObject.connection.addListener("receive", function(messages) {          
      for(var index in messages) {  
        // Parse the data as a reply object
        var reply = new MongoReply(messages[index]);
        self.emit(reply.responseTo.toString(), [reply]);
        self.removeListener(reply.responseTo.toString(), self.listeners(reply.responseTo.toString())[0]);
      }
    });
    // Open the connection
    self.serverObject.connection.open();
    return;
  } else if(self.serverObject instanceof ServerPair || self.serverObject instanceof ServerCluster) {
    var serverConnections = self.serverObject instanceof ServerPair ? [self.serverObject.leftServer, self.serverObject.rightServer] : self.serverObject.servers;
    var numberOfConnectedServers = 0;
    serverConnections.forEach(function(server) {
      server.connection = new Connection(server.host, server.port, server.autoReconnect);
      self.connections.push(server.connection);

      server.connection.addListener("connect", function() {
        // Create a callback function for a given connection
        var callback = function(reply) {
          // Locate the master connection and save it
          if(reply[0].documents[0].get('ismaster') == 1) {
            self.masterConnection = server.connection;
            server.master = true;
          }

          // emit a message saying we got a master and are ready to go and change state to reflect it
          if(++numberOfConnectedServers == serverConnections.length) {
            self.state = 'connected';
            self.emit("connect");                      
          }
        };    
        // Create db command and Add the callback to the list of callbacks by the request id (mapping outgoing messages to correct callbacks)
        var db_command = DbCommand.createIsMasterCommand(self.databaseName);
        // self.callbacks[db_command.getRequestId()] = callback;
        self.addListener(db_command.getRequestId().toString(), callback);
        // Let's send a request to identify the state of the server
        this.send(db_command);
      });

      server.connection.addListener("receive", function(messages) {                  
        for(var index in messages) {  
          // Parse the data as a reply object
          var reply = new MongoReply(messages[index]);
          self.emit(reply.responseTo.toString(), [reply]);
          self.removeListener(reply.responseTo.toString(), self.listeners(reply.responseTo.toString())[0]);
        }
      });
      // Open the connection
      server.connection.open();
    });
  } else {
    throw Error("Server parameter must be of type Server, ServerPair or ServerCluster");
  }
}

Db.prototype.close = function() {
  this.connections.forEach(function(connection) { connection.close(); });
}

Db.prototype.admin = function(callback) {
  callback(new Admin(this));
}

/**
  Get the list of all collections for a mongo master server
**/
Db.prototype.collectionsInfo = function(callback, collection_name) {
  // Create selector
  var selector = {};
  // If we are limiting the access to a specific collection name
  if(collection_name != null) selector["name"] = this.databaseName + "." + collection_name;  
  // Return Cursor
  callback(new Cursor(this, new Collection(this, DbCommand.SYSTEM_NAMESPACE_COLLECTION), selector));
}

/**
  Get the list of all collection names for the specified db
**/
Db.prototype.collectionNames = function(callback, collection_name) {
  var self = this;

  // Let's make our own callback to reuse the existing collections info method
  self.collectionsInfo(function(cursor) {    
    // sys.puts("self.collectionsInfo(function(cursor)");
    
    cursor.toArray(function(documents) {
      // sys.puts("cursor.toArray(function(documents)");
      // List of result documents that have been filtered
      var filtered_documents = [];
      // Remove any collections that are not part of the db or a system db signed with $
      documents.forEach(function(document) {
        if(!(document.get('name').indexOf(self.databaseName) == -1 || document.get('name').indexOf('$') != -1)) filtered_documents.push(document);
      });
      // Return filtered items    
      callback(filtered_documents);      
    });
  }, collection_name);
}

/**
  Fetch a specific collection (containing the actual collection information)
**/
Db.prototype.collection = function(callback, collectionName) {
  var self = this;
  try {
    if(self.strict) {
      self.collectionNames(function(collections) {
        if(collections.length == 0) {
          callback({ok:false, err:true, errmsg:("Collection " + collectionName + " does not exist. Currently in strict mode.")});
        } else {
          callback(new Collection(self, collectionName, self.pkFactory));        
        }
      }, collectionName);
    } else {
      callback(new Collection(self, collectionName, self.pkFactory));
    }    
  } catch(err) {
    callback({ok:false, err:true, errmsg:err.toString()});
  }
}

/**
  Fetch all collections for the given db
**/
Db.prototype.collections = function(callback) {
  var self = this;
  // Let's get the collection names
  self.collectionNames(function(documents) {
    var collections = [];
    documents.forEach(function(document) {
      collections.push(new Collection(self, document.get('name').replace(self.databaseName + ".", '')));        
    })
    // Return the collection objects
    callback(collections);
  });
}

/**
  Evaluate javascript on the server
**/
Db.prototype.eval = function(callback, code, parameters) {
  var finalCode = code;
  var finalParameters = [];
  // If not a code object translate to one
  if(!(finalCode instanceof Code)) {
    finalCode = new Code(finalCode);
  }
  
  // Ensure the parameters are correct
  if(parameters != null && parameters.constructor != Array) {
    finalParameters = [parameters];
  } else if(parameters != null && parameters.constructor == Array) {
    finalParameters = parameters;
  }  
  // Create execution selector
  var selector = new OrderedHash().add('$eval', finalCode).add('args', finalParameters);
  // Iterate through all the fields of the index
  new Cursor(this, new Collection(this, DbCommand.SYSTEM_COMMAND_COLLECTION), selector, {}, 0, -1).nextObject(function(result) {
    if(result.get('ok') == 1) {
      callback(result.get('retval'));
    } else {
      callback({ok:false, err:true, errmsg:("eval failed: " + result.get('errmsg'))}); return;
    }
  });
}

Db.prototype.dereference = function(callback, dbRef) {
  this.collection(function(collection) {
    collection.findOne(function(result) {
      callback(result);
    }, {'_id':dbRef.oid});
  }, dbRef.namespace);
}

/**
  Authenticate against server
**/
Db.prototype.authenticate = function(username, password, callback) {
  var self = this;
  // Create callback for the nonce
  var nonce_callback = function(reply) {
    // Nonce used to make authentication request with md5 hash
    var nonce = reply[0].documents[0].get('nonce');
    // Execute command
    self.executeCommand(DbCommand.createAuthenticationCommand(self.databaseName, username, password, nonce), callback);
  }     
  // Execute command
  this.executeCommand(DbCommand.createGetNonceCommand(self.databaseName), nonce_callback);
}

/**
  Logout user (if authenticated)
**/
Db.prototype.logout = function(callback) {
  this.executeCommand(DbCommand.createLogoutCommand(this.databaseName), callback);
}

/**
  Create Collection
**/
Db.prototype.createCollection = function(callback, collectionName, options) {
  var self = this;
  // Check if we have the name 
  this.collectionNames(function(collections) {    
    var found = false;
    collections.forEach(function(collection) {
      if(collection.get('name') == self.databaseName + "." + collectionName) found = true;
    });
    
    // If the collection exists either throw an exception (if db in strict mode) or return the existing collection
    if(found && self.strict) {
      callback({ok:false, err:true, errmsg:("Collection " + collectionName + " already exists. Currently in strict mode.")}); return;
    } else if(found){
      callback(new Collection(self, collectionName, self.pkFactory)); return;
    }

    // Create a new collection and return it
    self.executeCommand(DbCommand.createCreateCollectionCommand(self.databaseName, collectionName, options), function(results) {
      if(results[0].documents[0].get('ok') == 1) {
        callback(new Collection(self, collectionName, self.pkFactory));
      } else {
        callback({ok:false, err:true, errmsg:("Error creating collection: " + collectionName)});
      }
    });
  }, collectionName);  
}

Db.prototype.command = function(callback, selector) {
  if(!(selector instanceof OrderedHash)) {
    callback({ok:false, err:true, errmsg:"command must be given an OrderedHash"});      
  } else {
    //Cursor = function(db, collection, selector, fields, skip, limit, sort, hint, explain, snapshot, timemout) {    
    var cursor = new Cursor(this, new Collection(this, DbCommand.SYSTEM_COMMAND_COLLECTION), selector, {}, 0, -1, null, null, null, null, QueryCommand.OPTS_NO_CURSOR_TIMEOUT);
    cursor.nextObject(callback);
  }  
}

/**
  Drop Collection
**/
Db.prototype.dropCollection = function(callback, collectionName) {  
  this.executeCommand(DbCommand.createDropCollectionCommand(this.databaseName, collectionName), function(results) {    
    if(results[0].documents[0].get('ok') == 1) {      
      callback({ok:true, err:false});
    } else {
      callback({ok:false, err:true, errmsg:results[0].documents[0].get('errmsg')});      
    }
  });
}

/**
  Rename Collection
**/
Db.prototype.renameCollection = function(fromCollection, toCollection, callback) {
  this.executeCommand(DbCommand.createRenameCollectionCommand(this.databaseName, fromCollection, toCollection), callback);
}

/**
  Return last error message for the given connection
**/
Db.prototype.lastError = function(callback) {
  this.executeCommand(DbCommand.createGetLastErrorCommand(this.databaseName), function(errors) {
    callback(errors[0].documents);
  });  
}

Db.prototype.error = function(callback) {
  this.lastError(callback);
}

/**
  Return the status for the last operation on the given connection
**/
Db.prototype.lastStatus = function(callback) {
  this.executeCommand(DbCommand.createGetLastStatusCommand(this.databaseName), callback);    
}

/**
  Return all errors up to the last time db reset_error_history was called
**/
Db.prototype.previousErrors = function(callback) {
  this.executeCommand(DbCommand.createGetPreviousErrorsCommand(this.databaseName), function(errors) {
    callback(errors[0].documents);
  });
}

/**
  Forces error on server
**/
Db.prototype.executeDbCommand = function(command_hash, callback) {
  this.executeCommand(DbCommand.createDbCommand(this.databaseName, command_hash), callback);          
}

/**
  Resets the error history of the mongo instance
**/
Db.prototype.resetErrorHistory = function(callback) {
  this.executeCommand(DbCommand.createResetErrorHistoryCommand(this.databaseName), callback);        
}

/**
  Create an index on a collection
**/
Db.prototype.createIndex = function(callback, collectionName, fieldOrSpec, unique) {
  var command = DbCommand.createCreateIndexCommand(this.databaseName, collectionName, fieldOrSpec, unique);
  this.executeCommand(command, function(result) {});          
  callback(command.documents[0].name);
}

/**
  Fetch the cursor information
**/
Db.prototype.cursorInfo = function(callback) {
  this.executeCommand(DbCommand.createDbCommand(this.databaseName, {'cursorInfo':1}), function(results) {
    callback(results[0].documents[0]);
  });            
}

/**
  Drop Index on a collection
**/
Db.prototype.dropIndex = function(collectionName, indexName, callback) {
  this.executeCommand(DbCommand.createDropIndexCommand(this.databaseName, collectionName, indexName), callback);            
}

/**
  Index Information
**/
Db.prototype.indexInformation = function(callback, collectionName) {
  // Build selector for the indexes
  var selector = collectionName != null ? {'ns':(this.databaseName + "." + collectionName)} : {};
  var info = {};
  // Iterate through all the fields of the index
  new Cursor(this, new Collection(this, DbCommand.SYSTEM_INDEX_COLLECTION), selector).each(function(index) {
    // Return the info when finished
    if(index == null) {
      callback(info);
    } else {
      info[index.get('name')] = [];  
      for(var name in index.get('key').toArray()) {
        info[index.get('name')].push([name, index.get('key').get(name)]);
      }      
    }
  }); 
}

/**
  Database Drop Commando
**/
Db.prototype.dropDatabase = function(callback) {
  this.executeCommand(DbCommand.createDropDatabaseCommand(this.databaseName), callback);                
}

/**
  Utility methods
**/
Db.prototype.executeCommand = function(db_command, callback) {
  // Add the callback to the list of callbacks by the request id (mapping outgoing messages to correct callbacks)
  this.addListener(db_command.getRequestId().toString(), callback);
  // Execute command
  this.masterConnection.send(db_command);          
}










