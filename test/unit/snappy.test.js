'use strict';

const expect = require('chai').expect;
const mock = require('mongodb-mock-server');
const snappy = optionalRequire('snappy');
const snappyVersion = optionalRequire('snappy/package.json').version;

function optionalRequire(mod) {
  try {
    return require(mod);
  } catch (_) {
    return false;
  }
}

describe('Compression', function() {
  let client;
  /** @type {mock.MockServer} */
  let server;
  before(function() {
    if (!snappy) this.skip();
    return mock.createServer().then(s => {
      server = s;
      client = this.configuration.newClient(`mongodb://${server.uri()}`, {
        compression: { compressors: ['snappy'] }
      });
    });
  });

  after(function() {
    return Promise.all([mock.cleanup(), client.close()]);
  });

  describe('Snappy', () => {
    it(`should compress messages sent with snappy ${snappyVersion}`, function() {
      // the timeout is being set because the test should not take any longer than 5 seconds,
      // and that if it doesn't complete, it will hang due to the callback never being called
      this.timeout(5000);

      server.setMessageHandler(request => {
        const doc = request.document;
        if (doc.ismaster || doc.hello) {
          return request.reply(
            Object.assign({}, mock.DEFAULT_ISMASTER, { compression: ['snappy'] })
          );
        }
        if (doc.insert === 'snappy') {
          return request.reply({ ok: 1 });
        }
      });
      // The mock server uses snappy to decode messages so
      // if this passes we implicitly test snappy is working
      // TODO(NODE-3560): Add more comprehensive round trip testing
      return client.connect().then(() => {
        return client
          .db()
          .collection('snappy')
          .insertOne({ a: 1 });
      });
    });

    it('should define a version number on the optional import', function() {
      const retrieveSnappy = require('../../lib/core/connection/utils').retrieveSnappy;
      const PKG_VERSION = require('../../lib/core/connection/utils').PKG_VERSION;
      const versionParts = snappyVersion.split('.').map(n => +n);
      const Snappy = retrieveSnappy();
      expect(Snappy)
        .to.have.property(PKG_VERSION)
        .that.is.an('object');
      expect(Snappy[PKG_VERSION]).to.have.property('major', versionParts[0]);
      expect(Snappy[PKG_VERSION]).to.have.property('minor', versionParts[1]);
      expect(Snappy[PKG_VERSION]).to.have.property('patch', versionParts[2]);
    });
  });
});
