// Check if we have a valid node.js method
var validVersion = function(compare_version, version_required) {
  var comparator = version_required.slice(0, 1)
  var version_array = version_required
      .slice(1).split(/\./).map(function(x) { return parseInt(x, 10); });

  // Slice the arrays
  var compare_version = compare_version.slice(0, 3);
  var version_array = version_array.slice(0, 3);
  // Convert to actual number
  var cnumber = compare_version[0] * 100 + compare_version[1] * 10 + compare_version[2];
  var ver = version_array[0] * 100 + version_array[1] * 10 + version_array[2];

  // Comparator
  if(comparator == '>') {
    if(cnumber > ver) return true;
  } else if(comparator == '<') {
    if(cnumber < ver) return true;
  } else if(comparator == '=') {
    if(cnumber == ver) return true;
  }
  
  // No valid version
  return false;
}

exports.validVersion = validVersion;
