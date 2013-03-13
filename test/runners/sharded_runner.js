var Runner = require('integra').Runner;

module.exports = function(configurations) {
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
          '/test/tests/sharded/mongoclient_tests.js'
        , '/test/tests/sharded/operations_tests.js'
        , '/test/tests/sharded/readpreferences_tests.js'
        , '/test/tests/sharded/ha_tests.js'
        , '/test/tests/sharded/simple_tests.js'
      ]
    );

  //
  //  Sharded server auth
  //
  //

  // Configure a Run of tests
  var auth_sharded_server_runner = Runner
    // Add configurations to the test runner
    .configurations(configurations)
    .exeuteSerially(true)
    // First parameter is test suite name
    // Second parameter is the configuration used
    // Third parameter is the list of files to execute
    .add("sharded_server_auth",
      [
          '/test/tests/authentication/authentication_sharded_tests.js'
      ]
    );

  // Export runners
  return {
      runner: sharded_tests_runner
    , runner_auth: auth_sharded_server_runner
  }    
}