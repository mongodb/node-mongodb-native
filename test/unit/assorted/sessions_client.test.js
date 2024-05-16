'use strict';
const expect = require('chai').expect;
const mock = require('../../tools/mongodb-mock/index');
const { ReplSetFixture } = require('../../tools/common');
const { isHello } = require('../../mongodb');
const { MongoClient } = require('../../mongodb');

const test = {};
describe('Sessions - client/unit', function () {
  describe('Client', function () {
    afterEach(() => mock.cleanup());

    beforeEach(() => {
      return mock.createServer().then(server => {
        test.server = server;
      });
    });

    it('should not throw a synchronous exception if sessions are not supported', function () {
      test.server.setMessageHandler(request => {
        var doc = request.document;
        if (isHello(doc)) {
          request.reply(Object.assign({}, mock.HELLO));
        } else if (doc.endSessions) {
          request.reply({ ok: 1 });
        }
      });
      const client = new MongoClient(`mongodb://${test.server.uri()}/test`);
      return client.connect().then(() => {
        expect(() => client.startSession()).to.not.throw(
          'Current topology does not support sessions'
        );
        return client.close();
      });
    });

    it('should throw an exception if sessions are not supported on some servers', function () {
      const replicaSetMock = new ReplSetFixture();
      let testClient;
      return replicaSetMock
        .setup({ doNotInitHandlers: true })
        .then(() => {
          replicaSetMock.firstSecondaryServer.setMessageHandler(request => {
            var doc = request.document;
            if (isHello(doc)) {
              const hello = replicaSetMock.firstSecondaryStates[0];
              hello.logicalSessionTimeoutMinutes = 20;
              request.reply(hello);
            } else if (doc.endSessions) {
              request.reply({ ok: 1 });
            }
          });
          replicaSetMock.secondSecondaryServer.setMessageHandler(request => {
            var doc = request.document;
            if (isHello(doc)) {
              const hello = replicaSetMock.secondSecondaryStates[0];
              hello.logicalSessionTimeoutMinutes = 10;
              request.reply(hello);
            } else if (doc.endSessions) {
              request.reply({ ok: 1 });
            }
          });
          replicaSetMock.arbiterServer.setMessageHandler(request => {
            var doc = request.document;
            if (isHello(doc)) {
              const hello = replicaSetMock.arbiterStates[0];
              hello.logicalSessionTimeoutMinutes = 30;
              request.reply(hello);
            } else if (doc.endSessions) {
              request.reply({ ok: 1 });
            }
          });
          replicaSetMock.primaryServer.setMessageHandler(request => {
            var doc = request.document;
            if (isHello(doc)) {
              const hello = replicaSetMock.primaryStates[0];
              hello.logicalSessionTimeoutMinutes = null;
              request.reply(hello);
            } else if (doc.endSessions) {
              request.reply({ ok: 1 });
            }
          });
          return replicaSetMock.uri();
        })
        .then(uri => {
          testClient = new MongoClient(uri);
          return testClient.connect();
        })
        .then(client => {
          const session = client.startSession();
          return client.db().collection('t').insertOne({ a: 1 }, { session });
        })
        .then(() => {
          expect.fail('Expected an error to be thrown about not supporting sessions');
        })
        .catch(error => {
          expect(error.message).to.equal('Current topology does not support sessions');
        })
        .finally(() => (testClient ? testClient.close() : null));
    });

    it('should return a client session when requested if the topology supports it', function (done) {
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
