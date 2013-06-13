var Runner = require('integra').Runner;

module.exports = function(configurations) {
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
        '/test/tests/functional/mongo_reply_parser_tests.js'
        , '/test/tests/functional/connection_pool_tests.js'
        , '/test/tests/functional/gridstore/readstream_tests.js'
        , '/test/tests/functional/gridstore/grid_tests.js'
        , '/test/tests/functional/gridstore/gridstore_direct_streaming_tests.js'
        , '/test/tests/functional/gridstore/gridstore_tests.js'
        , '/test/tests/functional/gridstore/gridstore_stream_tests.js'
        , '/test/tests/functional/gridstore/gridstore_file_tests.js'
        , '/test/tests/functional/util_tests.js'
        , '/test/tests/functional/multiple_db_tests.js'
        , '/test/tests/functional/logging_tests.js'
        , '/test/tests/functional/custom_pk_tests.js'
        , '/test/tests/functional/geo_tests.js'
        , '/test/tests/functional/write_preferences_tests.js'
        , '/test/tests/functional/remove_tests.js'
        , '/test/tests/functional/unicode_tests.js'
        , '/test/tests/functional/raw_tests.js'
        , '/test/tests/functional/mapreduce_tests.js'
        , '/test/tests/functional/cursorstream_tests.js'
        , '/test/tests/functional/index_tests.js'
        , '/test/tests/functional/cursor_tests.js'
        , '/test/tests/functional/find_tests.js'
        , '/test/tests/functional/insert_tests.js'
        , '/test/tests/functional/admin_mode_tests.js'
        , '/test/tests/functional/aggregation_tests.js'
        , '/test/tests/functional/exception_tests.js'
        , '/test/tests/functional/error_tests.js'
        , '/test/tests/functional/command_generation_tests.js'
        , '/test/tests/functional/uri_tests.js'
        , '/test/tests/functional/url_parser_tests.js'
        , '/test/tests/functional/objectid_tests.js'
        , '/test/tests/functional/connection_tests.js'
        , '/test/tests/functional/collection_tests.js'
        , '/test/tests/functional/db_tests.js'
        , '/test/tests/functional/read_preferences_tests.js'
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
