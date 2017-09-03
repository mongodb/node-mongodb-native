var ES6GeneratorsSupportedFilter = function() {
  var serverConfig = null;

  this.beforeStart = function(object, callback) {
    callback();
  };

  this.filter = function(test) {
    if (test.metadata == null) return false;
    if (test.metadata.requires == null) return false;
    if (test.metadata.requires.generators == null) return false;
    if (test.metadata.requires.generators == false) return false;
    var check = true;

    try {
      eval('(function *(){})');
      check = false;
    } catch (err) {}

    // Do not execute the test
    return check;
  };
};

module.exports = ES6GeneratorsSupportedFilter;
