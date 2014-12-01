"use strict";

var validVersion = require('./shared').validVersion
  , semver = require('semver');

var NodeVersionFilter = function() {
  var version = process.version;
  // Get environmental variables that are known
  var node_version_array = process
      .version
      .replace(/v/g, '')
      .split('.')
      .map(function(x) { return parseInt(x, 10) });

  this.filter = function(test) {
    if(test.metadata == null) return false;
    if(test.metadata.requires == null) return false;
    if(test.metadata.requires.node == null) return false;
    // Return if this is a valid method
    return !semver.satisfies(version, test.metadata.requires.node);
  }
}

module.exports = NodeVersionFilter;
