require("mongodb/bson/bson");
require("mongodb/bson/collections");
require("mongodb/bson/binary_parser");
require("mongodb/commands/base_command");
require("mongodb/commands/query_command");
require("mongodb/commands/db_command");
require("mongodb/responses/mongo_reply");
require("mongodb/connection");
require("mongodb/collection");

require("goog/math/integer");
require("goog/math/long");

sys = require("sys");

Db = function(databaseName, nodes, options) {  
  this.databaseName = databaseName;
  this.nodes = nodes;
  this.options = options;
  // State of the db connection
  this.state = 'notConnected';
  // Set up this object as an emitter
  process.EventEmitter.call(this);  
  // Contains all the connections for the db
  this.connections = {};
  // Queued up callbacks (used to ensure execution happens in the right order)
  this.callbacks = {};
  // Stores the master server if any
  this.master_connection = null;
  // Added strict 
  this.strict = options['strict'] == null ? false : options['strict'];
}

// Set basic prototype
Db.prototype = new process.EventEmitter();
Db.prototype.open = function() {
  this.initialize(this.databaseName, this.nodes, this.options);  
}
Db.prototype.initialize = function(databaseName, nodes, options) {  
  var self = this;
  
  for(var index in nodes) {
    // Unpack node information
    var host = nodes[index].host;
    var port = nodes[index].port; 
    var auto_reconnect = nodes[index]['auto_reconnect'] == null ? false : nodes[index]['auto_reconnect'];
    // Create a connection
    var connection = new Connection(host, port, auto_reconnect);
    // Keep connections in the hash
    this.connections["" + host + "" + port] = connection;
    var index = 0;
    // Add a connection handler to set up the db
    connection.addListener("connect", function() {
      // Create db command 
      var db_command = DbCommand.createIsMasterCommand(self.databaseName);
      // Create a callback function for a given connection
      var callback = function(reply) {
        // Locate the master connection and save it
        if(reply[0].documents[0].get('ismaster') == 1) {
          self.master_connection = connection;
          // emit a message saying we got a master and are ready to go and change state to reflect it
          if(self.state == 'notConnected') {
            self.state = 'connected';
            self.emit("connect");                      
          }
        }
      };    
      // Add the callback to the list of callbacks by the request id (mapping outgoing messages to correct callbacks)
      self.callbacks[db_command.getRequestId()] = callback;
      // Let's send a request to identify the state of the server
      this.send(db_command);
    });        
    // Add a handler for data receive events
    connection.addListener("receive", function(messages) {
      for(var index in messages) {  
        // sys.puts("xxxxxxxxxxxxxxxxxxxxxxxxx RECEIVED MESSAGE");
        // new BinaryParser().pprint(messages[index]);          
        // Parse the data as a reply object
        var reply = new MongoReply(messages[index]);
        //Deliver the reply to a registered callback for the message
        if(self.callbacks[reply.responseTo] != undefined) {
          // Get callback function
          var callback = self.callbacks[reply.responseTo];
          // Remove callback from object
          delete self.callbacks[reply.responseTo];
          // Call the function with the result
          callback([reply]);
        }        
      }
    });    
    // Open the connection
    connection.open();
  }  
}

Db.prototype.close = function(listener) {
  for(var key in this.connections) this.connections[key].close(listener);
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
    cursor.toArray(function(documents) {
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
  
  if(self.strict) {
    self.collectionNames(function(collections) {
      if(collections.length == 0) {
        callback({ok:false, err:true, errmsg:("Collection " + collectionName + " does not exist. Currently in strict mode.")});
      } else {
        callback(new Collection(self, collectionName));        
      }
    }, collectionName);
  } else {
    callback(new Collection(self, collectionName));
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
      callback(new Collection(self, collectionName)); return;
    }

    // Create a new collection and return it
    self.executeCommand(DbCommand.createCreateCollectionCommand(self.databaseName, collectionName, options), function(results) {
      if(results[0].documents[0].get('ok') == 1) {
        callback(new Collection(self, collectionName));
      } else {
        callback({ok:false, err:true, errmsg:("Error creating collection: " + collectionName)});
      }
    });
  }, collectionName);  
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
  this.callbacks[db_command.getRequestId()] = callback;  
  // Execute command
  this.master_connection.send(db_command);          
}










