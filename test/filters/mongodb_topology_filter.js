// console.log(argv._);
var argv = require('optimist')
    .usage('Usage: $0 -t [target] -e [environment] -n [name] -f [filename] -r [smoke report file]')
    .demand(['t'])
    .argv;

var MongoDBTopologyFilter = function() {
  // Keep the server config
  var serverConfig = null;

  this.beforeStart = function(object, callback) {
    var Server = require('../..').Server
      , ReplSet = require('../..').ReplSet
      , Mongos = require('../..').Mongos;
    // Get the first configuration
    var configuration = object.configurations[0];
    // Get the MongoDB topology
    configuration.newDbInstance({w:1}).open(function(err, db) {
      if(err) throw err;
      // Use the provided environment for the filtering
      serverConfig = argv.e || 'single';
      // Close the connection
      db.close();
      callback();
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