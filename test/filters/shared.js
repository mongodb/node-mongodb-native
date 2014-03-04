// Check if we have a valid node.js method
var validVersion = function(compare_version, version) {
  var comparator = version.slice(0, 1)
  var version_array = version
      .slice(1).split(/\./).map(function(x) { return parseInt(x, 10); });

  // Slice the arrays
  var compare_version = compare_version.slice(0, 3);
  var version_array = version_array.slice(0, 3);

  // Comparator
  if(comparator == '>') {
  	if(compare_version[0] > version_array[0]) return false;
  	if(compare_version[0] == version_array[0] 
  		&& compare_version[1] > version_array[1]) return false;
  	if(compare_version[0] == version_array[0]
  		&& compare_version[1] == version_array[1]
  		&& compare_version[2] > version_array[2]) return false;
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
      return false;
  }
  
  // No valid version
  return true;
}

exports.validVersion = validVersion;
