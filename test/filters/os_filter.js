var OSFilter = function() {
  // Get environmental variables that are known
  var platform = process.platform;

  this.filter = function(test) {
    if(test.metadata == null) return false;
    if(test.metadata.requires == null) return false;
    if(test.metadata.requires.os == null) return false;
    // Get the os
    var os = test.metadata.requires.os;
    // If !platform only allow running if the platform match
    if(os[0] == '!' && os != ("!" + platform)) return false;
    if(os == platform) return true
    return true;
  }
}

module.exports = OSFilter;
