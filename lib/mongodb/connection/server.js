var Connection = require('./connection').Connection,
  DbCommand = require('../commands/db_command').DbCommand,
  MongoReply = require('../responses/mongo_reply').MongoReply,
  ConnectionPool = require('./connection_pool').ConnectionPool,
  EventEmitter = require('events').EventEmitter,
  MongoReply = require("../responses/mongo_reply").MongoReply,
  inherits = require('util').inherits;

var Server = exports.Server = function(host, port, options) {
  // Set up event emitter
  EventEmitter.call(this);  
  // Set up Server instance
  if(!(this instanceof Server)) return new Server(host, port, options);
  
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
  this._used = false;
  
  // Get the readPreference
  var readPreference = this.options['readPreference'];  
  // Read preference setting
  if(readPreference != null) {
    if(readPreference != Server.READ_PRIMARY && readPreference != Server.READ_SECONDARY_ONLY
      && readPreference != Server.READ_SECONDARY) {
        throw new Error("Illegal readPreference mode specified, " + readPreference);
    }
    
    // Set read Preference
    this._readPreference = readPreference;
  } else {
    this._readPreference = null;        
  }
  
  // Contains the isMaster information returned from the server
  this.isMasterDoc;

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
  
  // Setters and getters
  Object.defineProperty(this, "autoReconnect", { enumerable: true
    , get: function () {
        return this.options['auto_reconnect'] == null ? false : this.options['auto_reconnect'];
      }
  });  

  Object.defineProperty(this, "connection", { enumerable: true
    , get: function () {
        return this.internalConnection;
      }
    , set: function(connection) {
        this.internalConnection = connection;
      }
  });  

  Object.defineProperty(this, "master", { enumerable: true
    , get: function () {
        return this.internalMaster;
      }
    , set: function(value) {
        this.internalMaster = value;
      }
  });  

  Object.defineProperty(this, "primary", { enumerable: true
    , get: function () {
        return this;
      }
  });  

  // Getter for query Stats
  Object.defineProperty(this, "queryStats", { enumerable: true
    , get: function () {
        return this._state.runtimeStats.queryStats;
      }
  });  

  Object.defineProperty(this, "runtimeStats", { enumerable: true
    , get: function () {
        return this._state.runtimeStats;
      }
  });  

  // Get Read Preference method
  Object.defineProperty(this, "readPreference", { enumerable: true
    , get: function () {
        if(this._readPreference == null && this.readSecondary) {
          return Server.READ_SECONDARY;
        } else if(this._readPreference == null && !this.readSecondary) {
          return Server.READ_PRIMARY;
        } else {
          return this._readPreference;
        }
      }
  });    
};

// Inherit simple event emitter
inherits(Server, EventEmitter);
// Read Preferences
Server.READ_PRIMARY = 'primary';
Server.READ_SECONDARY = 'secondary';
Server.READ_SECONDARY_ONLY = 'secondaryOnly';

// Always ourselves
Server.prototype.setReadPreference = function() {}

// Return the used state
Server.prototype._isUsed = function() {  
  return this._used;
}

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

Server.prototype.isSetMember = function() {
  return this['replicasetInstance'] != null;
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
    // If something close down the connection and removed the callback before
    // proxy killed connection etc, ignore the erorr as close event was isssued
    if(err != null && internalCallback == null) return;    
    // Internal callback
    if(err != null) return internalCallback(err, null);
    server.master = reply.documents[0].ismaster == 1 ? true : false;
    server.connectionPool.setMaxBsonSize(reply.documents[0].maxBsonObjectSize);
    // Set server as connected
    server.connected = true;
    // Save document returned so we can query it
    server.isMasterDoc = reply.documents[0];
    
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
        
        // Callback instance
        var callbackInfo = null;
        var dbInstanceObject = null;
        
        // Locate a callback instance and remove any additional ones
        for(var i = 0; i < server.dbInstances.length; i++) {
          var dbInstanceObjectTemp = server.dbInstances[i];
          var hasHandler = dbInstanceObjectTemp._hasHandler(mongoReply.responseTo.toString());
          // Assign the first one we find and remove any duplicate ones
          if(hasHandler && callbackInfo == null) {
            callbackInfo = dbInstanceObjectTemp._findHandler(mongoReply.responseTo.toString());
            dbInstanceObject = dbInstanceObjectTemp;
          } else if(hasHandler) {
            dbInstanceObjectTemp._removeHandler(mongoReply.responseTo.toString());
          }
        }
            
        // Only execute callback if we have a caller
        if(callbackInfo.callback && Array.isArray(callbackInfo.info.chained)) {
          // Check if callback has already been fired (missing chain command)
          var chained = callbackInfo.info.chained;
          var numberOfFoundCallbacks = 0;
          for(var i = 0; i < chained.length; i++) {
            if(dbInstanceObject._hasHandler(chained[i])) numberOfFoundCallbacks++;
          }
          
          // If we have already fired then clean up rest of chain and move on
          if(numberOfFoundCallbacks != chained.length) {
            for(var i = 0; i < chained.length; i++) {
              dbInstanceObject._removeHandler(chained[i]);
            }
            
            // Just return from function
            return;
          }
          
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
    } catch (err) {
      // Throw error in next tick
      process.nextTick(function() {
        throw err;
      })
    }      
  });
  
  // Handle timeout
  connectionPool.on("timeout", function(err) {
    // If pool connection is already closed
    if(server._serverState === 'disconnected') return;
    // Set server state to disconnected
    server._serverState = 'disconnected';
    // Close the pool
    connectionPool.stop();
    // If we have a callback return the error
    if(typeof callback === 'function') {
      // ensure no callbacks get called twice
      var internalCallback = callback;
      callback = null;
      // Perform callback
      internalCallback(err, null);
    } else if(server.isSetMember()) {
      server.emit("timeout", err, server);
    } else {
      eventReceiver.emit("timeout", err, server);
    }
    
    // If we are a single server connection fire errors correctly
    if(!server.isSetMember()) {
      // Fire all callback errors
      _fireCallbackErrors(server, err);    
      // Emit error
      _emitAcrossAllDbInstances(server, eventReceiver, "timeout", err, server);      
    }
  });
  
  // Handle errors
  connectionPool.on("error", function(message) {   
    // If pool connection is already closed
    if(server._serverState === 'disconnected') return;
    // Set server state to disconnected
    server._serverState = 'disconnected';
    // Close the pool
    connectionPool.stop();
    // If we have a callback return the error
    if(typeof callback === 'function') {// && !server.isSetMember()) {
      // ensure no callbacks get called twice
      var internalCallback = callback;
      callback = null;
      // Perform callback
      internalCallback(new Error(message && message.err ? message.err : message), null);
    } else if(server.isSetMember()) {
      server.emit("error", new Error(message && message.err ? message.err : message), server);
    } else {
      eventReceiver.emit("error", new Error(message && message.err ? message.err : message), server);
    }
    
    // If we are a single server connection fire errors correctly
    if(!server.isSetMember()) {
      // Fire all callback errors
      _fireCallbackErrors(server, new Error(message && message.err ? message.err : message));    
      // Emit error
      _emitAcrossAllDbInstances(server, eventReceiver, "error", new Error(message && message.err ? message.err : message), server);      
    }
  });
  
  // Handle close events
  connectionPool.on("close", function() {
    // If pool connection is already closed
    if(server._serverState === 'disconnected') return;
    // Set server state to disconnected
    server._serverState = 'disconnected';
    // Close the pool
    connectionPool.stop(true);
    // If we have a callback return the error
    if(typeof callback == 'function') {
      // ensure no callbacks get called twice
      var internalCallback = callback;
      callback = null;
      // Perform callback
      internalCallback(new Error("connection closed"), null);
    } else if(server.isSetMember()) {
      server.emit("close", new Error("connection closed"), server);
    } else {
      eventReceiver.emit("close", new Error("connection closed"), server);
    }
    
    // If we are a single server connection fire errors correctly
    if(!server.isSetMember()) {
      // Fire all callback errors
      _fireCallbackErrors(server, new Error("connection closed"));    
      // Emit error
      _emitAcrossAllDbInstances(server, eventReceiver, "close", server);      
    }
  });

  // If we have a parser error we are in an unknown state, close everything and emit
  // error
  connectionPool.on("parseError", function(message) { 
    // If pool connection is already closed
    if(server._serverState === 'disconnected') return;
    // Set server state to disconnected
    server._serverState = 'disconnected';
    // Close the pool
    connectionPool.stop();
    // If we have a callback return the error
    if(typeof callback === 'function') {
      // ensure no callbacks get called twice
      var internalCallback = callback;
      callback = null;
      // Perform callback
      internalCallback(new Error("connection closed due to parseError"), null);
    } else if(server.isSetMember()) {
      server.emit("parseError", new Error("connection closed due to parseError"), server);
    } else {
      eventReceiver.emit("parseError", new Error("connection closed due to parseError"), server);
    }
    
    // If we are a single server connection fire errors correctly
    if(!server.isSetMember()) {
      // Fire all callback errors
      _fireCallbackErrors(server, new Error("connection closed due to parseError"));    
      // Emit error
      _emitAcrossAllDbInstances(server, eventReceiver, "parseError", server);      
    }
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

// Check if a writer can be provided
var canCheckoutWriter = function(self, read) {  
  // We cannot write to an arbiter or secondary server
  if(self.isMasterDoc['arbiterOnly'] == true) {
    return new Error("Cannot write to an arbiter");
  } if(self.isMasterDoc['secondary'] == true) {
    return new Error("Cannot write to a secondary");
  } else if(read == true && self._readPreference == Server.READ_SECONDARY_ONLY && self.isMasterDoc['ismaster'] == true) {
    return new Error("Cannot read from primary when secondary only specified");
  }
  
  // Return no error
  return null;
}

Server.prototype.checkoutWriter = function(read) {
  if(read == true) return this.connectionPool.checkoutConnection(); 
  // Check if are allowed to do a checkout (if we try to use an arbiter f.ex)
  var result = canCheckoutWriter(this, read);
  // If the result is null check out a writer
  if(result == null) {
    return this.connectionPool.checkoutConnection();    
  } else {
    return result;
  }  
}

// Check if a reader can be provided
var canCheckoutReader = function(self) {  
  // We cannot write to an arbiter or secondary server
  if(self.isMasterDoc['arbiterOnly'] == true) {
    return new Error("Cannot write to an arbiter");
  } else if(self._readPreference != null) {
    // If the read preference is Primary and the instance is not a master return an error
    if(self._readPreference == Server.READ_PRIMARY && self.isMasterDoc['ismaster'] != true) {
      return new Error("Read preference is " + Server.READ_PRIMARY + " and server is not master");
    } else if(self._readPreference == Server.READ_SECONDARY_ONLY && self.isMasterDoc['ismaster'] == true) {
      return new Error("Cannot read from primary when secondary only specified");      
    }
  }
  
  // Return no error
  return null;
}

Server.prototype.checkoutReader = function() {
  // Check if are allowed to do a checkout (if we try to use an arbiter f.ex)
  var result = canCheckoutReader(this);
  // If the result is null check out a writer
  if(result == null) {
    return this.connectionPool.checkoutConnection();    
  } else {
    return result;
  }  
}

Server.prototype.enableRecordQueryStats = function(enable) {
  this.recordQueryStats = enable;
}

//
// Internal statistics object used for calculating average and standard devitation on 
// running queries
var RunningStats = function() {
  var self = this;
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
