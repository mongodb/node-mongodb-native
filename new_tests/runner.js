var Configuration = require('integra').Configuration
  , Runner = require('integra').Runner
  , mongodb = require('../')
  , Db = mongodb.Db
  , Server = mongodb.Server
  , ServerManager = require('../test/tools/server_manager').ServerManager;

// Server manager
var serverManager = new ServerManager();

// Create Simple Server configuration
var configurations = Configuration
  .add('single_server', function() {
    var db = new Db('integration_tests', new Server("127.0.0.1", 27017,
     {auto_reconnect: false, poolSize: 4}), {w:0, native_parser: false});

    //
    // Basic functions
    //
    this.start = function(callback) {
      serverManager.start(true, {purgedirectories:true}, function(err) {
        if(err) throw err;

        db.open(function(err, result) {
          if(err) throw err;
          callback();
        })
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
    this.db_name = "integration_tests";
    this.db = db;
  })

// Configure a Run of tests
var functional_tests_runner = Runner
  // Add configurations to the test runner
  .configurations(configurations)
  // First parameter is test suite name
  // Second parameter is the configuration used
  // Third parameter is the list of files to execute
  .add("functional_tests",
    ['/new_tests/functional/insert_tests.js']
  );

// Run the tests against configuration 'single_server'
functional_tests_runner.run("single_server");




