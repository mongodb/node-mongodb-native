var tcp = require("tcp");
var sys = require("sys");

Connection = function(host, port, auto_reconnect) {    
  this.host = host;
  this.port = port;
  this.auto_reconnect = auto_reconnect;
  this.drained = true;
  // Reconnect buffer for messages
  this.messages = [];
  // Set up the process
  process.EventEmitter.call(this);
  // Message sender
  var self = this;
  // Status messages
  this.sizeOfMessage = 0;
  this.bytesRead = 0; 
  this.buffer = '';
}

// Set basic prototype
Connection.prototype = new process.EventEmitter();

// Functions for the connection
Connection.prototype.open = function() {
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
        self.emit("receive", [self.buffer]);              
        // Reset the variables
        self.buffer = ''; self.bytesRead = 0; self.sizeOfMessage = 0;
        // If message is longer than the current one, keep parsing
        if(remainingBytes < result.length) {
          self.receiveListener(result.substr(remainingBytes, (result.length - remainingBytes)));
        }
      }
    } else {
      var sizeOfMessage = BinaryParser.toInt(result.substr(0, 4));
      // We got a partial message, store the result and wait for more
      if(sizeOfMessage > result.length) {
        self.buffer = self.buffer + result; self.bytesRead = result.length; self.sizeOfMessage = sizeOfMessage;
      } else if(sizeOfMessage == result.length) {
        self.emit("receive", [result]);              
      } else if(sizeOfMessage < result.length) {
        self.emit("receive", [result.substr(0, sizeOfMessage)]);
        self.receiveListener(result.substr(sizeOfMessage, (result.length - sizeOfMessage)));
      }
    }
  }  
  
  // Add a receieved data connection
  this.connection.addListener("receive", this.receiveListener);  
}

Connection.prototype.close = function() {
  if(this.connection) this.connection.close();
}

Connection.prototype.send = function(command) {
  var self = this;
  
  try {
    // var m = command.toBinary();
    // sys.puts("================================================== message");
    // new BinaryParser().pprint(m);
    // this.connection.send(m, "binary");        
    this.connection.send(command.toBinary(), "binary");        
  } catch(err) {
    // Check if the connection is closed
    if(this.connection.readyState != "open" && this.auto_reconnect) {
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
          this.addListener("receive", self.receiveListener);            
          // assign the new ready connection
          self.connection = this;
          // send all the messages
          while(self.messages.length > 0) {
            this.send(self.messages.shift().toBinary(), "binary");
          }
        });        
      }
   } else {
      throw err;
    }
  }
}