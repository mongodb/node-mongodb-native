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

// Configurations
var replica_set_config = require('./configurations/replicasets').replica_set_config
  , single_server_config = require('./configurations/single_server').single_server_config
  , sharded_config = require('./configurations/sharded').sharded_config;

// 
//  Configurations
//
var configurations = Configuration  
  // Single server configuration
  .add('single_server', single_server_config)
  // Simple Replicaset Configuration
  .add('replica_set', replica_set_config)
  // Simple Sharded Configuration
  .add('sharded', sharded_config);

//
//  Runners
//

//
//  Single server runner
//
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
      '/new_tests/functional/mongo_reply_parser_tests.js'
      , '/new_tests/functional/connection_pool_tests.js'
      , '/new_tests/functional/gridstore/readstream_tests.js'
      , '/new_tests/functional/gridstore/grid_tests.js'
      , '/new_tests/functional/gridstore/gridstore_direct_streaming_tests.js'
      , '/new_tests/functional/gridstore/gridstore_tests.js'
      , '/new_tests/functional/gridstore/gridstore_stream_tests.js'
      , '/new_tests/functional/gridstore/gridstore_file_tests.js'
      , '/new_tests/functional/util_tests.js'
      , '/new_tests/functional/multiple_db_tests.js'
      , '/new_tests/functional/logging_tests.js'
      , '/new_tests/functional/custom_pk_tests.js'
      , '/new_tests/functional/geo_tests.js'
      , '/new_tests/functional/write_preferences_tests.js'
      , '/new_tests/functional/remove_tests.js'
      , '/new_tests/functional/unicode_tests.js'
      , '/new_tests/functional/raw_tests.js'
      , '/new_tests/functional/mapreduce_tests.js'
      , '/new_tests/functional/cursorstream_tests.js'
      , '/new_tests/functional/index_tests.js'
      , '/new_tests/functional/cursor_tests.js'
      , '/new_tests/functional/find_tests.js'
      , '/new_tests/functional/insert_tests.js'
      , '/new_tests/functional/admin_mode_tests.js'
      , '/new_tests/functional/aggregation_tests.js'
      , '/new_tests/functional/exception_tests.js'
      , '/new_tests/functional/error_tests.js'
      , '/new_tests/functional/command_generation_tests.js'
      , '/new_tests/functional/uri_tests.js'
      , '/new_tests/functional/url_parser_tests.js'
      , '/new_tests/functional/objectid_tests.js'
      , '/new_tests/functional/connection_tests.js'
      , '/new_tests/functional/collection_tests.js'
      , '/new_tests/functional/db_tests.js'
    ]
  );

// functional_tests_runner.run("single_server");

//
//  Replicaset runner
//
//

var buckets = {};
var test_results = [];
var schedulingData = null;

try {
  schedulingData = fs.readFileSync('./stats.tmp', 'utf8');
  schedulingData = JSON.parse(schedulingData);
} catch(err) {}

// Configure a Run of tests
var repl_set_parallel_tests_runner = ParallelRunner
  // Add configurations to the test runner
  .configurations(configurations)
  // The number of parallel contexts we are running with
  .parallelContexts(4)
  // Parallelize at test or file level
  .parallelizeAtLevel(ParallelRunner.TEST)
  // Execute all tests serially in each context
  .exeuteSerially(true)
  // Load runtime information data (used by scheduler)
  // to balance execution as much as possible
  // needs to be array of Json objects with fields {file, test, time}
  .schedulerHints(schedulingData)
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

// After each test is done
repl_set_parallel_tests_runner.on('test_done', function(test_statistics) {
    // Unpack statistics
    var time_spent = test_statistics.end_time.getTime() - test_statistics.start_time.getTime();
    var test = test_statistics.name;
    var file = test_statistics.file_name;
    var config = test_statistics.config_name;

    // Add to bucket
    if(!Array.isArray(buckets[test_statistics.configuration.startPort])) {
      buckets[test_statistics.configuration.startPort] = [];
    }

    // Stat object
    var stat = {
        port: test_statistics.configuration.startPort
      , time: time_spent
      , test: test
      , file: file
      , config: config
    };

    // Save statistics about test to it's bucket
    buckets[test_statistics.configuration.startPort].push(stat);
    // Save to list
    test_results.push(stat);
});

// After test suite is finished
repl_set_parallel_tests_runner.on('end', function() {
  for(var name in buckets) {
    var tests = buckets[name];
    var total_time = 0;

    for(var i = 0; i < tests.length; i++) {
      total_time = total_time + tests[i].time;
    }

    // console.log("===================== " + name + " = " + total_time);
  }

  // Sort in descending order
  test_results = test_results.sort(function(a, b) { return b.time - a.time });
  var json = JSON.stringify(test_results);
  fs.writeFileSync('./stats.tmp', json, 'utf8');
});

// // Parallel runner
// repl_set_parallel_tests_runner.run("replica_set");

//
//  Sharded runner
//
//

// Configure a Run of tests
var sharded_tests_runner = Runner
  // Add configurations to the test runner
  .configurations(configurations)
  .exeuteSerially(true)
  // First parameter is test suite name
  // Second parameter is the configuration used
  // Third parameter is the list of files to execute
  .add("sharded",
    [
        // '/new_tests/sharded/mongoclient_tests.js'
      // , '/new_tests/sharded/operations_tests.js'
      // , '/new_tests/sharded/readpreferences_tests.js'
      // , '/new_tests/sharded/ha_tests.js'
      , '/new_tests/sharded/simple_tests.js'
    ]
  );

sharded_tests_runner.run('sharded');



