'use strict';
var expect = require('chai').expect;
var assign = require('../../lib/utils').assign;
var co = require('co');
var mock = require('../mock');

describe('Max Staleness', function() {
  afterEach(() => mock.cleanup());

  it('should correctly set maxStalenessSeconds on Mongos query using MongoClient.connect', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single'
      }
    },

    test: function(done) {
      var self = this,
        MongoClient = self.configuration.require.MongoClient,
        Long = self.configuration.require.Long;

      var defaultFields = assign({}, mock.DEFAULT_ISMASTER, {
        msg: 'isdbgrid'
      });

      // Primary server states
      var serverIsMaster = [assign({}, defaultFields)];
      // Received command on server
      var command = null;
      // Boot the mock
      co(function*() {
        const mongos1 = yield mock.createServer(62001, 'localhost');

        mongos1.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(serverIsMaster[0]);
          } else if (doc['$query'] && doc['$readPreference']) {
            command = doc;
            request.reply({
              waitedMS: Long.ZERO,
              cursor: {
                id: Long.ZERO,
                ns: 'test.t',
                firstBatch: []
              },
              ok: 1
            });
          }
        });

        MongoClient.connect(
          'mongodb://localhost:62001/test?readPreference=secondary&maxStalenessSeconds=250',
          function(err, client) {
            expect(err).to.not.exist;
            var db = client.db(self.configuration.db);

            db
              .collection('test')
              .find({})
              .toArray(function(err) {
                expect(err).to.not.exist;
                expect(command).to.eql({
                  $query: { find: 'test', filter: {} },
                  $readPreference: { mode: 'secondary', maxStalenessSeconds: 250 }
                });

                client.close();
                done();
              });
          }
        );
      });
    }
  });

  it('should correctly set maxStalenessSeconds on Mongos query using db level readPreference', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single'
      }
    },

    test: function(done) {
      var self = this,
        MongoClient = self.configuration.require.MongoClient,
        ReadPreference = self.configuration.require.ReadPreference,
        Long = self.configuration.require.Long;

      // Default message fields
      var defaultFields = assign({}, mock.DEFAULT_ISMASTER, {
        msg: 'isdbgrid'
      });

      // Primary server states
      var serverIsMaster = [assign({}, defaultFields)];
      // Received command on server
      var command = null;
      // Boot the mock
      co(function*() {
        const mongos1 = yield mock.createServer(62002, 'localhost');

        mongos1.setMessageHandler(request => {
          var doc = request.document;

          if (doc.ismaster) {
            request.reply(serverIsMaster[0]);
          } else if (doc['$query'] && doc['$readPreference']) {
            command = doc;
            request.reply({
              waitedMS: Long.ZERO,
              cursor: {
                id: Long.ZERO,
                ns: 'test.t',
                firstBatch: []
              },
              ok: 1
            });
          }
        });

        MongoClient.connect('mongodb://localhost:62002/test', function(err, client) {
          expect(err).to.not.exist;

          // Get a db with a new readPreference
          var db1 = client.db('test', {
            readPreference: new ReadPreference('secondary', { maxStalenessSeconds: 250 })
          });

          db1
            .collection('test')
            .find({})
            .toArray(function(err) {
              expect(err).to.not.exist;
              expect(command).to.eql({
                $query: { find: 'test', filter: {} },
                $readPreference: { mode: 'secondary', maxStalenessSeconds: 250 }
              });

              client.close();
              done();
            });
        });
      });
    }
  });

  it(
    'should correctly set maxStalenessSeconds on Mongos query using collection level readPreference',
    {
      metadata: {
        requires: {
          generators: true,
          topology: 'single'
        }
      },

      test: function(done) {
        var self = this,
          MongoClient = self.configuration.require.MongoClient,
          ReadPreference = self.configuration.require.ReadPreference,
          Long = self.configuration.require.Long;

        // Default message fields
        var defaultFields = assign({}, mock.DEFAULT_ISMASTER, {
          msg: 'isdbgrid'
        });

        // Primary server states
        var serverIsMaster = [assign({}, defaultFields)];
        // Received command on server
        var command = null;
        // Boot the mock
        co(function*() {
          const mongos1 = yield mock.createServer(62003, 'localhost');

          mongos1.setMessageHandler(request => {
            var doc = request.document;

            if (doc.ismaster) {
              request.reply(serverIsMaster[0]);
            } else if (doc['$query'] && doc['$readPreference']) {
              command = doc;
              request.reply({
                waitedMS: Long.ZERO,
                cursor: {
                  id: Long.ZERO,
                  ns: 'test.t',
                  firstBatch: []
                },
                ok: 1
              });
            }
          });

          MongoClient.connect('mongodb://localhost:62003/test', function(err, client) {
            expect(err).to.not.exist;
            var db = client.db(self.configuration.db);

            // Get a db with a new readPreference
            db
              .collection('test', {
                readPreference: new ReadPreference('secondary', { maxStalenessSeconds: 250 })
              })
              .find({})
              .toArray(function(err) {
                expect(err).to.not.exist;
                expect(command).to.eql({
                  $query: { find: 'test', filter: {} },
                  $readPreference: { mode: 'secondary', maxStalenessSeconds: 250 }
                });

                client.close();
                done();
              });
          });
        });
      }
    }
  );

  it('should correctly set maxStalenessSeconds on Mongos query using cursor level readPreference', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single'
      }
    },

    test: function(done) {
      var self = this,
        MongoClient = self.configuration.require.MongoClient,
        ReadPreference = self.configuration.require.ReadPreference,
        Long = self.configuration.require.Long;

      // Default message fields
      var defaultFields = assign({}, mock.DEFAULT_ISMASTER, {
        msg: 'isdbgrid'
      });

      // Primary server states
      var serverIsMaster = [assign({}, defaultFields)];
      // Received command on server
      var command = null;
      // Boot the mock
      co(function*() {
        const mongos1 = yield mock.createServer(62004, 'localhost');

        mongos1.setMessageHandler(request => {
          var doc = request.document;

          if (doc.ismaster) {
            request.reply(serverIsMaster[0]);
          } else if (doc['$query'] && doc['$readPreference']) {
            command = doc;
            request.reply({
              waitedMS: Long.ZERO,
              cursor: {
                id: Long.ZERO,
                ns: 'test.t',
                firstBatch: []
              },
              ok: 1
            });
          }
        });

        MongoClient.connect('mongodb://localhost:62004/test', function(err, client) {
          expect(err).to.not.exist;
          var db = client.db(self.configuration.db);
          var readPreference = new ReadPreference('secondary', { maxStalenessSeconds: 250 });

          // Get a db with a new readPreference
          db
            .collection('test')
            .find({})
            .setReadPreference(readPreference)
            .toArray(function(err) {
              expect(err).to.not.exist;
              expect(command).to.eql({
                $query: { find: 'test', filter: {} },
                $readPreference: { mode: 'secondary', maxStalenessSeconds: 250 }
              });

              client.close();
              done();
            });
        });
      });
    }
  });
});
