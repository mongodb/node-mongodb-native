'use strict';

const { expect } = require('chai');
const { parseOptions } = require('../../src/mongo_client_options');
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
      directConnection: false,
      domainsEnabled: false
    });
    expect(options.directConnection).to.be.true;
    expect(options.domainsEnabled).to.be.false;
    expect(options.hosts).to.have.length(1);
    expect(options.dbName).to.equal('test');
    expect(options.prototype).to.not.exist;
  });

  it('pool size renames', function () {
    const options = parseOptions('mongodb://localhost:27017', { minSize: 2, poolSize: 4 });
    expect(options).to.not.have.property('minSize');
    expect(options).to.not.have.property('poolSize');
    expect(options).to.have.property('maxPoolSize', 4);
    expect(options).to.have.property('minPoolSize', 2);
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
    expect(options).to.have.property('ca', 'tlsCAFile');
    expect(options).to.have.property('crl', 'sslCRL');
    expect(options).to.have.property('cert', 'tlsCertificateFile');
    expect(options).to.have.property('key');
    expect(options.key).to.have.length(2);
    expect(options).to.have.property('passphrase', 'tlsCertificateKeyFilePassword');
    expect(options).to.have.property('rejectUnauthorized', false);
    expect(options).to.have.property('tls', true);
  });

  const ALL_OPTIONS = {
    appName: 'cats',
    auth: { user: 'username', pass: 'password' },
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
    domainsEnabled: false,
    driverInfo: { name: 'MyDriver', platform: 'moonOS' },
    family: 6,
    fieldsAsRaw: { rawField: true },
    forceServerObjectId: true,
    fsync: true,
    gssapiServiceName: 'gssapiService',
    ha: true,
    haInterval: 3,
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
    minSize: 3,
    monitorCommands: true,
    noDelay: true,
    numberOfRetries: 3,
    pkFactory: {
      createPk() {
        return 'very unique';
      }
    },
    poolSize: 4,
    promiseLibrary: global.Promise,
    promoteBuffers: true,
    promoteLongs: false,
    promoteValues: false,
    raw: true,
    readConcern: new ReadConcern(ReadConcern.AVAILABLE),
    readConcernLevel: ReadConcern.LINEARIZABLE,
    readPreference: ReadPreference.primary,
    readPreferenceTags: [{ loc: 'ny' }],
    reconnectInterval: 3,
    reconnectTries: 3,
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
    tlsInsecure: true,
    validateOptions: true,
    w: 'majority',
    waitQueueMultiple: 3,
    waitQueueTimeoutMS: 3,
    writeConcern: new WriteConcern(2),
    wtimeout: 5,
    wtimeoutMS: 6,
    zlibCompressionLevel: 2
  };

  it('All options', function () {
    const options = parseOptions('mongodb://localhost:27017/', ALL_OPTIONS);

    // Check consolidated options
    expect(options).to.have.property('writeConcern');
    expect(options.writeConcern).to.have.property('w', 2);
    expect(options.writeConcern).to.have.property('fsync', true);
    expect(options.writeConcern).to.have.property('j', true);
  });

  const allURIOptions =
    'mongodb://localhost:27017/test?' +
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
      'tlsInsecure=true',
      'w=majority',
      'waitQueueTimeoutMS=2',
      'wTimeoutMS=2',
      'zlibCompressionLevel=2'
    ].join('&');

  it('All URI options', function () {
    const options = parseOptions(allURIOptions);
    console.log(options);
  });

  it('srv', function () {
    const options = parseOptions('mongodb+srv://server.example.com/');
    expect(options).to.have.property('srv', true);
  });
});
