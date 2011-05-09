var Server = require('./server').Server;

/**
* ReplSetServers constructor provides master-slave functionality
*
* @param serverArr{Array of type Server}
* @return constructor of ServerCluster
*
*/
var ReplSetServers = exports.ReplSetServers = function(servers) {
  // Contains the master server entry
  this.master = null;
  this.target = null;

  if(servers.constructor != Array || servers.length == 0) {
    throw Error("The parameter must be an array of servers and contain at least one server");
  } else if(servers.constructor == Array || servers.length > 0) {
    var count = 0;
    servers.forEach(function(server) {
      if(server instanceof Server) count = count + 1;
    });

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
    if(this.target != null && this.target instanceof Server) {
      return this.target.masterConnection;
    } else {
      var finalServer = null;
      this.servers.forEach(function(server) {
        if(server.master == true && ( server.connection.connection.readyState == "open") ) finalServer = server;
      });
      return finalServer != null ? finalServer.masterConnection : finalServer;
    }
  });
};

ReplSetServers.prototype.setTarget = function(target) {
  this.target = target;
};
