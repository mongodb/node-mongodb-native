var Configuration = require('../lib/configuration').Configuration,
  Runner = require('../lib/runner').Runner,
  mongodb = require('../../../'),
  ServerManager = require('../../../test/tools/server_manager').ServerManager;

// Server manager
var serverManager = new ServerManager();

// Set up a set of configurations we are going to use
var configurations = Configuration
  .add("single_server", function() {
    //
    // Basic functions
    //
    this.start = function(callback) {
      serverManager.start(true, {purgedirectories:true}, function(err) {
        if(err) throw err;
        callback();
      });
    }

    this.setup = function(callback) {
      callback();
    }

    this.teardown = function(callback) {
      callback();      
    };

    this.stop = function(callback) {
      serverManager.stop(9, function(err) {
        callback();
      });
    };

    //
    // Custom functions tests can use to manage a test suite
    //
    this.killServer = function(callback) {
      callback();      
    }

    this.restartServer = function(callback) {
      callback();
    }

    // Used in tests
    this.integration_db = "integration_tests";
  });

// Configure a Run of tests
var runner = Runner
  // Add configurations to the test runner
  .configurations(configurations)
  // First parameter is test suite name
  // Second parameter is the configuration used
  // Third parameter is the list of files to execute
  .add("no_restart_needed", "single_server", ['/test/mongodb/simple_single_server_test'])
  // Runs all the suites
  .run();