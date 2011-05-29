var net = require('net'),
  debug = require('util').debug,
  inspect = require('util').inspect,
  EventEmitter = require("events").EventEmitter,
  BinaryParser = require('./bson/binary_parser').BinaryParser,
  inherits = require('util').inherits,
  Server = require('./connections/server').Server;

var Connection = exports.Connection = function(host, port, autoReconnect, options) {
  this.options = options == null ? {} : options;
  this.host = host;
  this.port = port;
  this.autoReconnect = autoReconnect;
  this.drained = true;
  // Fetch the poolsize
  this.poolSize = this.options["poolSize"] == null ? 2 : this.options["poolSize"];    
  // Reconnect buffer for messages
  this.messages = [];

  // Status messages
  this.sizeOfMessage = 0;
  this.bytesRead = 0;
  this.buffer = '';
  this.stubBuffer = '';
  
  // Connection pool variables
  this.pool = [];
  this.poolByReference = {};
  this.poolIndex = 0;
};

inherits(Connection, EventEmitter);

var getConnection = function(self) {
  return self.pool[self.poolIndex++ % self.pool.length];
}

// Setup the connection pool
var setupConnectionPool = function(self, poolSize, reconnect) {
  // Pool off connections and status variables
  var connectionPool = [];  
  var connectedTo = 0;
  var errors = 0;
  var connectionError = null;

  //
  // Listener that handles callbacks for the connection
  // Uses the internal object states to keep individual tcp connections seperate
  var receiveListener = function(result) {    
    // Fetch the pool reference
    var conObj = self.poolByReference[this.fd];
    // Check if we have an unfinished message
    if(conObj.bytesRead > 0 && conObj.sizeOfMessage > 0) {
      // Calculate remaing bytes to fetch
      var remainingBytes = conObj.sizeOfMessage - conObj.bytesRead;
      // Check if we have multiple packet messages and save the pieces otherwise emit the message
      if(remainingBytes > result.length) {
        conObj.buffer = conObj.buffer + result; conObj.bytesRead = conObj.bytesRead + result.length;
      } else {
        // Cut off the remaining message
        conObj.buffer = conObj.buffer + result.substr(0, remainingBytes);
        // Emit the message
        self.emit("data", conObj.buffer);
        // Reset the variables
        conObj.buffer = ''; conObj.bytesRead = 0; conObj.sizeOfMessage = 0;
        // If message is longer than the current one, keep parsing
        if(remainingBytes < result.length) {
          receiveListener.call(this, result.substr(remainingBytes, (result.length - remainingBytes)));
        }
      }
    } else {
      if(conObj.stubBuffer.length > 0) {
        result = conObj.stubBuffer + result;
        conObj.stubBuffer = '';
      }

      if(result.length > 4) {
        var sizeOfMessage = BinaryParser.toInt(result.substr(0, 4));
        // We got a partial message, store the result and wait for more
        if(sizeOfMessage > result.length) {
          conObj.buffer = conObj.buffer + result; conObj.bytesRead = result.length; conObj.sizeOfMessage = sizeOfMessage;
        } else if(sizeOfMessage == result.length) {
          self.emit("data", result);
        } else if(sizeOfMessage < result.length) {
          self.emit("data", result.substr(0, sizeOfMessage));
          receiveListener.call(this, result.substr(sizeOfMessage, (result.length - sizeOfMessage)));
        }
      } else {
        conObj.stubBuffer = result;
      }
    }
  };
  
  // Fill the pool
  for(var i = 0; i < poolSize; i++) {
    // Create the associated connection
    var connection = net.createConnection(self.port, self.host);    
    // Set up the net client
    connection.setEncoding("binary");
    // Add connnect listener
    connection.addListener("connect", function() {
      this.setEncoding("binary");
      this.setTimeout(0);
      this.setNoDelay();
      // Update number of connected to server
      connectedTo = connectedTo + 1;
    });
    
    connection.addListener("error", function(err) {
      // Update number of errors
      errors = errors + 1;
      connectionError = err;
    });
    
    connection.addListener("timeout", function(err) {
      // Update number of errors
      errors = errors + 1;
      connectionError = err;
    });
    
    // Add a close listener
    connection.addListener("close", function() {
      self.emit("close");
    });
    
    // Add connection to the pool array
    connectionPool.push({"connection": connection,
      "sizeOfMessage": 0,
      "bytesRead": 0,
      "buffer": '',
      "stubBuffer": ''});      
    // Add the listener to the connection
    connection.addListener("data", receiveListener);
  }
  
  // Wait until we are done connected to all pool entries before emitting connect signal
  var timer = setInterval(function() {
    // Emit a connect message once all connections are up
    if(connectedTo == connectionPool.length) {
      if(reconnect == null || !reconnect) {
        self.emit("connect");
      } else {
        self.emit("reconnect");
      }
      clearInterval(timer);
    } else if(errors + connectedTo == connectionPool.length) {
      if(reconnect == null || !reconnect) {
        self.emit("error", connectionError);
      } else {
        self.emit("reconnect");
      }        
      clearInterval(timer);
    }
  }, 1);
  
  // Return the pool
  return connectionPool;
}

// Functions to open the connection
Connection.prototype.open = function() {
  var self = this;
  // Create the pool with connections
  this.pool = setupConnectionPool(this, this.poolSize);
  this.poolByReference = {};
  
  // Save the connections by the fd reference
  this.pool.forEach(function(con) {
    self.poolByReference[con.connection.fd] = con;
  })
}


// // Functions to open the connection
// Connection.prototype.open = function() {
//   // Assign variable to point to local scope object
//   var self = this;
//   // Create the associated connection
//   this.connection = net.createConnection(this.port, this.host);    
//   // Set up the net client
//   this.connection.setEncoding("binary");
//   // Add connnect listener
//   this.connection.addListener("connect", function() {
//     this.setEncoding("binary");
//     this.setTimeout(0);
//     this.setNoDelay();
//     self.emit("connect");
//   });
//   
//   this.connection.addListener("error", function(err) {
//     self.emit("error", err);
//   });
//   
//   this.connection.addListener("timeout", function(err) {
//     self.emit("timeout", err);
//   });
//   
//   // Add a close listener
//   this.connection.addListener("close", function() {
//     self.emit("close");
//   });
//   
//   // Listener for receive data
//   this.receiveListener = function(result) {    
//     // Check if we have an unfinished message
//     if(self.bytesRead > 0 && self.sizeOfMessage > 0) {
//       // Calculate remaing bytes to fetch
//       var remainingBytes = self.sizeOfMessage - self.bytesRead;
//       // Check if we have multiple packet messages and save the pieces otherwise emit the message
//       if(remainingBytes > result.length) {
//         self.buffer = self.buffer + result; self.bytesRead = self.bytesRead + result.length;
//       } else {
//         // Cut off the remaining message
//         self.buffer = self.buffer + result.substr(0, remainingBytes);
//         // Emit the message
//         self.emit("data", self.buffer);
//         // Reset the variables
//         self.buffer = ''; self.bytesRead = 0; self.sizeOfMessage = 0;
//         // If message is longer than the current one, keep parsing
//         if(remainingBytes < result.length) {
//           self.receiveListener(result.substr(remainingBytes, (result.length - remainingBytes)));
//         }
//       }
//     } else {
//       if(self.stubBuffer.length > 0) {
//         result = self.stubBuffer + result;
//         self.stubBuffer = '';
//       }
// 
//       if(result.length > 4) {
//         var sizeOfMessage = BinaryParser.toInt(result.substr(0, 4));
//         // We got a partial message, store the result and wait for more
//         if(sizeOfMessage > result.length) {
//           self.buffer = self.buffer + result; self.bytesRead = result.length; self.sizeOfMessage = sizeOfMessage;
//         } else if(sizeOfMessage == result.length) {
//           self.emit("data", result);
//         } else if(sizeOfMessage < result.length) {
//           self.emit("data", result.substr(0, sizeOfMessage));
//           self.receiveListener(result.substr(sizeOfMessage, (result.length - sizeOfMessage)));
//         }
//       } else {
//         self.stubBuffer = result;
//       }
//     }
//   };
// 
//   // Add a receieved data connection
//   this.connection.addListener("data", this.receiveListener);
// };

Connection.prototype.close = function() {
  // Close all entries in the pool
  for(var i = 0; i < this.pool.length; i++) {
    this.pool[i].connection.end();      
  }
};

Connection.prototype.send = function(command) { 
  var self = this;
  var connection = getConnection(self).connection;  
  
  // debug("=============================== connection::fd = " + connection.fd)
    
  // Check if the connection is closed
  try {
    if (connection.readyState != "open") {
      throw 'notConnected';      
    }

    // Send the command, if it's an array of commands execute them all on the same connection
    if(Array.isArray(command)) {
      for(var i = 0; i < command.length; i++) {
        connection.write((command[i].constructor == String) ? command[i] : command[i].toBinary(), "binary");
      }
    } else {
      connection.write((command.constructor == String) ? command : command.toBinary(), "binary");      
    }
  } catch(err) {
    // Check if the connection is closed
    if(connection.readyState != "open" && self.autoReconnect) {
      // debug("================ hello")
      // Add the message to the queue of messages to send
      self.messages.push(command);
      // Initiate reconnect if no current running
      if(self.currently_reconnecting == null || self.currently_reconnecting == false) {
        self.currently_reconnecting = true;
                
        // Create the pool with connections
        self.pool = setupConnectionPool(self, self.poolSize, true);
        self.poolByReference = {};
        // Save the connections by the fd reference
        self.pool.forEach(function(con) {
          self.poolByReference[con.connection.fd] = con;
        })
        
        // Wait for a reconnect and send all the messages
        self.on("reconnect", function() {
          self.currently_reconnecting = false;
          // Fire the message again
          while(self.messages.length > 0) {
            // Fetch a connection and resend messages
            connection = getConnection(self).connection;
            // Fetch the a message
            var command = self.messages.shift();
            // Fire
            if(Array.isArray(command)) {
              for(var i = 0; i < command.length; i++) {
                connection.write((command[i].constructor == String) ? command[i] : command[i].toBinary(), "binary");
              }
            } else {
              connection.write((command.constructor == String) ? command : command.toBinary(), "binary");      
            }
          }          
        })
      }
    } else {   
      throw err;   
    }
  }
};

// Connection.prototype.send = function(command) { 
//   var self = this;
//   // Check if the connection is closed
//   try {
//     if ( this.connection.readyState != "open" )
//       throw 'notConnected';
//     if(command.constructor == String) {
//       // debug("========================================================================= command string")
//       // BinaryParser.ilprint(command)      
// 
//       this.connection.write(command, "binary");      
//     } else {
//       // debug("========================================================================= command command")
//       // BinaryParser.ilprint(command.toBinary())
// 
//       this.connection.write(command.toBinary(), "binary");      
//     }    
//   } catch(err) {
//     // Check if the connection is closed
//     if(this.connection.readyState != "open" && this.autoReconnect) {
//       // Add the message to the queue of messages to send
//       this.messages.push(command);
//       // Initiate reconnect if no current running
//       if(this.connection.currently_reconnecting == null) {
//         this.connection.currently_reconnecting = true;
//         // Create the associated connection
//         var new_connection = net.createConnection(this.port, this.host);
//         // Set up the net client
//         new_connection.setEncoding("binary");
//         new_connection.addListener( "error", function( err ) {
//           self.emit( "error", err ); 
//           self.connection.currently_reconnecting = null;
//         });
//         // Add connnect listener
//         new_connection.addListener("connect", function() {
//           this.setEncoding("binary");
//           this.setTimeout(0);
//           this.setNoDelay();
//           // Add the listener
//           this.addListener("data", self.receiveListener);
//           // assign the new ready connection
//           self.connection = this;
//           // send all the messages
//           while(self.messages.length > 0) {
//             var msg = self.messages.shift();
//             if(msg.constructor == String) {
//               // debug("========================================================================= write message")
//               // BinaryParser.hlprint(msg)              
//               this.write(msg, "binary");      
//             } else {
//               // debug("========================================================================= write message")
//               // BinaryParser.hlprint(msg.toBinary())
//               this.write(msg.toBinary(), "binary");      
//             }    
//             // this.write(self.messages.shift().toBinary(), "binary");
//           }
//         });
//       }
//     } else {   
//       throw err;   
//     }
//   }
// };

/**
* Wrtie command without an attempt of reconnect
* @param command 
*/
Connection.prototype.sendwithoutReconnect = function(command) {
  var self = this;
  var connection = this.connection;
  
  // Check if the connection is closed
  if (connection.readyState != "open") {
    throw new Error( 'Connection closed!' );
  }
  try {
    connection.write(command.toBinary(), "binary");
  } catch(err) {
    // no need to reconnect since called by latest master
    // and already went through send() function
    throw err;  
  };
};

// Some basic defaults
Connection.DEFAULT_PORT = 27017;