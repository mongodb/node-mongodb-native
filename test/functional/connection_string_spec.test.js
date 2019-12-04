'use strict';

const parse = require('../../lib/url_parser'),
  fs = require('fs'),
  f = require('util').format,
  expect = require('chai').expect;

describe('Connection String (spec)', function() {
  const testFiles = fs
    .readdirSync(f('%s/spec/connection-string', __dirname))
    .filter(function(x) {
      return x.indexOf('.json') !== -1;
    })
    .map(function(x) {
      return JSON.parse(fs.readFileSync(f('%s/spec/connection-string/%s', __dirname, x)));
    });

  // Execute the tests
  for (let i = 0; i < testFiles.length; i++) {
    const testFile = testFiles[i];

    // Get each test
    for (let j = 0; j < testFile.tests.length; j++) {
      const test = testFile.tests[j];

      it(test.description, {
        metadata: { requires: { topology: 'single' } },
        test: function(done) {
          const valid = test.valid;

          parse(test.uri, {}, function(err, result) {
            if (valid === false) {
              expect(err).to.exist;
              expect(result).to.not.exist;
            } else {
              expect(err).to.not.exist;
              expect(result).to.exist;
            }

            done();
          });
        }
      });
    }
  }
});
