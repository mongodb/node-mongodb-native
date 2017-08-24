'use strict';

var expect = require('chai').expect;
var assign = require('../../lib/utils').assign;
var co = require('co');
var mockupdb = require('../mock');

describe('Max Staleness', function() {
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
        ObjectId = self.configuration.require.ObjectId,
        ReadPreference = self.configuration.require.ReadPreference,
        Long = self.configuration.require.Long;

      // Contain mock server
      var mongos1 = null;
      var running = true;
      // Current index for the ismaster
      var currentStep = 0;
      // Primary stop responding
      var stopRespondingPrimary = false;

      // Default message fields
      var defaultFields = {
        ismaster: true,
        msg: 'isdbgrid',
        maxBsonObjectSize: 16777216,
        maxMessageSizeBytes: 48000000,
        maxWriteBatchSize: 1000,
        localTime: new Date(),
        maxWireVersion: 5,
        minWireVersion: 0,
        ok: 1
      };

      // Primary server states
      var serverIsMaster = [ assign({}, defaultFields) ];
      // Received command on server
      var command = null;
      // Boot the mock
      co(function*() {
        mongos1 = yield mockupdb.createServer(62001, 'localhost');

        // Mongos
        co(function*() {
          while (running) {
            var request = yield mongos1.receive();

            // Get the document
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
          }
        });

        MongoClient.connect(
          'mongodb://localhost:62001/test?readPreference=secondary&maxStalenessSeconds=250',
          function(err, client) {
            expect(err).to.not.exist;
            var db = client.db(self.configuration.db);

            db.collection('test').find({}).toArray(function(err, r) {
              expect(err).to.not.exist;
              expect(command).to.eql({
                $query: { find: 'test', filter: {} },
                $readPreference: { mode: 'secondary', maxStalenessSeconds: 250 }
              });

              client.close();
              mongos1.destroy();
              running = false;
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
        ObjectId = self.configuration.require.ObjectId,
        ReadPreference = self.configuration.require.ReadPreference,
        Long = self.configuration.require.Long;

      // Contain mock server
      var mongos1 = null;
      var running = true;
      // Current index for the ismaster
      var currentStep = 0;
      // Primary stop responding
      var stopRespondingPrimary = false;

      // Default message fields
      var defaultFields = {
        ismaster: true,
        msg: 'isdbgrid',
        maxBsonObjectSize: 16777216,
        maxMessageSizeBytes: 48000000,
        maxWriteBatchSize: 1000,
        localTime: new Date(),
        maxWireVersion: 5,
        minWireVersion: 0,
        ok: 1
      };

      // Primary server states
      var serverIsMaster = [assign({}, defaultFields)];
      // Received command on server
      var command = null;
      // Boot the mock
      co(function*() {
        mongos1 = yield mockupdb.createServer(62002, 'localhost');

        // Mongos
        co(function*() {
          while (running) {
            var request = yield mongos1.receive();

            // Get the document
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
          }
        });

        MongoClient.connect('mongodb://localhost:62002/test', function(err, client) {
          expect(err).to.not.exist;
          var db = client.db(self.configuration.db);

          // Get a db with a new readPreference
          var db1 = client.db('test', {
            readPreference: new ReadPreference('secondary', { maxStalenessSeconds: 250 })
          });

          db1.collection('test').find({}).toArray(function(err, r) {
            expect(err).to.not.exist;
            expect(command).to.eql({
              $query: { find: 'test', filter: {} },
              $readPreference: { mode: 'secondary', maxStalenessSeconds: 250 }
            });

            client.close();
            mongos1.destroy();
            running = false;
            done();
          });
        });
      });
    }
  });

  it('should correctly set maxStalenessSeconds on Mongos query using collection level readPreference', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single'
      }
    },

    test: function(done) {
      var self = this,
        MongoClient = self.configuration.require.MongoClient,
        ObjectId = self.configuration.require.ObjectId,
        ReadPreference = self.configuration.require.ReadPreference,
        Long = self.configuration.require.Long;

      // Contain mock server
      var mongos1 = null;
      var running = true;
      // Current index for the ismaster
      var currentStep = 0;
      // Primary stop responding
      var stopRespondingPrimary = false;

      // Default message fields
      var defaultFields = {
        ismaster: true,
        msg: 'isdbgrid',
        maxBsonObjectSize: 16777216,
        maxMessageSizeBytes: 48000000,
        maxWriteBatchSize: 1000,
        localTime: new Date(),
        maxWireVersion: 5,
        minWireVersion: 0,
        ok: 1
      };

      // Primary server states
      var serverIsMaster = [assign({}, defaultFields)];
      // Received command on server
      var command = null;
      // Boot the mock
      co(function*() {
        mongos1 = yield mockupdb.createServer(62003, 'localhost');

        // Mongos
        co(function*() {
          while (running) {
            var request = yield mongos1.receive();

            // Get the document
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
            .toArray(function(err, r) {
              expect(err).to.not.exist;
              expect(command).to.eql({
                $query: { find: 'test', filter: {} },
                $readPreference: { mode: 'secondary', maxStalenessSeconds: 250 }
              });

              client.close();
              mongos1.destroy();
              running = false;
              done();
            });
        });
      });
    }
  });

  it('should correctly set maxStalenessSeconds on Mongos query using cursor level readPreference', {
    metadata: {
      requires: {
        generators: true,
        topology: "single"
      }
    },

    test: function(done) {
      var self = this,
        MongoClient = self.configuration.require.MongoClient,
        ObjectId = self.configuration.require.ObjectId,
        ReadPreference = self.configuration.require.ReadPreference,
        Long = self.configuration.require.Long;

      // Contain mock server
      var mongos1 = null;
      var running = true;
      // Current index for the ismaster
      var currentStep = 0;
      // Primary stop responding
      var stopRespondingPrimary = false;

      // Default message fields
      var defaultFields = {
        "ismaster" : true,
        "msg" : "isdbgrid",
        "maxBsonObjectSize" : 16777216,
        "maxMessageSizeBytes" : 48000000,
        "maxWriteBatchSize" : 1000,
        "localTime" : new Date(),
        "maxWireVersion" : 5,
        "minWireVersion" : 0,
        "ok" : 1
      }

      // Primary server states
      var serverIsMaster = [assign({}, defaultFields)];
      // Received command on server
      var command = null;
      // Boot the mock
      co(function*() {
        mongos1 = yield mockupdb.createServer(62004, 'localhost');

        // Mongos
        co(function*() {
          while(running) {
            var request = yield mongos1.receive();

            // Get the document
            var doc = request.document;

            if(doc.ismaster) {
              request.reply(serverIsMaster[0]);
            } else if(doc['$query'] && doc['$readPreference']) {
              command = doc;
              request.reply({
                "waitedMS" : Long.ZERO,
                "cursor" : {
                  "id" : Long.ZERO,
                  "ns" : "test.t",
                  "firstBatch" : [ ]
                },
                "ok" : 1
              });
            }
          }
        });

        MongoClient.connect('mongodb://localhost:62004/test', function(err, client) {
          expect(err).to.not.exist;
          var db = client.db(self.configuration.db);
          var readPreference = new ReadPreference('secondary', { maxStalenessSeconds: 250 });

          // Get a db with a new readPreference
          db.collection('test').find({}).setReadPreference(readPreference).toArray(function(err, r) {
            expect(err).to.not.exist;
            expect(command).to.eql({
              '$query':  { find: 'test', filter: {} },
              '$readPreference': { mode: 'secondary', maxStalenessSeconds: 250 }
            });

            client.close();
            mongos1.destroy();
            running = false;
            done();
          });
        });
      });
    }
  });
});
