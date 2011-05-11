var Connection = require('../connection').Connection,
  DbCommand = require('../commands/db_command').DbCommand,
  MongoReply = require('../responses/mongo_reply').MongoReply,
  Server = require('./server').Server,
  debug = require('util').debug,
  inspect = require('util').inspect;

// Server pair object used to support a failover connection set
var ServerPair = exports.ServerPair = function(leftServer, rightServer) {
  if(leftServer == null || rightServer == null || !(leftServer instanceof Server) || !(rightServer instanceof Server)) {
    throw Error("Both left/right must be defined and off the type Server");
  }
  this.leftServer = leftServer;
  this.rightServer = rightServer;
  // Containst the master server entry
  this.master = null;
  this.target = null;
  // Setters and getters
  this.__defineGetter__("autoReconnect", function() {
    if(this.target != null) return this.target.autoReconnect;
    if(this.masterConnection != null) return this.masterConnection.autoReconnect;
  });
  this.__defineGetter__("masterConnection", function() {
    if(this.target != null && this.target instanceof Server) return this.target.masterConnection;
    if(this.leftServer.master) return this.leftServer.masterConnection;
    if(this.rightServer.master) return this.rightServer.masterConnection;
    return null;
  });
};

ServerPair.prototype.setTarget = function(target) {
  this.target = target;
  this.servers = [];
};

ServerPair.MASTER = 0;
ServerPair.SHADOW_MASTER = 1;

ServerPair.prototype.connect = function(parent, callback) {
  var serverConnections = [this.leftServer, this.rightServer];
  var numberOfCheckedServers = 0; 
  
  serverConnections.forEach(function(server) {
    server.connection = new Connection(server.host, server.port, server.autoReconnect);
    parent.connections.push(server.connection);
    
    var handleServerConnection = function(srv, connected) {
      numberOfCheckedServers+=1;
      // Set connected status
      server.connected = connected;
      
      if(numberOfCheckedServers == serverConnections.length) {
          if(parent.masterConnection) {
              // emit a message saying we got a master and are ready to go and change state to reflect it
              parent.state = 'connected';
              callback(null, parent);
          } else {
              // emit error only when all servers are checked and connecting to them failed.
              parent.state = "notConnected"
              callback(new Error("Failed connecting to any of the servers in the cluster"), null);
          }
      }
    }
  
    server.connection.addListener("connect", function() {
      // Create a callback function for a given connection    
      var connectCallback = function(err, reply) {
        if(err != null) {
          callback(err, null);          
        } else {
          if(reply.documents[0].ismaster == 1) {
            // Locate the master connection and save it      
            parent.masterConnection = server.connection;
            server.master = true;
          } else {
            server.master = false;
          }
          
          handleServerConnection(server, true);
        }
      };
      // Create db command and Add the callback to the list of callbacks by the request id (mapping outgoing messages to correct callbacks)
      var db_command = DbCommand.createIsMasterCommand(parent);
      // Add listener
      parent.addListener(db_command.getRequestId().toString(), connectCallback);
      // Let's send a request to identify the state of the server
      this.send(db_command);
    });
      
    server.connection.addListener("data", function(message) {
      // Parse the data as a reply object
      var reply = new MongoReply(parent, message);
      // Emit error if there is one       
      reply.responseHasError ? parent.emit(reply.responseTo.toString(), reply.documents[0], reply) : parent.emit(reply.responseTo.toString(), null, reply);
      // Remove the listener
      parent.removeListener(reply.responseTo.toString(), parent.listeners(reply.responseTo.toString())[0]);
      
    });
    
    server.connection.addListener("error", function(err) {
      handleServerConnection(server, false);
    });
  
    // Emit timeout and close events so the client using db can figure do proper error handling (emit contains the connection that triggered the event)
    server.connection.addListener("timeout", function() { parent.emit("timeout", this); });
    server.connection.addListener("close", function() { parent.emit("close", this); });
    // Open the connection
    server.connection.open();
  });  
}

ServerPair.prototype.close = function() {
  this.leftServer.close();
  this.rightServer.close();
}
