var tcp = require("tcp");
var sys = require("sys");

Connection = function(host, port) {    
  this.host = host;
  this.port = port;
  this.parser = new BinaryParser();
  this.drained = true;
  // this.buffer = '';
  // Set up the process
  process.EventEmitter.call(this);
  // Message sender
  var self = this;
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
  
  // Add a receieved data connection
  this.connection.addListener("receive", function(result) {
    var messages = [];
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
        // sys.puts("P ============ message (size = " + sizeOfMessage + ") (read size = " + message.length + ")");
        index = index + sizeOfMessage;
      }      
    } else {
      // sys.puts("F ============ message (size = " + sizeOfMessage + ") (read size = " + result.length + ")");
      messages.push(result);
    }
    
    // Emit message received to the listening object
    self.emit("receive", messages);      
  });  
}

Connection.prototype.close = function() {
  if(this.connection) this.connection.close();
}

Connection.prototype.send = function(command) {
  this.connection.send(command.toBinary(), "binary");    
}