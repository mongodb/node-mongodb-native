'use strict';

var TravisFilter = function(name) {
  // console.dir(process.env)
  name = name || 'TRAVIS_JOB_ID';
  // Get environmental variables that are known
  this.filter = function(test) {
    if (test.metadata == null) return false;
    if (test.metadata.ignore == null) return false;
    if (test.metadata.ignore.travis == null) return false;
    if (process.env[name] != null && test.metadata.ignore.travis == true) return true;
    return false;
  };
};

module.exports = TravisFilter;
