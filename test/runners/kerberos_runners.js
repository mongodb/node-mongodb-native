var Runner = require('integra').Runner;

module.exports = function(configurations) {
  //
  //  Single server auth
  //
  //

  // Set the test to run dependent on the platform
  var tests = [
        '/test/tests/kerberos/kdc_tests.js'
    ];

  // If we have win32 change the test
  if(process.platform == 'win32') {
    tests = [
        '/test/tests/kerberos/kdc_win32_tests.js'
    ];
  }

  // Add the remaining test
  tests.push('/test/tests/kerberos/ldap_tests.js');

  // Configure a Run of tests
  var kdc_runner = Runner
    // Add configurations to the test runner
    .configurations(configurations)
    .exeuteSerially(true)
    // First parameter is test suite name
    // Second parameter is the configuration used
    // Third parameter is the list of files to execute
    .add("single_server_auth", tests);
    
  // Export runners
  return {
    runner: kdc_runner
  }    
}
