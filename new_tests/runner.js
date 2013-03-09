var Configuration = require('integra').Configuration
  , Runner = require('integra').Runner
  , ParallelRunner = require('integra').ParallelRunner
  , mongodb = require('../')
  , fs = require('fs')
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
      serverManager.killAll(function(err) {
        callback();
      });
    };

    // Pr test functions
    this.setup = function(callback) { callback(); }
    this.teardown = function(callback) { callback(); };

    // Returns the package for using Mongo driver classes
    this.getMongoPackage = function() {
      return mongodb;
    }

    this.newDbInstance = function(db_options, server_options) {
      return new Db('integration_tests', new Server("127.0.0.1", 27017,
        server_options), db_options);      
    }

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
    // Save the startPort
    this.startPort = startPort;
    // Set up replicaset manager
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

    var mapFunction = function(replicasetManager, name) {
      return function() {
        var args = Array.prototype.slice.call(arguments, 0);
        replicasetManager[name].apply(replicasetManager, args);        
      }
    }

    this.killPrimary = mapFunction(replicasetManager, 'killPrimary');
    this.restartKilledNodes = mapFunction(replicasetManager, 'restartKilledNodes');
    this.stepDownPrimary = mapFunction(replicasetManager, 'stepDownPrimary');
    this.getNodeFromPort = mapFunction(replicasetManager, 'getNodeFromPort');
    this.kill = mapFunction(replicasetManager, 'kill');
    this.killSecondary = mapFunction(replicasetManager, 'killSecondary');
    this.primary = mapFunction(replicasetManager, 'primary');
    this.secondaries = mapFunction(replicasetManager, 'secondaries');
    this.arbiters = mapFunction(replicasetManager, 'arbiters');

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
  .exeuteSerially(true)
  // First parameter is test suite name
  // Second parameter is the configuration used
  // Third parameter is the list of files to execute
  .add("functional_tests",
    [
        '/new_tests/functional/insert_tests.js'
      , '/new_tests/functional/admin_mode_tests.js'
      , '/new_tests/functional/aggregation_tests.js'
      , '/new_tests/functional/exception_tests.js'
      , '/new_tests/functional/error_tests.js'
      , '/new_tests/functional/command_generation_tests.js'
      , '/new_tests/functional/uri_tests.js'
      , '/new_tests/functional/url_parser_tests.js'
      , '/new_tests/functional/objectid_tests.js'
    ]
  );

functional_tests_runner.run("single_server");

// // Configure a Run of tests
// var repl_set_tests_runner = Runner
//   // Add configurations to the test runner
//   .configurations(configurations)
//   .exeuteSerially(true)
//   // First parameter is test suite name
//   // Second parameter is the configuration used
//   // Third parameter is the list of files to execute
//   .add("replica_set",
//     [
//         '/new_tests/repl_set/reconnect_tests.js'
//       , '/new_tests/repl_set/connecting_tests.js'
//       , '/new_tests/repl_set/secondary_queries_tests.js'
//       , '/new_tests/repl_set/mongoclient_tests.js'
//       , '/new_tests/repl_set/read_preferences_tests.js'
//       , '/new_tests/repl_set/read_preferences_spec_tests.js'
//       , '/new_tests/repl_set/failover_query_tests.js'
//     ]
//   );

// var buckets = {};
// var test_results = [];
// var schedulingData = null;

// try {
//   schedulingData = fs.readFileSync('./stats.tmp', 'utf8');
//   schedulingData = JSON.parse(schedulingData);
// } catch(err) {}

// // Configure a Run of tests
// var repl_set_parallel_tests_runner = ParallelRunner
//   // Add configurations to the test runner
//   .configurations(configurations)
//   // The number of parallel contexts we are running with
//   .parallelContexts(4)
//   // Parallelize at test or file level
//   .parallelizeAtLevel(ParallelRunner.TEST)
//   // Execute all tests serially in each context
//   .exeuteSerially(true)
//   // Load runtime information data (used by scheduler)
//   // to balance execution as much as possible
//   // needs to be array of Json objects with fields {file, test, time}
//   .schedulerHints(schedulingData)
//   // First parameter is test suite name
//   // Second parameter is the configuration used
//   // Third parameter is the list of files to execute
//   .add("replica_set",
//     [
//         '/new_tests/repl_set/reconnect_tests.js'
//       , '/new_tests/repl_set/connecting_tests.js'
//       , '/new_tests/repl_set/secondary_queries_tests.js'
//       , '/new_tests/repl_set/mongoclient_tests.js'
//       , '/new_tests/repl_set/read_preferences_tests.js'
//       , '/new_tests/repl_set/read_preferences_spec_tests.js'
//       , '/new_tests/repl_set/failover_query_tests.js'
//     ]
//   );

// // // Run the tests against configuration 'single_server'
// // functional_tests_runner.run("single_server");
// // repl_set_tests_runner.run("replica_set");

// // After each test is done
// repl_set_parallel_tests_runner.on('test_done', function(test_statistics) {
//     // Unpack statistics
//     var time_spent = test_statistics.end_time.getTime() - test_statistics.start_time.getTime();
//     var test = test_statistics.name;
//     var file = test_statistics.file_name;
//     var config = test_statistics.config_name;

//     // Add to bucket
//     if(!Array.isArray(buckets[test_statistics.configuration.startPort])) {
//       buckets[test_statistics.configuration.startPort] = [];
//     }

//     // Stat object
//     var stat = {
//         port: test_statistics.configuration.startPort
//       , time: time_spent
//       , test: test
//       , file: file
//       , config: config
//     };

//     // Save statistics about test to it's bucket
//     buckets[test_statistics.configuration.startPort].push(stat);
//     // Save to list
//     test_results.push(stat);
// });

// // After test suite is finished
// repl_set_parallel_tests_runner.on('end', function() {
//   for(var name in buckets) {
//     var tests = buckets[name];
//     var total_time = 0;

//     for(var i = 0; i < tests.length; i++) {
//       total_time = total_time + tests[i].time;
//     }

//     // console.log("===================== " + name + " = " + total_time);
//   }

//   // Sort in descending order
//   test_results = test_results.sort(function(a, b) { return b.time - a.time });
//   var json = JSON.stringify(test_results);
//   fs.writeFileSync('./stats.tmp', json, 'utf8');
// });

// // Parallel runner
// repl_set_parallel_tests_runner.run("replica_set");




