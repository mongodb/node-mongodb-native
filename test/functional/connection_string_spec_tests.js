'use strict';

var parse = require('../../lib/url_parser');
var fs = require('fs'),
  f = require('util').format;

describe('Connection String', function() {
  var testFiles = fs
    .readdirSync(f('%s/connection-string', __dirname))
    .filter(function(x) {
      return x.indexOf('.json') != -1;
    })
    .map(function(x) {
      return JSON.parse(fs.readFileSync(f('%s/connection-string/%s', __dirname, x)));
    });

  // Execute the tests
  for (var i = 0; i < testFiles.length; i++) {
    var testFile = testFiles[i];

    // Get each test
    for (var j = 0; j < testFile.tests.length; j++) {
      var test = testFile.tests[j];

      it(test.description, {
        metadata: { requires: { topology: 'single' } },
        test: function(done) {
          var valid = test.valid;

          try {
            parse(test.uri);
            if (valid == false) done('should not have been able to parse');
          } catch (err) {
            if (valid == true) done(err);
          }

          done();
        }
      });
    }
  }
});
