"use strict";

var MongoDBTopologyFilter = function() {
  var serverConfig = null;

  this.beforeStart = function(object, callback) {
    // Get the first configuration
    var configuration = object.configurations[0];
    
    // Get the MongoDB topology
    configuration.newConnection(function(err, connection) {
      // Run the ismaster command
      connection.command('system.$cmd', {ismaster:true}, function(err, command) {
        if(err) return callback(err, null);
        // Check for topology
        if(Array.isArray(command.result.hosts)) {
          serverConfig = 'replicaset';
        } else if(command.result.msg && command.result.msg == 'isdbgrid') {
          serverConfig = 'mongos';
        } else {
          serverConfig = 'single';
        }

        // Close the connection
        connection.destroy();
        callback();
      });
    });
  }

	this.filter = function(test) {
  	if(test.metadata == null) return false;
  	if(test.metadata.requires == null) return false;
  	if(test.metadata.requires.topology == null) return false;

    // If we have a single topology convert to single item array
    var topologies = null;

    if(typeof test.metadata.requires.topology == 'string') {
      topologies = [test.metadata.requires.topology];
    } else if(Array.isArray(test.metadata.requires.topology)) {
      topologies = test.metadata.requires.topology;
    } else {
      throw new Error("MongoDBTopologyFilter only supports single string topology or an array of string topologies");
    }

    // Check if we have an allowed topology for this test
    for(var i = 0; i < topologies.length; i++) {
      if(topologies[i] == serverConfig) return false;
    }

  	// Do not execute the test
  	return true;
	}	
}

module.exports = MongoDBTopologyFilter;