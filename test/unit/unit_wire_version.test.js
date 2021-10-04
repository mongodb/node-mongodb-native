'use strict';

const mock = require('../tools/mock');
const { expect } = require('chai');
const { MongoServerSelectionError, MongoClient } = require('../../src');

const minCompatErrMsg = `minimum wire version ${
  Number.MAX_SAFE_INTEGER - 1
}, but this version of the Node.js Driver requires at most 13`;
const maxCompatErrMsg = `reports maximum wire version 1, but this version of the Node.js Driver requires at least 2`;

describe('Wire Protocol Version', () => {
  /** @type {mock.MockServer} */
  let server, client;

  function setWireProtocolMessageHandler(min, max) {
    server.setMessageHandler(req => {
      const doc = req.document;
      if (doc.ismaster || doc.hello) {
        const hello = {
          ...mock.DEFAULT_ISMASTER_36,
          minWireVersion: min,
          maxWireVersion: max
        };
        return req.reply(hello);
      }
    });
  }

  beforeEach(async () => {
    server = await mock.createServer();
  });
  afterEach(async () => {
    await client.close();
    await mock.cleanup();
  });

  describe('minimum is greater than 13', () => {
    it('should raise a compatibility error', async function () {
      setWireProtocolMessageHandler(Number.MAX_SAFE_INTEGER - 1, Number.MAX_SAFE_INTEGER);

      /** @type {import('../../src/mongo_client').MongoClient} */
      client = new MongoClient(
        `mongodb://${server.uri()}/wireVersionTest?serverSelectionTimeoutMS=200`
      );
      try {
        await client.connect();
        expect.fail('should fail to select server!');
      } catch (error) {
        expect(error).to.be.instanceOf(MongoServerSelectionError);
        expect(error).to.have.property('message').that.includes(minCompatErrMsg);
      }
    });
  });

  describe('maximum is less than 2', () => {
    it('should raise a compatibility error', async function () {
      setWireProtocolMessageHandler(1, 1);

      /** @type {import('../../src/mongo_client').MongoClient} */
      client = new MongoClient(
        `mongodb://${server.uri()}/wireVersionTest?serverSelectionTimeoutMS=200`
      );
      try {
        await client.connect();
        expect.fail('should fail to select server!');
      } catch (error) {
        expect(error).to.be.instanceOf(MongoServerSelectionError);
        expect(error).to.have.property('message').that.includes(maxCompatErrMsg);
      }
    });
  });
});
