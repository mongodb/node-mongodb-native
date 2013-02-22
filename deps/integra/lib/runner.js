var Runner = function() {  
  this.configuration = null;
  this.tests = {};
}

Runner.configurations = function(configuration) {  
  var runner = new Runner();
  runner.configuration = configuration;
  return runner;
}

Runner.prototype.add = function(suite_name, configuration_name, test_files) {
  this.tests[suite_name] = new TestSuite(this.configuration, suite_name, configuration_name, test_files);
  return this;
}

Runner.prototype.run = function() {  
  var keys = Object.keys(this.tests);
  var number_of_tests = keys.length;

  // Execute all the test suites
  for(var i = 0; i < keys.length; i++) {
    var test_suite = this.tests[keys[i]];
    // Execute the test suite
    test_suite.execute(function(err, results) {
      number_of_tests = number_of_tests - 1;

      // Finished test running
      if(number_of_tests == 0) {
        // console.log("================ done")
      }
    });
  }
}

//
// Wraps a test suite
//
var TestSuite = function(configuration, name, config_name, files) {
  this.configuration = configuration;
  this.name = name;
  this.config_name = config_name;
  this.files = files;  
}

TestSuite.prototype.execute = function(callback) {
  var self = this;
  var number_of_files = this.files.length;

  // First run the the start part of the configuration
  var configuration = this.configuration.get(this.config_name);

  // Configuration start
  configuration.start(function() {
    // Load all the files
    for(var i = 0; i < self.files.length; i++) {
      runFile(self, self.files[i], function() {
        number_of_files = number_of_files - 1;

        if(number_of_files == 0) {
          callback(null, []);
        }
      });
    }
  });
}

var runFile = function(test_suite, file_name, callback) {
  var test = require(process.cwd() + file_name);
  // Get the total number of tests
  var number_of_tests = Object.keys(test).length;

  // Test control
  var test_control = new TestControl();
  test_control.done = function() {
    process.nextTick(function() {
      number_of_tests = number_of_tests - 1;
      if(number_of_tests == 0) {
        callback(null, null);
      }      
    })
  }

  // Iterate over all the functions
  for(var name in test) {    
    test[name].apply(test, [test_suite.configuration.get(test_suite.config_name), test_control]);
  }  
}

var TestControl = function() {  
}

TestControl.prototype.ok = function(value, description) {
  if(!value) throw new Error("description");
}

exports.Runner = Runner;











