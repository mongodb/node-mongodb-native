module.exports = function() {
  var isWindows = /^win/ig.test(process.platform);

  this.isWindows = function() {
    return isWindows;
  };

  this.filter = function(test) {
    if (test.metadata == null) {
      return false;
    }
    if (test.metadata.requires == null) {
      return false;
    }
    if (test.metadata.requires.os == null) {
      return false;
    }
    // Return if this is a valid method
    return test.metadata.requires.os.windows !== isWindows;
  };
};