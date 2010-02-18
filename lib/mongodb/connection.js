var tcp = require("tcp");
var sys = require("sys");

var mongo = require('mongodb/bson/binary_parser');
process.mixin(mongo, require('mongodb/bson/collections'));
process.mixin(mongo, require('mongodb/commands/insert_command'));

exports.Connection = Class({
  init: function(host, port, autoReconnect) { 
    this.host = host;
    this.port = port;
    this.autoReconnect = autoReconnect;
    this.drained = true;
    // Reconnect buffer for messages
    this.messages = [];
    // Mixin process emitter
    process.mixin(this, new process.EventEmitter());
    // Set up the process
    process.EventEmitter.call(this);
    // Message sender
    var self = this;
    // Status messages
    this.sizeOfMessage = 0;
    this.bytesRead = 0; 
    this.buffer = '';
    this.stubBuffer = '';
    this.className = "Connection";
  },
  
  // Functions to open the connection
  open: function() {
    // Assign variable to point to local scope object
    var self = this;
    // Create the associated connection
    this.connection = tcp.createConnection(this.port, this.host);
    // Set up the tcp client
    this.connection.setEncoding("binary");
    // Add connnect listener
    this.connection.addListener("connect", function() {
      this.setEncoding("binary");
      this.setTimeout(0);
      this.setNoDelay();
      self.emit("connect");
    });
    // Add a close listener
    this.connection.addListener("close", function() {
      self.emit("close");
    });

    // Listener for receive data
    this.receiveListener = function(result) {
      // Check if we have an unfinished message
      if(self.bytesRead > 0 && self.sizeOfMessage > 0) {
        // Calculate remaing bytes to fetch
        var remainingBytes = self.sizeOfMessage - self.bytesRead;
        // Check if we have multiple packet messages and save the pieces otherwise emit the message
        if(remainingBytes > result.length) {
          self.buffer = self.buffer + result; self.bytesRead = self.bytesRead + result.length;        
        } else {
          // Cut off the remaining message
          self.buffer = self.buffer + result.substr(0, remainingBytes);
          // Emit the message
          self.emit("data", [self.buffer]);              
          // Reset the variables
          self.buffer = ''; self.bytesRead = 0; self.sizeOfMessage = 0;
          // If message is longer than the current one, keep parsing
          if(remainingBytes < result.length) {
            self.receiveListener(result.substr(remainingBytes, (result.length - remainingBytes)));
          }
        }
      } else {
        if(self.stubBuffer.length > 0) {
          result = self.stubBuffer + result;
          self.stubBuffer = '';
        }
        
        if(result.length > 4) {
          var sizeOfMessage = mongo.BinaryParser.toInt(result.substr(0, 4));        
          // We got a partial message, store the result and wait for more
          if(sizeOfMessage > result.length) {
            self.buffer = self.buffer + result; self.bytesRead = result.length; self.sizeOfMessage = sizeOfMessage;
          } else if(sizeOfMessage == result.length) {
            self.emit("data", [result]);              
          } else if(sizeOfMessage < result.length) {
            self.emit("data", [result.substr(0, sizeOfMessage)]);
            self.receiveListener(result.substr(sizeOfMessage, (result.length - sizeOfMessage)));
          }          
        } else {
          self.stubBuffer = result;
        }
      } 
    }  

    // Add a receieved data connection
    this.connection.addListener("data", this.receiveListener);  
  },  
  
  close: function() {
    if(this.connection) this.connection.close();
  },
  
  send: function(command) {
    var self = this;

    // Check if the connection is closed
    try {
      this.connection.write(command.toBinary(), "binary");        
    } catch(err) {
      // Check if the connection is closed
      if(this.connection.readyState != "open" && this.autoReconnect) {
        // Add the message to the queue of messages to send
        this.messages.push(command);
        // Initiate reconnect if no current running
        if(this.connection.currently_reconnecting == null) {
          this.connection.currently_reconnecting = true;
          // Create the associated connection
          var new_connection = tcp.createConnection(this.port, this.host);
          // Set up the tcp client
          new_connection.setEncoding("binary");
          // Add connnect listener
          new_connection.addListener("connect", function() {
            this.setEncoding("binary");
            this.setTimeout(0);
            this.setNoDelay();
            // Add the listener
            this.addListener("data", self.receiveListener);            
            // assign the new ready connection
            self.connection = this;
            // send all the messages
            while(self.messages.length > 0) {
              this.write(self.messages.shift().toBinary(), "binary");
            }
          });        
        }
     } else {
        throw err;
      }
    }
  }
})

// Some basic defaults
exports.Connection.DEFAULT_PORT = 27017;

exports.Server = Class({
  init: function(host, port, options) {
    this.host = host;
    this.port = port;
    this.options = options == null ? {} : options;
    this.internalConnection;
    this.internalMaster = false;
    this.className = "Server";
    // Setters and getters
    this.__defineGetter__("autoReconnect", function() { return this.options['auto_reconnect'] == null ? false : this.options['auto_reconnect']; });
    this.__defineGetter__("connection", function() { return this.internalConnection; });
    this.__defineSetter__("connection", function(connection) { this.internalConnection = connection; });  
    this.__defineGetter__("master", function() { return this.internalMaster; });
    this.__defineSetter__("master", function(value) { this.internalMaster = value; });  
    this.__defineGetter__("masterConnection", function() { return (this.internalMaster == true) ? this.internalConnection : null; });
  },

  close: function(callback) {
    this.connection.close(callback);
  }
})

// Server pair object used to support a failover connection set
exports.ServerPair = Class({
  init: function(leftServer, rightServer) {
    if(leftServer == null || rightServer == null || !(leftServer.className == "Server") || !(rightServer.className == "Server")) {
      throw Error("Both left/right must be defined and off the type Server");
    }  
    this.leftServer = leftServer;
    this.rightServer = rightServer;
    // Containst the master server entry
    this.master = null;
    this.target = null;
    this.className = "ServerPair";
    // Setters and getters
    this.__defineGetter__("autoReconnect", function() { 
      if(this.target != null) return this.target.autoReconnect;
      if(this.masterConnection != null) return this.masterConnection.autoReconnect;
    });
    this.__defineGetter__("masterConnection", function() { 
      if(this.target != null && this.target.className == "Server") return this.target.masterConnection;
      if(this.leftServer.master) return this.leftServer.masterConnection;
      if(this.rightServer.master) return this.rightServer.masterConnection;
      return null;
    });
  },
  
  setTarget: function(target) {
    this.target = target;
    this.servers = [];
  }  
})

exports.ServerPair.MASTER = 0;
exports.ServerPair.SHADOW_MASTER = 1;

// Server cluster (one master and multiple read slaves)
exports.ServerCluster = Class({
  init: function(servers) {  
    // Containst the master server entry
    this.master = null;
    this.target = null;
    this.className = "ServerCluster";

    if(servers.constructor != Array || servers.length == 0) {        
      throw Error("The parameter must be an array of servers and contain at least one server");
    } else if(servers.constructor == Array || servers.length > 0) {
      var count = 0;
      servers.forEach(function(server) {
        if(server.className == "Server") count = count + 1;
      })       

      if(count < servers.length) {
        throw Error("All server entries must be of type Server");      
      } else {
        this.servers = servers;      
      }
    }      
    // Setters and getters
    this.__defineGetter__("autoReconnect", function() { 
      if(this.target != null) return this.target.autoReconnect;
      if(this.masterConnection != null) return this.masterConnection.autoReconnect;
    });
    this.__defineGetter__("masterConnection", function() { 
      // Allow overriding to a specific connection
      if(this.target != null && this.target.className == "Server") {
        return this.target.masterConnection;
      } else {
        var finalServer = null;
        this.servers.forEach(function(server) {
          if(server.master == true) finalServer = server;
        });
        return finalServer != null ? finalServer.masterConnection : finalServer;      
      }
    });    
  },
  
  setTarget: function(target) {
    this.target = target;
  }
})