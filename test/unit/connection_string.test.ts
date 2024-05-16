import { once } from 'node:events';
import * as process from 'node:process';

import { expect } from 'chai';
import * as dns from 'dns';
import * as sinon from 'sinon';
import { inspect } from 'util';

import {
  AUTH_MECHS_AUTH_SRC_EXTERNAL,
  AuthMechanism,
  COSMOS_DB_MSG,
  DEFAULT_ALLOWED_HOSTS,
  DOCUMENT_DB_MSG,
  FEATURE_FLAGS,
  type Log,
  MongoAPIError,
  MongoClient,
  MongoCredentials,
  MongoDriverError,
  MongoInvalidArgumentError,
  type MongoOptions,
  MongoParseError,
  MongoRuntimeError,
  parseOptions,
  resolveSRVRecord
} from '../mongodb';

describe('Connection String', function () {
  describe('when serverMonitoringMode is set', function () {
    describe('when it is valid', function () {
      describe('when set in the connection string', function () {
        it('sets the mode', function () {
          const options = parseOptions('mongodb://localhost:27017/?serverMonitoringMode=poll');
          expect(options.serverMonitoringMode).to.equal('poll');
        });
      });

      describe('when set in the options', function () {
        it('sets the mode', function () {
          const options = parseOptions('mongodb://localhost:27017', {
            serverMonitoringMode: 'poll'
          });
          expect(options.serverMonitoringMode).to.equal('poll');
        });
      });
    });

    describe('when it is not valid', function () {
      describe('when set in the connection string', function () {
        it('throws a parse error', function () {
          expect(() =>
            parseOptions('mongodb://localhost:27017/?serverMonitoringMode=invalid')
          ).to.throw(MongoParseError, /serverMonitoringMode/);
        });
      });
    });
  });

  describe('when serverMonitoringMode is not set', function () {
    it('defaults to auto', function () {
      const options = parseOptions('mongodb://localhost:27017');
      expect(options.serverMonitoringMode).to.equal('auto');
    });
  });

  it('should not support auth passed with user', function () {
    const optionsWithUser = {
      authMechanism: 'SCRAM-SHA-1',
      auth: { user: 'testing', password: 'llamas' }
    };
    expect(() => parseOptions('mongodb://localhost', optionsWithUser as any)).to.throw(
      MongoParseError
    );
  });

  it('should support auth passed with username', function () {
    const optionsWithUsername = {
      authMechanism: 'SCRAM-SHA-1',
      auth: { username: 'testing', password: 'llamas' }
    };
    const options = parseOptions('mongodb://localhost', optionsWithUsername as any);
    expect(options.credentials).to.containSubset({
      source: 'admin',
      username: 'testing',
      password: 'llamas'
    });
  });

  it('throws an error related to the option that was given an empty value', function () {
    expect(() => parseOptions('mongodb://localhost?tls=', {})).to.throw(
      MongoAPIError,
      /tls" cannot/i
    );
  });

  it('should provide a default port if one is not provided', function () {
    const options = parseOptions('mongodb://hostname');
    expect(options.hosts[0].socketPath).to.be.undefined;
    expect(options.hosts[0].host).to.be.a('string');
    expect(options.hosts[0].port).to.equal(27017);
  });

  describe('ca option', () => {
    describe('when set in the options object', () => {
      it('should parse a string', () => {
        const options = parseOptions('mongodb://localhost', {
          ca: 'hello'
        });
        expect(options).to.have.property('ca').to.equal('hello');
      });

      it('should parse a NodeJS buffer', () => {
        const options = parseOptions('mongodb://localhost', {
          ca: Buffer.from([1, 2, 3, 4])
        });
        expect(options)
          .to.have.property('ca')
          .to.deep.equal(Buffer.from([1, 2, 3, 4]));
      });

      it('should parse arrays with a single element', () => {
        const options = parseOptions('mongodb://localhost', {
          ca: ['hello']
        });
        expect(options).to.have.property('ca').to.deep.equal(['hello']);
      });

      it('should parse an empty array', () => {
        const options = parseOptions('mongodb://localhost', {
          ca: []
        });
        expect(options).to.have.property('ca').to.deep.equal([]);
      });

      it('should parse arrays with multiple elements', () => {
        const options = parseOptions('mongodb://localhost', {
          ca: ['hello', 'world']
        });
        expect(options).to.have.property('ca').to.deep.equal(['hello', 'world']);
      });
    });

    describe('when set in the uri', () => {
      it('should parse a string value', () => {
        const options = parseOptions('mongodb://localhost?ca=hello', {});
        expect(options).to.have.property('ca').to.equal('hello');
      });

      it('should throw an error with a buffer value', () => {
        const buffer = Buffer.from([1, 2, 3, 4]);
        expect(() => {
          parseOptions(`mongodb://localhost?ca=${buffer.toString()}`, {});
        }).to.throw(MongoAPIError);
      });

      it('should not parse multiple string values (array of options)', () => {
        const options = parseOptions('mongodb://localhost?ca=hello,world', {});
        expect(options).to.have.property('ca').to.equal('hello,world');
      });
    });

    it('should prioritize options set in the object over those set in the URI', () => {
      const options = parseOptions('mongodb://localhost?ca=hello', {
        ca: ['world']
      });
      expect(options).to.have.property('ca').to.deep.equal(['world']);
    });
  });

  describe('readPreferenceTags option', function () {
    describe('when the option is passed in the uri', () => {
      it('should parse a single read preference tag', () => {
        const options = parseOptions('mongodb://hostname?readPreferenceTags=bar:foo');
        expect(options.readPreference.tags).to.deep.equal([{ bar: 'foo' }]);
      });

      it('should parse multiple readPreferenceTags', () => {
        const options = parseOptions(
          'mongodb://hostname?readPreferenceTags=bar:foo&readPreferenceTags=baz:bar'
        );
        expect(options.readPreference.tags).to.deep.equal([{ bar: 'foo' }, { baz: 'bar' }]);
      });

      it('should parse multiple readPreferenceTags for the same key', () => {
        const options = parseOptions(
          'mongodb://hostname?readPreferenceTags=bar:foo&readPreferenceTags=bar:banana&readPreferenceTags=baz:bar'
        );
        expect(options.readPreference.tags).to.deep.equal([
          { bar: 'foo' },
          { bar: 'banana' },
          { baz: 'bar' }
        ]);
      });

      it('should parse multiple and empty readPreferenceTags', () => {
        const options = parseOptions(
          'mongodb://hostname?readPreferenceTags=bar:foo&readPreferenceTags=baz:bar&readPreferenceTags='
        );
        expect(options.readPreference.tags).to.deep.equal([{ bar: 'foo' }, { baz: 'bar' }, {}]);
      });

      it('will set "__proto__" as own property on readPreferenceTag', () => {
        const options = parseOptions('mongodb://hostname?readPreferenceTags=__proto__:foo');
        expect(options.readPreference.tags?.[0]).to.have.own.property('__proto__', 'foo');
        expect(Object.getPrototypeOf(options.readPreference.tags?.[0])).to.be.null;
      });
    });

    describe('when the option is passed in the options object', () => {
      it('should not parse an empty readPreferenceTags object', () => {
        const options = parseOptions('mongodb://hostname?', {
          readPreferenceTags: []
        });
        expect(options.readPreference.tags).to.deep.equal([]);
      });

      it('should parse a single readPreferenceTags object', () => {
        const options = parseOptions('mongodb://hostname?', {
          readPreferenceTags: [{ bar: 'foo' }]
        });
        expect(options.readPreference.tags).to.deep.equal([{ bar: 'foo' }]);
      });

      it('should parse multiple readPreferenceTags', () => {
        const options = parseOptions('mongodb://hostname?', {
          readPreferenceTags: [{ bar: 'foo' }, { baz: 'bar' }]
        });
        expect(options.readPreference.tags).to.deep.equal([{ bar: 'foo' }, { baz: 'bar' }]);
      });

      it('should parse multiple readPreferenceTags for the same key', () => {
        const options = parseOptions('mongodb://hostname?', {
          readPreferenceTags: [{ bar: 'foo' }, { bar: 'banana' }, { baz: 'bar' }]
        });
        expect(options.readPreference.tags).to.deep.equal([
          { bar: 'foo' },
          { bar: 'banana' },
          { baz: 'bar' }
        ]);
      });
    });

    it('should prioritize options from the options object over the uri options', () => {
      const options = parseOptions('mongodb://hostname?readPreferenceTags=a:b', {
        readPreferenceTags: [{ bar: 'foo' }, { baz: 'bar' }]
      });
      expect(options.readPreference.tags).to.deep.equal([{ bar: 'foo' }, { baz: 'bar' }]);
    });
  });

  describe('boolean options', function () {
    const valuesExpectations: {
      value: string;
      expectation: 'error' | boolean;
    }[] = [
      { value: 'true', expectation: true },
      { value: 'false', expectation: false },
      { value: '-1', expectation: 'error' },
      { value: '1', expectation: 'error' },
      { value: '0', expectation: 'error' },
      { value: 't', expectation: 'error' },
      { value: 'f', expectation: 'error' },
      { value: 'n', expectation: 'error' },
      { value: 'y', expectation: 'error' },
      { value: 'yes', expectation: 'error' },
      { value: 'no', expectation: 'error' },
      { value: 'unknown', expectation: 'error' }
    ];
    for (const { value, expectation } of valuesExpectations) {
      const connString = `mongodb://hostname?retryWrites=${value}`;
      describe(`when provided '${value}'`, function () {
        if (expectation === 'error') {
          it('throws MongoParseError', function () {
            expect(() => {
              parseOptions(connString);
            }).to.throw(MongoParseError);
          });
        } else {
          it(`parses as ${expectation}`, function () {
            const options = parseOptions(connString);
            expect(options).to.have.property('retryWrites', expectation);
          });
        }
      });
    }
  });

  it('should parse compression options', function () {
    const options = parseOptions('mongodb://localhost/?compressors=zlib&zlibCompressionLevel=4');
    expect(options).to.have.property('compressors');
    expect(options.compressors).to.include('zlib');
    expect(options.zlibCompressionLevel).to.equal(4);
  });

  it('should parse `readConcernLevel`', function () {
    const options = parseOptions('mongodb://localhost/?readConcernLevel=local');
    expect(options).to.have.property('readConcern');
    expect(options.readConcern.level).to.equal('local');
  });

  describe('when auth mechanism is MONGODB-OIDC', function () {
    describe('when ALLOWED_HOSTS is in the URI', function () {
      it('raises an error', function () {
        expect(() => {
          parseOptions(
            'mongodb://localhost/?authMechanismProperties=PROVIDER_NAME:aws,ALLOWED_HOSTS:[localhost]&authMechanism=MONGODB-OIDC'
          );
        }).to.throw(
          MongoParseError,
          'Auth mechanism property ALLOWED_HOSTS is not allowed in the connection string.'
        );
      });
    });

    describe('when ALLOWED_HOSTS is in the options', function () {
      describe('when it is an array of strings', function () {
        const hosts = ['*.example.com'];

        it('sets the allowed hosts property', function () {
          const options = parseOptions(
            'mongodb://localhost/?authMechanism=MONGODB-OIDC&authMechanismProperties=PROVIDER_NAME:aws',
            {
              authMechanismProperties: {
                ALLOWED_HOSTS: hosts
              }
            }
          );
          expect(options.credentials.mechanismProperties).to.deep.equal({
            PROVIDER_NAME: 'aws',
            ALLOWED_HOSTS: hosts
          });
        });
      });

      describe('when it is not an array of strings', function () {
        it('raises an error', function () {
          expect(() => {
            parseOptions(
              'mongodb://localhost/?authMechanism=MONGODB-OIDC&authMechanismProperties=PROVIDER_NAME:aws',
              {
                authMechanismProperties: {
                  ALLOWED_HOSTS: [1, 2, 3]
                }
              }
            );
          }).to.throw(
            MongoInvalidArgumentError,
            'Auth mechanism property ALLOWED_HOSTS must be an array of strings.'
          );
        });
      });
    });

    describe('when ALLOWED_HOSTS is not in the options', function () {
      it('sets the default value', function () {
        const options = parseOptions(
          'mongodb://localhost/?authMechanism=MONGODB-OIDC&authMechanismProperties=PROVIDER_NAME:aws'
        );
        expect(options.credentials.mechanismProperties).to.deep.equal({
          PROVIDER_NAME: 'aws',
          ALLOWED_HOSTS: DEFAULT_ALLOWED_HOSTS
        });
      });
    });

    describe('when TOKEN_AUDIENCE is in the properties', function () {
      describe('when it is a uri', function () {
        const options = parseOptions(
          'mongodb://localhost/?authMechanism=MONGODB-OIDC&authMechanismProperties=PROVIDER_NAME:azure,TOKEN_AUDIENCE:api%3A%2F%2Ftest'
        );

        it('parses the uri', function () {
          expect(options.credentials.mechanismProperties).to.deep.equal({
            PROVIDER_NAME: 'azure',
            TOKEN_AUDIENCE: 'api://test',
            ALLOWED_HOSTS: DEFAULT_ALLOWED_HOSTS
          });
        });
      });
    });
  });

  it('should parse `authMechanismProperties`', function () {
    const options = parseOptions(
      'mongodb://user%40EXAMPLE.COM:secret@localhost/?authMechanismProperties=SERVICE_NAME:other,SERVICE_REALM:blah,CANONICALIZE_HOST_NAME:true,SERVICE_HOST:example.com&authMechanism=GSSAPI'
    );
    expect(options.credentials.mechanismProperties).to.deep.include({
      SERVICE_HOST: 'example.com',
      SERVICE_NAME: 'other',
      SERVICE_REALM: 'blah',
      CANONICALIZE_HOST_NAME: true
    });
    expect(options.credentials.mechanism).to.equal(AuthMechanism.MONGODB_GSSAPI);
  });

  it('should provide default authSource when valid AuthMechanism provided', function () {
    const options = parseOptions(
      'mongodb+srv://jira-sync.pw0q4.mongodb.net/testDB?authMechanism=MONGODB-AWS&retryWrites=true&w=majority'
    );
    expect(options.credentials.source).to.equal('$external');
  });

  it('should omit credentials option when the only authSource is provided', function () {
    let options = parseOptions(`mongodb://a/?authSource=someDb`);
    expect(options).to.not.have.property('credentials');
    options = parseOptions(`mongodb+srv://a/?authSource=someDb`);
    expect(options).to.not.have.property('credentials');
  });
  for (const mechanism of ['GSSAPI', 'MONGODB-X509']) {
    describe(`when the authMechanism is ${mechanism} and authSource is NOT $external`, function () {
      it('throws a MongoParseError', function () {
        expect(() =>
          parseOptions(`mongodb+srv://hostname/?authMechanism=${mechanism}&authSource=invalid`)
        )
          .to.throw(MongoParseError)
          .to.match(/requires an authSource of '\$external'/);
      });
    });
  }

  it('should omit credentials and not throw a MongoAPIError if the only auth related option is authSource', async () => {
    // The error we're looking to **not** see is
    // `new MongoInvalidArgumentError('No AuthProvider for ${credentials.mechanism} defined.')`
    // in `prepareHandshakeDocument` and/or `performInitialHandshake`.
    // Neither function is exported currently but if I did export them because of the inlined callbacks
    // I think I would need to mock quite a bit of internals to get down to that layer.
    // My thinking is I can lean on server selection failing for th unit tests to assert we at least don't get an error related to auth.
    const client = new MongoClient('mongodb://localhost:123/?authSource=someDb', {
      serverSelectionTimeoutMS: 500
    });
    let thrownError: Error;
    try {
      // relies on us not running a mongod on port 123, fairly likely assumption
      await client.connect();
    } catch (error) {
      thrownError = error;
    }
    // We should fail to connect, not fail to find an auth provider thus we should not find a MongoAPIError
    expect(thrownError).to.not.be.instanceOf(MongoAPIError);
    expect(client.options).to.not.have.a.property('credentials');
  });

  it('should parse a numeric authSource with variable width', function () {
    const options = parseOptions('mongodb://test@localhost/?authSource=0001');
    expect(options.credentials.source).to.equal('0001');
  });

  it('should not remove dbName from the options if authSource is provided', function () {
    const dbName = 'my-db-name';
    const authSource = 'admin';
    const options = parseOptions(
      `mongodb://myName:myPassword@localhost:27017/${dbName}?authSource=${authSource}`
    );
    expect(options).has.property('dbName', dbName);
    expect(options.credentials).to.have.property('source', authSource);
  });

  it('should parse a replicaSet with a leading number', function () {
    const options = parseOptions('mongodb://localhost/?replicaSet=123abc');
    expect(options).to.have.property('replicaSet');
    expect(options.replicaSet).to.equal('123abc');
  });

  describe('when directionConnection is set', () => {
    it('sets directConnection successfully when there is one host', () => {
      const options = parseOptions('mongodb://localhost:27027/?directConnection=true');
      expect(options.directConnection).to.be.true;
    });

    it('throws when directConnection is true and there is more than one host', () => {
      expect(() =>
        parseOptions('mongodb://localhost:27027,localhost:27018/?directConnection=true')
      ).to.throw(MongoParseError, 'directConnection option requires exactly one host');
    });
  });

  describe('when providing tlsCRLFile', function () {
    it('sets the tlsCRLFile option', function () {
      const options = parseOptions('mongodb://localhost/?tls=true&tlsCRLFile=path/to/crl.pem');
      expect(options.tlsCRLFile).to.equal('path/to/crl.pem');
    });
  });

  describe('when both tls and ssl options are provided', function () {
    describe('when the options are provided in the URI', function () {
      describe('when the options are equal', function () {
        describe('when both options are true', function () {
          it('sets the tls option', function () {
            const options = parseOptions('mongodb://localhost/?tls=true&ssl=true');
            expect(options.tls).to.be.true;
          });

          it('does not set the ssl option', function () {
            const options = parseOptions('mongodb://localhost/?tls=true&ssl=true');
            expect(options).to.not.have.property('ssl');
          });
        });

        describe('when both options are false', function () {
          it('sets the tls option', function () {
            const options = parseOptions('mongodb://localhost/?tls=false&ssl=false');
            expect(options.tls).to.be.false;
          });

          it('does not set the ssl option', function () {
            const options = parseOptions('mongodb://localhost/?tls=false&ssl=false');
            expect(options).to.not.have.property('ssl');
          });
        });
      });

      describe('when the options are not equal', function () {
        it('raises an error', function () {
          expect(() => {
            parseOptions('mongodb://localhost/?tls=true&ssl=false');
          }).to.throw(MongoParseError, 'All values of tls/ssl must be the same.');
        });
      });
    });

    describe('when the options are provided in the options', function () {
      describe('when the options are equal', function () {
        describe('when both options are true', function () {
          it('sets the tls option', function () {
            const options = parseOptions('mongodb://localhost/', { tls: true, ssl: true });
            expect(options.tls).to.be.true;
          });

          it('does not set the ssl option', function () {
            const options = parseOptions('mongodb://localhost/', { tls: true, ssl: true });
            expect(options).to.not.have.property('ssl');
          });
        });

        describe('when both options are false', function () {
          describe('when the URI is an SRV URI', function () {
            it('overrides the tls option', function () {
              const options = parseOptions('mongodb+srv://localhost/', { tls: false, ssl: false });
              expect(options.tls).to.be.false;
            });

            it('does not set the ssl option', function () {
              const options = parseOptions('mongodb+srv://localhost/', { tls: false, ssl: false });
              expect(options).to.not.have.property('ssl');
            });
          });

          describe('when the URI is not SRV', function () {
            it('sets the tls option', function () {
              const options = parseOptions('mongodb://localhost/', { tls: false, ssl: false });
              expect(options.tls).to.be.false;
            });

            it('does not set the ssl option', function () {
              const options = parseOptions('mongodb://localhost/', { tls: false, ssl: false });
              expect(options).to.not.have.property('ssl');
            });
          });
        });
      });

      describe('when the options are not equal', function () {
        it('raises an error', function () {
          expect(() => {
            parseOptions('mongodb://localhost/', { tls: true, ssl: false });
          }).to.throw(MongoParseError, 'All values of tls/ssl must be the same.');
        });
      });
    });
  });

  describe('validation', function () {
    it('should validate compressors options', function () {
      let thrownError;
      try {
        parseOptions('mongodb://localhost/?compressors=bunnies');
      } catch (error) {
        thrownError = error;
      }
      expect(thrownError).to.be.instanceOf(MongoInvalidArgumentError);
      expect(thrownError.message).to.equal(
        'bunnies is not a valid compression mechanism. Must be one of: none,snappy,zlib,zstd.'
      );
    });

    it('throws an error for repeated options that can only appear once', function () {
      // At the time of writing, readPreferenceTags is the only options that can be repeated
      expect(() => parseOptions('mongodb://localhost/?compressors=zstd&compressors=zstd')).to.throw(
        MongoInvalidArgumentError,
        /cannot appear more than once/
      );
      expect(() => parseOptions('mongodb://localhost/?tls=true&tls=true')).to.throw(
        MongoInvalidArgumentError,
        /cannot appear more than once/
      );
    });

    it('should validate authMechanism', function () {
      expect(() => parseOptions('mongodb://localhost/?authMechanism=DOGS')).to.throw(
        MongoParseError,
        'authMechanism one of MONGODB-AWS,MONGODB-CR,DEFAULT,GSSAPI,PLAIN,SCRAM-SHA-1,SCRAM-SHA-256,MONGODB-X509,MONGODB-OIDC, got DOGS'
      );
    });

    it('should validate readPreference', function () {
      expect(() => parseOptions('mongodb://localhost/?readPreference=llamasPreferred')).to.throw(
        MongoDriverError, // not parse Error b/c thrown from ReadPreference construction
        'Invalid read preference mode "llamasPreferred"'
      );
    });
  });

  describe('mongodb+srv', function () {
    it('should parse a default database', function () {
      const options = parseOptions('mongodb+srv://test1.test.build.10gen.cc/somedb');
      expect(options.dbName).to.equal('somedb');
      expect(options.srvHost).to.equal('test1.test.build.10gen.cc');
    });
  });

  describe('resolveSRVRecord()', () => {
    afterEach(() => {
      sinon.restore();
    });
    function makeStub(txtRecord: string) {
      const mockAddress = [
        {
          name: 'localhost.test.mock.test.build.10gen.cc',
          port: 2017,
          weight: 0,
          priority: 0
        }
      ];
      const mockRecord: string[][] = [[txtRecord]];
      // first call is for stubbing resolveSrv
      // second call is for stubbing resolveTxt
      sinon.stub(dns.promises, 'resolveSrv').callsFake(async () => {
        return mockAddress;
      });
      sinon.stub(dns.promises, 'resolveTxt').callsFake(async () => {
        return mockRecord;
      });
    }
    for (const mechanism of AUTH_MECHS_AUTH_SRC_EXTERNAL) {
      it(`should set authSource to $external for ${mechanism} external mechanism`, async function () {
        makeStub('authSource=thisShouldNotBeAuthSource');
        const mechanismProperties = {};
        if (mechanism === AuthMechanism.MONGODB_OIDC) {
          mechanismProperties.PROVIDER_NAME = 'aws';
        }
        const credentials = new MongoCredentials({
          source: '$external',
          mechanism,
          username: mechanism === AuthMechanism.MONGODB_OIDC ? undefined : 'username',
          password: mechanism === AuthMechanism.MONGODB_X509 ? undefined : 'password',
          mechanismProperties: mechanismProperties
        });
        credentials.validate();
        const options = {
          credentials,
          srvHost: 'test.mock.test.build.10gen.cc',
          srvServiceName: 'mongodb',
          userSpecifiedAuthSource: false
        } as MongoOptions;
        await resolveSRVRecord(options);
        // check MongoCredentials instance (i.e. whether or not merge on options.credentials was called)
        expect(options).property('credentials').to.equal(credentials);
        expect(options).to.have.nested.property('credentials.source', '$external');
      });
    }

    it('should set a default authSource for non-external mechanisms with no user-specified source', async function () {
      makeStub('authSource=thisShouldBeAuthSource');
      const credentials = new MongoCredentials({
        source: 'admin',
        mechanism: AuthMechanism.MONGODB_SCRAM_SHA256,
        username: 'username',
        password: 'password',
        mechanismProperties: {}
      });
      credentials.validate();
      const options = {
        credentials,
        srvHost: 'test.mock.test.build.10gen.cc',
        srvServiceName: 'mongodb',
        userSpecifiedAuthSource: false
      } as MongoOptions;
      await resolveSRVRecord(options);
      // check MongoCredentials instance (i.e. whether or not merge on options.credentials was called)
      expect(options).property('credentials').to.not.equal(credentials);
      expect(options).to.have.nested.property('credentials.source', 'thisShouldBeAuthSource');
    });

    it('should retain credentials for any mechanism with no user-sepcificed source and no source in DNS', async function () {
      makeStub('');
      const credentials = new MongoCredentials({
        source: 'admin',
        mechanism: AuthMechanism.MONGODB_SCRAM_SHA256,
        username: 'username',
        password: 'password',
        mechanismProperties: {}
      });
      credentials.validate();
      const options = {
        credentials,
        srvHost: 'test.mock.test.build.10gen.cc',
        srvServiceName: 'mongodb',
        userSpecifiedAuthSource: false
      } as MongoOptions;
      await resolveSRVRecord(options as any);
      // check MongoCredentials instance (i.e. whether or not merge on options.credentials was called)
      expect(options).property('credentials').to.equal(credentials);
      expect(options).to.have.nested.property('credentials.source', 'admin');
    });

    it('should retain specified authSource with no provided credentials', async function () {
      makeStub('authSource=thisShouldBeAuthSource');
      const credentials = {};
      const options = {
        credentials,
        srvHost: 'test.mock.test.build.10gen.cc',
        srvServiceName: 'mongodb',
        userSpecifiedAuthSource: false
      } as MongoOptions;
      await resolveSRVRecord(options as any);
      expect(options).to.have.nested.property('credentials.username', '');
      expect(options).to.have.nested.property('credentials.mechanism', 'DEFAULT');
      expect(options).to.have.nested.property('credentials.source', 'thisShouldBeAuthSource');
    });
  });

  describe('feature flags', () => {
    it('should be stored in the FEATURE_FLAGS Set', () => {
      expect(FEATURE_FLAGS.size).to.equal(3);
      expect(FEATURE_FLAGS.has(Symbol.for('@@mdb.skipPingOnConnect'))).to.be.true;
      expect(FEATURE_FLAGS.has(Symbol.for('@@mdb.enableMongoLogger'))).to.be.true;
      expect(FEATURE_FLAGS.has(Symbol.for('@@mdb.internalLoggerConfig'))).to.be.true;
      // Add more flags here
    });

    it('should should ignore unknown symbols', () => {
      const randomFlag = Symbol();
      const client = new MongoClient('mongodb://iLoveJavaScript', { [randomFlag]: 23n });
      expect(client.s.options).to.not.have.property(randomFlag);
    });

    it('should be prefixed with @@mdb.', () => {
      for (const flag of FEATURE_FLAGS) {
        expect(flag).to.be.a('symbol');
        expect(flag).to.have.property('description');
        expect(flag.description).to.match(/@@mdb\..+/);
      }
    });

    it('should only exist if specified on options', () => {
      const flag = Array.from(FEATURE_FLAGS)[0]; // grab a random supported flag
      const client = new MongoClient('mongodb://iLoveJavaScript', { [flag]: true });
      expect(client.s.options).to.have.property(flag, true);
      expect(client.options).to.have.property(flag, true);
    });

    it('should support nullish values', () => {
      const flag = Array.from(FEATURE_FLAGS.keys())[0]; // grab a random supported flag
      const client = new MongoClient('mongodb://iLoveJavaScript', { [flag]: null });
      expect(client.s.options).to.have.property(flag, null);
    });
  });

  describe('IPv6 host addresses', () => {
    it('should not allow multiple unbracketed portless localhost IPv6 addresses', () => {
      // Note there is no "port-full" version of this test, there's no way to distinguish when a port begins without brackets
      expect(() => new MongoClient('mongodb://::1,::1,::1/test')).to.throw(
        /invalid connection string/i
      );
    });

    it('should not allow multiple unbracketed portless remote IPv6 addresses', () => {
      expect(
        () =>
          new MongoClient(
            'mongodb://ABCD:f::abcd:abcd:abcd:abcd,ABCD:f::abcd:abcd:abcd:abcd,ABCD:f::abcd:abcd:abcd:abcd/test'
          )
      ).to.throw(MongoRuntimeError);
    });

    it('should allow multiple bracketed portless localhost IPv6 addresses', () => {
      const client = new MongoClient('mongodb://[::1],[::1],[::1]/test');
      expect(client.options.hosts).to.deep.equal([
        { host: '::1', port: 27017, isIPv6: true, socketPath: undefined },
        { host: '::1', port: 27017, isIPv6: true, socketPath: undefined },
        { host: '::1', port: 27017, isIPv6: true, socketPath: undefined }
      ]);
    });

    it('should allow multiple bracketed portless remote IPv6 addresses', () => {
      const client = new MongoClient(
        'mongodb://[ABCD:f::abcd:abcd:abcd:abcd],[ABCD:f::abcd:abcd:abcd:abcd],[ABCD:f::abcd:abcd:abcd:abcd]/test'
      );
      expect(client.options.hosts).to.deep.equal([
        { host: 'abcd:f::abcd:abcd:abcd:abcd', port: 27017, isIPv6: true, socketPath: undefined },
        { host: 'abcd:f::abcd:abcd:abcd:abcd', port: 27017, isIPv6: true, socketPath: undefined },
        { host: 'abcd:f::abcd:abcd:abcd:abcd', port: 27017, isIPv6: true, socketPath: undefined }
      ]);
    });

    it('should allow multiple bracketed IPv6 addresses with specified ports', () => {
      const client = new MongoClient('mongodb://[::1]:27018,[::1]:27019,[::1]:27020/test');
      expect(client.options.hosts).to.deep.equal([
        { host: '::1', port: 27018, isIPv6: true, socketPath: undefined },
        { host: '::1', port: 27019, isIPv6: true, socketPath: undefined },
        { host: '::1', port: 27020, isIPv6: true, socketPath: undefined }
      ]);
    });
  });

  it('rejects a connection string with an unsupported scheme', () => {
    expect(() => new MongoClient('mango://localhost:23')).to.throw(/Invalid scheme/i);
    expect(() => new MongoClient('mango+srv://localhost:23')).to.throw(/Invalid scheme/i);
  });

  describe('when deprecated options are used', () => {
    it('useNewUrlParser emits a warning', async () => {
      let willBeWarning = once(process, 'warning');
      parseOptions('mongodb://host?useNewUrlParser=true');
      let [warning] = await willBeWarning;
      expect(warning)
        .to.have.property('message')
        .that.matches(/useNewUrlParser has no effect/);
      willBeWarning = once(process, 'warning');
      //@ts-expect-error: using unsupported option on purpose
      parseOptions('mongodb://host', { useNewUrlParser: true });
      [warning] = await willBeWarning;
      expect(warning)
        .to.have.property('message')
        .that.matches(/useNewUrlParser has no effect/);
    });

    it('useUnifiedTopology emits a warning', async () => {
      let willBeWarning = once(process, 'warning');
      parseOptions('mongodb://host?useUnifiedTopology=true');
      let [warning] = await willBeWarning;
      expect(warning)
        .to.have.property('message')
        .that.matches(/useUnifiedTopology has no effect/);
      willBeWarning = once(process, 'warning');
      //@ts-expect-error: using unsupported option on purpose
      parseOptions('mongodb://host', { useUnifiedTopology: true });
      [warning] = await willBeWarning;
      expect(warning)
        .to.have.property('message')
        .that.matches(/useUnifiedTopology has no effect/);
    });
  });

  describe('when mongodbLogPath is in options', function () {
    const loggerFeatureFlag = Symbol.for('@@mdb.enableMongoLogger');
    let stderrStub;
    let stdoutStub;

    beforeEach(() => {
      stdoutStub = sinon.stub(process.stdout);
      stderrStub = sinon.stub(process.stderr);
    });

    afterEach(() => {
      sinon.restore();
    });

    describe('when option is `stderr`', function () {
      it('it is accessible through mongoLogger.logDestination', function () {
        const client = new MongoClient('mongodb://a/?mongodbLogPath=stderr', {
          [loggerFeatureFlag]: true
        });
        const log: Log = { t: new Date(), c: 'ConnectionStringStdErr', s: 'error' };
        client.options.mongoLoggerOptions.logDestination.write(log);
        const logLine = inspect(log, { breakLength: Infinity, compact: true });
        expect(stderrStub.write).calledWith(`${logLine}\n`);
      });
    });

    describe('when option is `stdout`', function () {
      it('it is accessible through mongoLogger.logDestination', function () {
        const client = new MongoClient('mongodb://a/?mongodbLogPath=stdout', {
          [loggerFeatureFlag]: true
        });
        const log: Log = { t: new Date(), c: 'ConnectionStringStdOut', s: 'error' };
        client.options.mongoLoggerOptions.logDestination.write(log);
        const logLine = inspect(log, { breakLength: Infinity, compact: true });
        expect(stdoutStub.write).calledWith(`${logLine}\n`);
      });
    });

    describe('when option is invalid', function () {
      it('should throw error at construction', function () {
        expect(
          () =>
            new MongoClient('mongodb://a/?mongodbLogPath=stdnothing', { [loggerFeatureFlag]: true })
        ).to.throw(MongoAPIError);
      });
    });
  });

  describe('non-genuine hosts', () => {
    beforeEach(() => {
      process.env.MONGODB_LOG_CLIENT = 'info';
    });

    afterEach(() => {
      process.env.MONGODB_LOG_CLIENT = undefined;
    });
    const loggerFeatureFlag = Symbol.for('@@mdb.enableMongoLogger');
    const test_cases = [
      ['non-SRV example uri', 'mongodb://a.example.com:27017,b.example.com:27017/', ''],
      ['non-SRV default uri', 'mongodb://a.mongodb.net:27017', ''],
      ['SRV example uri', 'mongodb+srv://a.example.com/', ''],
      ['SRV default uri', 'mongodb+srv://a.mongodb.net/', ''],
      // ensure case insensitity
      ['non-SRV cosmosDB uri', 'mongodb://a.mongo.COSmos.aZure.com:19555/', COSMOS_DB_MSG],
      ['non-SRV documentDB uri', 'mongodb://a.docDB.AmazonAws.com:27017/', DOCUMENT_DB_MSG],
      [
        'non-SRV documentDB uri ',
        'mongodb://a.docdB-eLasTic.amazonaws.com:27017/',
        DOCUMENT_DB_MSG
      ],
      ['SRV cosmosDB uri', 'mongodb+srv://a.mongo.COSmos.aZure.com/', COSMOS_DB_MSG],
      ['SRV documentDB uri', 'mongodb+srv://a.docDB.AmazonAws.com/', DOCUMENT_DB_MSG],
      ['SRV documentDB uri 2', 'mongodb+srv://a.docdB-eLastic.amazonaws.com/', DOCUMENT_DB_MSG]
    ];

    describe('when logging is turned on', () => {
      for (const [name, uri, message] of test_cases) {
        it(`${name} triggers ${message.length === 0 ? 'no' : 'correct info'} msg`, () => {
          const stream = {
            buffer: [],
            write(log) {
              this.buffer.push(log);
            }
          };
          new MongoClient(uri, {
            [loggerFeatureFlag]: true,
            mongodbLogPath: stream
          });
          if (message.length > 0) {
            expect(stream.buffer).to.have.lengthOf(1);
            expect(stream.buffer[0]).to.have.property('c', 'client');
            expect(stream.buffer[0]).to.have.property('message', message);
          } else {
            expect(stream.buffer).to.have.lengthOf(0);
          }
        });
      }
    });
  });
});
