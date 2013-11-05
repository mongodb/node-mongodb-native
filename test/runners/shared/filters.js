var Filters = require('integra').Filters;

// Get environmental variables that are known
var node_version_array = process
    .version
    .replace(/v/g, '')
    .split('.')
    .map(function(x) { return parseInt(x, 10) });

// Check if we have a valid node.js method
var validVersions = function(compare_version, version) {
  var comparator = version.slice(0, 1)
  var version_array = version
      .slice(1).split(/\./).map(function(x) { return parseInt(x, 10); });

  // Comparator
  if(comparator == '>') {
    if(compare_version[0] >= version_array[0]
      && compare_version[1] >= version_array[1]
      && compare_version[2] >= version_array[2])
      return true;
  } else if(comparator == '=') {
    // Deal with X operator
    if(isNaN(version_array[0])) return true;
    
    if(compare_version[0] == version_array[0]
      && isNaN(version_array[1])) return true;
    
    if(compare_version[0] == version_array[0]
      && compare_version[1] == version_array[1]
      && isNaN(version_array[2])) return true;

    // No wildcard operator do a full check
    if(compare_version[0] == version_array[0]
      && compare_version[1] == version_array[1]
      && compare_version[2] == version_array[2])
      return true;
  }
  
  // No valid node version
  return false;
}

var MongoDBVersionFilter = function() {
  var mongodbVersionArray = [];

  this.afterConfigurationStart = function(configuration, callback) {
    configuration.newDbInstance({w:1}).open(function(err, db) {
      db.command({buildInfo:true}, function(err, result) {
        if(err) throw err;
        mongodb_version = result.versionArray;
        db.close();
        callback();
      });
    });
  }

  this.filter = function(test) {
    if(typeof test != 'function') {      
      if(test.requires && test.requires.mongodb) {
        return validVersions(mongodb_version, test.requires.mongodb);
      }

      if(test.requires 
        && test.requires.serverType 
        && test.requires.serverType.toLowerCase() != 'server') {
        return false;
      }
    }

    return true
  }  
}

var NodeVersionFilter = function() {
  var nodeVersionArray = process
      .version
      .replace(/v/g, '')
      .split('.')
      .map(function(x) { return parseInt(x, 10) });

  this.afterConfigurationStart = function(configuration, callback) {
    callback(null, null);
  }

  this.filter = function(test) {    
    if(typeof test != 'function') {      
      if(test.requires && test.requires.node) 
        return validVersions(node_version_array, test.requires.node);

      if(test.requires 
        && test.requires.serverType 
        && test.requires.serverType.toLowerCase() != 'server') {
        return false;
      }
    }

    return true
  }  
}

// Create version filters
var createVersionFilters = function() {
  var versionFilters = new Filters();
  versionFilters.add(new NodeVersionFilter());
  versionFilters.add(new MongoDBVersionFilter());
  return versionFilters;
}

// Exports functions
exports.createVersionFilters = createVersionFilters;

