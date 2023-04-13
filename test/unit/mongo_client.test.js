'use strict';
const os = require('os');
const fs = require('fs');
const { expect } = require('chai');
const { getSymbolFrom } = require('../tools/utils');
const { parseOptions, resolveSRVRecord } = require('../mongodb');
const { ReadConcern } = require('../mongodb');
const { WriteConcern } = require('../mongodb');
const { ReadPreference } = require('../mongodb');
const { MongoCredentials } = require('../mongodb');
const { MongoClient, MongoParseError, ServerApiVersion } = require('../mongodb');
const { MongoLogger } = require('../mongodb');
const sinon = require('sinon');
const { Writable } = require('stream');

describe('MongoOptions', function () {
  it('MongoClient should always freeze public options', function () {
    const client = new MongoClient('mongodb://localhost:27017');
    expect(client.options).to.be.frozen;
  });

  it('programmatic options should override URI options', function () {
    const options = parseOptions('mongodb://localhost:27017/test?directConnection=true', {
      directConnection: false
    });
    expect(options.directConnection).to.be.false;
    expect(options.hosts).has.length(1);
    expect(options.dbName).to.equal('test');
    expect(options.prototype).to.not.exist;
  });

  it('should rename tls options correctly', function () {
    const filename = `${os.tmpdir()}/tmp.pem`;
    fs.closeSync(fs.openSync(filename, 'w'));
    const options = parseOptions('mongodb://localhost:27017/?ssl=true', {
      tlsCertificateKeyFile: filename,
      tlsCertificateFile: filename,
      tlsCAFile: filename,
      sslCRL: filename,
      tlsCertificateKeyFilePassword: 'tlsCertificateKeyFilePassword',
      sslValidate: false
    });
    fs.unlinkSync(filename);

    /*
     * If set TLS enabled, equivalent to setting the ssl option.
     *
     * ### Additional options:
     *
     * |    nodejs option     | MongoDB equivalent                                 | type                                   |
     * |:---------------------|----------------------------------------------------|:---------------------------------------|
     * | `ca`                 | sslCA, tlsCAFile                                   | `string \| Buffer \| Buffer[]`         |
     * | `crl`                | sslCRL                                             | `string \| Buffer \| Buffer[]`         |
     * | `cert`               | sslCert, tlsCertificateFile                        | `string \| Buffer \| Buffer[]`         |
     * | `key`                | sslKey, tlsCertificateKeyFile                      | `string \| Buffer \| KeyObject[]`      |
     * | `passphrase`         | sslPass, tlsCertificateKeyFilePassword             | `string`                               |
     * | `rejectUnauthorized` | sslValidate                                        | `boolean`                              |
     *
     */
    expect(options).to.not.have.property('tlsCertificateKeyFile');
    expect(options).to.not.have.property('tlsCAFile');
    expect(options).to.not.have.property('sslCRL');
    expect(options).to.not.have.property('tlsCertificateKeyFilePassword');
    expect(options).has.property('ca', '');
    expect(options).has.property('crl', '');
    expect(options).has.property('cert', '');
    expect(options).has.property('key');
    expect(options.key).has.length(0);
    expect(options).has.property('passphrase', 'tlsCertificateKeyFilePassword');
    expect(options).has.property('rejectUnauthorized', false);
    expect(options).has.property('tls', true);
  });

  const ALL_OPTIONS = {
    appName: 'cats',
    auth: { username: 'username', password: 'password' },
    authMechanism: 'SCRAM-SHA-1',
    authMechanismProperties: { SERVICE_NAME: 'service name here' },
    authSource: 'refer to dbName',
    autoEncryption: { bypassAutoEncryption: true },
    checkKeys: true,
    checkServerIdentity: false,
    compressors: 'snappy,zlib',
    connectTimeoutMS: 123,
    directConnection: true,
    dbName: 'test',
    driverInfo: { name: 'MyDriver', platform: 'moonOS' },
    family: 6,
    fieldsAsRaw: { rawField: true },
    forceServerObjectId: true,
    fsync: true,
    heartbeatFrequencyMS: 3,
    ignoreUndefined: false,
    j: true,
    journal: false,
    keepAlive: true,
    keepAliveInitialDelay: 3,
    localThresholdMS: 3,
    maxConnecting: 5,
    maxIdleTimeMS: 3,
    maxPoolSize: 2,
    maxStalenessSeconds: 3,
    minInternalBufferSize: 0,
    minPoolSize: 1,
    monitorCommands: true,
    noDelay: true,
    pkFactory: {
      createPk() {
        return 'very unique';
      }
    },
    promoteBuffers: true,
    promoteLongs: false,
    promoteValues: false,
    raw: true,
    readConcern: new ReadConcern(ReadConcern.AVAILABLE),
    readConcernLevel: ReadConcern.LINEARIZABLE,
    readPreference: ReadPreference.primary,
    readPreferenceTags: [{ loc: 'ny' }],
    replicaSet: 'phil',
    retryReads: false,
    retryWrites: true,
    serializeFunctions: true,
    serverSelectionTimeoutMS: 3,
    servername: 'some tls option',
    serverApi: { version: '1' },
    socketTimeoutMS: 3,
    ssl: true,
    sslPass: 'pass',
    sslValidate: true,
    tls: true,
    tlsAllowInvalidCertificates: true,
    tlsAllowInvalidHostnames: true,
    tlsCertificateKeyFilePassword: 'tls-pass',
    w: 'majority',
    waitQueueTimeoutMS: 3,
    writeConcern: new WriteConcern(2),
    wtimeout: 5,
    wtimeoutMS: 6,
    zlibCompressionLevel: 2
  };

  it('should parse all options from the options object', function () {
    const options = parseOptions('mongodb://localhost:27017/', ALL_OPTIONS);
    // Check consolidated options
    expect(options).has.property('writeConcern');
    expect(options.writeConcern).has.property('w', 2);
    expect(options.writeConcern).has.property('j', true);
  });

  const allURIOptions =
    'mongodb://myName@localhost:27017/test?' +
    [
      'appname=myBestApp',
      'authMechanism=scram-sha-1',
      'authMechanismProperties=opt1:val1',
      'authSource=authDb',
      'compressors=zlib,snappy',
      'connectTimeoutMS=2',
      'directConnection=true',
      'heartbeatFrequencyMS=2',
      'journal=true',
      'localThresholdMS=2',
      'maxConnecting=5',
      'maxIdleTimeMS=2',
      'maxPoolSize=4',
      'maxStalenessSeconds=2',
      'minPoolSize=2',
      'readConcernLevel=local',
      'readPreference=nearest',
      'readPreferenceTags=dc:ny,rack:1',
      'replicaSet=phil',
      'retryReads=true',
      'retryWrites=true',
      'serverSelectionTimeoutMS=2',
      'socketTimeoutMS=2',
      'ssl=true',
      'tls=true',
      'tlsAllowInvalidCertificates=true',
      'tlsAllowInvalidHostnames=true',
      'tlsCertificateKeyFilePassword=PASSWORD',
      'w=majority',
      'waitQueueTimeoutMS=2',
      'wTimeoutMS=2',
      'zlibCompressionLevel=2'
    ].join('&');

  it('should parse all options from the URI string', function () {
    const options = parseOptions(allURIOptions);
    expect(options).has.property('zlibCompressionLevel', 2);

    expect(options).has.property('writeConcern');
    expect(options.writeConcern).has.property('w', 'majority');
    expect(options.writeConcern).has.property('wtimeout', 2);
  });

  it('should ignore undefined and null values in the options object', function () {
    const options = parseOptions('mongodb://localhost:27017/', {
      maxPoolSize: null,
      servername: undefined,
      randomopt: null,
      otherrandomopt: undefined
    });

    // test valid option key with default value
    expect(options).to.have.property('maxPoolSize', 100);

    // test valid option key without default value
    expect(options).not.to.have.property('servername');

    // test invalid option keys that are null/undefined
    expect(options).not.to.have.property('randomopt');
    expect(options).not.to.have.property('otherrandomopt');
  });

  it('should throw an error on unrecognized keys in the options object if they are defined', function () {
    expect(() =>
      parseOptions('mongodb://localhost:27017/', {
        randomopt: 'test'
      })
    ).to.throw(MongoParseError, 'option randomopt is not supported');

    expect(() =>
      parseOptions('mongodb://localhost:27017/', {
        randomopt: 'test',
        randomopt2: 'test'
      })
    ).to.throw(MongoParseError, 'options randomopt, randomopt2 are not supported');
  });

  it('srvHost saved to options for later resolution', function () {
    const options = parseOptions('mongodb+srv://server.example.com/');
    expect(options).has.property('srvHost', 'server.example.com');
    expect(options).has.property('tls', true);
  });

  it('ssl= can be used to set tls=false', function () {
    const options = parseOptions('mongodb+srv://server.example.com/?ssl=false');
    expect(options).has.property('srvHost', 'server.example.com');
    expect(options).has.property('tls', false);
  });

  it('tls= can be used to set tls=false', function () {
    const options = parseOptions('mongodb+srv://server.example.com/?tls=false');
    expect(options).has.property('srvHost', 'server.example.com');
    expect(options).has.property('tls', false);
  });

  it('ssl= can be used to set tls=true', function () {
    const options = parseOptions('mongodb+srv://server.example.com/?ssl=true');
    expect(options).has.property('srvHost', 'server.example.com');
    expect(options).has.property('tls', true);
  });

  it('tls= can be used to set tls=true', function () {
    const options = parseOptions('mongodb+srv://server.example.com/?tls=true');
    expect(options).has.property('srvHost', 'server.example.com');
    expect(options).has.property('tls', true);
  });

  it('supports ReadPreference option in url', function () {
    const options = parseOptions('mongodb://localhost/?readPreference=nearest');
    expect(options.readPreference).to.be.an.instanceof(ReadPreference);
    expect(options.readPreference.mode).to.equal('nearest');
  });

  it('supports ReadPreference option in object plain', function () {
    const options = parseOptions('mongodb://localhost', {
      readPreference: { mode: 'nearest', hedge: { enabled: true } }
    });
    expect(options.readPreference).to.be.an.instanceof(ReadPreference);
    expect(options.readPreference.mode).to.equal('nearest');
    expect(options.readPreference.hedge).to.include({ enabled: true });
  });

  it('supports ReadPreference option in object proper class', function () {
    const tag = { rack: 1 };
    const options = parseOptions('mongodb://localhost', {
      readPreference: new ReadPreference('nearest', [tag], { maxStalenessSeconds: 20 })
    });
    expect(options.readPreference).to.be.an.instanceof(ReadPreference);
    expect(options.readPreference.mode).to.equal('nearest');
    expect(options.readPreference.tags).to.be.an('array').that.includes(tag);
    expect(options.readPreference.maxStalenessSeconds).to.equal(20);
    // maxStalenessSeconds sets the minWireVersion
    expect(options.readPreference.minWireVersion).to.be.at.least(5);
  });

  it('should throw when given a readpreference options with an unsupported type', () => {
    expect(() => new MongoClient('mongodb://blah', { readPreference: 34 })).to.throw(
      MongoParseError,
      /Unknown ReadPreference value/
    );
    // Passing readPreference in URI will always be string
  });

  it('supports WriteConcern option in url', function () {
    const options = parseOptions('mongodb://localhost/?w=3');
    expect(options.writeConcern).to.be.an.instanceof(WriteConcern);
    expect(options.writeConcern.w).to.equal(3);
  });

  it('supports WriteConcern option in object plain', function () {
    const options = parseOptions('mongodb://localhost', {
      writeConcern: { w: 'majority', wtimeoutMS: 300 }
    });
    expect(options.writeConcern).to.be.an.instanceof(WriteConcern);
    expect(options.writeConcern.w).to.equal('majority');
    expect(options.writeConcern.wtimeout).to.equal(300);
  });

  it('supports WriteConcern option in object proper class', function () {
    const options = parseOptions('mongodb://localhost', {
      writeConcern: new WriteConcern(5, 200, true)
    });
    expect(options.writeConcern).to.be.an.instanceof(WriteConcern);
    expect(options.writeConcern.w).to.equal(5);
    expect(options.writeConcern.wtimeout).to.equal(200);
    expect(options.writeConcern.j).to.equal(true);
  });

  it('supports ReadConcern option in url', function () {
    const options = parseOptions('mongodb://localhost/?readConcernLevel=available');
    expect(options.readConcern).to.be.an.instanceof(ReadConcern);
    expect(options.readConcern.level).to.equal('available');
  });

  it('supports ReadConcern option in object plain', function () {
    const options = parseOptions('mongodb://localhost', {
      readConcern: { level: 'linearizable' }
    });
    expect(options.readConcern).to.be.an.instanceof(ReadConcern);
    expect(options.readConcern.level).to.equal('linearizable');
  });

  it('supports ReadConcern option in object proper class', function () {
    const options = parseOptions('mongodb://localhost', {
      readConcern: new ReadConcern('snapshot')
    });
    expect(options.readConcern).to.be.an.instanceof(ReadConcern);
    expect(options.readConcern.level).to.equal('snapshot');
  });

  it('supports Credentials option in url', function () {
    const options = parseOptions('mongodb://USERNAME:PASSWORD@localhost/');
    expect(options.credentials).to.be.an.instanceof(MongoCredentials);
    expect(options.credentials.username).to.equal('USERNAME');
    expect(options.credentials.password).to.equal('PASSWORD');
    expect(options.credentials.source).to.equal('admin');
  });

  it('supports Credentials option in url with db', function () {
    const options = parseOptions('mongodb://USERNAME:PASSWORD@localhost/foo');
    expect(options.credentials).to.be.an.instanceof(MongoCredentials);
    expect(options.credentials.username).to.equal('USERNAME');
    expect(options.credentials.password).to.equal('PASSWORD');
    expect(options.credentials.source).to.equal('foo');
  });

  it('supports Credentials option in auth object plain', function () {
    const options = parseOptions('mongodb://localhost/', {
      auth: { username: 'USERNAME', password: 'PASSWORD' }
    });
    expect(options.credentials).to.be.an.instanceof(MongoCredentials);
    expect(options.credentials.username).to.equal('USERNAME');
    expect(options.credentials.password).to.equal('PASSWORD');
  });

  it('transforms tlsAllowInvalidCertificates and tlsAllowInvalidHostnames correctly', function () {
    const optionsTrue = parseOptions('mongodb://localhost/', {
      tlsAllowInvalidCertificates: true,
      tlsAllowInvalidHostnames: true
    });
    expect(optionsTrue.rejectUnauthorized).to.equal(false);
    expect(optionsTrue.checkServerIdentity).to.be.a('function');
    expect(optionsTrue.checkServerIdentity()).to.equal(undefined);

    const optionsFalse = parseOptions('mongodb://localhost/', {
      tlsAllowInvalidCertificates: false,
      tlsAllowInvalidHostnames: false
    });
    expect(optionsFalse.rejectUnauthorized).to.equal(true);
    expect(optionsFalse.checkServerIdentity).to.equal(undefined);

    const optionsUndefined = parseOptions('mongodb://localhost/');
    expect(optionsUndefined.rejectUnauthorized).to.equal(undefined);
    expect(optionsUndefined.checkServerIdentity).to.equal(undefined);
  });

  describe('[tls certificate handling]', () => {
    before(() => {
      fs.writeFileSync('testCertKey.pem', 'cert key');
      fs.writeFileSync('testKey.pem', 'test key');
      fs.writeFileSync('testCert.pem', 'test cert');
    });

    after(() => {
      fs.unlinkSync('testCertKey.pem');
      fs.unlinkSync('testKey.pem');
      fs.unlinkSync('testCert.pem');
    });

    it('correctly sets the cert and key if only tlsCertificateKeyFile is provided', function () {
      const optsFromObject = parseOptions('mongodb://localhost/', {
        tlsCertificateKeyFile: 'testCertKey.pem'
      });
      expect(optsFromObject).to.have.property('cert', 'cert key');
      expect(optsFromObject).to.have.property('key', 'cert key');

      const optsFromUri = parseOptions('mongodb://localhost?tlsCertificateKeyFile=testCertKey.pem');
      expect(optsFromUri).to.have.property('cert', 'cert key');
      expect(optsFromUri).to.have.property('key', 'cert key');
    });

    it('correctly sets the cert and key if both tlsCertificateKeyFile and tlsCertificateFile is provided', function () {
      const optsFromObject = parseOptions('mongodb://localhost/', {
        tlsCertificateKeyFile: 'testKey.pem',
        tlsCertificateFile: 'testCert.pem'
      });
      expect(optsFromObject).to.have.property('cert', 'test cert');
      expect(optsFromObject).to.have.property('key', 'test key');

      const optsFromUri = parseOptions(
        'mongodb://localhost?tlsCertificateKeyFile=testKey.pem&tlsCertificateFile=testCert.pem'
      );
      expect(optsFromUri).to.have.property('cert', 'test cert');
      expect(optsFromUri).to.have.property('key', 'test key');
    });
  });

  it('throws an error if multiple tls parameters are not all set to the same value', () => {
    expect(() => parseOptions('mongodb://localhost?tls=true&tls=false')).to.throw(
      'All values of tls/ssl must be the same.'
    );
  });

  it('throws an error if multiple ssl parameters are not all set to the same value', () => {
    expect(() => parseOptions('mongodb://localhost?ssl=true&ssl=false')).to.throw(
      'All values of tls/ssl must be the same.'
    );
  });

  it('throws an error if tls and ssl parameters are not all set to the same value', () => {
    expect(() => parseOptions('mongodb://localhost?tls=true&ssl=false')).to.throw(
      'All values of tls/ssl must be the same.'
    );
    expect(() => parseOptions('mongodb://localhost?tls=false&ssl=true')).to.throw(
      'All values of tls/ssl must be the same.'
    );
  });

  it('correctly sets tls if multiple tls parameters are all set to the same value', () => {
    expect(parseOptions('mongodb://localhost?tls=true&tls=true')).to.have.property('tls', true);
    expect(parseOptions('mongodb://localhost?tls=false&tls=false')).to.have.property('tls', false);
  });

  it('correctly sets tls if multiple ssl parameters are all set to the same value', () => {
    expect(parseOptions('mongodb://localhost?ssl=true&ssl=true')).to.have.property('tls', true);
    expect(parseOptions('mongodb://localhost?ssl=false&ssl=false')).to.have.property('tls', false);
  });

  it('correctly sets tls if tls and ssl parameters are all set to the same value', () => {
    expect(parseOptions('mongodb://localhost?ssl=true&tls=true')).to.have.property('tls', true);
    expect(parseOptions('mongodb://localhost?ssl=false&tls=false')).to.have.property('tls', false);
  });

  it('transforms tlsInsecure correctly', function () {
    const optionsTrue = parseOptions('mongodb://localhost/', {
      tlsInsecure: true
    });
    expect(optionsTrue.rejectUnauthorized).to.equal(false);
    expect(optionsTrue.checkServerIdentity).to.be.a('function');
    expect(optionsTrue.checkServerIdentity()).to.equal(undefined);

    const optionsFalse = parseOptions('mongodb://localhost/', {
      tlsInsecure: false
    });
    expect(optionsFalse.rejectUnauthorized).to.equal(true);
    expect(optionsFalse.checkServerIdentity).to.equal(undefined);

    const optionsUndefined = parseOptions('mongodb://localhost/');
    expect(optionsUndefined.rejectUnauthorized).to.equal(undefined);
    expect(optionsUndefined.checkServerIdentity).to.equal(undefined);
  });

  describe('compressors', function () {
    it('can be set when passed in as an array in the options object', function () {
      const clientViaOpt = new MongoClient('mongodb://localhost', {
        compressors: ['zlib', 'snappy']
      });
      expect(clientViaOpt.options)
        .to.have.property('compressors')
        .deep.equal(['zlib', 'snappy', 'none']);
    });

    it('can be set when passed in as a comma-delimited string in the options object or URI', function () {
      const clientViaOpt = new MongoClient('mongodb://localhost', {
        compressors: 'zlib,snappy'
      });
      const clientViaUri = new MongoClient('mongodb://localhost?compressors=zlib,snappy');
      expect(clientViaOpt.options)
        .to.have.property('compressors')
        .deep.equal(['zlib', 'snappy', 'none']);
      expect(clientViaUri.options)
        .to.have.property('compressors')
        .deep.equal(['zlib', 'snappy', 'none']);
    });

    it('should validate that a string or an array of strings is provided as input', function () {
      expect(
        () =>
          new MongoClient('mongodb://localhost', {
            compressors: { zlib: true }
          })
      ).to.throw(/^compressors must be an array or a comma-delimited list of strings/);
    });

    it('should throw an error if an unrecognized compressor is specified', function () {
      const expectedErrRegex = /not a valid compression mechanism/;
      expect(
        () =>
          new MongoClient('mongodb://localhost', {
            compressors: ['invalid']
          })
      ).to.throw(expectedErrRegex);
      expect(
        () =>
          new MongoClient('mongodb://localhost', {
            compressors: 'invalid'
          })
      ).to.throw(expectedErrRegex);
      expect(() => new MongoClient('mongodb://localhost?compressors=invalid')).to.throw(
        expectedErrRegex
      );
    });
  });

  describe('serverApi', function () {
    it('is supported as a client option when it is a valid ServerApiVersion string', function () {
      const validVersions = Object.values(ServerApiVersion);
      expect(validVersions.length).to.be.at.least(1);
      for (const version of validVersions) {
        const result = parseOptions('mongodb://localhost/', {
          serverApi: version
        });
        expect(result).to.have.property('serverApi').deep.equal({ version });
      }
    });

    it('is supported as a client option when it is an object with a valid version property', function () {
      const validVersions = Object.values(ServerApiVersion);
      expect(validVersions.length).to.be.at.least(1);
      for (const version of validVersions) {
        const result = parseOptions('mongodb://localhost/', {
          serverApi: { version }
        });
        expect(result).to.have.property('serverApi').deep.equal({ version });
      }
    });

    it('is not supported as a client option when it is an invalid string', function () {
      expect(() =>
        parseOptions('mongodb://localhost/', {
          serverApi: 'bad'
        })
      ).to.throw(/^Invalid server API version=bad;/);
    });

    it('is not supported as a client option when it is a number', function () {
      expect(() =>
        parseOptions('mongodb://localhost/', {
          serverApi: 1
        })
      ).to.throw(/^Invalid `serverApi` property;/);
    });

    it('is not supported as a client option when it is an object without a specified version', function () {
      expect(() =>
        parseOptions('mongodb://localhost/', {
          serverApi: {}
        })
      ).to.throw(/^Invalid `serverApi` property;/);
    });

    it('is not supported as a client option when it is an object with an invalid specified version', function () {
      expect(() =>
        parseOptions('mongodb://localhost/', {
          serverApi: { version: 1 }
        })
      ).to.throw(/^Invalid server API version=1;/);
      expect(() =>
        parseOptions('mongodb://localhost/', {
          serverApi: { version: 'bad' }
        })
      ).to.throw(/^Invalid server API version=bad;/);
    });

    it('is not supported as a URI option even when it is a valid ServerApiVersion string', function () {
      expect(() => parseOptions('mongodb://localhost/?serverApi=1')).to.throw(
        'URI cannot contain `serverApi`, it can only be passed to the client'
      );
    });
  });

  describe('default options', () => {
    const doNotCheckEq = Symbol('do not check equality');
    const KNOWN_DEFAULTS = [
      ['connecttimeoutms', 30000],
      ['directconnection', false],
      ['forceserverobjectid', false],
      ['heartbeatfrequencyms', 10000],
      ['keepalive', true],
      ['keepaliveinitialdelay', 120000],
      ['localthresholdms', 15],
      ['maxidletimems', 0],
      ['maxpoolsize', 100],
      ['minpoolsize', 0],
      ['minheartbeatfrequencyms', 500],
      ['monitorcommands', false], // NODE-3513
      ['nodelay', true],
      ['raw', false],
      ['retryreads', true],
      ['retrywrites', true],
      ['serverselectiontimeoutms', 30000],
      ['sockettimeoutms', 0],
      ['waitqueuetimeoutms', 0],
      ['zlibcompressionlevel', 0],

      // map to objects that are not worth checking deep equality
      ['compressors', doNotCheckEq],
      ['readpreference', doNotCheckEq],
      ['pkfactory', doNotCheckEq]
    ];

    const findMatchingKey = (o, searchKey) => {
      return Object.keys(o).filter(key => {
        return key.toLowerCase() === searchKey;
      })[0];
    };

    it(`should define known defaults in client.options`, () => {
      const client = new MongoClient('mongodb://localhost');
      const clientOptions = client.options;

      for (const [optionName, value] of KNOWN_DEFAULTS) {
        const camelCaseName = findMatchingKey(clientOptions, optionName);
        expect(camelCaseName, `did not find a camelcase match for ${optionName}`).to.be.a('string');

        expect(clientOptions).to.have.property(camelCaseName);

        if (value !== doNotCheckEq) {
          expect(clientOptions).to.have.property(camelCaseName).that.deep.equals(value);
        }
      }
    });

    it('set monitorCommands to false (NODE-3513)', function () {
      const client = new MongoClient('mongodb://localhost');
      const clientOptions = client.options;

      expect(clientOptions).to.have.property('monitorCommands', false);
      expect(client.s.options).to.have.property('monitorCommands', false);
      expect(client).to.have.property('monitorCommands', false);
      const optionsSym = getSymbolFrom(client, 'options');
      expect(client[optionsSym]).to.have.property('monitorCommands', false);
    });

    it('respects monitorCommands option passed in', function () {
      const clientViaOpt = new MongoClient('mongodb://localhost', { monitorCommands: true });
      const clientViaUri = new MongoClient('mongodb://localhost?monitorCommands=true');

      const testTable = [
        [clientViaOpt, clientViaOpt.options],
        [clientViaUri, clientViaUri.options]
      ];

      for (const [client, clientOptions] of testTable) {
        expect(clientOptions).to.have.property('monitorCommands', true);
        expect(client.s.options).to.have.property('monitorCommands', true);
        expect(client).to.have.property('monitorCommands', true);
        const optionsSym = getSymbolFrom(client, 'options');
        expect(client[optionsSym]).to.have.property('monitorCommands', true);
      }
    });
  });

  context('when loadBalanced=true is in the URI', function () {
    it('sets the option', function () {
      const options = parseOptions('mongodb://a/?loadBalanced=true');
      expect(options.loadBalanced).to.be.true;
    });

    it('errors with multiple hosts', function () {
      const parse = () => {
        parseOptions('mongodb://a,b/?loadBalanced=true');
      };
      expect(parse).to.throw(/single host/);
    });

    it('errors with a replicaSet option', function () {
      const parse = () => {
        parseOptions('mongodb://a/?loadBalanced=true&replicaSet=test');
      };
      expect(parse).to.throw(/replicaSet/);
    });

    it('errors with a directConnection option', function () {
      const parse = () => {
        parseOptions('mongodb://a/?loadBalanced=true&directConnection=true');
      };
      expect(parse).to.throw(/directConnection/);
    });
  });

  context('when loadBalanced is in the options object', function () {
    it('errors when the option is true', function () {
      const parse = () => {
        parseOptions('mongodb://a/', { loadBalanced: true });
      };
      expect(parse).to.throw(/URI/);
    });

    it('errors when the option is false', function () {
      const parse = () => {
        parseOptions('mongodb://a/', { loadBalanced: false });
      };
      expect(parse).to.throw(/URI/);
    });
  });

  it('srvMaxHosts > 0 cannot be combined with LB or ReplicaSet', () => {
    expect(() => {
      new MongoClient('mongodb+srv://localhost?srvMaxHosts=2&replicaSet=repl');
    }).to.throw(MongoParseError, 'Cannot use srvMaxHosts option with replicaSet');
    expect(() => {
      new MongoClient('mongodb+srv://localhost?srvMaxHosts=2&loadBalanced=true');
    }).to.throw(MongoParseError, 'Cannot limit srv hosts with loadBalanced enabled');
    expect(() => {
      new MongoClient('mongodb+srv://localhost', { srvMaxHosts: 2, replicaSet: 'blah' });
    }).to.throw(MongoParseError, 'Cannot use srvMaxHosts option with replicaSet');
    expect(() => {
      new MongoClient('mongodb+srv://localhost?loadBalanced=true', { srvMaxHosts: 2 });
    }).to.throw(MongoParseError, 'Cannot limit srv hosts with loadBalanced enabled');

    // These should not throw.
    new MongoClient('mongodb+srv://localhost?srvMaxHosts=0&replicaSet=repl');
    new MongoClient('mongodb+srv://localhost', { srvMaxHosts: 0, replicaSet: 'blah' });
    new MongoClient('mongodb+srv://localhost?srvMaxHosts=0&loadBalanced=true');
    new MongoClient('mongodb+srv://localhost?loadBalanced=true', { srvMaxHosts: 0 });
  });

  it('srvServiceName and srvMaxHosts cannot be used on a non-srv connection string', () => {
    expect(() => {
      new MongoClient('mongodb://localhost?srvMaxHosts=2');
    }).to.throw(MongoParseError);
    expect(() => {
      new MongoClient('mongodb://localhost?srvMaxHosts=0');
    }).to.throw(MongoParseError);
    expect(() => {
      new MongoClient('mongodb://localhost', { srvMaxHosts: 0 });
    }).to.throw(MongoParseError);
    expect(() => {
      new MongoClient('mongodb://localhost?srvServiceName=abc');
    }).to.throw(MongoParseError);
    expect(() => {
      new MongoClient('mongodb://localhost', { srvMaxHosts: 2 });
    }).to.throw(MongoParseError);
    expect(() => {
      new MongoClient('mongodb://localhost', { srvServiceName: 'abc' });
    }).to.throw(MongoParseError);
  });

  it('srvServiceName should error if it is too long', async () => {
    const options = parseOptions('mongodb+srv://localhost.a.com', {
      srvServiceName: 'a'.repeat(255)
    });
    const error = await resolveSRVRecord(options).catch(error => error);
    expect(error).to.have.property('code', 'EBADNAME');
  });

  it('srvServiceName should not error if it is greater than 15 characters as long as the DNS query limit is not surpassed', async () => {
    const options = parseOptions('mongodb+srv://localhost.a.com', {
      srvServiceName: 'a'.repeat(16)
    });
    const error = await resolveSRVRecord(options).catch(error => error);

    // Nothing wrong with the name, just DNE
    expect(error).to.have.property('code', 'ENOTFOUND');
  });

  describe('dbName and authSource', () => {
    describe('in the URI', () => {
      it('should set the database name to the dbName in the uri', () => {
        const client = new MongoClient('mongodb://u:p@host/myDb');
        const db = client.db();
        expect(db).to.have.property('databaseName', 'myDb');
        expect(client).to.have.nested.property('options.credentials.source', 'myDb');
      });
      it('should set the database name to the uri pathname and respect the authSource option', () => {
        const client = new MongoClient('mongodb://u:p@host/myDb?authSource=myAuthDb');
        const db = client.db();
        expect(db).to.have.property('databaseName', 'myDb');
        expect(client).to.have.nested.property('options.credentials.source', 'myAuthDb');
      });
      it('should set the database name to the uri pathname and respect the authSource option in options object', () => {
        const client = new MongoClient('mongodb://u:p@host/myDb', { authSource: 'myAuthDb' });
        const db = client.db();
        expect(db).to.have.property('databaseName', 'myDb');
        expect(client).to.have.nested.property('options.credentials.source', 'myAuthDb');
      });
    });

    describe('in the options object', () => {
      it('should set the database name to the dbName in the options object', () => {
        const client = new MongoClient('mongodb://u:p@host', { dbName: 'myDb' });
        const db = client.db();
        expect(db).to.have.property('databaseName', 'myDb');
        expect(client).to.have.nested.property('options.credentials.source', 'myDb');
      });
      it('should set the database name to dbName and respect the authSource option', () => {
        const client = new MongoClient('mongodb://u:p@host?authSource=myAuthDb', {
          dbName: 'myDb'
        });
        const db = client.db();
        expect(db).to.have.property('databaseName', 'myDb');
        expect(client).to.have.nested.property('options.credentials.source', 'myAuthDb');
      });
      it('should set the database name to dbName and respect the authSource option in options object', () => {
        const client = new MongoClient('mongodb://u:p@host', {
          dbName: 'myDb',
          authSource: 'myAuthDb'
        });
        const db = client.db();
        expect(db).to.have.property('databaseName', 'myDb');
        expect(client).to.have.nested.property('options.credentials.source', 'myAuthDb');
      });

      it('should set the database name to dbName in options object and respect the authSource option in options object', () => {
        const client = new MongoClient('mongodb://u:p@host/myIgnoredDb', {
          dbName: 'myDb',
          authSource: 'myAuthDb'
        });
        const db = client.db();
        expect(db).to.have.property('databaseName', 'myDb');
        expect(client).to.have.nested.property('options.credentials.source', 'myAuthDb');
      });
    });
  });

  context('loggingOptions', function () {
    const expectedLoggingObject = {
      maxDocumentLength: 20,
      logDestination: new Writable()
    };

    before(() => {
      sinon.stub(MongoLogger, 'resolveOptions').callsFake(() => {
        return expectedLoggingObject;
      });
    });

    after(() => {
      sinon.restore();
    });

    it('assigns the parsed options to the mongoLoggerOptions option', function () {
      const client = new MongoClient('mongodb://localhost:27017');
      expect(client.options).to.have.property('mongoLoggerOptions').to.equal(expectedLoggingObject);
    });
  });
});
