'use strict';
var test = require('./shared').assert;
var co = require('co');
var mockupdb = require('../mock');
var assign = require('../../lib/utils').assign;

describe('ReplSet (mocks)', function() {
  it('Should correctly print warning when non mongos proxy passed in seed list', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single'
      },
      ignore: { travis: true }
    },

    test: function(done) {
      var configuration = this.configuration;
      var MongoClient = configuration.require.MongoClient,
        ObjectId = configuration.require.ObjectId,
        Logger = configuration.require.Logger;

      // Contain mock server
      var mongos1 = null;
      var mongos2 = null;
      var running = true;

      // Default message fields
      var defaultFields = {
        ismaster: true,
        msg: 'isdbgrid',
        maxBsonObjectSize: 16777216,
        maxMessageSizeBytes: 48000000,
        maxWriteBatchSize: 1000,
        localTime: new Date(),
        maxWireVersion: 3,
        minWireVersion: 0,
        ok: 1
      };

      // Default message fields
      var defaultRSFields = {
        setName: 'rs',
        setVersion: 1,
        electionId: new ObjectId(),
        maxBsonObjectSize: 16777216,
        maxMessageSizeBytes: 48000000,
        maxWriteBatchSize: 1000,
        localTime: new Date(),
        maxWireVersion: 4,
        minWireVersion: 0,
        ok: 1,
        hosts: ['localhost:32000', 'localhost:32001', 'localhost:32002'],
        arbiters: ['localhost:32002']
      };

      // Primary server states
      var serverIsMaster = [assign({}, defaultFields), assign({}, defaultRSFields)];

      // Boot the mock
      co(function*() {
        mongos1 = yield mockupdb.createServer(52000, 'localhost');
        mongos2 = yield mockupdb.createServer(52001, 'localhost');

        // Mongos
        co(function*() {
          while (running) {
            var request = yield mongos1.receive();

            // Get the document
            var doc = request.document;
            if (doc.ismaster) {
              request.reply(serverIsMaster[0]);
            } else if (doc.insert) {
              request.reply({ ok: 1, n: doc.documents, lastOp: new Date() });
            }
          }
        }).catch(function() {});

        // Mongos
        co(function*() {
          while (running) {
            var request = yield mongos2.receive();

            // Get the document
            var doc = request.document;
            if (doc.ismaster) {
              request.reply(serverIsMaster[1]);
            } else if (doc.insert) {
              request.reply({ ok: 1, n: doc.documents, lastOp: new Date() });
            }
          }
        }).catch(function() {});

        var logger = Logger.currentLogger();
        Logger.setCurrentLogger(function(msg, state) {
          test.equal('warn', state.type);
          test.equal(
            'expected mongos proxy, but found replicaset member mongod for server localhost:52001',
            state.message
          );
        });

        MongoClient.connect('mongodb://localhost:52000,localhost:52001/test', function(
          err,
          client
        ) {
          Logger.setCurrentLogger(logger);
          test.equal(null, err);

          running = false;
          client.close();
          mongos1.destroy();
          mongos2.destroy();

          setTimeout(function() {
            done();
          }, 200);
        });
      }).catch(function() {});
    }
  });

  it('Should correctly print warning and error when no mongos proxies in seed list', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single'
      },
      ignore: { travis: true }
    },

    test: function(done) {
      var configuration = this.configuration;
      var MongoClient = configuration.require.MongoClient,
        ObjectId = configuration.require.ObjectId,
        Logger = configuration.require.Logger;

      // Contain mock server
      var mongos1 = null;
      var mongos2 = null;
      var running = true;

      // Default message fields
      var defaultRSFields = {
        setName: 'rs',
        setVersion: 1,
        electionId: new ObjectId(),
        maxBsonObjectSize: 16777216,
        maxMessageSizeBytes: 48000000,
        maxWriteBatchSize: 1000,
        localTime: new Date(),
        maxWireVersion: 4,
        minWireVersion: 0,
        ok: 1,
        hosts: ['localhost:32000', 'localhost:32001', 'localhost:32002'],
        arbiters: ['localhost:32002']
      };

      // Primary server states
      var serverIsMaster = [assign({}, defaultRSFields), assign({}, defaultRSFields)];

      // Boot the mock
      co(function*() {
        mongos1 = yield mockupdb.createServer(52002, 'localhost');
        mongos2 = yield mockupdb.createServer(52003, 'localhost');

        // Mongos
        co(function*() {
          while (running) {
            var request = yield mongos1.receive();

            // Get the document
            var doc = request.document;
            if (doc.ismaster) {
              request.reply(serverIsMaster[0]);
            } else if (doc.insert) {
              request.reply({ ok: 1, n: doc.documents, lastOp: new Date() });
            }
          }
        }).catch(function() {});

        // Mongos
        co(function*() {
          while (running) {
            var request = yield mongos2.receive();

            // Get the document
            var doc = request.document;
            if (doc.ismaster) {
              request.reply(serverIsMaster[1]);
            } else if (doc.insert) {
              request.reply({ ok: 1, n: doc.documents, lastOp: new Date() });
            }
          }
        }).catch(function() {});

        var warnings = [];

        var logger = Logger.currentLogger();
        Logger.setCurrentLogger(function(msg, state) {
          test.equal('warn', state.type);
          warnings.push(state);
        });

        MongoClient.connect('mongodb://localhost:52002,localhost:52003/test', function(err) {
          Logger.setCurrentLogger(logger);

          // Assert all warnings
          test.equal(
            'expected mongos proxy, but found replicaset member mongod for server localhost:52002',
            warnings[0].message
          );
          test.equal(
            'expected mongos proxy, but found replicaset member mongod for server localhost:52003',
            warnings[1].message
          );
          test.equal(
            'no mongos proxies found in seed list, did you mean to connect to a replicaset',
            warnings[2].message
          );
          test.equal(
            'seed list contains no mongos proxies, replicaset connections requires the parameter replicaSet to be supplied in the URI or options object, mongodb://server:port/db?replicaSet=name',
            warnings[3].message
          );
          // Assert error
          test.equal(
            'seed list contains no mongos proxies, replicaset connections requires the parameter replicaSet to be supplied in the URI or options object, mongodb://server:port/db?replicaSet=name',
            err.message
          );

          running = false;
          mongos1.destroy();
          mongos2.destroy();
          setTimeout(function() {
            done();
          }, 200);
        });
      }).catch(function() {});
    }
  });

  it('Should correctly set socketTimeoutMS and connectTimeoutMS for mongos', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single'
      }
    },

    test: function(done) {
      var configuration = this.configuration;
      var MongoClient = configuration.require.MongoClient;

      // Contain mock server
      var mongos1 = null;
      var mongos2 = null;
      var running = true;

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
      // Boot the mock
      co(function*() {
        mongos1 = yield mockupdb.createServer(12004, 'localhost');
        mongos2 = yield mockupdb.createServer(12005, 'localhost');

        // Mongos
        co(function*() {
          while (running) {
            var request = yield mongos1.receive();

            // Get the document
            var doc = request.document;

            if (doc.ismaster) {
              request.reply(serverIsMaster[0]);
            }
          }
        }).catch(function() {});

        // Mongos
        co(function*() {
          while (running) {
            var request = yield mongos2.receive();

            // Get the document
            var doc = request.document;

            if (doc.ismaster) {
              request.reply(serverIsMaster[0]);
            }
          }
        }).catch(function() {});

        MongoClient.connect(
          'mongodb://localhost:12004,localhost:12005/test?socketTimeoutMS=120000&connectTimeoutMS=15000',
          function(err, client) {
            test.equal(null, err);
            test.equal(15000, client.topology.s.mongos.s.options.connectionTimeout);
            test.equal(120000, client.topology.s.mongos.s.options.socketTimeout);

            client.close();
            mongos1.destroy();
            mongos2.destroy();
            running = false;

            setTimeout(function() {
              done();
            }, 200);
          }
        );
      }).catch(function() {});
    }
  });
});
