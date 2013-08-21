var fs = require('fs')
  , Runner = require('integra').Runner;

module.exports = function(configurations) {
  //
  //  Replicaset runner
  //
  //
  var buckets = {};
  var test_results = [];
  var schedulingData = null;

  // Get environmental variables that are known
  var node_version_array = process
      .version
      .replace(/v/g, '')
      .split('.')
      .map(function(x) { return parseInt(x, 10) });
  var mongodb_version_array = null;

  // Check if we have a valid node.js method
  var validVersions = function(compare_version, version) {
    var comparator = version.slice(0, 1)
    var version_array = version
        .slice(1).split(/\./).map(function(x) { return parseInt(x, 10); });

    // Comparator
    if(comparator == '>') {
      if(compare_version[0] >= version_array[0]
        && compare_version[1] >= version_array[1]
        && compare_version[2] >= version_array[2])
        return true;
    }
    
    // No valid node version
    return false;
  }

  try {
    schedulingData = fs.readFileSync('./stats.tmp', 'utf8');
    schedulingData = JSON.parse(schedulingData);
  } catch(err) {}

  // Configure a Run of tests
  var repl_set_parallel_tests_runner = Runner
    // Add configurations to the test runner
    .configurations(configurations)

    // The number of parallel contexts we are running with
    .parallelContexts(4)

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
          '/test/tests/repl_set/reconnect_tests.js'
        , '/test/tests/repl_set/connecting_tests.js'
        , '/test/tests/repl_set/secondary_queries_tests.js'
        , '/test/tests/repl_set/mongoclient_tests.js'
        , '/test/tests/repl_set/read_preferences_tests.js'
        , '/test/tests/repl_set/read_preferences_spec_tests.js'
        , '/test/tests/repl_set/failover_query_tests.js'
        , '/test/tests/repl_set/replicaset_examples_tests.js'
        , '/test/tests/repl_set/recovering_server_tests.js'
      ]
    );

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
    }

    // Sort in descending order
    test_results = test_results.sort(function(a, b) { return b.time - a.time });
    var json = JSON.stringify(test_results);
    fs.writeFileSync('./stats.tmp', json, 'utf8');
  });

  //
  //  Replicaset server auth
  //
  //

  // Configure a Run of tests
  var auth_replset_server_runner = Runner
    // Add configurations to the test runner
    .configurations(configurations)
    .exeuteSerially(true)
    // First parameter is test suite name
    // Second parameter is the configuration used
    // Third parameter is the list of files to execute
    .add("replset_server_auth",
      [
          '/test/tests/authentication/authentication_replicaset_tests.js'
      ]
    );

  // Export runners
  return {
      runner: repl_set_parallel_tests_runner
    , runner_auth: auth_replset_server_runner
  }
}