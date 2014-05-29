var validVersion = require('./shared').validVersion
  , f = require('util').format;

var MongoDBVersionFilter = function() {
  var mongodb_version_array = [];

  this.beforeStart = function(object, callback) {
    // Get the first configuration
    var configuration = object.configurations[0];
    // Get the MongoDB version
    configuration.newConnection({w:1}, function(err, topology) {
      if(err) throw err;

      topology.command(f("%s.$cmd", configuration.db), {buildInfo:true}, function(err, result) {
        if(err) throw err;      
        mongodb_version_array = result.result.versionArray;
        topology.destroy();
        callback();
      });
    });
  }

	this.filter = function(test) {
  	if(test.metadata == null) return false;
  	if(test.metadata.requires == null) return false;
  	if(test.metadata.requires.mongodb == null) return false;
  	// Return if this is a valid method
    return !validVersion(mongodb_version_array, test.metadata.requires.mongodb);
	}
}

module.exports = MongoDBVersionFilter;
