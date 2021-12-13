'use strict';

const { expect } = require('chai');
const mock = require('../tools/mongodb-mock/index');

const snappy = optionalRequire('snappy');
const snappyVersion = optionalRequire('snappy/package.json').version;
const { MongoClient } = require('../../src');
const { isHello } = require('../../src/utils');

function optionalRequire(mod) {
  try {
    return require(mod);
  } catch {
    return false;
  }
}

describe('Compression', function () {
  let client;
  /** @type {mock.MockServer} */
  let server;
  before(async function () {
    if (!snappy) return this.skip();
    server = await mock.createServer();
    client = new MongoClient(`mongodb://${server.uri()}`, { compressors: 'snappy' });
  });

  after(async function () {
    if (server) await mock.cleanup();
    if (client) await client.close();
  });

  describe('Snappy', () => {
    it(`should compress messages sent with snappy ${snappyVersion}`, async function () {
      // the timeout is being set because the test should not take any longer than 5 seconds,
      // and that if it doesn't complete, it will hang due to the callback never being called
      this.timeout(5000);

      server.setMessageHandler(request => {
        const doc = request.document;
        if (isHello(doc)) {
          return request.reply({ ...mock.HELLO, compression: ['snappy'] });
        }
        if (doc.insert === 'snappy') {
          return request.reply({ ok: 1 });
        }
      });
      // The mock server uses snappy to decode messages so
      // if this passes we implicitly test snappy is working
      // TODO(NODE-3560): Add more comprehensive round trip testing
      await client.connect();
      await client.db().collection('snappy').insertOne({ a: 1 });
    });

    it('should define a version number on the optional import', function () {
      const { Snappy, PKG_VERSION } = require('../../src/deps');
      const [major, minor, patch] = snappyVersion.split('.').map(n => +n);
      expect(Snappy).to.have.property(PKG_VERSION).that.is.an('object');
      expect(Snappy[PKG_VERSION]).to.have.property('major', major);
      expect(Snappy[PKG_VERSION]).to.have.property('minor', minor);
      expect(Snappy[PKG_VERSION]).to.have.property('patch', patch);
    });
  });
});
