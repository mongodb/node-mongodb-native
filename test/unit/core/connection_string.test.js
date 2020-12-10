'use strict';

const { parseConnectionString } = require('../../../src/connection_string');
const punycode = require('punycode');
const { MongoParseError } = require('../../../src/error');
const { loadSpecTests } = require('../../spec');
const chai = require('chai');
const { parseOptions } = require('../../../src/connection_string');
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
  'Unsupported option values are ignored',

  // We don't actually support `wtimeoutMS` which this test depends upon
  'Deprecated (or unknown) options are ignored if replacement exists',

  // We already handle this case in different ways
  'may support deprecated gssapiServiceName option (GSSAPI)'
];

describe('Connection String', function () {
  it('should support auth passed in through options', function (done) {
    const optionsWithUser = {
      authMechanism: 'SCRAM-SHA-1',
      auth: { user: 'testing', password: 'llamas' }
    };

    const optionsWithUsername = {
      authMechanism: 'SCRAM-SHA-1',
      auth: { username: 'testing', password: 'llamas' }
    };

    parseConnectionString('mongodb://localhost', optionsWithUser, (err, result) => {
      expect(err).to.not.exist;
      expect(result.auth).to.containSubset({
        db: 'admin',
        username: 'testing',
        password: 'llamas'
      });

      parseConnectionString('mongodb://localhost', optionsWithUsername, (err, result) => {
        expect(err).to.not.exist;
        expect(result.auth).to.containSubset({
          db: 'admin',
          username: 'testing',
          password: 'llamas'
        });

        done();
      });
    });
  });

  it('should provide a default port if one is not provided', function (done) {
    parseConnectionString('mongodb://hostname', function (err, result) {
      expect(err).to.not.exist;
      expect(result.hosts[0].port).to.equal(27017);
      done();
    });
  });

  it('should correctly parse arrays', function (done) {
    parseConnectionString('mongodb://hostname?foo=bar&foo=baz', function (err, result) {
      expect(err).to.not.exist;
      expect(result.options.foo).to.deep.equal(['bar', 'baz']);
      done();
    });
  });

  it('should parse boolean values', function (done) {
    parseConnectionString('mongodb://hostname?retryWrites=1', function (err, result) {
      expect(err).to.not.exist;
      expect(result.options.retryWrites).to.equal(false);

      parseConnectionString('mongodb://hostname?retryWrites=false', function (err, result) {
        expect(err).to.not.exist;
        expect(result.options.retryWrites).to.equal(false);

        parseConnectionString('mongodb://hostname?retryWrites=true', function (err, result) {
          expect(err).to.not.exist;
          expect(result.options.retryWrites).to.equal(true);
          done();
        });
      });
    });
  });

  it('should parse compression options', function (done) {
    parseConnectionString(
      'mongodb://localhost/?compressors=zlib&zlibCompressionLevel=4',
      (err, result) => {
        expect(err).to.not.exist;
        expect(result.options).to.have.property('compression');
        expect(result.options.compression).to.eql({
          compressors: ['zlib'],
          zlibCompressionLevel: 4
        });

        done();
      }
    );
  });

  it('should parse `readConcernLevel`', function (done) {
    parseConnectionString('mongodb://localhost/?readConcernLevel=local', (err, result) => {
      expect(err).to.not.exist;
      expect(result.options).to.have.property('readConcern');
      expect(result.options.readConcern).to.eql({ level: 'local' });
      done();
    });
  });

  it('should parse `authMechanismProperties`', function (done) {
    parseConnectionString(
      'mongodb://user%40EXAMPLE.COM:secret@localhost/?authMechanismProperties=SERVICE_NAME:other,SERVICE_REALM:blah,CANONICALIZE_HOST_NAME:true&authMechanism=GSSAPI',
      (err, result) => {
        expect(err).to.not.exist;

        const options = result.options;
        expect(options).to.deep.include({
          gssapiServiceName: 'other',
          gssapiServiceRealm: 'blah',
          gssapiCanonicalizeHostName: true
        });

        expect(options).to.have.property('authMechanism');
        expect(options.authMechanism).to.equal('GSSAPI');

        done();
      }
    );
  });

  it('should parse a numeric authSource with variable width', function (done) {
    parseConnectionString('mongodb://test@localhost/?authSource=0001', (err, result) => {
      expect(err).to.not.exist;
      expect(result.options).to.have.property('authSource');
      expect(result.options.authSource).to.equal('0001');

      done();
    });
  });

  it('should parse a replicaSet with a leading number', function (done) {
    parseConnectionString('mongodb://localhost/?replicaSet=123abc', (err, result) => {
      expect(err).to.not.exist;
      expect(result.options).to.have.property('replicaSet');
      expect(result.options.replicaSet).to.equal('123abc');

      done();
    });
  });

  it('should parse multiple readPreferenceTags', function (done) {
    parseConnectionString(
      'mongodb://localhost/?readPreferenceTags=dc:ny,rack:1&readPreferenceTags=dc:ny',
      (err, result) => {
        expect(err).to.not.exist;
        expect(result.options).to.have.property('readPreferenceTags');
        expect(result.options.readPreferenceTags).to.deep.equal([
          { dc: 'ny', rack: '1' },
          { dc: 'ny' }
        ]);

        done();
      }
    );
  });

  describe('validation', function () {
    it('should validate compression options', function (done) {
      parseConnectionString('mongodb://localhost/?zlibCompressionLevel=15', err => {
        expect(err).to.exist;

        parseConnectionString('mongodb://localhost/?compressors=bunnies', err => {
          expect(err).to.exist;

          done();
        });
      });
    });

    it('should validate authMechanism', function (done) {
      parseConnectionString('mongodb://localhost/?authMechanism=DOGS', err => {
        expect(err).to.exist;
        done();
      });
    });

    it('should validate readPreference', function (done) {
      parseConnectionString('mongodb://localhost/?readPreference=llamasPreferred', err => {
        expect(err).to.exist;
        done();
      });
    });

    it('should validate non-equal tls values', function (done) {
      parseConnectionString('mongodb://localhost/?tls=true&tls=false', err => {
        expect(err).to.have.property('message', 'All values of tls must be the same.');
        done();
      });
    });
  });

  describe('spec tests', function () {
    /** @type {import('../../spec/connection-string/valid-auth.json')[]} */
    const suites = loadSpecTests('connection-string').concat(loadSpecTests('auth'));

    for (const suite of suites) {
      describe(suite.name, function () {
        for (const test of suite.tests) {
          it(`${test.description} -- new MongoOptions parser`, function () {
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
                  expect(options.hosts[index].host, message).to.equal(host);
                  if (typeof port === 'number') expect(options.hosts[index].port).to.equal(port);
                }
              }

              if (test.auth) {
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

              // TODO
              // if (test.options) {
              //   expect(options, message).to.deep.include(test.options);
              // }
            } else {
              expect(() => parseOptions(test.uri), message).to.throw();
            }
          });
        }
      });
    }

    suites.forEach(suite => {
      describe(suite.name, function () {
        suite.tests.forEach(test => {
          it(test.description, {
            metadata: { requires: { topology: 'single' } },
            test: function (done) {
              if (skipTests.indexOf(test.description) !== -1) {
                return this.skip();
              }

              const valid = test.valid;
              parseConnectionString(test.uri, { caseTranslate: false }, function (err, result) {
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

                  if (test.hosts != null) {
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
                  }

                  if (test.auth) {
                    if (test.auth.db != null) {
                      expect(result.auth).to.have.property('db');
                      expect(result.auth.db).to.eql(test.auth.db);
                    }

                    if (test.auth.username != null) {
                      expect(result.auth).to.have.property('username');
                      expect(result.auth.username).to.eql(test.auth.username);
                    }

                    if (test.auth.password != null) {
                      expect(result.auth).to.have.property('password');
                      expect(result.auth.password).to.eql(test.auth.password);
                    }
                  }

                  if (test.options != null) {
                    // it's possible we have options which are not explicitly included in the spec test
                    expect(result.options).to.deep.include(test.options);
                  }
                }

                done();
              });
            }
          });
        });
      });
    });
  });
});
