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
  this.__defineGetter__("readPreference", function() { return Server.READ_PRIMARY; });

  // Set default connection pool options
  this.socketOptions = this.options.socketOptions != null ? this.options.socketOptions : {};

  // Just keeps list of events we allow
  this.eventHandlers = {error:[], parseError:[], poolReady:[], message:[], close:[]};
  // Internal state of server connection
  this._serverState = 'disconnected';
  // Contains state information about server connection
  this._state = {'runtimeStats': {'queryStats':new RunningStats()}};  
  // Do we record server stats or not
  this.recordQueryStats = false;
  // Getter for query Stats
  this.__defineGetter__("queryStats", function() { return this._state.runtimeStats.queryStats; });
  this.__defineGetter__("runtimeStats", function() { return this._state.runtimeStats; });  
};

// Inherit simple event emitter
inherits(Server, SimpleEmitter);
// Read Preferences
Server.READ_PRIMARY = 'primary';
Server.READ_SECONDARY = 'secondary';

// Always ourselves
Server.prototype.setReadPreference = function() {}

// Server close function
Server.prototype.close = function(callback) {  
  // Remove all local listeners
  this.removeAllListeners();

  if(this.connectionPool) {
    // Remove all the listeners on the pool so it does not fire messages all over the place
    this.connectionPool.removeAllEventListeners();
    // Close the connection if it's open
    this.connectionPool.stop();
  }

  // Set server status as disconnected
  this._serverState = 'disconnected';  
  // Peform callback if present
  if(typeof callback === 'function') callback();
};

Server.prototype.send = function(command) {
  // this.internalConnection.send(command);         
}

Server.prototype.isConnected = function() {
  return this.connectionPool && this.connectionPool.isConnected();
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
  var connectionPool = new ConnectionPool(this.host, this.port, this.poolSize, dbInstance.bson_deserializer,  this.socketOptions);
  
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

    // Set server state to connected
    server._serverState = 'connected';

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
              // Let's record the stats info if it's enabled
              if(server.recordQueryStats == true && server._state['runtimeStats'] != null 
                && server._state.runtimeStats['queryStats'] instanceof RunningStats) {
                // Add data point to the running statistics object
                server._state.runtimeStats.queryStats.push(new Date().getTime() - callbackInfo.info.start);
              }              
              
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
            server.dbInstances[i].emit("error", typeof err === 'string' ? new Error(err) : err);
          }        
        } else {
          eventReceiver.emit("error", typeof err === 'string' ? new Error(err) : err);
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
      // Set server state to connected
      server._serverState = 'disconnected';
      // Shut down the pool
      connectionPool.stop();
      // Only do a callback if we have a valid callback function, on retries this might not be true
      if(typeof callback === 'function') callback(new Error(message && message.err ? message.err : message));
    } else {
      // Set server instance to disconnected state
      server._serverState = !connectionPool.isConnected() ? 'disconnected' : server._serverState;      
      
      // Emit event
      if(eventEmitterIsDb) {
        // Issue error across all the db instances registered in server instance
        if(server._serverState != 'disconnected') {
          for(var i = 0; i < server.dbInstances.length; i++) {
            server.dbInstances[i].emit("error", new Error(message.err));
          }                  
        }
      } else {
        if(server._serverState != 'disconnected') {
          eventReceiver.emit("error", new Error(message.err));                
        }
      }
    }
  });
  
  // Handle close events
  connectionPool.on("close", function() {
    // Force close all connections
    server.close();

    // Emit close event
    if(eventEmitterIsDb) {
      // Issue close across all the db instances registered in server instance
      for(var i = 0; i < server.dbInstances.length; i++) {
        server.dbInstances[i].emit("close");
      }        
    } else {
      eventReceiver.emit("close");
    }
  });

  // If we have a parser error we are in an unknown state, close everything and emit
  // error
  connectionPool.on("parseError", function(message) {    
    // Force close the pool
    if(connectionPool.isConnected()) server.close();
    // Emit error
    server.emit("error", message);
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

Server.prototype.enableRecordQueryStats = function(enable) {
  this.recordQueryStats = enable;
}

//
// Internal statistics object used for calculating average and standard devitation on 
// running queries
var RunningStats = function() {
  this.m_n = 0;
  this.m_oldM = 0.0;
  this.m_oldS = 0.0;
  this.m_newM = 0.0;
  this.m_newS = 0.0;
  
  // Define getters
  Object.defineProperty(this, "numDataValues", { enumerable: true
    , get: function () { return this.m_n; }
  });

  Object.defineProperty(this, "mean", { enumerable: true
    , get: function () { return (this.m_n > 0) ? this.m_newM : 0.0; }
  });

  Object.defineProperty(this, "variance", { enumerable: true
    , get: function () { return ((this.m_n > 1) ? this.m_newS/(this.m_n - 1) : 0.0); }
  });

  Object.defineProperty(this, "standardDeviation", { enumerable: true
    , get: function () { return Math.sqrt(this.variance); }
  });
  
  Object.defineProperty(this, "sScore", { enumerable: true
    , get: function () { 
      var bottom = this.mean + this.standardDeviation;
      if(bottom == 0) return 0;
      return ((2 * this.mean * this.standardDeviation)/(bottom)); 
    }
  });
}

RunningStats.prototype.push = function(x) {
  // Update the number of samples
  this.m_n = this.m_n + 1;
  // See Knuth TAOCP vol 2, 3rd edition, page 232
  if(this.m_n == 1) {
    this.m_oldM = this.m_newM = x;
    this.m_oldS = 0.0;
  } else {
    this.m_newM = this.m_oldM + (x - this.m_oldM) / this.m_n;
    this.m_newS = this.m_oldS + (x - this.m_oldM) * (x - this.m_newM);

    // set up for next iteration
    this.m_oldM = this.m_newM; 
    this.m_oldS = this.m_newS;    
  }
}
