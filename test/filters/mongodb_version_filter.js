"use strict";

var validVersion = require('./shared').validVersion
  , semver = require('semver')
  , f = require('util').format;

var MongoDBVersionFilter = function(options) {
  options = options || {};
  // Get environmental variables that are known
  var mongodb_version_array = [];
  var version = null;

  this.beforeStart = function(object, callback) {
    if(options.skip) return callback();
    // Get the first configuration
    var configuration = object.configurations[0];
    // Get the MongoDB version
    configuration.newConnection({w:1}, function(err, topology) {
      if(err) {
        console.log(err.stack);
        callback();
      }

      topology.command(f("%s.$cmd", configuration.db), {buildInfo:true}, function(err, result) {
        if(err) throw err;
        console.log(f('running against mongodb: %s', result.result.version));
        mongodb_version_array = result.result.versionArray;
        version = result.result.version;
        topology.destroy();
        callback();
      });
    });
  }

	this.filter = function(test) {
    if(options.skip) return false;
  	if(test.metadata == null) return false;
  	if(test.metadata.requires == null) return false;
  	if(test.metadata.requires.mongodb == null) return false;
    return !semver.satisfies(version, test.metadata.requires.mongodb);
	}
}

module.exports = MongoDBVersionFilter;
