// The ping strategy uses pings each server and records the
// elapsed time for the server so it can pick a server based on lowest
// return time for the db command {ping:true}
var PingStrategy = exports.PingStrategy = function(replicaset) {
  this.replicaset = replicaset;
}

// Starts any needed code
PingStrategy.prototype.start = function(callback) {
  // this.stop(function() {
    // Set status of strategy
    this.state = 'running';
    // Start ping server
    this._pingServer(callback);    
  // })
}

// Stops and kills any processes running
PingStrategy.prototype.stop = function(callback) {  
  // Stop the ping process
  if(this.pingIntervalId != null) clearInterval(this.pingIntervalId);
  // // Remove reference to replicaset
  thsis.replicaset = null;
  // Set status of ping strategy
  this.state = 'stopped';
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
  var replicaset = self.replicaset;
  var addresses = self.replicaset._state.addresses;
  // Start up the ping timer
  self.pingIntervalId = setInterval(function() {
    if(self.state == 'running') {
      // Grab all servers
      var serverKeys = Object.keys(addresses);
      // We need to ping for all servers
      for(var i = 0; i < serverKeys.length; i++) {
        var server = addresses[serverKeys[i]];
        // Let's grab the stat connection
        var connection = server.checkoutStatsConnection();      
        // If we have a connection and a db instance
        if(connection != null && replicaset.db != null) {
          // Ensure correct scoping for the connectionInstance
          new function(replSet, serverInstance, connectionInstance) {
            // Get start time off command
            var startTime = new Date().getTime();
            // We now need to issue a ping command 
            replSet.db.admin().ping(function(err, result) {
              // Only record data if the ping server is still running
              if(self.startTime == 'running') {
                // Get end time of the command
                var endTime = new Date().getTime();
                // Store the ping time in the server instance state variable
                serverInstance.runtimeStats['pingMs'] = (endTime - startTime);                
              }
            })          
          }(replicaset, server, connection);
        }
      }      
    }
  }, 1000);
  // Do the callback  
  callback(null);
}
