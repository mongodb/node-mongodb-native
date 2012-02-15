// The Statistics strategy uses the measure of each end-start time for each 
// query executed against the db to calculate the mean, variance and standard deviation
// and pick the server which the lowest mean and deviation
var StatisticsStrategy = exports.StatisticsStrategy = function(replicaset) {
  this.replicaset = replicaset;
}

// Starts any needed code
StatisticsStrategy.prototype.start = function(callback) {  
  callback(null, null);
}

StatisticsStrategy.prototype.stop = function(callback) {  
  // Remove reference to replicaset
  this.replicaset = null;
  // Perform callback
  callback(null, null);
}

StatisticsStrategy.prototype.checkoutSecondary = function() {  
  // Get all secondary server keys
  var keys = Object.keys(this.replicaset._state.secondaries);
  // Contains the picked instance
  var minimumSscore = null;
  var selectedInstance = null;

  // Pick server key by the lowest ping time
  for(var i = 0; i < keys.length; i++) {
    // Fetch a server
    var server = this.replicaset._state.secondaries[keys[i]];
    // Pick server by lowest Sscore
    if(minimumSscore == null || (server.queryStats.sScore < minimumSscore)) {
      minimumSscore = server.queryStats.sScore;
      selectedInstance = server;      
    }
  }

  // Return the selected instance
  return selectedInstance != null ? selectedInstance.checkoutReader() : null;
}
