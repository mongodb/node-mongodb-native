"use strict";

// Check if we have a valid node.js method
var validVersion = function(compare_version, version_required) {
  var comparator = version_required.substr(0, 1)

  // Figure out the comparator
  if(version_required.indexOf('>=') != -1 || version_required.indexOf('<=') != -1) {
    comparator = version_required.substr(0, 2);
    version_required = version_required.substr(2);
  } else if(version_required.indexOf('>') != -1 || version_required.indexOf('<') != -1 || version_required.indexOf('=') != -1) {
    version_required = version_required.substr(1);
  }

  var v1parts = compare_version.split('.');
  var v2parts = version_required.split('.');

  function isValidPart(x) {
    return (/^\d+$/).test(x);
  }

  if(!v1parts.every(isValidPart) || !v2parts.every(isValidPart)) {
    return false;
  }

  // Map all parts to numbers
  v1parts = v1parts.map(Number);
  v2parts = v2parts.map(Number);

  // Comparison function
  var compare = function(v1, v2) {
    for(var i = 0; i < v1.length; ++i) {
      if(v1[i] > v2[i]) return -1;
      if(v1[i] < v2[i]) return 1;
    }
    return 0;    
  }

  // calculate comparison
  var result = compare(v1parts, v2parts)

  // Return if it's valid depending on the passed in comparator
  if((comparator == '=' || comparator == '>=' || comparator == '<=') && result == 0) {
    return true;
  } else if((comparator == '>' || comparator == '>=') && result == -1) {
    return true;
  } else if((comparator == '<' || comparator == '<=') && result == 1) {
    return true;
  }

  return false;
}

exports.validVersion = validVersion;
