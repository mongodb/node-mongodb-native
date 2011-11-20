// The ping strategy uses pings each server and records the
// elapsed time for the server so it can pick a server based on lowest
// return time for the db command {ping:true}
var PingStrategy = exports.PingStrategy = function(replicaset) {
  this.replicaset = replicaset;
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
    console.log("===================================================== ping")
    var addresses = self.replicaset._state != null && self.replicaset._state.addresses != null ? self.replicaset._state.addresses : null;
    // If we have server instances
    if(addresses != null && self.replicaset.isConnected()) {
      // Grab all servers
      var serverKeys = Object.keys(addresses);
      var numberOfChecks = serverKeys.length;
      // We need to ping for all servers
      for(var i = 0; i < serverKeys.length; i++) {
        var server = addresses[serverKeys[i]];
        // Let's grab the stat connection
        var connection = server.checkoutStatsConnection();      
        // If we have a connection and a db instance
        if(connection != null && self.replicaset.db != null) {
          // Ensure correct scoping for the connectionInstance
          new function(replSet, serverInstance, connectionInstance) {
            console.log("===================================================== hitting it")
            
            if(self.state == 'connected') {
              // // Get start time off command
              // var startTime = new Date().getTime();
              // // We now need to issue a ping command 
              // replSet.db.admin().ping(function(err, result) {
              //   // Adjust the number of items
              //   numberOfChecks = numberOfChecks - 1;
              //   // Get end time of the command
              //   var endTime = new Date().getTime();
              //   // Store the ping time in the server instance state variable
              //   serverInstance.runtimeStats['pingMs'] = (endTime - startTime);  
              //   // Restart if we are done

                // Adjust the number of items
                numberOfChecks = numberOfChecks - 1;

                if(numberOfChecks == 0) {
                  setTimeout(pingFunction, 1000);
                }                            
              // });              
            } else {
              setTimeout(pingFunction, 1000);              
            }
          }(self.replicaset, server, connection);
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
