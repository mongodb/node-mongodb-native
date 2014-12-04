"use strict";

var f = require('util').format;

var DisabledFilter = function() {
  // Get environmental variables that are known
  var colorStart = '\u001b[35m';
  var colorEnd = '\u001b[39m';

  this.filter = function(test) {
    if(test.metadata == null) return false;
    if(test.metadata.disabled == true) {
      console.log(f("%s%s was disabled%s", colorStart, test.name, colorEnd));
      return true;
    }

    return false;
  }
}

module.exports = DisabledFilter;
