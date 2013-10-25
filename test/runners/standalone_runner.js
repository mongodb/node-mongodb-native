var Runner = require('integra').Runner;

module.exports = function(configurations) {
  //
  //  Single server runner
  //
  //

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

  // Configure a Run of tests
  var functional_tests_runner = Runner
    // Add configurations to the test runner
    .configurations(configurations)
    
    // Execute serially
    .exeuteSerially(true)
    
    // No hints
    .schedulerHints(null)
    
    // Query configuration for any variables we need to know
    .afterConfigurationStart(function(configuration, callback) {
      configuration.newDbInstance({w:1}).open(function(err, db) {
        db.command({buildInfo:true}, function(err, result) {
          if(err) throw err;
          mongodb_version = result.versionArray;
          db.close();
          callback();
        });
      });
    })

    // We wish to filter out tests based on tags
    .filter(function(test) {
      if(typeof test != 'function') {      
        // If we have a node.js version check
        if(test.requires && test.requires.node) 
          return validVersions(node_version_array, test.requires.node);

        if(test.requires && test.requires.mongodb) {
          return validVersions(mongodb_version, test.requires.mongodb);
        }

        if(test.requires 
          && test.requires.serverType 
          && test.requires.serverType.toLowerCase() != 'server') {
          return false;
        }
      }

      return true
    })

    // The list of files to execute
    .add("functional_tests",
      [
        // '/test/tests/functional/mongo_reply_parser_tests.js'
        // , '/test/tests/functional/connection_pool_tests.js'
        // , '/test/tests/functional/gridstore/readstream_tests.js'
        // , '/test/tests/functional/gridstore/grid_tests.js'
        // , '/test/tests/functional/gridstore/gridstore_direct_streaming_tests.js'
        // , '/test/tests/functional/gridstore/gridstore_tests.js'
        // , '/test/tests/functional/gridstore/gridstore_stream_tests.js'
        // , '/test/tests/functional/gridstore/gridstore_file_tests.js'
        // , '/test/tests/functional/util_tests.js'
        // , '/test/tests/functional/multiple_db_tests.js'
        // , '/test/tests/functional/logging_tests.js'
        // , '/test/tests/functional/custom_pk_tests.js'
        // , '/test/tests/functional/geo_tests.js'
        // , '/test/tests/functional/write_preferences_tests.js'
        // , '/test/tests/functional/remove_tests.js'
        // , '/test/tests/functional/unicode_tests.js'
        // , '/test/tests/functional/raw_tests.js'
        // , '/test/tests/functional/mapreduce_tests.js'
        // , '/test/tests/functional/cursorstream_tests.js'
        // , '/test/tests/functional/index_tests.js'
        // , '/test/tests/functional/cursor_tests.js'
        // , '/test/tests/functional/find_tests.js'
        // , '/test/tests/functional/insert_tests.js'
        // , '/test/tests/functional/admin_mode_tests.js'
        , '/test/tests/functional/aggregation_tests.js'
        // , '/test/tests/functional/exception_tests.js'
        // , '/test/tests/functional/error_tests.js'
        // , '/test/tests/functional/command_generation_tests.js'
        // , '/test/tests/functional/uri_tests.js'
        // , '/test/tests/functional/url_parser_tests.js'
        // , '/test/tests/functional/objectid_tests.js'
        // , '/test/tests/functional/connection_tests.js'
        // , '/test/tests/functional/collection_tests.js'
        // , '/test/tests/functional/db_tests.js'
        // , '/test/tests/functional/read_preferences_tests.js'
        , '/test/tests/functional/fluent_api/aggregation_tests.js'
        // , '/test/tests/functional/maxtimems_tests.js'
        // , '/test/tests/functional/mongo_client_tests.js'
        // , '/test/tests/functional/fluent_api/batch_write_operations_tests.js'
      ]
    );

  //
  //  Single server auth
  //
  //

  // Configure a Run of tests
  var auth_single_server_runner = Runner
    // Add configurations to the test runner
    .configurations(configurations)
    .exeuteSerially(true)
    // First parameter is test suite name
    // Second parameter is the configuration used
    // Third parameter is the list of files to execute
    .add("single_server_auth",
      [
          '/test/tests/authentication/authentication_tests.js'
      ]
    );

  // Export runners
  return {
      runner: functional_tests_runner
    , runner_auth: auth_single_server_runner
  }    
}
