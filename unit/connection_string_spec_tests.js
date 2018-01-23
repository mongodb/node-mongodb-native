'use strict';

const parseConnectionString = require('../../../lib/uri_parser');
const fs = require('fs');
const f = require('util').format;
const expect = require('chai').expect;

// NOTE: These are cases we could never check for unless we write out own
//       url parser. The node parser simply won't let these through, so we
//       are safe skipping them.
const skipTests = [
  'Invalid port (negative number) with hostname',
  'Invalid port (non-numeric string) with hostname',
  'Missing delimiting slash between hosts and options',

  // These tests are only relevant to the native driver which
  // cares about specific keys, and validating their values
  'Unrecognized option keys are ignored',
  'Unsupported option values are ignored'
];

describe('Connection String (spec)', function() {
  const testFiles = fs
    .readdirSync(f('%s/../spec/connection-string', __dirname))
    .filter(x => x.indexOf('.json') !== -1)
    .map(x => JSON.parse(fs.readFileSync(f('%s/../spec/connection-string/%s', __dirname, x))));

  // Execute the tests
  for (let i = 0; i < testFiles.length; i++) {
    const testFile = testFiles[i];

    // Get each test
    for (let j = 0; j < testFile.tests.length; j++) {
      const test = testFile.tests[j];
      if (skipTests.indexOf(test.description) !== -1) {
        continue;
      }

      it(test.description, {
        metadata: { requires: { topology: 'single' } },
        test: function(done) {
          const valid = test.valid;

          parseConnectionString(test.uri, function(err, result) {
            if (valid === false) {
              expect(err).to.exist;
              expect(result).to.not.exist;
            } else {
              expect(err).to.not.exist;
              expect(result).to.exist;

              // remove data we don't track
              if (test.auth && test.auth.password === '') {
                test.auth.password = null;
              }

              test.hosts = test.hosts.map(host => {
                delete host.type;
                return host;
              });

              expect(result.hosts).to.eql(test.hosts);
              expect(result.auth).to.eql(test.auth);
              expect(result.options).to.eql(test.options);
            }

            done();
          });
        }
      });
    }
  }
});
