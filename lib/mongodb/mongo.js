var tcp = require("tcp");

Mongo = function(host, port) {
  this.host = host || '127.0.0.1'
  this.port = port || 27017
}

Mongo.prototype = new Object()
Mongo.prototype.connect = function() {
  // Start a connection to mongo
  sys.puts("Connecting to mongo db " + this.host + ":" + this.port)
  // Create a connection object
  this.connection = tcp.createConnection(this.port, this.host)
  // Create an event emitter for the object
  this.events = new process.EventEmitter()
  // Set up the tcp client
  this.connection.setEncoding("binary");
  this.connection.addListener("connect", function() {
    sys.puts("Connected")
  })  
}
Mongo.prototype.disconnect = function() {  
  this.connection.close()
}