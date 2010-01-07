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
        if(reply[0].documents[0].ismaster == 1) {
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
Db.prototype.collections_info = function(collection_name, callback) {
  // Create selector
  var selector = {};
  // If we are limiting the access to a specific collection name
  if(collection_name != null) selector["name"] = collection_name;  
  // Execute command
  this.executeCommand(DbCommand.createCollectionInfoCommand(this.databaseName, selector), callback);
}

/**
  Get the list of all collection names for the specified db
**/
Db.prototype.collection_names = function(collection_name, callback) {
  var self = this;
  // Let's make our own callback to reuse the existing collections info method
  this.collections_info(collection_name, function(reply) {
    // List of result documents that have been filtered
    var filtered_documents = [];
    // Remove any collections that are not part of the db or a system db signed with $
    for(var index in reply[0].documents) {
      var document = reply[0].documents[index];
      if(!(document.name.indexOf(self.databaseName) == -1 || document.name.indexOf('$') != -1)) {
        filtered_documents.push(document);
      }
    }
    // Set the documents to point to the filtered array
    reply[0].documents = filtered_documents;
    // Return filtered items    
    callback(reply);
  });
}

/**
  Fetch a specific collection (containing the actual collection information)
**/
Db.prototype.collection = function(collectionName) {
  return new Collection(this, collectionName);
}

/**
  Fetch all collections for the given db
**/
Db.prototype.collections = function(callback) {
  var self = this;
  // Let's get the collection names
  this.collection_names(null, function(replies) {
    var collections = [];
    if(replies.length > 0) {
      var documents = replies[0].documents;
      for(var index in documents) {
        collections.push(new Collection(self, documents[index].name.replace(self.databaseName + ".", '')));
      }
    }
    // Return the collection objects
    callback(collections);
  });
}

/**
  Authenticate against server
**/
Db.prototype.authenticate = function(username, password, callback) {
  var self = this;
  // Create callback for the nonce
  var nonce_callback = function(reply) {
    // Nonce used to make authentication request with md5 hash
    var nonce = reply[0].documents[0].nonce;
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
Db.prototype.createCollection = function(collectionName, callback) {
  this.executeCommand(DbCommand.createCreateCollectionCommand(this.databaseName, collectionName), callback);
}

/**
  Drop Collection
**/
Db.prototype.dropCollection = function(collectionName, callback) {  
  this.executeCommand(DbCommand.createDropCollectionCommand(this.databaseName, collectionName), callback);
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
  this.executeCommand(DbCommand.createGetLastErrorCommand(this.databaseName), callback);  
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
  this.executeCommand(DbCommand.createGetPreviousErrorsCommand(this.databaseName), callback);        
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
Db.prototype.createIndex = function(collectionName, fieldOrSpec, unique, callback) {
  this.executeCommand(DbCommand.createCreateIndexCommand(this.databaseName, collectionName, fieldOrSpec, unique), callback);          
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
Db.prototype.indexInformation = function(collectionName, callback) {
  this.executeCommand(DbCommand.createIndexInformationCommand(this.databaseName, collectionName), callback);              
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










