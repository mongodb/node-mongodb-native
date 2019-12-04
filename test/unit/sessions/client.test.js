'use strict';

const expect = require('chai').expect;
const mock = require('mongodb-mock-server');

const test = {};
describe('Sessions', function() {
  describe('Client', function() {
    afterEach(() => mock.cleanup());
    beforeEach(() => {
      return mock.createServer().then(server => {
        test.server = server;
      });
    });

    it('should throw an exception if sessions are not supported', {
      metadata: { requires: { topology: 'single' } },
      test: function(done) {
        test.server.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(Object.assign({}, mock.DEFAULT_ISMASTER));
          } else if (doc.endSessions) {
            request.reply({ ok: 1 });
          }
        });

        const client = this.configuration.newClient(`mongodb://${test.server.uri()}/test`);
        client.connect(function(err, client) {
          expect(err).to.not.exist;
          expect(() => {
            client.startSession();
          }).to.throw(/Current topology does not support sessions/);

          client.close(done);
        });
      }
    });

    it('should return a client session when requested if the topology supports it', {
      metadata: { requires: { topology: 'single' } },

      test: function(done) {
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
        client.connect(function(err, client) {
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
