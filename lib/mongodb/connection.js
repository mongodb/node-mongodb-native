var net = require('net'),
  debug = require('util').debug,
  inspect = require('util').inspect,
  EventEmitter = require("events").EventEmitter,
  BinaryParser = require('./bson/binary_parser').BinaryParser,
  inherits = require('sys').inherits,
  Server = require('./connections/server').Server;

var Connection = exports.Connection = function(host, port, autoReconnect) {
  this.host = host;
  this.port = port;
  this.autoReconnect = autoReconnect;
  this.drained = true;
  // Reconnect buffer for messages
  this.messages = [];
  // Message sender
  var self = this;
  // Status messages
  this.sizeOfMessage = 0;
  this.bytesRead = 0;
  this.buffer = '';
  this.stubBuffer = '';
};

inherits(Connection, EventEmitter);

// Functions to open the connection
Connection.prototype.open = function() {
  // Assign variable to point to local scope object
  var self = this;
  // Create the associated connection
  this.connection = net.createConnection(this.port, this.host);    
  // Set up the net client
  this.connection.setEncoding("binary");
  // Add connnect listener
  this.connection.addListener("connect", function() {
    this.setEncoding("binary");
    this.setTimeout(0);
    this.setNoDelay();
    self.emit("connect");
  });
  
  this.connection.addListener("error", function(err) {
    self.emit("error", err);
  });
  
  this.connection.addListener("timeout", function(err) {
    self.emit("timeout", err);
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
        self.emit("data", self.buffer);
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
        var sizeOfMessage = BinaryParser.toInt(result.substr(0, 4));
        // We got a partial message, store the result and wait for more
        if(sizeOfMessage > result.length) {
          self.buffer = self.buffer + result; self.bytesRead = result.length; self.sizeOfMessage = sizeOfMessage;
        } else if(sizeOfMessage == result.length) {
          self.emit("data", result);
        } else if(sizeOfMessage < result.length) {
          self.emit("data", result.substr(0, sizeOfMessage));
          self.receiveListener(result.substr(sizeOfMessage, (result.length - sizeOfMessage)));
        }
      } else {
        self.stubBuffer = result;
      }
    }
  };

  // Add a receieved data connection
  this.connection.addListener("data", this.receiveListener);
};

Connection.prototype.close = function() {
  if(this.connection) this.connection.end();
};

Connection.prototype.send = function(command) { 
  var self = this;
  // Check if the connection is closed
  try {
    if ( this.connection.readyState != "open" )
      throw 'notConnected';
    if(command.constructor == String) {
      this.connection.write(command, "binary");      
    } else {
      this.connection.write(command.toBinary(), "binary");      
    }    
  } catch(err) {
    // Check if the connection is closed
    if(this.connection.readyState != "open" && this.autoReconnect) {
      // Add the message to the queue of messages to send
      this.messages.push(command);
      // Initiate reconnect if no current running
      if(this.connection.currently_reconnecting == null) {
        this.connection.currently_reconnecting = true;
        // Create the associated connection
        var new_connection = net.createConnection(this.port, this.host);
        // Set up the net client
        new_connection.setEncoding("binary");
        new_connection.addListener( "error", function( err ) {
          self.emit( "error", err ); 
          self.connection.currently_reconnecting = null;
        });
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
            var msg = self.messages.shift();
            if(msg.constructor == String) {
              this.write(msg, "binary");      
            } else {
              this.write(msg.toBinary(), "binary");      
            }    
            // this.write(self.messages.shift().toBinary(), "binary");
          }
        });
      }
    } else {   
      throw err;   
    }
  }
};

/**
* Wrtie command without an attempt of reconnect
* @param command 
*/
Connection.prototype.sendwithoutReconnect = function(command) {
  var self = this;
  // Check if the connection is closed
  if ( this.connection.readyState != "open" ) {
    throw new Error( 'Connection closed!' );
  }
  try {
    this.connection.write(command.toBinary(), "binary");
  } catch(err) {
    // no need to reconnect since called by latest master
    // and already went through send() function
    throw err;  
  };
};

// Some basic defaults
Connection.DEFAULT_PORT = 27017;