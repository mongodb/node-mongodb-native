'use strict';

const { expect } = require('chai');
const { parseOptions } = require('../../src/connection_string');
const { ReadConcern } = require('../../src/read_concern');
const { WriteConcern } = require('../../src/write_concern');
const { ReadPreference } = require('../../src/read_preference');
const { Logger } = require('../../src/logger');

describe('MongoOptions', function () {
  it('parseOptions should always return frozen object', function () {
    expect(parseOptions('mongodb://localhost:27017')).to.be.frozen;
  });

  it('test simple', function () {
    const options = parseOptions('mongodb://localhost:27017/test?directConnection=true', {
      directConnection: false
    });
    expect(options.directConnection).to.be.true;
    expect(options.hosts).has.length(1);
    expect(options.dbName).to.equal('test');
    expect(options.prototype).to.not.exist;
  });

  it('tls renames', function () {
    const options = parseOptions('mongodb://localhost:27017/?ssl=true', {
      tlsCertificateKeyFile: [{ pem: 'pem' }, { pem: 'pem2', passphrase: 'passphrase' }],
      tlsCertificateFile: 'tlsCertificateFile',
      tlsCAFile: 'tlsCAFile',
      sslCRL: 'sslCRL',
      tlsCertificateKeyFilePassword: 'tlsCertificateKeyFilePassword',
      sslValidate: false
    });

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
    expect(options).has.property('ca', 'tlsCAFile');
    expect(options).has.property('crl', 'sslCRL');
    expect(options).has.property('cert', 'tlsCertificateFile');
    expect(options).has.property('key');
    expect(options.key).has.length(2);
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
    compression: 'zlib',
    compressors: 'snappy', // TODO
    connectTimeoutMS: 123,
    directConnection: true,
    dbName: 'test',
    driverInfo: { name: 'MyDriver', platform: 'moonOS' },
    family: 6,
    fieldsAsRaw: { rawField: true },
    forceServerObjectId: true,
    fsync: true,
    gssapiServiceName: 'gssapiService',
    heartbeatFrequencyMS: 3,
    ignoreUndefined: false,
    j: true,
    journal: false,
    keepAlive: true,
    keepAliveInitialDelay: 3,
    localThresholdMS: 3,
    logger: new Logger('Testing!'),
    loggerLevel: 'info',
    maxIdleTimeMS: 3,
    maxPoolSize: 2,
    maxStalenessSeconds: 3,
    minInternalBufferSize: 0,
    minPoolSize: 1,
    monitorCommands: true,
    noDelay: true,
    numberOfRetries: 3,
    pkFactory: {
      createPk() {
        return 'very unique';
      }
    },
    promiseLibrary: global.Promise,
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
    serverSelectionTryOnce: true,
    servername: 'some tls option',
    socketTimeoutMS: 3,
    ssl: true,
    sslCA: 'ca',
    sslCert: 'cert',
    sslCRL: 'crl',
    sslKey: 'key',
    sslPass: 'pass',
    sslValidate: true,
    tls: false,
    tlsAllowInvalidCertificates: true,
    tlsAllowInvalidHostnames: true,
    tlsCAFile: 'tls-ca',
    tlsCertificateKeyFile: 'tls-key',
    tlsCertificateKeyFilePassword: 'tls-pass',
    // tlsInsecure: true,
    w: 'majority',
    waitQueueTimeoutMS: 3,
    writeConcern: new WriteConcern(2),
    wtimeout: 5,
    wtimeoutMS: 6,
    zlibCompressionLevel: 2
  };

  it('All options', function () {
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
      'serverSelectionTryOnce=true',
      'socketTimeoutMS=2',
      'ssl=true',
      'tls=true',
      'tlsAllowInvalidCertificates=true',
      'tlsAllowInvalidHostnames=true',
      'tlsCAFile=CA_FILE',
      'tlsCertificateKeyFile=KEY_FILE',
      'tlsCertificateKeyFilePassword=PASSWORD',
      // 'tlsDisableCertificateRevocationCheck=true', // not implemented
      // 'tlsDisableOCSPEndpointCheck=true', // not implemented
      // 'tlsInsecure=true',
      'w=majority',
      'waitQueueTimeoutMS=2',
      'wTimeoutMS=2',
      'zlibCompressionLevel=2'
    ].join('&');

  it('All URI options', function () {
    const options = parseOptions(allURIOptions);
    expect(options).has.property('zlibCompressionLevel', 2);

    expect(options).has.property('writeConcern');
    expect(options.writeConcern).has.property('w', 'majority');
    expect(options.writeConcern).has.property('wtimeout', 2);
  });

  it('srv', function () {
    const options = parseOptions('mongodb+srv://server.example.com/');
    expect(options).has.property('srv', true);
  });
});
