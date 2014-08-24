var validVersion = require('./shared').validVersion;

var NodeVersionFilter = function() {
  // Get environmental variables that are known
  var node_version = process.version.replace(/v/g, '');

	this.filter = function(test) {
  	if(test.metadata == null) return false;
  	if(test.metadata.requires == null) return false;
  	if(test.metadata.requires.node == null) return false;
  	// Return if this is a valid method
    return !validVersion(node_version, test.metadata.requires.node);
	}
}

module.exports = NodeVersionFilter;
