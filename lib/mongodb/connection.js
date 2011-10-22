var net = require('net'),
  debug = require('util').debug,
  inspect = require('util').inspect,
  EventEmitter = require("events").EventEmitter,
  BinaryParser = require('./bson/binary_parser').BinaryParser,
  inherits = require('util').inherits,
  Server = require('./connections/server').Server,
  binaryutils = require("./bson/binary_utils");

var Connection = exports.Connection = function(host, port, autoReconnect, options) {
  this.options = options == null ? {} : options;
  this.host = host;
  this.port = port;
  this.autoReconnect = autoReconnect;
  this.drained = true;
  // Fetch the poolsize
  this.poolSize = this.options["poolSize"] == null ? 1 : this.options["poolSize"];    
  // Reconnect buffer for messages
  this.messages = [];

  // Status messages
  this.connected = false;
  this.closedConnectionCount = 0;

  // Connection pool variables
  this.pool = [];
  this.poolByReference = {};
  this.poolIndex = 0;
};

inherits(Connection, EventEmitter);

var getConnection = function(self) {
  return self.pool[self.poolIndex++ % self.pool.length];
}

// // Receive listener curry function
// // Make it easy to test the logic for the parsing
// // It's on purpose :)
// var receiveListenerCreator = exports.Connection._receiveListenerCreator = function(self) {
//   // Return receive Listener
//   return function(result, fd) {    
//     fd = fd == null ? this.fd : fd;
// 
//     // Fetch the pool reference
//     var conObj = self.poolByReference[fd];
//     
//     // Check if we have an unfinished message
//     if(conObj != null && conObj.bytesRead > 0 && conObj.sizeOfMessage > 0) {
//       // Calculate remaing bytes to fetch
//       var remainingBytes = conObj.sizeOfMessage - conObj.bytesRead;      
//       // Check if we have multiple packet messages and save the pieces otherwise emit the message
//       if(remainingBytes > result.length) {
//         // Let's copy all the results into a new buffer
//         var buffer = new Buffer(conObj.buffer.length + result.length);
//         conObj.buffer.copy(buffer, 0, 0, conObj.buffer.length);
//         result.copy(buffer, conObj.buffer.length, 0, result.length);
//         // Save the reference to the new buffer
//         conObj.buffer = buffer;
//         // Adjust the number of read bytes
//         conObj.bytesRead = conObj.bytesRead + result.length;
//       } else {
//         // Cut off the remaining message
//         var buffer = new Buffer(conObj.buffer.length + remainingBytes);
//         conObj.buffer.copy(buffer, 0, 0, conObj.buffer.length);
//         result.copy(buffer, conObj.buffer.length, 0, remainingBytes);
//         // Emit the message
//         self.emit("data", buffer);
//         // Reset the variables
//         conObj.buffer = new Buffer(0); conObj.bytesRead = 0; conObj.sizeOfMessage = 0;
//         // If message is longer than the current one, keep parsing
//         if(remainingBytes < result.length) {
//           arguments.callee(result.slice(remainingBytes, result.length), fd);
//         }        
//       }
//     } else if(conObj != null){
//       if(conObj.stubBuffer.length > 0) {
//         // Add missing stub files
//         var buffer = new Buffer(conObj.stubBuffer.length + result.length);
//         conObj.stubBuffer.copy(buffer, 0, 0, conObj.stubBuffer.length);
//         result.copy(buffer, conObj.stubBuffer.length, 0, result.length);
//         // New result contains the former missing bytes as well as the incoming payload
//         result = buffer;
//         conObj.stubBuffer = new Buffer(0);
//         
//         // If we got more than 4 bytes let's calculate the length of the message and add
//         // to the connection object
//         if(result.length >= 4) {
//           conObj.sizeOfMessage = binaryutils.decodeUInt32(result, 0);
//         } else {
//           conObj.stubBuffer = result;
//         }
//       } else if(result.length >= 4) {
//         conObj.sizeOfMessage = binaryutils.decodeUInt32(result, 0);        
//       } else {
//         conObj.stubBuffer = result;        
//       }
//       
//       // If no stubBuffer parse
//       if(conObj.stubBuffer.length == 0) {
//         var sizeOfMessage = conObj.sizeOfMessage;
//         
//         // Ensure we have a positive sized message, avoid corrupt messages
//         if(sizeOfMessage > 0) {
//           // Parse valid message
//           if(sizeOfMessage > result.length) {
//             // Create a new buffer with the correct size
//             var buffer = new Buffer(conObj.buffer.length + result.length);
//             conObj.buffer.copy(buffer, 0, 0, conObj.buffer.length);
//             result.copy(buffer, conObj.buffer.length, 0, result.length);
//             conObj.buffer = buffer;
//             // Adjust variables
//             conObj.bytesRead = result.length; 
//             // conObj.sizeOfMessage = sizeOfMessage;
//           } else if(sizeOfMessage == result.length) {
//             try {
//               self.emit("data", result);              
//             } catch(err) {
//               debug("========================================== caught error 0")
//             }
//             
//           } else if(sizeOfMessage < result.length) {
//             try {
//               self.emit("data", result.slice(0, sizeOfMessage));
//             } catch(err) {
//               debug("========================================== caught error 1")
//             }
//             arguments.callee(result.slice(sizeOfMessage, result.length), fd);
//           }                  
//         } else {
//           // Emit error and do cleanup
//           self.emit("error", {err:"unparsable", bin:result, parseState:conObj});          
//           // Force cleanup of the connection, throwing away the content
//           conObj.stubBuffer = new Buffer(0);
//           conObj.sizeOfMessage = 0;
//           conObj.buffer = new Buffer(0);
//           conObj.bytesRead = 0;
//         }
//       }
//     }
//   };  
// }

// Setup the connection pool
var setupConnectionPool = function(self, poolSize, reconnect) {
  // Pool off connections and status variables
  var connectionPool = [];  
  var connectedTo = 0;
  var errors = 0;
  var connectionError = null;
  
  // Receive listener
  // var receiveListener = receiveListenerCreator(self);
  var receiveListener = function(result, fd) {    
    fd = fd == null ? this.fd : fd;

    // Fetch the pool reference
    var conObj = self.poolByReference[fd];

    // Check if we have an unfinished message
    if(conObj != null && conObj.bytesRead > 0 && conObj.sizeOfMessage > 0) {
      // Calculate remaing bytes to fetch
      var remainingBytes = conObj.sizeOfMessage - conObj.bytesRead;
      // Check if we have multiple packet messages and save the pieces otherwise emit the message
      if(remainingBytes > result.length) {
        // conObj.buffer = conObj.buffer + result; conObj.bytesRead = conObj.bytesRead + result.length;

        // Let's copy all the results into a new buffer
        var buffer = new Buffer(conObj.buffer.length + result.length);
        conObj.buffer.copy(buffer, 0, 0, conObj.buffer.length);
        result.copy(buffer, conObj.buffer.length, 0, result.length);
        // Save the reference to the new buffer
        conObj.buffer = buffer;
        // Adjust the number of read bytes
        conObj.bytesRead = conObj.bytesRead + result.length;

      } else {
        // Cut off the remaining message
        var buffer = new Buffer(conObj.buffer.length + remainingBytes);
        conObj.buffer.copy(buffer, 0, 0, conObj.buffer.length);
        result.copy(buffer, conObj.buffer.length, 0, remainingBytes);
        
        // Catches the error, and ensures we do not get a crazy ripple killing the connection
        // Ensure we clean up if needed
        try {
          self.emit("data", buffer);          
        } finally {
          // Reset the variables
          conObj.buffer = new Buffer(0); conObj.bytesRead = 0; conObj.sizeOfMessage = 0;
          // If message is longer than the current one, keep parsing
          if(remainingBytes < result.length) {
            receiveListener(result.slice(remainingBytes, result.length), fd);
          }
        }
      }
    } else if(conObj != null){
      if(conObj.stubBuffer.length > 0) {
        // Add missing stub files
        var buffer = new Buffer(conObj.stubBuffer.length + result.length);
        conObj.stubBuffer.copy(buffer, 0, 0, conObj.stubBuffer.length);
        result.copy(buffer, conObj.stubBuffer.length, 0, result.length);
        // New result contains the former missing bytes as well as the incoming payload
        result = buffer;
        conObj.stubBuffer = new Buffer(0);
      }

      if(result.length > 4) {
        // var sizeOfMessage = BinaryParser.toInt(result.toString('binary', 0, 4));
        var sizeOfMessage = binaryutils.decodeUInt32(result, 0);
        // We got a partial message, store the result and wait for more
        if(sizeOfMessage > result.length) {
          // Create a new buffer with the correct size
          var buffer = new Buffer(conObj.buffer.length + result.length);
          conObj.buffer.copy(buffer, 0, 0, conObj.buffer.length);
          result.copy(buffer, conObj.buffer.length, 0, result.length);
          conObj.buffer = buffer;
          // Adjust variables
          conObj.bytesRead = result.length; conObj.sizeOfMessage = sizeOfMessage;
        } else if(sizeOfMessage == result.length) {

          //Try/finally not needed here as there is no more code to be executed afterwards
          self.emit("data", result);
        } else if(sizeOfMessage < result.length) {

          // Catches the error, and ensures we do not get a crazy ripple killing the connection
          // Ensure we clean up if needed
          try {
            self.emit("data", result.slice(0, sizeOfMessage));
          } finally {
            receiveListener(result.slice(sizeOfMessage, result.length), fd);
          }
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
    // Add connnect listener
    connection.addListener("connect", function() {
      // this.setEncoding("binary");
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
      // Only emit close once all connections in the pool have closed.
      // Note that connections which emit an error also emit a close.
      if (++self.closedConnectionCount === self.pool.length)
        self.emit("close");
    });
    
    // Add connection to the pool array
    connectionPool.push({"connection": connection,
      "sizeOfMessage": 0,
      "bytesRead": 0,
      "buffer": new Buffer(0),
      "stubBuffer": new Buffer(0)});      

    // Add the listener to the connection
    connection.addListener("data", receiveListener);
  }
  
  // Function that wait for connection to finish up
  var waitForConnections = function() {
    // Emit a connect message once all connections are up
    if(connectedTo == connectionPool.length) {
      if(reconnect == null || !reconnect) {
        self.connected = true;
        self.poolByReference = {};
     
         // Save the connections by the fd reference
        self.pool.forEach(function(con) {
          self.poolByReference[con.connection.fd] = con;
        });
                
        self.emit("connect");
      } else {
        self.connected = false;
        self.emit("reconnect");
      }
    } else if(errors > 0) {
      if(reconnect == null || !reconnect) {
        self.connected = false;
        self.emit("error", connectionError);
      } else {
        self.connected = false;
        self.emit("reconnect");
      }              
    } else {
      setTimeout(waitForConnections, 10);
    }
  }
  
  // Wait until we are done connected to all pool entries before emitting connect signal
  // process.nextTick(waitForConnections);
  setTimeout(waitForConnections, 10);
  
  // Return the pool
  return connectionPool;
}

// Functions to open the connection
Connection.prototype.open = function() {
  // Create the pool with connections
  this.pool = setupConnectionPool(this, this.poolSize);
}

Connection.prototype.getConnection = function() {
  return getConnection(this);
}

Connection.prototype.close = function(callback) {
  this.connected = false;
  // Close all entries in the pool
  if (!callback) {
    // This seems to block until completion.
    for(var i = 0; i < this.pool.length; i++) {
      this.pool[i].connection.end();
    }
  } else {
    this.once("close", callback);
    this.pool.forEach(function(poolMember, i) {
      var connection = poolMember.connection;
      // Force an async flush.
      connection.write('', function() {
        // Hopefully this doesn't block.
        connection.end();
      });
    });
  }
};

Connection.prototype.send = function(command, rawConnection) { 
  var self = this;
  // If we are executing the commnand on the entire pool
  var connection = null;
  // If we are forcing the use of a connection
  if(rawConnection != null) {
    connection = rawConnection;
  } else {
    connection = getConnection(self).connection;    
  }

  // Check if the connection is closed
  try {
    if (connection.readyState != "open") {
      throw 'notConnected';      
    }

    // Send the command, if it's an array of commands execute them all on the same connection
    if(Array.isArray(command)) {
      for(var i = 0; i < command.length; i++) {
        connection.write(command[i].toBinary());
      }
    } else {
      connection.write(command.toBinary());
    }
  } catch(err) {    
    // Check if the connection is closed
    if(connection.readyState != "open" && self.autoReconnect) {
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
        self.on("resend", function() {
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
                connection.write(command[i].toBinary());
              }
            } else {              
              connection.write(command.toBinary());
            }
          }          
        })
      }
    } else {   
      // Set connected to false
      self.connected = false;
      // Throw error
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
  var connection = this.connection;

  // Check if the connection is closed
  if (connection.readyState != "open") {
    throw new Error( 'Connection closed!' );
  }

  // If connection.write() throws there is
  // no need to reconnect since called by latest master
  // and already went through send() function
  connection.write(command.toBinary(), "binary");
};

// Some basic defaults
Connection.DEFAULT_PORT = 27017;
