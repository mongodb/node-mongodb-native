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
        , passive_count:0, arbiter_count:1
        , start_port: startPort
        , tags:[{"dc1":"ny"}, {"dc1":"ny"}, {"dc2":"sf"}]
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
    this.killPrimary = function() {
      var args = Array.prototype.slice.call(arguments, 0);
      replicasetManager.killPrimary.apply(replicasetManager, args);
    }

    // Restart killed nodes
    this.restartKilledNodes = function() {
      var args = Array.prototype.slice.call(arguments, 0);
      replicasetManager.restartKilledNodes.apply(replicasetManager, args);
    }

    // Stepdown primary
    this.stepDownPrimary = function() {
      var args = Array.prototype.slice.call(arguments, 0);
      replicasetManager.stepDownPrimary.apply(replicasetManager, args);
    }

    // Get node
    this.getNodeFromPort = function() {
      var args = Array.prototype.slice.call(arguments, 0);
      replicasetManager.getNodeFromPort.apply(replicasetManager, args);
    }

    // kill
    this.kill = function() {
      var args = Array.prototype.slice.call(arguments, 0);
      replicasetManager.kill.apply(replicasetManager, args);
    }

    // kill secondary
    this.killSecondary = function() {
      var args = Array.prototype.slice.call(arguments, 0);
      replicasetManager.killSecondary.apply(replicasetManager, args);
    }

    // primary
    this.primary = function() {
      var args = Array.prototype.slice.call(arguments, 0);
      replicasetManager.primary.apply(replicasetManager, args);
    }

    // secondaries
    this.secondaries = function() {
      var args = Array.prototype.slice.call(arguments, 0);
      replicasetManager.secondaries.apply(replicasetManager, args);
    }

    // arbiters
    this.arbiters = function() {
      var args = Array.prototype.slice.call(arguments, 0);
      replicasetManager.arbiters.apply(replicasetManager, args);
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

    // Returns the package for using Mongo driver classes
    this.getMongoPackage = function() {
      return mongodb;
    }

    // Get the star port
    this.getReplicasetManager = function() {
      return replicasetManager;
    }

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
      // , '/new_tests/repl_set/reconnect_tests.js'
    ]
  );

// Configure a Run of tests
var repl_set_parallel_tests_runner = ParallelRunner
  // Add configurations to the test runner
  .configurations(configurations)
  // .parallelContexts(2)
  .parallelContexts(4)
  .parallelizeAtLevel(ParallelRunner.TEST)
  .exeuteSerially(true)
  // First parameter is test suite name
  // Second parameter is the configuration used
  // Third parameter is the list of files to execute
  .add("replica_set",
    [
        '/new_tests/repl_set/reconnect_tests.js'
      , '/new_tests/repl_set/connecting_tests.js'
      , '/new_tests/repl_set/secondary_queries_tests.js'
      , '/new_tests/repl_set/mongoclient_tests.js'
      , '/new_tests/repl_set/read_preferences_tests.js'
      , '/new_tests/repl_set/read_preferences_spec_tests.js'
      , '/new_tests/repl_set/failover_query_tests.js'
    ]
  );

// // Run the tests against configuration 'single_server'
// functional_tests_runner.run("single_server");
// repl_set_tests_runner.run("replica_set");
repl_set_parallel_tests_runner.run("replica_set");




