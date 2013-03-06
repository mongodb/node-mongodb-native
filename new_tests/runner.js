var Configuration = require('integra').Configuration
  , Runner = require('integra').Runner
  , ParallelRunner = require('integra').ParallelRunner
  , mongodb = require('../')
  , Db = mongodb.Db
  , Server = mongodb.Server
  , ReplSet = mongodb.ReplSet
  , ServerManager = require('../test/tools/server_manager').ServerManager
  , ReplicaSetManager = require('../test/tools/replica_set_manager').ReplicaSetManager;

// Server manager
var startPort = 30000;

// 
//  Configurations
//
var configurations = Configuration
  
  // Single server configuration
  .add('single_server', function() {
    var serverManager = new ServerManager();
    var db = new Db('integration_tests', new Server("127.0.0.1", 27017,
     {auto_reconnect: false, poolSize: 4}), {w:0, native_parser: false});

    // Test suite start
    this.start = function(callback) {
      serverManager.start(true, {purgedirectories:true}, function(err) {
        if(err) throw err;

        db.open(function(err, result) {
          if(err) throw err;
          callback();
        })
      });
    }

    // Test suite stop
    this.stop = function(callback) {
      serverManager.stop(9, function(err) {
        callback();
      });
    };

    // Pr test functions
    this.setup = function(callback) { callback(); }
    this.teardown = function(callback) { callback(); };

    // Returns a db
    this.db = function() {
      return db;
    }

    // Used in tests
    this.db_name = "integration_tests";
  })

  // Simple Replicaset Configuration
  .add('replica_set', function() {
    var self = this;
    var replicasetManager = new ReplicaSetManager(
      { 
          retries:120, secondary_count:2
        , passive_count:0, arbiter_count:0
        , start_port: startPort
      }
    );

    // Adjust startPort
    startPort = startPort + 10;

    // Test suite start
    this.start = function(callback) {
      replicasetManager.startSet(true, function(err, result) {
        if(err) throw err;

        // Set up the replicaset
        var replSet = new ReplSet( [
                new Server( replicasetManager.host, replicasetManager.ports[1]),
                new Server( replicasetManager.host, replicasetManager.ports[0]),
                new Server( replicasetManager.host, replicasetManager.ports[2])
              ],
              {rs_name:replicasetManager.name}
            );

        self._db = new Db('integration_tests', replSet, {w:0, native_parser: false});
        self._db.open(function(err, result) {
          if(err) throw err;
          callback();
        })
      });
    }

    // Test suite stop
    this.stop = function(callback) {
      replicasetManager.killAll(function(err) {
        callback();
      });
    };

    // Allow us to kill the primary
    this.killPrimary = function(callback) {
      replicasetManager.killPrimary(function() {
        callback();
      })
    }

    // Pr test functions
    this.setup = function(callback) { 
      callback(); 
    }
    
    this.teardown = function(callback) { 
      replicasetManager.restartKilledNodes(function() {
        callback();
      });
    };

    // Returns a db
    this.db = function() {
      return self._db;
    }

    // Used in tests
    this.db_name = "integration_tests";
  })

//
//  Runners
//
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

// Configure a Run of tests
var repl_set_tests_runner = Runner
  // Add configurations to the test runner
  .configurations(configurations)
  .exeuteSerially(true)
  // First parameter is test suite name
  // Second parameter is the configuration used
  // Third parameter is the list of files to execute
  .add("replica_set",
    [
        '/new_tests/repl_set/reconnect_tests.js'
      , '/new_tests/repl_set/reconnect_tests.js'
    ]
  );

// Configure a Run of tests
var repl_set_parallel_tests_runner = ParallelRunner
  // Add configurations to the test runner
  .configurations(configurations)
  .parallelContexts(2)
  .exeuteSerially(true)
  // First parameter is test suite name
  // Second parameter is the configuration used
  // Third parameter is the list of files to execute
  .add("replica_set",
    [
        '/new_tests/repl_set/reconnect_tests.js'
      , '/new_tests/repl_set/reconnect_tests.js'
    ]
  );

// // Run the tests against configuration 'single_server'
// functional_tests_runner.run("single_server");
// repl_set_tests_runner.run("replica_set");
repl_set_parallel_tests_runner.run("replica_set");




