import { expect } from 'chai';
import * as dns from 'dns';
import * as sinon from 'sinon';

import {
  AUTH_MECHS_AUTH_SRC_EXTERNAL,
  AuthMechanism,
  FEATURE_FLAGS,
  MongoAPIError,
  MongoClient,
  MongoCredentials,
  MongoDriverError,
  MongoInvalidArgumentError,
  MongoOptions,
  MongoParseError,
  MongoRuntimeError,
  parseOptions,
  resolveSRVRecord
} from '../mongodb';

describe('Connection String', function () {
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

  it('should provide a default port if one is not provided', function () {
    const options = parseOptions('mongodb://hostname');
    expect(options.hosts[0].socketPath).to.be.undefined;
    expect(options.hosts[0].host).to.be.a('string');
    expect(options.hosts[0].port).to.equal(27017);
  });

  describe('ca option', () => {
    context('when set in the options object', () => {
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

    // TODO(NODE-4172): align uri behavior with object options behavior
    context('when set in the uri', () => {
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
    context('when the option is passed in the uri', () => {
      it('should throw an error if no value is passed for readPreferenceTags', () => {
        expect(() => parseOptions('mongodb://hostname?readPreferenceTags=')).to.throw(
          MongoAPIError
        );
      });
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
    });

    context('when the option is passed in the options object', () => {
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

  it('should parse boolean values', function () {
    let options = parseOptions('mongodb://hostname?retryWrites=1');
    expect(options.retryWrites).to.equal(true);
    options = parseOptions('mongodb://hostname?retryWrites=false');
    expect(options.retryWrites).to.equal(false);
    options = parseOptions('mongodb://hostname?retryWrites=t');
    expect(options.retryWrites).to.equal(true);
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
    context(`when the authMechanism is ${mechanism} and authSource is NOT $external`, function () {
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

  context('when directionConnection is set', () => {
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

  context('when both tls and ssl options are provided', function () {
    context('when the options are provided in the URI', function () {
      context('when the options are equal', function () {
        context('when both options are true', function () {
          it('sets the tls option', function () {
            const options = parseOptions('mongodb://localhost/?tls=true&ssl=true');
            expect(options.tls).to.be.true;
          });

          it('does not set the ssl option', function () {
            const options = parseOptions('mongodb://localhost/?tls=true&ssl=true');
            expect(options).to.not.have.property('ssl');
          });
        });

        context('when both options are false', function () {
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

      context('when the options are not equal', function () {
        it('raises an error', function () {
          expect(() => {
            parseOptions('mongodb://localhost/?tls=true&ssl=false');
          }).to.throw(MongoParseError, 'All values of tls/ssl must be the same.');
        });
      });
    });

    context('when the options are provided in the options', function () {
      context('when the options are equal', function () {
        context('when both options are true', function () {
          it('sets the tls option', function () {
            const options = parseOptions('mongodb://localhost/', { tls: true, ssl: true });
            expect(options.tls).to.be.true;
          });

          it('does not set the ssl option', function () {
            const options = parseOptions('mongodb://localhost/', { tls: true, ssl: true });
            expect(options).to.not.have.property('ssl');
          });
        });

        context('when both options are false', function () {
          context('when the URI is an SRV URI', function () {
            it('overrides the tls option', function () {
              const options = parseOptions('mongodb+srv://localhost/', { tls: false, ssl: false });
              expect(options.tls).to.be.false;
            });

            it('does not set the ssl option', function () {
              const options = parseOptions('mongodb+srv://localhost/', { tls: false, ssl: false });
              expect(options).to.not.have.property('ssl');
            });
          });

          context('when the URI is not SRV', function () {
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

      context('when the options are not equal', function () {
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
      expect(FEATURE_FLAGS.size).to.equal(2);
      expect(FEATURE_FLAGS.has(Symbol.for('@@mdb.skipPingOnConnect'))).to.be.true;
      expect(FEATURE_FLAGS.has(Symbol.for('@@mdb.enableMongoLogger'))).to.be.true;
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
});
