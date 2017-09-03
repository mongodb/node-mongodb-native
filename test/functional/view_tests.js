'use strict';
var expect = require('chai').expect,
  assign = require('../../lib/utils').assign;

describe('Views', function() {
  it('should successfully pass through collation to findAndModify command', {
    metadata: { requires: { generators: true, topology: 'single' } },

    test: function(done) {
      var self = this,
        MongoClient = self.configuration.mongo.MongoClient,
        co = require('co'),
        Long = self.configuration.mongo.Long,
        mockupdb = require('../mock');

      // Contain mock server
      var singleServer = null;
      var running = true;

      // Default message fields
      var defaultFields = {
        ismaster: true,
        maxBsonObjectSize: 16777216,
        maxMessageSizeBytes: 48000000,
        maxWriteBatchSize: 1000,
        localTime: new Date(),
        maxWireVersion: 5,
        minWireVersion: 0,
        ok: 1
      };

      // Primary server states
      var primary = [assign({}, defaultFields)];
      var commandResult = null;

      // Boot the mock
      co(function*() {
        singleServer = yield mockupdb.createServer(32000, 'localhost');

        // Primary state machine
        co(function*() {
          while (running) {
            var request = yield singleServer.receive();
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
            }
          }
        }).catch(function(err) {
          // console.log(err.stack);
        });

        var commandResult = null;

        // Connect to the mocks
        MongoClient.connect('mongodb://localhost:32000/test', function(err, client) {
          expect(err).to.not.exist;
          var db = client.db(self.configuration.db);

          // Simple findAndModify command returning the new document
          db.createCollection('test', { viewOn: 'users', pipeline: [{ $match: {} }] }, function(
            err,
            r
          ) {
            expect(err).to.not.exist;
            expect(commandResult).to.eql({
              create: 'test',
              viewOn: 'users',
              pipeline: [{ $match: {} }]
            });

            singleServer.destroy();
            running = false;

            client.close();
            done();
          });
        });
      });
    }
  });
});
