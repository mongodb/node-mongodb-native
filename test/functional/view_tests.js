'use strict';
var expect = require('chai').expect,
  assign = require('../../lib/utils').assign,
  mock = require('../mock'),
  co = require('co');

describe('Views', function() {
  it('should successfully pass through collation to findAndModify command', {
    metadata: { requires: { generators: true, topology: 'single' } },

    test: function(done) {
      var self = this,
        MongoClient = self.configuration.mongo.MongoClient,
        Long = self.configuration.mongo.Long;

      // Default message fields
      var defaultFields = assign({}, mock.DEFAULT_ISMASTER);

      // Primary server states
      var primary = [assign({}, defaultFields)];

      // Boot the mock
      co(function*() {
        const singleServer = yield mock.createServer();

        singleServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(primary[0]);
          } else if (doc.listCollections) {
            request.reply({
              ok: 1,
              cursor: {
                id: Long.fromNumber(0),
                ns: 'test.cmd$.listCollections',
                firstBatch: []
              }
            });
          } else if (doc.create) {
            commandResult = doc;
            request.reply({ ok: 1 });
          } else if (doc.endSessions) {
            request.reply({ ok: 1 });
          }
        });

        var commandResult = null;

        // Connect to the mocks
        MongoClient.connect(`mongodb://${singleServer.uri()}/test`, function(err, client) {
          expect(err).to.not.exist;
          var db = client.db(self.configuration.db);

          // Simple findAndModify command returning the new document
          db.createCollection('test', { viewOn: 'users', pipeline: [{ $match: {} }] }, function(
            err,
            r
          ) {
            expect(r).to.exist;
            expect(err).to.not.exist;
            expect(commandResult).to.eql({
              create: 'test',
              viewOn: 'users',
              pipeline: [{ $match: {} }]
            });

            client.close();
            done();
          });
        });
      });
    }
  });
});
