'use strict';

var ES6PromisesSupportedFilter = function() {
  var serverConfig = null;

  this.beforeStart = function(object, callback) {
    callback();
  };

  this.filter = function(test) {
    if (test.metadata == null) return false;
    if (test.metadata.requires == null) return false;
    if (test.metadata.requires.promises == null) return false;
    if (test.metadata.requires.promises == false) return false;
    var check = true;

    try {
      new Promise(function() {});
      check = false;
    } catch (err) {}

    // Do not execute the test
    return check;
  };
};

module.exports = ES6PromisesSupportedFilter;
