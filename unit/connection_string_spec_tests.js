'use strict';

const parseConnectionString = require('../../../lib/uri_parser');
const fs = require('fs');
const f = require('util').format;
const punycode = require('punycode');
const MongoParseError = require('../../../lib/error').MongoParseError;
const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-subset'));

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
  it('should provide a default port if one is not provided', function(done) {
    parseConnectionString('mongodb://hostname', function(err, result) {
      expect(err).to.not.exist;
      expect(result.hosts[0].port).to.equal(27017);
      done();
    });
  });

  it('should correctly parse arrays', function(done) {
    parseConnectionString('mongodb://hostname?foo=bar&foo=baz', function(err, result) {
      expect(err).to.not.exist;
      expect(result.options.foo).to.deep.equal(['bar', 'baz']);
      done();
    });
  });

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
              expect(err).to.be.instanceOf(MongoParseError);
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
                host.host = punycode.toASCII(host.host);
                return host;
              });

              // remove values that require no validation
              test.hosts.forEach(host => {
                Object.keys(host).forEach(key => {
                  if (host[key] == null) delete host[key];
                });
              });

              expect(result.hosts).to.containSubset(test.hosts);
              if (test.auth) {
                if (test.auth.db !== null) {
                  expect(result.auth).to.eql(test.auth);
                } else {
                  expect(result.auth.username).to.eql(test.auth.username);
                  expect(result.auth.password).to.eql(test.auth.password);
                }
              }
              expect(result.options).to.eql(test.options);
            }

            done();
          });
        }
      });
    }
  }
});
