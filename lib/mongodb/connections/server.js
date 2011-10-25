var Connection = require('../connection').Connection,
  DbCommand = require('../commands/db_command').DbCommand,
  MongoReply = require('../responses/mongo_reply').MongoReply,
  EventEmitter = require("events").EventEmitter,
  ConnectionPool = require('../connection/connection_pool').ConnectionPool,
  inherits = require('util').inherits;

var Server = exports.Server = function(host, port, options) {
  EventEmitter.call(this);
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

  // Add handler of resend message
  this.on('resend', function(err) {
    self.connection.emit("resend");    
  });
  
  // Internal state of server connection
  this._serverState = 'disconnected';
};

inherits(Server, EventEmitter);

Server.prototype.close = function(callback) {  
  if(this.connectionPool.isConnected()) this.connectionPool.stop();        
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

    // Add listener to the request Id
    parent.on(db_command.getRequestId().toString(), connectCallback);
    // Save a object stamp to the notReplied to list that keeps some information about the callback
    parent.notReplied[db_command.getRequestId().toString()] = {start: new Date().getTime(), raw:false};
    
    // Check out a reader from the pool
    var connection = connectionPool.checkoutConnection();
    // Write the command out
    connection.write(db_command);
  })

  // Set up item connection
  connectionPool.on("message", function(message) {    
    // Locate the callback, do the cleanup and move on
    try {
      if(parent.notReplied[message.responseTo.toString()] != null) {        
        parent.emit(message.responseTo.toString(), null, message, parent.notReplied[message.responseTo.toString()].connection);
      }
    } catch(err) {
      parent.emit('error', err);
    }
    
    // Clean up crap to avoid memory leaks
    delete parent.notReplied[message.responseTo.toString()];
    parent.removeAllListeners(message.responseTo.toString());
  });
  
  // Handle errors
  connectionPool.on("error", function(message) {        
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
    // Emit error only if we are not in the process of connecting
    if(server._serverState === 'connecting') {
      callback(new Error('no open connections'));
    } else {
      parent.emit("close");
    }
  });

  // Handle errors
  connectionPool.on("parseError", function(message) {    
    // Force close the pool
    if(connectionPool.isConnected()) self.stop();        
  });
  
  // Boot up connection poole, pass in a locator of callbacks
  connectionPool.start(function(id) {
    return parent.notReplied[id];
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



