require('mongodb/lang/oo');

var events = require("events");
var mongo = require('mongodb/connection');
process.mixin(mongo, require('mongodb/responses/mongo_reply'));
process.mixin(mongo, require('mongodb/admin'));
process.mixin(mongo, require('mongodb/cursor'));
process.mixin(mongo, require('mongodb/collection'));
process.mixin(mongo, require('mongodb/bson/bson'));
process.mixin(mongo, require('mongodb/bson/binary_parser'));
process.mixin(mongo, require('mongodb/bson/collections'));
process.mixin(mongo, require('mongodb/commands/db_command'));
process.mixin(mongo, require('mongodb/commands/query_command'));

// Mixin in request generator into global
process.mixin(GLOBAL, require("mongodb/commands/request_id_generator"));
// Make Class an event emitter
process.inherits(Class, events.EventEmitter);

var sys = require("sys");
var events = require("events");

exports.Db = Class({ 
  init: function(databaseName, serverConfig, options) {  
    this.databaseName = databaseName;
    this.serverConfig = serverConfig;
    this.options = options == null ? {} : options;
    this.className = "Db";
    // Mixin event emitter
    events.EventEmitter.call(this);
    // State of the db connection
    this.state = 'notConnected';
    this.pkFactory = this.options['pk'] == null ? mongo.ObjectID : this.options['pk'];
    // Contains all the connections for the db
    this.connections = [];
    // Added strict 
    this.strict = this.options['strict'] == null ? false : this.options['strict'];
  },
  
  open: function(callback) {
    var self = this;

    // Set up connections
    if(self.serverConfig.className == "Server") {
      self.serverConfig.connection = new mongo.Connection(self.serverConfig.host, self.serverConfig.port, self.serverConfig.autoReconnect);
      self.connections.push(self.serverConfig.connection);
      var server = self.serverConfig;

      self.serverConfig.connection.addListener("connect", function() {
        // Create a callback function for a given connection
        var connectCallback = function(reply) {
          // Locate the master connection and save it
          if(reply[0].documents[0].ismaster == 1) {
            self.serverConfig.master = true;
            // emit a message saying we got a master and are ready to go and change state to reflect it
            if(self.state == 'notConnected') {
              self.state = 'connected';
              callback(self);
            }
          }
        };    
        // Create db command and Add the callback to the list of callbacks by the request id (mapping outgoing messages to correct callbacks)
        var db_command = mongo.DbCommand.createIsMasterCommand(self.databaseName);
        self.addListener(db_command.getRequestId().toString(), connectCallback);
        // Let's send a request to identify the state of the server
        this.send(db_command);
      });

      self.serverConfig.connection.addListener("data", function(messages) {          
        messages.forEach(function(message) {
          // Parse the data as a reply object
          var reply = new mongo.MongoReply(message);
          self.emit(reply.responseTo.toString(), [reply]);
          self.removeListener(reply.responseTo.toString(), self.listeners(reply.responseTo.toString())[0]);          
        });
      });
      // Emit timeout and close events so the client using db can figure do proper error handling (emit contains the connection that triggered the event)
      self.serverConfig.connection.addListener("timeout", function() { self.emit("timeout", this); });            
      self.serverConfig.connection.addListener("close", function() { self.emit("close", this); });      
      // Open the connection
      self.serverConfig.connection.open();
    } else if(self.serverConfig.className == "ServerPair" || self.serverConfig.className == "ServerCluster") {
      var serverConnections = self.serverConfig.className == "ServerPair" ? [self.serverConfig.leftServer, self.serverConfig.rightServer] : self.serverConfig.servers;
      var numberOfConnectedServers = 0;
      serverConnections.forEach(function(server) {
        server.connection = new mongo.Connection(server.host, server.port, server.autoReconnect);
        self.connections.push(server.connection);

        server.connection.addListener("connect", function() {
          // Create a callback function for a given connection
          var connectCallback = function(reply) {
            // Locate the master connection and save it
            if(reply[0].documents[0].ismaster == 1) {
              self.masterConnection = server.connection;
              server.master = true;
            }
            
            // emit a message saying we got a master and are ready to go and change state to reflect it
            if(++numberOfConnectedServers == serverConnections.length && self.state == 'notConnected') {
              self.state = 'connected';
              callback(self);
            }
          };    
          // Create db command and Add the callback to the list of callbacks by the request id (mapping outgoing messages to correct callbacks)
          var db_command = mongo.DbCommand.createIsMasterCommand(self.databaseName);
          self.addListener(db_command.getRequestId().toString(), connectCallback);
          // Let's send a request to identify the state of the server
          this.send(db_command);
        });

        server.connection.addListener("data", function(messages) {           
          messages.forEach(function(message) {
            // Parse the data as a reply object
            var reply = new mongo.MongoReply(message);
            self.emit(reply.responseTo.toString(), [reply]);
            self.removeListener(reply.responseTo.toString(), self.listeners(reply.responseTo.toString())[0]);            
          });
        });

        // Emit timeout and close events so the client using db can figure do proper error handling (emit contains the connection that triggered the event)
        server.connection.addListener("timeout", function() { self.emit("timeout", this); });            
        server.connection.addListener("close", function() { self.emit("close", this); });      
        // Open the connection
        server.connection.open();
      });
    } else {
      throw Error("Server parameter must be of type Server, ServerPair or ServerCluster");
    }
  },
  
  close: function() {
    this.connections.forEach(function(connection) { connection.close(); });
  },
  
  admin: function(callback) {
    callback(null, new mongo.Admin(this));
  },
  
  /**
    Get the list of all collections for a mongo master server
  **/
  collectionsInfo: function(collection_name, callback) {
    if(callback == null) { callback = collection_name; collection_name = null; }
    // Create selector
    var selector = {};
    // If we are limiting the access to a specific collection name
    if(collection_name != null) selector["name"] = this.databaseName + "." + collection_name;  
    // Return Cursor
    callback(null, new mongo.Cursor(this, new mongo.Collection(this, mongo.DbCommand.SYSTEM_NAMESPACE_COLLECTION), selector));
  },
  
  /**
    Get the list of all collection names for the specified db
  **/
  collectionNames: function(collection_name, callback) {
    if(callback == null) { callback = collection_name; collection_name = null; }
    var self = this;
    // Let's make our own callback to reuse the existing collections info method
    self.collectionsInfo(collection_name, function(err, cursor) {    
      cursor.toArray(function(err, documents) {
        // List of result documents that have been filtered
        var filtered_documents = [];
        // Remove any collections that are not part of the db or a system db signed with $
        documents.forEach(function(document) {
          if(!(document.name.indexOf(self.databaseName) == -1 || document.name.indexOf('$') != -1)) filtered_documents.push(document);
        });
        // Return filtered items    
        callback(null, filtered_documents);      
      });
    });
  },
  
  /**
    Fetch a specific collection (containing the actual collection information)
  **/
  collection: function(collectionName, callback) {
    var self = this;

    try {
      if(self.strict) {
        try {
          self.collectionNames(collectionName, function(err, collections) {
            if(collections.length == 0) {
              callback(new Error("Collection " + collectionName + " does not exist. Currently in strict mode."), null);
            } else {
              callback(null, new mongo.Collection(self, collectionName, self.pkFactory));        
            }
          });
        } catch(err) {
          throw err;
        }
      } else {
        callback(null, new mongo.Collection(self, collectionName, self.pkFactory));
      }    
    } catch(err) {
      callback(new Error(err.toString()), null);
    }
  },
    
  /**
    Fetch all collections for the given db
  **/
  collections: function(callback) {
    var self = this;
    // Let's get the collection names
    self.collectionNames(function(err, documents) {
      var collections = [];
      documents.forEach(function(document) {
        collections.push(new mongo.Collection(self, document.name.replace(self.databaseName + ".", '')));        
      })
      // Return the collection objects
      callback(null, collections);
    });
  },
  
  /**
    Evaluate javascript on the server
  **/
  eval: function(code, parameters, callback) {
    if(typeof parameters === "function") { callback = parameters; parameters = null}    
    var finalCode = code;
    var finalParameters = [];
    // If not a code object translate to one
    if(!(finalCode.className == "Code")) {
      finalCode = new mongo.Code(finalCode);
    }

    // Ensure the parameters are correct
    if(parameters != null && parameters.constructor != Array) {
      finalParameters = [parameters];
    } else if(parameters != null && parameters.constructor == Array) {
      finalParameters = parameters;
    }  
    // Create execution selector
    var selector = new mongo.OrderedHash().add('$eval', finalCode).add('args', finalParameters);
    // Iterate through all the fields of the index
    new mongo.Cursor(this, new mongo.Collection(this, mongo.DbCommand.SYSTEM_COMMAND_COLLECTION), selector, {}, 0, -1).nextObject(function(err, result) {
      if(result.ok == 1) {
        callback(null, result.retval);
      } else {
        callback(new Error("eval failed: " + result.errmsg), null); return;
      }
    });
  },
  
  dereference: function(dbRef, callback) {
    this.collection(dbRef.namespace, function(err, collection) {
      collection.findOne({'_id':dbRef.oid}, function(err, result) {
        callback(err, result);
      });
    });
  },
  
  /**
    Authenticate against server
  **/
  authenticate: function(username, password, callback) {
    var self = this;
    // Execute command
    this.executeCommand(mongo.DbCommand.createGetNonceCommand(self.databaseName), function(reply) {
      // Nonce used to make authentication request with md5 hash
      var nonce = reply[0].documents[0].nonce;
      // Execute command
      self.executeCommand(mongo.DbCommand.createAuthenticationCommand(self.databaseName, username, password, nonce), function(results) {
        if(results[0].documents[0].ok == 1) {
          callback(null, true);
        } else {
          callback(new Error(results[0].documents[0].errmsg), false);
        }        
      });
    });
  },
  
  /**
    Add a user
  **/
  addUser: function(username, password, callback) {
    var userPassword = MD5.hex_md5(username + ":mongo:" + password);
    // Fetch a user collection
    this.collection(mongo.DbCommand.SYSTEM_USER_COLLECTION, function(err, collection) {
      // Insert the user into the system users collections
      collection.insert({'user':username, 'pwd':userPassword}, function(err, documents) {
        callback(err, documents);
      });      
    });    
  },
  
  /**
    Remove a user
  **/
  removeUser: function(username, callback) {
    // Fetch a user collection
    this.collection(mongo.DbCommand.SYSTEM_USER_COLLECTION, function(err, collection) {
      collection.findOne({'user':username}, function(err, user) {
        if(user != null) {
          collection.remove({'user':username}, function(err, result) {
            callback(err, true);
          });
        } else {
          callback(err, false);
        }
      });
    });        
  },
  
  /**
    Logout user (if authenticated)
  **/
  logout: function(callback) {
    this.executeCommand(mongo.DbCommand.createLogoutCommand(this.databaseName), callback);
  },
  
  /**
    Create Collection
  **/
  createCollection: function(collectionName, options, callback) {
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
        callback(null, new mongo.Collection(self, collectionName, self.pkFactory)); return;
      }

      // Create a new collection and return it
      self.executeCommand(mongo.DbCommand.createCreateCollectionCommand(self.databaseName, collectionName, options), function(results) {
        if(results[0].documents[0].ok == 1) {
          callback(null, new mongo.Collection(self, collectionName, self.pkFactory));
        } else {
          callback(null, new Error("Error creating collection: " + collectionName));
        }
      });
    });  
  },
  
  command: function(selector, callback) {
    if(!(selector.className == "OrderedHash")) {
      callback(new Error("command must be given an OrderedHash"), null);
    } else {
      var cursor = new mongo.Cursor(this, new mongo.Collection(this, mongo.DbCommand.SYSTEM_COMMAND_COLLECTION), selector, {}, 0, -1, null, null, null, null, mongo.QueryCommand.OPTS_NO_CURSOR_TIMEOUT);
      cursor.nextObject(callback);
    }  
  },
  
  /**
    Drop Collection
  **/
  dropCollection: function(collectionName, callback) {  
    this.executeCommand(mongo.DbCommand.createDropCollectionCommand(this.databaseName, collectionName), function(results) {    
      if(results[0].documents[0].ok == 1) {      
        callback(null, true);
      } else {
        callback(new Error(results[0].documents[0].errmsg), null);
      }
    });
  },
  
  /**
    Rename Collection
  **/
  renameCollection: function(fromCollection, toCollection, callback) {
    this.executeCommand(mongo.DbCommand.createRenameCollectionCommand(this.databaseName, fromCollection, toCollection), function(documents) { callback(null, documents); });
  },
  
  /**
    Return last error message for the given connection
  **/
  lastError: function(callback) {
    this.executeCommand(mongo.DbCommand.createGetLastErrorCommand(this.databaseName), function(errors) {
      callback(errors[0].documents);
    });  
  },
  
  error: function(callback) {
    this.lastError(callback);
  },
  
  /**
    Return the status for the last operation on the given connection
  **/
  lastStatus: function(callback) {
    this.executeCommand(mongo.DbCommand.createGetLastStatusCommand(this.databaseName), callback);    
  },
  
  /**
    Return all errors up to the last time db reset_error_history was called
  **/
  previousErrors: function(callback) {
    this.executeCommand(mongo.DbCommand.createGetPreviousErrorsCommand(this.databaseName), function(errors) {
      callback(errors[0].documents);
    });
  },
  
  /**
    Forces error on server
  **/
  executeDbCommand: function(command_hash, callback) {
    this.executeCommand(mongo.DbCommand.createDbCommand(this.databaseName, command_hash), callback);          
  },
  
  /**
    Resets the error history of the mongo instance
  **/
  resetErrorHistory: function(callback) {
    this.executeCommand(mongo.DbCommand.createResetErrorHistoryCommand(this.databaseName), callback);        
  },
  
  /**
    Create an index on a collection
  **/
  createIndex: function(collectionName, fieldOrSpec, unique, callback) {
    if(callback == null) { callback = unique; unique = null; }
    var command = mongo.DbCommand.createCreateIndexCommand(this.databaseName, collectionName, fieldOrSpec, unique);
    this.executeCommand(command, function(result) {});          
    callback(null, command.documents[0].name);
  },
  
  /**
    Fetch the cursor information
  **/
  cursorInfo: function(callback) {
    this.executeCommand(mongo.DbCommand.createDbCommand(this.databaseName, {'cursorInfo':1}), function(results) {
      callback(null, results[0].documents[0]);
    });            
  },

  /**
    Drop Index on a collection
  **/
  dropIndex: function(collectionName, indexName, callback) {
    this.executeCommand(mongo.DbCommand.createDropIndexCommand(this.databaseName, collectionName, indexName), callback);            
  },
  
  /**
    Index Information
  **/
  indexInformation: function(collectionName, callback) {
    if(typeof collectionName === "function") { callback = collectionName; collectionName = null}    
    // Build selector for the indexes
    var selector = collectionName != null ? {'ns':(this.databaseName + "." + collectionName)} : {};
    var info = {};
    // Iterate through all the fields of the index
    new mongo.Cursor(this, new mongo.Collection(this, mongo.DbCommand.SYSTEM_INDEX_COLLECTION), selector).each(function(err, index) {
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
  },
  
  /**
    Database Drop Commando
  **/
  dropDatabase: function(callback) {
    this.executeCommand(mongo.DbCommand.createDropDatabaseCommand(this.databaseName), function(result) {
      callback(null, result);
    });                
  },

  /**
    Execute db command
  **/
  executeCommand: function(db_command, callback) {
    // Add the callback to the list of callbacks by the request id (mapping outgoing messages to correct callbacks)
    this.addListener(db_command.getRequestId().toString(), callback);
    // Execute command
    this.serverConfig.masterConnection.send(db_command);          
  }
})









