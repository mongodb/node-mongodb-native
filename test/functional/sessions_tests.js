'use strict';

const MongoClient = require('../..').MongoClient;
const expect = require('chai').expect;
const assign = require('../../lib/utils').assign;
const mock = require('../mock');

const test = {};
describe('Sessions', function() {
  describe('unit', function() {
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
            request.reply(assign({}, mock.DEFAULT_ISMASTER));
          }
        });

        MongoClient.connect(`mongodb://${test.server.uri()}/test`, function(err, client) {
          expect(err).to.not.exist;
          expect(() => {
            client.startSession();
          }).to.throw(/Current topology does not support sessions/);

          client.close();
          done();
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
              assign({}, mock.DEFAULT_ISMASTER, {
                logicalSessionTimeoutMinutes: 10
              })
            );
          }
        });

        MongoClient.connect(`mongodb://${test.server.uri()}/test`, function(err, client) {
          expect(err).to.not.exist;
          let session = client.startSession();
          expect(session).to.exist;

          client.close();
          done();
        });
      }
    });
  });
});
