'use strict';

const { expect } = require('chai');
const mock = require('../../tools/mongodb-mock/index');
const { isHello } = require('../../../src/utils');
const { MongoClient } = require('../../../src/mongo_client');

describe('Client (unit)', function () {
  let server, client;
  const isLegacyMongoClient = MongoClient.name === 'LegacyMongoClient';

  afterEach(async () => {
    await client.close();
    await mock.cleanup();
  });

  beforeEach(() => {
    return mock.createServer().then(_server => (server = _server));
  });

  it('should let wrapping libraries amend the client metadata', function () {
    let handshake;
    server.setMessageHandler(request => {
      const doc = request.document;
      if (isHello(doc)) {
        handshake = doc;
        request.reply(Object.assign({}, mock.HELLO));
      } else if (doc.endSessions) {
        request.reply({ ok: 1 });
      }
    });

    client = new MongoClient(`mongodb://${server.uri()}/`, {
      driverInfo: {
        name: 'mongoose',
        version: '5.7.10',
        platform: 'llama edition'
      }
    });

    return client.connect().then(() => {
      expect(handshake).to.have.nested.property('client.driver');
      expect(handshake)
        .nested.property('client.driver.name')
        // Currently the tests import either MongoClient or LegacyMongoClient, the latter of which overrides the client metadata
        // We still are confirming here that a third party wrapper can set the metadata but it will change depending on the
        // MongoClient constructor that is imported
        .to.equal(isLegacyMongoClient ? 'nodejs|mongodb-legacy|mongoose' : 'nodejs|mongoose');
      expect(handshake)
        .nested.property('client.driver.version')
        .to.match(/|5.7.10/);
      expect(handshake)
        .nested.property('client.platform')
        .to.match(/llama edition/);
    });
  });
});
