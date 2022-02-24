'use strict';

const expect = require('chai').expect;
const mock = require('../../tools/mongodb-mock/index');
const { isHello } = require('../../../src/utils');
const { MongoClient } = require('../../../src');

const test = {};
describe('Sessions - client/unit', function () {
  describe('Client', function () {
    afterEach(() => mock.cleanup());
    beforeEach(() => {
      return mock.createServer().then(server => {
        test.server = server;
      });
    });

    it('should return a client session when requested', function (done) {
      test.server.setMessageHandler(request => {
        var doc = request.document;
        if (isHello(doc)) {
          request.reply(
            Object.assign({}, mock.HELLO, {
              logicalSessionTimeoutMinutes: 10
            })
          );
        } else if (doc.endSessions) {
          request.reply({ ok: 1 });
        }
      });

      const client = new MongoClient(`mongodb://${test.server.uri()}/test`);
      client.connect(function (err, client) {
        expect(err).to.not.exist;
        let session = client.startSession();
        expect(session).to.exist;

        session.endSession({ skipCommand: true });
        client.close(done);
      });
    });
  });
});
