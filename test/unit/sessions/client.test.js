'use strict';

const expect = require('chai').expect;
const mock = require('../../tools/mock');
const { ReplSetFixture } = require('../core/common');

const test = {};
describe('Sessions - client/unit', function () {
  describe('Client', function () {
    afterEach(() => mock.cleanup());
    beforeEach(() => {
      return mock.createServer().then(server => {
        test.server = server;
      });
    });

    it('should throw an exception if sessions are not supported', {
      metadata: { requires: { topology: 'single' } },
      test: function (done) {
        test.server.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(Object.assign({}, mock.DEFAULT_ISMASTER));
          } else if (doc.endSessions) {
            request.reply({ ok: 1 });
          }
        });

        const client = this.configuration.newClient(`mongodb://${test.server.uri()}/test`);
        client.connect(function (err, client) {
          expect(err).to.not.exist;
          expect(() => {
            client.startSession();
          }).to.throw(/Current topology does not support sessions/);

          client.close(done);
        });
      }
    });

    it('should throw an exception if sessions are not supported on some servers', {
      metadata: { requires: { topology: 'single' } },
      test() {
        const replicaSetMock = new ReplSetFixture();
        let testClient;
        return replicaSetMock
          .setup({ doNotInitHandlers: true })
          .then(() => {
            replicaSetMock.firstSecondaryServer.setMessageHandler(request => {
              var doc = request.document;
              if (doc.ismaster) {
                const ismaster = replicaSetMock.firstSecondaryStates[0];
                ismaster.logicalSessionTimeoutMinutes = 20;
                request.reply(ismaster);
              } else if (doc.endSessions) {
                request.reply({ ok: 1 });
              }
            });

            replicaSetMock.secondSecondaryServer.setMessageHandler(request => {
              var doc = request.document;
              if (doc.ismaster) {
                const ismaster = replicaSetMock.secondSecondaryStates[0];
                ismaster.logicalSessionTimeoutMinutes = 10;
                request.reply(ismaster);
              } else if (doc.endSessions) {
                request.reply({ ok: 1 });
              }
            });

            replicaSetMock.arbiterServer.setMessageHandler(request => {
              var doc = request.document;
              if (doc.ismaster) {
                const ismaster = replicaSetMock.arbiterStates[0];
                ismaster.logicalSessionTimeoutMinutes = 30;
                request.reply(ismaster);
              } else if (doc.endSessions) {
                request.reply({ ok: 1 });
              }
            });

            replicaSetMock.primaryServer.setMessageHandler(request => {
              var doc = request.document;
              if (doc.ismaster) {
                const ismaster = replicaSetMock.primaryStates[0];
                ismaster.logicalSessionTimeoutMinutes = null;
                request.reply(ismaster);
              } else if (doc.endSessions) {
                request.reply({ ok: 1 });
              }
            });

            return replicaSetMock.uri();
          })
          .then(uri => {
            const client = this.configuration.newClient(uri);
            return client.connect();
          })
          .then(client => {
            testClient = client;
            expect(client.topology.s.description.logicalSessionTimeoutMinutes).to.not.exist;
            expect(() => {
              client.startSession();
            }).to.throw(/Current topology does not support sessions/);
          })
          .finally(() => (testClient ? testClient.close() : null));
      }
    });

    it('should return a client session when requested if the topology supports it', {
      metadata: { requires: { topology: 'single' } },

      test: function (done) {
        test.server.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(
              Object.assign({}, mock.DEFAULT_ISMASTER, {
                logicalSessionTimeoutMinutes: 10
              })
            );
          } else if (doc.endSessions) {
            request.reply({ ok: 1 });
          }
        });

        const client = this.configuration.newClient(`mongodb://${test.server.uri()}/test`);
        client.connect(function (err, client) {
          expect(err).to.not.exist;
          let session = client.startSession();
          expect(session).to.exist;

          session.endSession({ skipCommand: true });
          client.close(done);
        });
      }
    });
  });
});
