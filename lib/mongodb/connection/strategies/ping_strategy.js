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
  console.log("===================================================================== checkoutSecondary")
  
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
  console.log("=========================== pingserver")
  var self = this;
  
  // Ping function
  var pingFunction = function() {
    // Stop if we are done
    if(self.start == 'disconnected') return;
    console.log("===================================================== ping")
    var addresses = self.replicaset._state != null && self.replicaset._state.addresses != null ? self.replicaset._state.addresses : null;
    console.log("self.replicaset.isConnected() = " + self.replicaset.isConnected())
    console.dir(addresses)
    // If we have server instances
    if(addresses != null && self.replicaset.isConnected()) {
      console.log("===================================================== ping :: 0")
      // Grab all servers
      var serverKeys = Object.keys(addresses);
      if(serverKeys.length == 0) return;
      console.log("===================================================== ping :: 0:1")
      var numberOfChecks = serverKeys.length;
      console.log("===================================================== ping :: 0:2")
      if(serverKeys.length == 0) return setTimeout(pingFunction, 1000);
      // We need to ping for all servers
      for(var i = 0; i < serverKeys.length; i++) {
        console.log("===================================================== ping :: 1")
        var server = addresses[serverKeys[i]];
        // Let's grab the stat connection
        var connection = server.checkoutStatsConnection();      
        // If we have a connection and a db instance
        if(connection != null && connection.isConnected() && self.replicaset.db != null) {
          // Fire off ping command
          self.replicaset.db.admin().ping({'connection':connection}, function(err, result) {
            if(err != null) {
              // Adjust the number of items
              numberOfChecks = numberOfChecks - 1;
              // Get end time of the command
              var endTime = new Date().getTime();
              // Store the ping time in the server instance state variable
              serverInstance.runtimeStats['pingMs'] = (endTime - startTime);  
              // Finished up
              if(numberOfChecks == 0) {
                setTimeout(pingFunction, 1000);
              }                                          
            }
          });
        } else {
          setTimeout(pingFunction, 1000);          
        }
      }            
    } else {
      setTimeout(pingFunction, 1000);      
    }
  }
  
  // Start up the session
  setTimeout(pingFunction, 1000);
  // Do the callback  
  callback(null);
}
