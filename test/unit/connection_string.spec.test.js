import { expect } from 'chai';

import { parseOptions } from '../../src/connection_string';
import { loadSpecTests } from '../spec';

// NOTE: These are cases we could never check for unless we write our own
//       url parser. The node parser simply won't let these through, so we
//       are safe skipping them.
const skipTests = [
  'Invalid port (negative number) with hostname',
  'Invalid port (non-numeric string) with hostname',
  'Missing delimiting slash between hosts and options',

  // These tests are only relevant to the native driver which
  // cares about specific keys, and validating their values
  'Unrecognized option keys are ignored',
  'Unsupported option values are ignored',

  // We don't actually support `wtimeoutMS` which this test depends upon
  'Deprecated (or unknown) options are ignored if replacement exists'
];

describe('Connection String spec tests', function () {
  const suites = loadSpecTests('connection-string').concat(loadSpecTests('auth'));

  for (const suite of suites) {
    describe(suite.name, function () {
      for (const test of suite.tests) {
        it(`${test.description}`, function () {
          if (skipTests.includes(test.description)) {
            return this.skip();
          }

          const message = `"${test.uri}"`;

          const valid = test.valid;
          if (valid) {
            const options = parseOptions(test.uri);
            expect(options, message).to.be.ok;

            if (test.hosts) {
              for (const [index, { host, port }] of test.hosts.entries()) {
                expect(options.hosts[index], message).to.satisfy(e => {
                  return e.host === host || e.socketPath === host;
                });
                if (typeof port === 'number') expect(options.hosts[index].port).to.equal(port);
              }
            }

            if (test.auth && test.auth.db != null) {
              expect(options.dbName, message).to.equal(test.auth.db);
            }

            if (test.auth && test.auth.username) {
              expect(options.credentials, message).to.exist;

              if (test.auth.db != null) {
                expect(options.credentials.source, message).to.equal(test.auth.db);
              }

              if (test.auth.username != null) {
                expect(options.credentials.username, message).to.equal(test.auth.username);
              }

              if (test.auth.password != null) {
                expect(options.credentials.password, message).to.equal(test.auth.password);
              }
            }

            if (test.options) {
              for (const [optionKey, optionValue] of Object.entries(test.options)) {
                switch (optionKey) {
                  case 'authmechanism':
                    expect(options.credentials.mechanism, message).to.eq(optionValue);
                    break;
                  case 'authmechanismproperties':
                    expect(options.credentials.mechanismProperties, message).to.deep.eq(
                      optionValue
                    );
                    break;
                  case 'replicaset':
                    expect(options.replicaSet, message).to.equal(optionValue);
                    break;
                  case 'w':
                    expect(options.writeConcern.w).to.equal(optionValue);
                    break;
                  default:
                    throw Error(`This options is not covered by the spec test: ${optionKey}`);
                }
              }
            }
          } else {
            expect(() => parseOptions(test.uri), message).to.throw();
          }
        });
      }
    });
  }
});
