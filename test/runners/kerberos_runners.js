var Runner = require('integra').Runner;

module.exports = function(configurations) {
  //
  //  Single server auth
  //
  //

  // Configure a Run of tests
  var kdc_runner = Runner
    // Add configurations to the test runner
    .configurations(configurations)
    .exeuteSerially(true)
    // First parameter is test suite name
    // Second parameter is the configuration used
    // Third parameter is the list of files to execute
    .add("single_server_auth",
      [
          '/test/tests/kerberos/kdc_tests.js'
      ]
    );

  // Export runners
  return {
    runner: kdc_runner
  }    
}
