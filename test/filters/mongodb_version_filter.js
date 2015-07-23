"use strict";

var validVersion = require('./shared').validVersion
  , semver = require('semver');

var MongoDBVersionFilter = function(options) {
  options = options || {};
  // Get environmental variables that are known
  var mongodb_version = null;

  this.beforeStart = function(object, callback) {
    if(options.skip) return callback();
    // Get the first configuration
    var configuration = object.configurations[0];
    // Get the MongoDB version
    configuration.newDbInstance({w:1}).open(function(err, db) {
      console.dir(err)
      if(err) throw err;

      db.command({buildInfo:true}, function(err, result) {
        if(err) throw err;
        mongodb_version = result.versionArray.slice(0, 3).join('.');
        db.close();
        callback();
      });
    });
  }

	this.filter = function(test) {
    if(options.skip) return false;    
  	if(test.metadata == null) return false;
  	if(test.metadata.requires == null) return false;
  	if(test.metadata.requires.mongodb == null) return false;
  	// Return if this is a valid method
    return !semver.satisfies(mongodb_version, test.metadata.requires.mongodb);
	}
}

module.exports = MongoDBVersionFilter;
