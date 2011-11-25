var Server = require("../server").Server;

// The ping strategy uses pings each server and records the
// elapsed time for the server so it can pick a server based on lowest
// return time for the db command {ping:true}
var PingStrategy = exports.PingStrategy = function(replicaset) {
  this.replicaset = replicaset;
  this.state = 'disconnected';
}

// Starts any needed code
PingStrategy.prototype.start = function(callback) {
  this.state = 'connected';
  // Start ping server
  this._pingServer(callback);    
}

// Stops and kills any processes running
PingStrategy.prototype.stop = function(callback) {  
  // Stop the ping process
  this.state = 'disconnected';
  // Call the callback
  callback(null, null);
}

PingStrategy.prototype.checkoutSecondary = function() {  
  // Get all secondary server keys
  var keys = Object.keys(this.replicaset._state.secondaries);
  // Contains the picked instance
  var minimumPingMs = null;
  var selectedInstance = null;
  // Pick server key by the lowest ping time
  for(var i = 0; i < keys.length; i++) {
    // Fetch a server
    var server = this.replicaset._state.secondaries[keys[i]];
    // If we don't have a ping time use it
    if(server.runtimeStats['pingMs'] == null) {
      // Set to 0 ms for the start
      server.runtimeStats['pingMs'] = 0;
      // Pick server
      selectedInstance = server;
      break;
    } else {
      // If the next server's ping time is less than the current one choose than one
      if(minimumPingMs == null || server.runtimeStats['pingMs'] < minimumPingMs) {
        minimumPingMs = server.runtimeStats['pingMs'];
        selectedInstance = server;
      }
    }
  }

  // Return the selected instance
  return selectedInstance != null ? selectedInstance.checkoutReader() : null;
}

PingStrategy.prototype._pingServer = function(callback) {
  var self = this;
  
  // Ping server function
  var pingFunction = function() {
    if(self.state == 'disconnected') return;
    var addresses = self.replicaset._state != null && self.replicaset._state.addresses != null ? self.replicaset._state.addresses : null;
    // Grab all servers
    var serverKeys = Object.keys(addresses);
    // We got keys
    for(var i = 0; i < serverKeys.length; i++) {
      // We got a server instance
      var server = addresses[serverKeys[i]];
      // Create a new server object, avoid using internal connections as they might
      // be in an illegal state
      new function(serverInstance) {
        var server = new Server(serverInstance.host, serverInstance.port, {poolSize:1, keepAlive: 100, timeout:5000});
        // Connect with it's own server instance
        server.connect(self.replicaset.db, function(err, result) {
          if(err == null) {
            // Get a connection
            var connection = server.checkoutWriter();
            if(connection != null) {
              // Startup time of the command
              var startTime = new Date().getTime();
              // Execute ping on this connection
              self.replicaset.db.executeDbCommand({ping:1}, {connection:connection}, function(err, result) {
                // Get end time of the command
                var endTime = new Date().getTime();                
                // Store the ping time in the server instance state variable, if there is one
                if(serverInstance != null && serverInstance.runtimeStats != null && serverInstance.isConnected()) {
                  serverInstance.runtimeStats['pingMs'] = (endTime - startTime);                    
                }

                // Close server
                server.close();                
              })                
            } else {
              server.close();              
            }
          } else {
            server.close();            
          }
        })          
      }(server);
    }

    // Wait for another 1000 and repeat
    setTimeout(pingFunction, 1000);
  }
  
  // Start pingFunction
  setTimeout(pingFunction, 1000);
  // Do the callback  
  callback(null);
}
