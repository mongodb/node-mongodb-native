'use strict';

const mock = require('mongodb-mock-server');
const expect = require('chai').expect;
const MongoServerSelectionError = require('../../lib/core/error').MongoServerSelectionError;

const minCompatErrMsg = `minimum wire version ${Number.MAX_SAFE_INTEGER -
  1}, but this version of the Node.js Driver requires at most 13`;
const maxCompatErrMsg = `reports maximum wire version 1, but this version of the Node.js Driver requires at least 2`;

describe('Wire Protocol Version', () => {
  let server;

  function setWireProtocolMessageHandler(min, max) {
    server.setMessageHandler(req => {
      const doc = req.document;
      if (doc.ismaster || doc.hello) {
        const hello = Object.assign({}, mock.DEFAULT_ISMASTER_36, {
          minWireVersion: min,
          maxWireVersion: max
        });
        return req.reply(hello);
      }
    });
  }

  beforeEach(() => {
    return mock.createServer().then(s => {
      server = s;
    });
  });
  afterEach(() => {
    return mock.cleanup();
  });

  describe('minimum is greater than 13', () => {
    it('should raise a compatibility error', function() {
      setWireProtocolMessageHandler(Number.MAX_SAFE_INTEGER - 1, Number.MAX_SAFE_INTEGER);

      const client = this.configuration.newClient(
        `mongodb://${server.uri()}/wireVersionTest?serverSelectionTimeoutMS=200`
      );
      return client
        .connect()
        .then(() => {
          expect.fail('should fail to select server!');
        })
        .catch(error => {
          expect(error).to.be.instanceOf(MongoServerSelectionError);
          expect(error)
            .to.have.property('message')
            .that.includes(minCompatErrMsg);
        });
    });
  });

  describe('maximum is less than 2', () => {
    it('should raise a compatibility error', function() {
      setWireProtocolMessageHandler(1, 1);

      const client = this.configuration.newClient(
        `mongodb://${server.uri()}/wireVersionTest?serverSelectionTimeoutMS=200`
      );
      return client
        .connect()
        .then(() => {
          expect.fail('should fail to select server!');
        })
        .catch(error => {
          expect(error).to.be.instanceOf(MongoServerSelectionError);
          expect(error)
            .to.have.property('message')
            .that.includes(maxCompatErrMsg);
        });
    });
  });
});
