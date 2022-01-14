'use strict';

const mock = require('../../tools/mongodb-mock/index');
const { expect } = require('chai');
const { MongoServerSelectionError, MongoClient } = require('../../../src');
const { isHello } = require('../../../src/utils');

const minCompatErrMsg = `minimum wire version ${
  Number.MAX_SAFE_INTEGER - 1
}, but this version of the Node.js Driver requires at most 14`;
const maxCompatErrMsg = `reports maximum wire version 1, but this version of the Node.js Driver requires at least 6`;

describe('Wire Protocol Version', () => {
  /** @type {mock.MockServer} */
  let server, client;

  function setWireProtocolMessageHandler(min, max) {
    server.setMessageHandler(req => {
      const doc = req.document;
      if (isHello(doc)) {
        const hello = {
          ...mock.HELLO,
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

  describe('minimum is greater than 14', () => {
    it('should raise a compatibility error', async function () {
      setWireProtocolMessageHandler(Number.MAX_SAFE_INTEGER - 1, Number.MAX_SAFE_INTEGER);

      /** @type {MongoClient} */
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

      /** @type {MongoClient} */
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
