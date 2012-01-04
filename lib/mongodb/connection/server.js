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
  this.ssl = this.options.ssl == null ? false : this.options.ssl;
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
  // Set ssl up if it's defined
  if(this.ssl) {
    this.socketOptions.ssl = true;
  }
  
  // Set up logger if any set
  this.logger = this.options.logger != null 
    && (typeof this.options.logger.debug == 'function') 
    && (typeof this.options.logger.error == 'function') 
    && (typeof this.options.logger.debug == 'function') 
      ? this.options.logger : {error:function(message, object) {}, log:function(message, object) {}, debug:function(message, object) {}};

  // Just keeps list of events we allow
  this.eventHandlers = {error:[], parseError:[], poolReady:[], message:[], close:[], timeout:[]};
  // Internal state of server connection
  this._serverState = 'disconnected';
  // this._timeout = false;
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

  if(this.connectionPool != null) {
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

Server.prototype.isConnected = function() {
  return this.connectionPool != null && this.connectionPool.isConnected();
}

Server.prototype.allServerInstances = function() {
  return [this];
}

Server.prototype.connect = function(dbInstance, options, callback) {
  if('function' === typeof options) callback = options, options = {};  
  if(options == null) options = {};
  if(!('function' === typeof callback)) callback = null;
  
  // Currently needed to work around problems with multiple connections in a pool with ssl
  // TODO fix if possible
  if(this.ssl == true) {
    // Set up socket options for ssl
    this.socketOptions.ssl = true;  
  }
  
  // Let's connect
  var server = this;
  // Let's us override the main receiver of events
  var eventReceiver = options.eventReceiver != null ? options.eventReceiver : this;  
  // Creating dbInstance
  this.dbInstance = dbInstance;
  // Save reference to dbInstance
  this.dbInstances = [dbInstance];

  // Set server state to connecting
  this._serverState = 'connecting';
  // Ensure dbInstance can do a slave query if it's set
  dbInstance.slaveOk = this.slaveOk ? this.slaveOk : dbInstance.slaveOk;
  // Create connection Pool instance with the current BSON serializer
  var connectionPool = new ConnectionPool(this.host, this.port, this.poolSize, dbInstance.bson,  this.socketOptions);
  // Set logger on pool
  connectionPool.logger = this.logger;
  
  // Set up a new pool using default settings
  server.connectionPool = connectionPool;
  
  // Set basic parameters passed in
  var returnIsMasterResults = options.returnIsMasterResults == null ? false : options.returnIsMasterResults;
  
  // Create a default connect handler, overriden when using replicasets
  var connectCallback = function(err, reply) {    
    // ensure no callbacks get called twice
    var internalCallback = callback;
    callback = null;
    // Internal callback
    if(err != null) return internalCallback(err, null);
    server.master = reply.documents[0].ismaster == 1 ? true : false;
    server.connectionPool.setMaxBsonSize(reply.documents[0].maxBsonObjectSize);
    // Set server as connected
    server.connected = true;
    
    // If we have it set to returnIsMasterResults
    if(returnIsMasterResults) {
      internalCallback(null, reply);
    } else {
      internalCallback(null, dbInstance);      
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
    // Attempt to parse the message
    try {
      // Create a new mongo reply
      var mongoReply = new MongoReply()
      // Parse the header
      mongoReply.parseHeader(message, connectionPool.bson)      
      // If message size is not the same as the buffer size
      // something went terribly wrong somewhere
      if(mongoReply.messageLength != message.length) {
        // Emit the error
        eventReceiver.emit("error", new Error("bson length is different from message length"), server);        
        // Remove all listeners
        server.removeAllListeners();
      } else {    
        var startDate = new Date().getTime();
              
        // Attempt to locate a callback instance
        for(var i = 0; i < server.dbInstances.length; i++) {
          var dbInstanceObject = server.dbInstances[i];
          // Locate the callback info
          var callbackInfo = dbInstanceObject._findHandler(mongoReply.responseTo.toString());
      
          // Only execute callback if we have a caller
          if(callbackInfo.callback && Array.isArray(callbackInfo.info.chained)) {
            // Parse the body
            mongoReply.parseBody(message, connectionPool.bson, callbackInfo.info.raw, function(err) {
              var callbackInfo = dbInstanceObject._findHandler(mongoReply.responseTo.toString());
              // If we have an error let's execute the callback and clean up all other
              // chained commands
              var firstResult = mongoReply && mongoReply.documents;
              // Check for an error, if we have one let's trigger the callback and clean up
              // The chained callbacks
              if(firstResult[0].err != null || firstResult[0].errmsg != null) {
                // Trigger the callback for the error
                dbInstanceObject._callHandler(mongoReply.responseTo, mongoReply, null);
              } else {
                var chainedIds = callbackInfo.info.chained;
                
                if(chainedIds.length > 0 && chainedIds[chainedIds.length - 1] == mongoReply.responseTo) {
                  // Cleanup all other chained calls
                  chainedIds.pop();
                  // Remove listeners
                  for(var i = 0; i < chainedIds.length; i++) dbInstanceObject._removeHandler(chainedIds[i]);                  
                  // Call the handler
                  dbInstanceObject._callHandler(mongoReply.responseTo, callbackInfo.info.results.shift(), null);
                } else{
                  // Add the results to all the results
                  for(var i = 0; i < chainedIds.length; i++) {
                    var handler = dbInstanceObject._findHandler(chainedIds[i]);
                    // Check if we have an object, if it's the case take the current object commands and 
                    // and add this one
                    if(handler.info != null) {
                      handler.info.results = Array.isArray(callbackInfo.info.results) ? callbackInfo.info.results : [];
                      handler.info.results.push(mongoReply);
                    }
                  }                  
                }
              }
            });          
          } else if(callbackInfo.callback) {
            // Parse the body
            mongoReply.parseBody(message, connectionPool.bson, callbackInfo.info.raw, function(err) {
              // Let's record the stats info if it's enabled
              if(server.recordQueryStats == true && server._state['runtimeStats'] != null 
                && server._state.runtimeStats['queryStats'] instanceof RunningStats) {
                // Add data point to the running statistics object
                server._state.runtimeStats.queryStats.push(new Date().getTime() - callbackInfo.info.start);
              }              
            
              // Trigger the callback
              dbInstanceObject._callHandler(mongoReply.responseTo, mongoReply, null);
            });          
          }
        }
      }      
    } catch (err) {
      // Throw error in next tick
      process.nextTick(function() {
        throw err;
      })
    }      
  });
  
  // Handle timeout
  connectionPool.on("timeout", function(err) {
    // Force close the pool
    connectionPool.stop();
    // Keep the db we don't want to emit an error on
    var filterDb = null;

    // Emit timeout event
    if(typeof callback === 'function') {
      // ensure no callbacks get called twice
      var internalCallback = callback;
      callback = null;
      // Perform callback
      internalCallback(err, null);
      // Emit errors but filter out current db
      filterDb = server.dbInstance;
      // Remove all listeners
      server.removeAllListeners()          
    }   
    
    // Emit error
    _emitAcrossAllDbInstances(server, filterDb, "timeout", err, server);     
  });
  
  // Handle errors
  connectionPool.on("error", function(message) {   
    // Remove all connectionPool Listeners
    connectionPool.removeAllEventListeners();
    // Remove all listeners
    server.removeAllListeners()          
    // Force close the pool
    connectionPool.stop();

    // Keep the db we don't want to emit an error on
    var filterDb = null;
    
    // if(connectionPool.isConnected()) connectionPool.stop();        
    // Emit error only if we are not in the process of connecting
    if(typeof callback === 'function') {
      // Set server state to connected
      server._serverState = 'disconnected';
      // ensure no callbacks get called twice
      var internalCallback = callback;
      callback = null;
      // Only do a callback if we have a valid callback function, on retries this might not be true
      internalCallback(new Error(message && message.err ? message.err : message));
      // Emit errors but filter out current db
      filterDb = server.dbInstance;
    } else if(server._serverState !== 'disconnected') {
      // Set server instance to disconnected state
      server._serverState = !connectionPool.isConnected() ? 'disconnected' : server._serverState;      
    }

    // Fire all callback errors
    _fireCallbackErrors(server, new Error(message.err));
    
    // Emit error
    _emitAcrossAllDbInstances(server, filterDb, "error", new Error(message.err), server);    
  });
  
  // Handle close events
  connectionPool.on("close", function() {
    // Force close the pool
    connectionPool.stop();
    // Keep the db we don't want to emit an error on
    var filterDb = eventReceiver;
    // Emit timeout event
    if(typeof callback === 'function') {
      // ensure no callbacks get called twice
      var internalCallback = callback;
      callback = null;
      // Perform callback
      internalCallback(new Error("connection closed"), null);
      // Emit errors but filter out current db
      filterDb = server.dbInstance;
    } else {
      eventReceiver.emit("close", server);
    }
    
    // Fire all callback errors
    _fireCallbackErrors(server, new Error("connection closed"));
    
    // Emit error
    _emitAcrossAllDbInstances(server, filterDb, "close", server);
  });

  // If we have a parser error we are in an unknown state, close everything and emit
  // error
  connectionPool.on("parseError", function(message) { 
    // Force close the pool
    connectionPool.stop();

    // Fire all callback errors
    _fireCallbackErrors(server, message);

    // Emit error across all servers
    _emitAcrossAllDbInstances(server, null, "error", message, server);
  });
  
  // Boot up connection poole, pass in a locator of callbacks
  connectionPool.start();
}

// Fire all the errors
var _fireCallbackErrors = function(server, err) {
  // Locate all the possible callbacks that need to return
  for(var i = 0; i < server.dbInstances.length; i++) {
    // Fetch the db Instance
    var dbInstance = server.dbInstances[i];
    // Check all callbacks
    var keys = Object.keys(dbInstance._callBackStore._notReplied);
    // For each key check if it's a callback that needs to be returned
    for(var j = 0; j < keys.length; j++) {
      var info = dbInstance._callBackStore._notReplied[keys[j]];
      if(info.connection.socketOptions.host === server.host && info.connection.socketOptions.port === server.port) {
        dbInstance._callBackStore.emit(keys[j], err, null);
      }
    }
  }  
}

var _emitAcrossAllDbInstances = function(server, filterDb, event, message, object) {
  // Emit close event across all db instances sharing the sockets
  var allServerInstances = server.allServerInstances();
  // Fetch the first server instance
  var serverInstance = allServerInstances[0];
  // For all db instances signal all db instances
  if(Array.isArray(serverInstance.dbInstances) && serverInstance.dbInstances.length > 1) {
	  for(var i = 0; i < serverInstance.dbInstances.length; i++) {
      var dbInstance = serverInstance.dbInstances[i];
      // Check if it's our current db instance and skip if it is
      if(filterDb == null || filterDb.databaseName !== dbInstance.databaseName || filterDb.tag !== dbInstance.tag) {
  	    dbInstance.emit(event, message, object);
      }
    }
  }
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
