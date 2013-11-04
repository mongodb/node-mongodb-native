// Get environmental variables that are known
var node_version_array = process
    .version
    .replace(/v/g, '')
    .split('.')
    .map(function(x) { return parseInt(x, 10) });
var mongodb_version_array = null;

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
  }
  
  // No valid node version
  return false;
}

var Filters = function() {
  var filters = [];

  // Add filter to aggregated grouping
  this.add = function(filter) {
    if(filter.afterConfigurationStart == null) {
      throw new Error("Filter must implement afterConfigurationStart method");
    }

    if(filter.filter == null) {
      throw new Error("Filter must implement filter method");      
    }
    
    filters.push(filter);
  }

  // After configuration has started perform this action
  this.afterConfigurationStart = function(configuration, callback) {    
    var toGo = filters.length;
    var errors = [];

    // Execute all the after configuration start
    for(var i = 0; i < filters.length; i++) {
      if(!filters[i].afterConfigurationStart) {
        throw new Error("Filter " + i + " does not implement afterConfigurationStart");
      }

      // Execute filter
      filters[i].afterConfigurationStart(configuration, function(err, result) {
        toGo = toGo - 1;

        if(err != null) {
          errors.push(err);
        }

        if(toGo == 0) {
          callback(errors.length > 0 ? errors : null);
        }
      });
    }
  }

  // Filter individual tests
  this.filter = function(test) {    
    for(var i = 0; i < filters.length; i++) {
      if(filters[i].filter(test) == false) {
        return false;
      }
    }

    return true;
  }
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
exports.Filters = Filters;
exports.createVersionFilters = createVersionFilters;

