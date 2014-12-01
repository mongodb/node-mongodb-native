"use strict";

var TravisFilter = function(name) {
  name = name || "ON_TRAVIS";
  // Get environmental variables that are known
  this.filter = function(test) {
    if(test.metadata == null) return false;
    if(test.metadata.ignore == null) return false;
    if(test.metadata.ignore.travis == null) return false;
    if(process.env[name] && test.metadata.ignore.travis == true) return true;
    return false;
  }
}

module.exports = TravisFilter;
