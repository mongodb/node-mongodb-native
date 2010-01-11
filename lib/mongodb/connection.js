var tcp = require("tcp");
var sys = require("sys");

Connection = function(host, port, auto_reconnect) {    
  this.host = host;
  this.port = port;
  this.auto_reconnect = auto_reconnect;
  this.parser = new BinaryParser();
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
    var messages = [];
    // sys.puts("================== " + self.bytesRead + "/" + self.sizeOfMessage);
    
    if(self.bytesRead + result.length < self.sizeOfMessage) {      
      // sys.puts("P ============ message (size = " + self.sizeOfMessage + ") (read size = " + result.length + ")");      
      self.bytesRead = self.bytesRead + result.length;
      self.buffer = self.buffer + result;      
    } else if(self.bytesRead != 0 && (self.bytesRead + result.length == self.sizeOfMessage)) {
      // sys.puts("C ============ message (size = " + self.sizeOfMessage + ") (read size = " + result.length + ")");            
      self.bytesRead = 0;
      self.sizeOfMessage = 0;
      self.buffer = self.buffer + result;      
      messages.push(self.buffer);      
      // Clear out buffer
      self.buffer = '';
    } else {
      // Split the message into pieces (if more than one message has been written together on the stream)
      var sizeOfMessage = self.parser.toInt(result.substr(0, 4));
      if(sizeOfMessage < result.length) {
        // We got more than one message we need to split it up into seperate messages
        var index = 0;
        while(index < result.length) {
          sizeOfMessage = self.parser.toInt(result.substr(index, 4));
          var message = (index + sizeOfMessage > result.length) ? result.substr(index, (result.length - index)) : result.substr(index, sizeOfMessage);
          // If the message is smaller than the size of the message we are missing part of the message
          // if(message.length != sizeOfMessage) {
          //   this.buffer = message;
          // } else {
            messages.push(message);   
          // }
          // sys.puts("P ============ message (size = " + sizeOfMessage + ") (read size = " + result.length + ")");
          index = index + sizeOfMessage;
        }   
      } else if(sizeOfMessage > result.length) {   
        // sys.puts("S ============ message (size = " + sizeOfMessage + ") (read size = " + result.length + ")");
        self.bytesRead = result.length;
        self.sizeOfMessage = sizeOfMessage;
        self.buffer = result;
      } else {
        // sys.puts("F ============ message (size = " + sizeOfMessage + ") (read size = " + result.length + ")");
        messages.push(result);
      }
    }
    
    // Emit message received to the listening object
    self.emit("receive", messages);      
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