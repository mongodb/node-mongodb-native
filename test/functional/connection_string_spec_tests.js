'use strict';

var fs = require('fs'),
  f = require('util').format;

/**
 * @ignore
 */
exports['Should run all connection string tests'] = {
  metadata: { requires: { topology: 'single' } },

  // The actual test we wish to run
  test: function(configuration, assert) {
    var testFiles = fs
      .readdirSync(f('%s/connection-string', __dirname))
      .filter(function(x) {
        return x.indexOf('.json') != -1;
      })
      .map(function(x) {
        return JSON.parse(fs.readFileSync(f('%s/connection-string/%s', __dirname, x)));
      });

    var parser = require('../../lib/url_parser');

    // Execute the tests
    for (var i = 0; i < testFiles.length; i++) {
      var testFile = testFiles[i];

      // Get each test
      for (var j = 0; j < testFile.tests.length; j++) {
        var test = testFile.tests[j];
        console.log(f('  %s', test.description));
        // console.dir(test)

        // Unpack the test
        var auth = test.auth;
        var description = test.description;
        var hosts = test.hosts;
        var options = test.options;
        var uri = test.uri;
        var valid = test.valid;
        var warning = test.warning;

        // Test state
        var success = true;

        // Parse the test
        try {
          var result = parser(test.uri);
          if (valid == false) success = false;
        } catch (err) {
          // console.log(err.stack)
          if (valid == true) success = false;
        }

        // If we were unsuccessful
        if (!success) {
          throw test;
        }
      }
    }

    assert.done();
  }
};
