var Server = require('./server').Server;

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
