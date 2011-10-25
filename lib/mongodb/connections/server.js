var Connection = require('../connection').Connection,
  DbCommand = require('../commands/db_command').DbCommand,
  MongoReply = require('../responses/mongo_reply').MongoReply,
  // EventEmitter = require("events").EventEmitter,
  ConnectionPool = require('../connection/connection_pool').ConnectionPool,
  inherits = require('util').inherits;

var Server = exports.Server = function(host, port, options) {
  // EventEmitter.call(this);
  var self = this;
  this.host = host;
  this.port = port;
  this.options = options == null ? {} : options;
  this.internalConnection;
  this.internalMaster = false;
  this.connected = false;
  this.poolSize = this.options.poolSize == null ? 1 : this.options.poolSize;
  this.slaveOk = this.options["slave_ok"];
  this.auths = [];
  // Setters and getters
  this.__defineGetter__("autoReconnect", function() { return self.options['auto_reconnect'] == null ? false : this.options['auto_reconnect']; });
  this.__defineGetter__("connection", function() { return self.internalConnection; });
  this.__defineSetter__("connection", function(connection) { self.internalConnection = connection; });
  this.__defineGetter__("master", function() { return self.internalMaster; });
  this.__defineSetter__("master", function(value) { self.internalMaster = value; });
  this.__defineGetter__("primary", function() { return self; });

  // // Add handler of resend message
  // this.on('resend', function(err) {
  //   self.connection.emit("resend");    
  // });
  
  // Just keeps list of events we allow
  this.eventHandlers = {error:[], parseError:[], poolReady:[], message:[], close:[]};
  
  // Internal state of server connection
  this._serverState = 'disconnected';
};

// inherits(Server, EventEmitter);

Server.prototype.close = function(callback) {  
  // Remove all the listeners on the pool so it does not fire messages all over the place  
  this.connectionPool.removeAllListeners();
  // Close the connection if it's open
  if(this.connectionPool.isConnected()) this.connectionPool.stop();        
  // Peform callback if present
  if(typeof callback === 'function') callback();
};

Server.prototype.send = function(command) {
  // this.internalConnection.send(command);         
}

Server.prototype.isConnected = function() {
  return this.connectionPool.isConnected();
}

Server.prototype.connect = function(parent, callback) {
  this._serverState = 'connecting';
  // Ensure parent can do a slave query if it's set
  parent.slaveOk = this.slaveOk ? this.slaveOk : parent.slaveOk;
  
  // Let's connect
  var server = this;
  // Create connection Pool instance with the current BSON serializer
  var connectionPool = new ConnectionPool(this.host, this.port, this.poolSize, parent.bson_deserializer);
  // Set up a new pool using default settings
  server.connectionPool = connectionPool;

  // Set up on connect method
  connectionPool.on("poolReady", function() { 
    // Create a callback function for a given connection
    var connectCallback = function(err, reply) {   
      if(err != null) return callback(err, null);
      server.master = reply.documents[0].ismaster == 1 ? true : false;
      server.connectionPool.setMaxBsonSize(reply.documents[0].maxBsonObjectSize);
      // Set server as connected
      server.connected = true;
                          
      // emit a message saying we got a master and are ready to go and change state to reflect it
      // if(server.)
      // if(parent.state == 'notConnected') {
      parent.state = 'connected';
      callback(null, parent);
      // } else {
      //   callback("connection already opened");
      // }
    };
  
    // Create db command and Add the callback to the list of callbacks by the request id (mapping outgoing messages to correct callbacks)
    var db_command = DbCommand.NcreateIsMasterCommand(parent, parent.databaseName);    

    // Check out a reader from the pool
    var connection = connectionPool.checkoutConnection();

    // Register handler for messages
    parent._registerHandler(db_command, false, connection, connectCallback);
    
    // console.log("----------------------------------------------------Connecting")
    
    // Write the command out
    connection.write(db_command);
  })

  // Set up item connection
  connectionPool.on("message", function(message) {    
    // console.log("=========================================== message")
    
    // Locate the callback, do the cleanup and move on
    try {
      var callbackInstance = parent._removeHandler(message.responseTo);
      // Only trigger the callback if we have one
      if(typeof callbackInstance.callback === 'function') {
        callbackInstance.callback(null, message, callbackInstance.info.connection);
      }
    } catch(err) {
      parent.emit('error', err);
    }
  });
  
  // Handle errors
  connectionPool.on("error", function(message) {        
    // console.log("=========================================== error")

    // Force close the pool
    if(connectionPool.isConnected()) connectionPool.stop();        
    // Emit error only if we are not in the process of connecting
    if(server._serverState === 'connecting') {
      callback(new Error(message.err));
    } else {
      parent.emit("error", new Error(message.err));      
    }
  });
  
  // Handle close events
  connectionPool.on("close", function() {
    // console.log("-------------------------- yo")
    
    // console.log("------------------------------------------------------------------ 0")
    // Emit error only if we are not in the process of connecting
    // if(server._serverState === 'connecting') {
    //   callback(new Error('no open connections'));
    // } else {
      // console.log("------------------------------------ Server.prototype.stop 1")
      // console.dir(parent)
      parent.emit("close");
    // }
  });

  // Handle errors
  connectionPool.on("parseError", function(message) {    
    // console.log("=========================================== parseError")
    // console.log(message.stack)
    // Force close the pool
    if(connectionPool.isConnected()) self.stop();        
  });
  
  // Boot up connection poole, pass in a locator of callbacks
  connectionPool.start(function(id) {
    return parent._findHandler(id);
  });
}

Server.prototype.allRawConnections = function() {
  // console.log("#################################################### allRawConnections")
  return this.connectionPool.getAllConnections();
} 

Server.prototype.checkoutWriter = function() {
  // console.log("#################################################### checkoutWriter")
  // return this.connection;
  return this.connectionPool.checkoutConnection();
}

Server.prototype.checkoutReader = function() {
  // console.log("#################################################### checkoutReader")
  return this.connectionPool.checkoutConnection();
}

//
// My own simple synchronous emit support, We don't need the overhead of the built in flexible node.js
// event emitter as we are looking for as low latency as possible.
//
Server.prototype.on = function(event, callback) {
  if(this.eventHandlers[event] == null) throw "Event handler only accepts values of " + Object.keys(this.eventHandlers);
  // Just add callback to our event handler (avoiding the cost of the node.js event handler)
  this.eventHandlers[event].push(callback);
}

Server.prototype.emit = function(event, err, object) {
  if(this.eventHandlers[event] == null) throw "Event handler only accepts values of " + Object.keys(this.eventHandlers);
  // Fire off all the callbacks
  var callbacks = this.eventHandlers[event];
  // Attemp to emit
  try {
    // Perform a callback on all the registered callback handlers
    for(var i = 0; i < callbacks.length; i++) {
      callbacks[i](err, object);
    }    
  } catch (err) {
    this.emit("error", err);
  }
}

Server.prototype.removeListeners = function(event) {
  if(this.eventHandlers[event] == null) throw "Event handler only accepts values of " + Object.keys(this.eventHandlers);
  // Throw away all handlers
  this.eventHandlers[event] = [];
}

Server.prototype.removeAllListeners = function() {
  // Fetch all the keys of handlers
  var keys = Object.keys(this.eventHandlers);  
  // Remove all handlers
  for(var i = 0; i < keys.length; i++) {
    this.eventHandlers[keys[i]] = [];
  }
}




