var Connection = require('../connection').Connection,
  DbCommand = require('../commands/db_command').DbCommand,
  MongoReply = require('../responses/mongo_reply').MongoReply,
  debug = require('util').debug,
  inspect = require('util').inspect;

var Server = exports.Server = function(host, port, options) {
  this.host = host;
  this.port = port;
  this.options = options == null ? {} : options;
  this.internalConnection;
  this.internalMaster = false;
  this.connected = false;
  // Setters and getters
  this.__defineGetter__("autoReconnect", function() { return this.options['auto_reconnect'] == null ? false : this.options['auto_reconnect']; });
  this.__defineGetter__("connection", function() { return this.internalConnection; });
  this.__defineSetter__("connection", function(connection) { this.internalConnection = connection; });
  this.__defineGetter__("master", function() { return this.internalMaster; });
  this.__defineSetter__("master", function(value) { this.internalMaster = value; });
  this.__defineGetter__("masterConnection", function() { return this.internalConnection; });
};

Server.prototype.close = function(callback) {
  this.connection.close(callback);
};

Server.prototype.connect = function(parent, callback) {
  var server = this;
  this.connection = new Connection(this.host, this.port, this.autoReconnect);
  parent.connections.push(this.connection);

  server.connection.addListener("connect", function() {
    // Create a callback function for a given connection
    var connectCallback = function(err, reply) {   
      if(err != null) {
        return callback(err, null);
      } else if(reply.documents[0].ismaster == 1) {
        server.master = true;
      } else if(reply.documents[0].ismaster == 0) {
        server.master = false;
      }
      
      // Set server as connected
      server.connected = true;
      
      // emit a message saying we got a master and are ready to go and change state to reflect it
      if(parent.state == 'notConnected') {
        parent.state = 'connected';
        // 
        // Call the server version function via admin to adapt to changes from 1.7.6 >
        var admindb = parent.admin()
        admindb.serverInfo(function(err, doc) {
          if(err != null) return callback(err, null);
          // Store the db version
          parent.version = doc.version;
          callback(null, parent);
        });
      } else {
        callback("connection already opened");
      }
    };

    // Create db command and Add the callback to the list of callbacks by the request id (mapping outgoing messages to correct callbacks)
    var db_command = DbCommand.createIsMasterCommand(parent);
    // Add listeners
    parent.addListener(db_command.getRequestId().toString(), connectCallback);
    parent.notReplied[db_command.getRequestId().toString()] = this;	
    
    // Let's send a request to identify the state of the server
    this.send(db_command);
  });

  server.connection.addListener("data", function(message) {
    // Parse the data as a reply object
    var reply = new MongoReply(parent, message);
    // Emit message
    parent.emit(reply.responseTo.toString(), null, reply);
    // Remove the listener
    if(parent.notReplied[reply.responseTo.toString()]) {
      delete parent.notReplied[reply.responseTo.toString()];
      parent.removeListener(reply.responseTo.toString(), parent.listeners(reply.responseTo.toString())[0]);
    }
  });
  
  server.connection.addListener("error", function(err) {
    if(parent.listeners("error") != null && parent.listeners("error").length > 0) parent.emit("error", err);
    parent.state = "notConnected"
    return callback(err, null);
  });
  
  // Emit timeout and close events so the client using db can figure do proper error handling (emit contains the connection that triggered the event)
  server.connection.addListener("timeout", function() { parent.emit("timeout", this); });
  server.connection.addListener("close", function() { parent.emit("close", this); });
  // Open the connection
  server.connection.open();  
}

Server.prototype.close = function() {
  this.connection.close();
}
