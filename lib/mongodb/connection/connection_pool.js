var utils = require('./connection_utils'),
  inherits = require('util').inherits,
  net = require('net'),
  MongoReply = require("../responses/mongo_reply").MongoReply,
  Connection = require("./connection").Connection;

var ConnectionPool = exports.ConnectionPool = function(host, port, poolSize, bson, socketOptions) {
  if(typeof host !== 'string' || typeof port !== 'number') throw "host and port must be specified";
  // Keep all options for the socket in a specific collection allowing the user to specify the 
  // Wished upon socket connection parameters
  this.socketOptions = typeof socketOptions === 'object' ? socketOptions : {};
  this.socketOptions.host = host;
  this.socketOptions.port = port;
  this.socketOptions.poolSize = poolSize;
  this.bson = bson;
  
  // Set host variable or default
  utils.setStringParameter(this.socketOptions, 'host', '127.0.0.1');
  // Set port variable or default
  utils.setIntegerParameter(this.socketOptions, 'port', 27017);
  // Set poolSize or default
  utils.setIntegerParameter(this.socketOptions, 'poolSize', 1);

  // Set default settings for the socket options
  utils.setIntegerParameter(this.socketOptions, 'timeout', 0);
  // Delay before writing out the data to the server
  utils.setBooleanParameter(this.socketOptions, 'noDelay', true);
  // Delay before writing out the data to the server
  utils.setIntegerParameter(this.socketOptions, 'keepAlive', 0);
  // Set the encoding of the data read, default is binary == null
  utils.setStringParameter(this.socketOptions, 'encoding', null);
  // Allows you to set a throttling bufferSize if you need to stop overflows
  utils.setIntegerParameter(this.socketOptions, 'bufferSize', 0);  
  
  // Internal structures
  this.waitingToOpen = {};
  this.connectionsWithErrors = {};
  this.openConnections = {};
  
  // Assign connection id's
  this.connectionId = 0;
  
  // Just keeps list of events we allow
  this.eventHandlers = {error:[], parseError:[], poolReady:[], message:[]};
  // Current connection to pick
  this.currentConnectionIndex = 0;
}

ConnectionPool.prototype.setMaxBsonSize = function(maxBsonSize) {
  var keys = Object.keys(this.openConnections);
  
  for(var i = 0; i < keys.length; i++) {
    this.openConnections[keys[i]].maxBsonSize = maxBsonSize;
  }
}

// Creates handlers
var connectHandler = function(self) {
  return function(err, connection) {
    // Ensure we don't fire same error message multiple times
    var fireError = true;
    // console.log("=================================================================")
    // console.log(self.openConnections[connection.id])
    // console.dir(self.openConnections)
    // console.log("connection.id = " + " :: " + connection.id)
    // console.dir(err)
    // console.log("================================================================= 111")
    // console.log("Object.keys(self.waitingToOpen).length :: " + Object.keys(self.waitingToOpen).length)
    // console.log("Object.keys(self.connectionsWithErrors).length :: " + Object.keys(self.connectionsWithErrors).length)
    // console.log("Object.keys(self.openConnections).length :: " + Object.keys(self.openConnections).length)

    
    // if we have an error and we have not already put the connection into the list of connections with errors
    if(err && self.openConnections[connection.id] == null && self.connectionsWithErrors[connection.id] == null) {
      // console.log("================================================================= 0")
      // Add to list of error connections
      self.connectionsWithErrors[connection.id] = connection;
      // Remove from list of waiting to connect
      delete self.waitingToOpen[connection.id];
    } else if(err && self.openConnections[connection.id] != null){
      // console.log("================================================================= 1")
      // Add to list of error connections
      self.connectionsWithErrors[connection.id] = connection;
      // Remove from list of open connections
      delete self.openConnections[connection.id];      
    } else if(!err && self.waitingToOpen[connection.id] != null){
      // console.log("================================================================= 2")
      // Remove from list of waiting to connect
      delete self.waitingToOpen[connection.id];
      // Add to list of open connections
      self.openConnections[connection.id] = connection;
    } else {
      // console.log("+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++ 0")
      fireError = false;
    }
    
    // console.log("================================================================= 111")
    // console.log("Object.keys(self.waitingToOpen).length :: " + Object.keys(self.waitingToOpen).length)
    // console.log("Object.keys(self.connectionsWithErrors).length :: " + Object.keys(self.connectionsWithErrors).length)
    // Check if we are done meaning that the number of openconnections + errorconnections
    if(Object.keys(self.waitingToOpen).length == 0) {
      // If we have any errors notify the application, only fire if we don't have the element already in
      // errors
      if(Object.keys(self.connectionsWithErrors).length > 0 && fireError) {
        self.emit("error", err, connection);        
      } else {
        // Emit pool is ready
        self.emit("poolReady");        
      }      
    }
  } 
}

// Start method, will throw error if no listeners are available
// Pass in an instance of the listener that contains the api for 
// finding callbacks for a given message etc.
ConnectionPool.prototype.start = function(listener) {
  var self = this;
  
  if(this.eventHandlers["poolReady"].length == 0) {
    throw "pool must have at least one listener ready that responds to the [poolReady] event";
  }
  
  // Let's boot up all the instances
  for(var i = 0; i < this.socketOptions.poolSize; i++) {
    // Create a new connection instance
    var connection = new Connection(this.connectionId++, this.socketOptions);
    // Add connection to list of waiting connections
    this.waitingToOpen[connection.id] = connection;
    
    // Handle "Error" events coming from the connections
    connection.on("connect", connectHandler(this));
    connection.on("error", connectHandler(this));
    connection.on("close", connectHandler(this));
    connection.on("end", connectHandler(this));
    connection.on("timeout", connectHandler(this));    
    connection.on("parseError", function(err) {
      // console.log("-----------------------------++++++++++++++++++++++ pool parseError")
      // console.dir(err.bin)
      // Stop the connection pool
      self.stop();
      // Emit the error
      self.emit("parseError", err);
    });    
    
    connection.on("message", function(message) {      
      // Attempt to parse the message
      try {
        // console.log("============================================================== mongoreply")
        // Create a new mongo reply
        var mongoReply = new MongoReply()
        // Parse the header
        mongoReply.parseHeader(message, self.bson)
        // console.dir(mongoReply)
        // console.log("============================================================== mongoReply.messageLength = " + mongoReply.messageLength)
        
        // If message size is not the same as the buffer size
        // something went terribly wrong somewhere
        if(mongoReply.messageLength != message.length) {
          // Stop the connection pool
          self.stop();
          // Emit parse Error
          self.emit("parseError", {err:"invalidMessageSize", bin:message});                
        } else {
          // console.log("============================================================== mongoreply 1")
          // console.log(mongoReply.responseTo.toString())
          // Locate the callback info
          var callbackInfo = listener(mongoReply.responseTo.toString());
          // Parse the body
          mongoReply.parseBody(message, self.bson, callbackInfo.raw);
          // Emit the message
          self.emit("message", mongoReply);

          // console.log(callbackInfo)
          // console.log("============================================================== mongoreply 2")          
        }
        
        // If we have a request for a raw message let's 
        
        
        
        // console.dir(mongoReply)
        // throw new Error('on purpose')
        
        
      } catch (err) {
        // Stop the connection pool
        self.stop();
        // Emit the error
        self.emit("parseError", err);
      }
      
      
      // console.log("---------------------------------------------------- pool message")
    })
    
    // Start connection
    connection.start();
  }  
}

// Restart a connection pool (on a close the pool might be in a wrong state)
ConnectionPool.prototype.restart = function() {
  // Close all connections
  this.stop();
  // Now restart the pool
  this.start();
}

// Stop the connections in the pool
ConnectionPool.prototype.stop = function() {
  var keys = Object.keys(this.openConnections);  
  // Force close any sockets that are not already closed
  for(var i = 0; i < keys.length; i++) {
    this.openConnections[keys[i]].close();
  } 
  
  // Clear out all the connection variables
  this.waitingToOpen = {};
  this.connectionsWithErrors = {};
  this.openConnections = {};   
}

// Checkout a connection from the pool for usage, or grab a specific pool instance
ConnectionPool.prototype.checkoutConnection = function(id) {
  // If we have an id return that specific connection
  if(id != null) return this.openConnections[id];
  // Otherwise let's pick one using roundrobin
  var keys = Object.keys(this.openConnections);
  return this.openConnections[(keys[(this.currentConnectionIndex++ % keys.length)])]
}

ConnectionPool.prototype.getAllConnections = function() {
  return this.openConnections;
}

//
// My own simple synchronous emit support, We don't need the overhead of the built in flexible node.js
// event emitter as we are looking for as low latency as possible.
//
ConnectionPool.prototype.on = function(event, callback) {
  if(this.eventHandlers[event] == null) throw "Event handler only accepts values of " + Object.keys(this.eventHandlers);
  // Just add callback to our event handler (avoiding the cost of the node.js event handler)
  this.eventHandlers[event].push(callback);
}

ConnectionPool.prototype.emit = function(event, err, object) {
  // console.log(Object.keys(this.eventHandlers) + " " + event)
  
  if(this.eventHandlers[event] == null) throw "Event handler only accepts values of " + Object.keys(this.eventHandlers);
  // Fire off all the callbacks
  var callbacks = this.eventHandlers[event];
  // Perform a callback on all the registered callback handlers
  for(var i = 0; i < callbacks.length; i++) {
    callbacks[i](err, object);
  }
}

























