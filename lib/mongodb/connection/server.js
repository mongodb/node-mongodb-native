var Connection = require('./connection').Connection,
  DbCommand = require('../commands/db_command').DbCommand,
  MongoReply = require('../responses/mongo_reply').MongoReply,
  ConnectionPool = require('./connection_pool').ConnectionPool,
  SimpleEmitter = require('./simple_emitter').SimpleEmitter,
  MongoReply = require("../responses/mongo_reply").MongoReply,
  inherits = require('util').inherits;

var Server = exports.Server = function(host, port, options) {
  var self = this;
  this.host = host;
  this.port = port;
  this.options = options == null ? {} : options;
  this.internalConnection;
  this.internalMaster = false;
  this.connected = false;
  this.poolSize = this.options.poolSize == null ? 1 : this.options.poolSize;
  this.slaveOk = this.options["slave_ok"];
  // Setters and getters
  this.__defineGetter__("autoReconnect", function() { return self.options['auto_reconnect'] == null ? false : this.options['auto_reconnect']; });
  this.__defineGetter__("connection", function() { return self.internalConnection; });
  this.__defineSetter__("connection", function(connection) { self.internalConnection = connection; });
  this.__defineGetter__("master", function() { return self.internalMaster; });
  this.__defineSetter__("master", function(value) { self.internalMaster = value; });
  this.__defineGetter__("primary", function() { return self; });

  // Just keeps list of events we allow
  this.eventHandlers = {error:[], parseError:[], poolReady:[], message:[], close:[]};
  // Internal state of server connection
  this._serverState = 'disconnected';
};

inherits(Server, SimpleEmitter);

Server.prototype.close = function(callback) {  
  // Remove all local listeners
  this.removeAllListeners();
  // Remove all the listeners on the pool so it does not fire messages all over the place  
  this.connectionPool.removeAllEventListeners();
  // Close the connection if it's open
  if(this.connectionPool.isConnected()) this.connectionPool.stop();        
  // Set server status as disconnected
  this._serverState = 'disconnected';  
  // Peform callback if present
  if(typeof callback === 'function') callback();
};

Server.prototype.send = function(command) {
  // this.internalConnection.send(command);         
}

Server.prototype.isConnected = function() {
  return this.connectionPool.isConnected();
}

Server.prototype.allServerInstances = function() {
  return [this];
}

Server.prototype.connect = function(dbInstance, options, callback) {
  if('function' === typeof options) callback = options, options = {};  
  if(options == null) options = {};
  if(!('function' === typeof callback)) callback = null;
  
  // Let's connect
  var server = this;
  // Let's us override the main receiver of events
  var eventReceiver = options.eventReceiver != null ? options.eventReceiver : dbInstance;
  var eventEmitterIsDb = options.eventReceiver != null ? false : true;
  // Save reference to dbInstance
  this.dbInstances = [dbInstance];

  // Set server state to connecting
  this._serverState = 'connecting';
  // Ensure dbInstance can do a slave query if it's set
  dbInstance.slaveOk = this.slaveOk ? this.slaveOk : dbInstance.slaveOk;
  // Create connection Pool instance with the current BSON serializer
  var connectionPool = new ConnectionPool(this.host, this.port, this.poolSize, dbInstance.bson_deserializer);
  
  // Set up a new pool using default settings
  server.connectionPool = connectionPool;
  
  // Set basic parameters passed in
  var firstCall = options.firstCall == null ? false : options.firstCall;
  var returnIsMasterResults = options.returnIsMasterResults == null ? false : options.returnIsMasterResults;
  
  // Create a default connect handler, overriden when using replicasets
  var connectCallback = function(err, reply) {   
    if(err != null) return callback(err, null);
    server.master = reply.documents[0].ismaster == 1 ? true : false;
    server.connectionPool.setMaxBsonSize(reply.documents[0].maxBsonObjectSize);
    // Set server as connected
    server.connected = true;
    // Set db as connected
    dbInstance.state = 'connected';
    
    // If we have it set to returnIsMasterResults
    if(returnIsMasterResults) {
      callback(null, reply);
    } else {
      callback(null, dbInstance);      
    }
  };
  
  // Let's us override the main connect callback
  var connectHandler = options.connectHandler == null ? connectCallback : options.connectHandler;  

  // Set up on connect method
  connectionPool.on("poolReady", function() {   
    // Create db command and Add the callback to the list of callbacks by the request id (mapping outgoing messages to correct callbacks)
    var db_command = DbCommand.NcreateIsMasterCommand(dbInstance, dbInstance.databaseName);    
    // Check out a reader from the pool
    var connection = connectionPool.checkoutConnection();

    // Register handler for messages
    dbInstance._registerHandler(db_command, false, connection, connectHandler);
    
    // Write the command out
    connection.write(db_command);
  })

  // Set up item connection
  connectionPool.on("message", function(message) {
    // Do this in a process tick
    process.nextTick(function() {
      // Attempt to parse the message
      try {
        // Create a new mongo reply
        var mongoReply = new MongoReply()
        // Parse the header
        mongoReply.parseHeader(message, connectionPool.bson)      
        // If message size is not the same as the buffer size
        // something went terribly wrong somewhere
        if(mongoReply.messageLength != message.length) {
          // Force close the pool
          if(connectionPool.isConnected()) server.close();        
          // Emit the error
          eventReceiver.emit("error", new Error("bson length is different from message length"));        
        } else {
          // Attempt to locate a callback instance
          for(var i = 0; i < server.dbInstances.length; i++) {
            var dbInstanceObject = server.dbInstances[i];
            // Locate the callback info
            var callbackInfo = dbInstanceObject._findHandler(mongoReply.responseTo.toString());
            // Only execute callback if we have a caller
            if(typeof callbackInfo.callback === 'function') {
              // Parse the body
              mongoReply.parseBody(message, connectionPool.bson, callbackInfo.info.raw);          
              // Get the callback instance
              var callbackInstance = dbInstanceObject._removeHandler(mongoReply.responseTo);
              // Only call if we have an actual callback instance, might have been removed by the reaper
              if(callbackInstance != null) {
                // Only trigger the callback if we have one that is not removed by the reaper
                if(callbackInstance != null && typeof callbackInstance.callback === 'function') {
                  callbackInstance.callback(null, mongoReply, callbackInstance.info.connection);
                }        
              }              
            }
          }
        }        
      } catch (err) {
        // Force close the pool
        if(connectionPool.isConnected()) server.close();        
        // Emit the error
        if(eventEmitterIsDb) {
          // Issue error across all the db instances registered in server instance
          for(var i = 0; i < server.dbInstances.length; i++) {
            server.dbInstances[i].emit("error", new Error(err));
          }        
        } else {
          eventReceiver.emit("error", new Error(err));
        }        
      }      
    })
  });
  
  // Handle errors
  connectionPool.on("error", function(message) {        
    // Force close the pool
    if(connectionPool.isConnected()) connectionPool.stop();        
    // Emit error only if we are not in the process of connecting
    if(server._serverState === 'connecting' && firstCall) {
      // Only do a callback if we have a valid callback function, on retries this might not be true
      if(typeof callback === 'function') callback(new Error(message && message.err ? message.err : message));
    } else {
      if(eventEmitterIsDb) {
        // Issue error across all the db instances registered in server instance
        for(var i = 0; i < server.dbInstances.length; i++) {
          server.dbInstances[i].emit("error", new Error(message.err));
        }        
      } else {
        eventReceiver.emit("error", new Error(message.err));                
      }
    }
  });
  
  // Handle close events
  connectionPool.on("close", function() {
    // Force close all connections
    server.close();

    // Emit close event
    if(eventEmitterIsDb) {
      // Issue error across all the db instances registered in server instance
      for(var i = 0; i < server.dbInstances.length; i++) {
        server.dbInstances[i].emit("close");
      }        
    } else {
      eventReceiver.emit("close");
    }
  });

  // Handle errors
  connectionPool.on("parseError", function(message) {    
    // Force close the pool
    if(connectionPool.isConnected()) self.stop();        
  });
  
  // Boot up connection poole, pass in a locator of callbacks
  connectionPool.start();
}

Server.prototype.allRawConnections = function() {
  return this.connectionPool.getAllConnections();
} 

Server.prototype.checkoutWriter = function() {
  return this.connectionPool.checkoutConnection();
}

Server.prototype.checkoutReader = function() {
  return this.connectionPool.checkoutConnection();
}




