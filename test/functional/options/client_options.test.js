'use strict';

const { MongoClientOptions } = require('../../../src/options/client_options');
const { expect } = require('chai');

describe('MongoClientOptions', () => {
  context('.parse() [defaults]', () => {
    const d = {
      tls: false,
      ssl: false,
      tlsAllowInvalidCertificates: false,
      tlsAllowInvalidHostnames: false,
      tlsInsecure: false,
      connectTimeoutMS: 10000,
      socketTimeoutMS: 360000,
      compressors: [],
      zlibCompressionLevel: 0,
      maxPoolSize: 5,
      minPoolSize: 0,
      w: 1,
      readConcernLevel: 'local',
      readPreference: { mode: 'primary', tags: [] },
      authMechanism: 'DEFAULT',
      retryWrites: true,
      directConnection: true,
      poolSize: 5,
      sslValidate: false,
      autoReconnect: true,
      auto_reconnect: true,
      noDelay: true,
      keepAlive: true,
      keepAliveInitialDelay: 30000,
      family: null,
      reconnectTries: 30,
      reconnectInterval: 1000,
      ha: true,
      haInterval: 10000,
      secondaryAcceptableLatencyMS: 15,
      acceptableLatencyMS: 15,
      connectWithNoPrimary: false,
      forceServerObjectId: false,
      serializeFunctions: false,
      ignoreUndefined: false,
      raw: false,
      bufferMaxEntries: -1,
      pkFactory: undefined,
      promiseLibrary: undefined,
      loggerLevel: 'error',
      logger: undefined,
      promoteValues: true,
      promoteBuffers: false,
      promoteLongs: true,
      domainsEnabled: false,
      validateOptions: false,
      fsync: false,
      numberOfRetries: 5,
      monitorCommands: false,
      useNewUrlParser: true,
      useUnifiedTopology: false,
      autoEncryption: undefined,
      readConcern: { level: 'local' },
      writeConcern: { w: 1 }
    };
    it('should assert all defaults ', () => {
      const options = MongoClientOptions.parse('mongodb://localhost:8080');
      expect(options).to.deep.nested.include(d);
    });
  });

  context('.parse() [compressors/compression]', () => {
    it('parses compressors from uri', () => {
      const options = MongoClientOptions.parse('mongodb://localhost:8080?compressors=snappy');
      expect(options.compressors).to.deep.equal(['snappy']);
      expect(options.compression).to.equal('snappy');
    });

    it('parses compressors from uri + options', () => {
      const options = MongoClientOptions.parse('mongodb://localhost:8080?compressors=snappy', {
        compression: 'zlib'
      });
      expect(options.compressors).to.deep.equal(['snappy', 'zlib']);
      expect(options.compression).to.equal('snappy');
    });
  });
});
