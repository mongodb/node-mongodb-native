var MongoDBTopologyFilter = function() {
	var Server = require('../../lib/mongodb').Server
		, ReplSet = require('../../lib/mongodb').ReplSet
		, Mongos = require('../../lib/mongodb').Mongos;

  // Keep the server config
  var serverConfig = null;

  this.beforeStart = function(object, callback) {
    // Get the first configuration
    var configuration = object.configurations[0];
    
    // Get the MongoDB topology
    configuration.newDbInstance({w:1}).open(function(err, db) {
      if(err) throw err;

      // Check the topology
      if(db.serverConfig instanceof Server) {
      	serverConfig = "single";
      } else if(db.serverConfig instanceof ReplSet) {
      	serverConfig = "replicaset";
      } else if(db.serverConfig instanceof Mongos) {
      	serverConfig = "mongos";
      }

      // Close the connection
      db.close();
      callback();
    });
  }

	this.filter = function(test) {
  	if(test.metadata == null) return false;
  	if(test.metadata.requires == null) return false;
  	if(test.metadata.requires.topology == null) return false;

  	// If the topology does not match the required one for 
  	// this test, filter it out
  	if(test.metadata.requires.topology != serverConfig) {
  		return true;
  	}

  	// Execute the test
  	return false;
	}	
}

module.exports = MongoDBTopologyFilter;