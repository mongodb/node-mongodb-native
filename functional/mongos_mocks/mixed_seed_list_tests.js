'use strict';
var expect = require('chai').expect,
    assign = require('../../../../lib/utils').assign,
    co = require('co'),
    mockupdb = require('../../../mock');

describe('Mongos Mixed Seed List (mocks)', function() {
  it('Should correctly print warning when non mongos proxy passed in seed list', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single'
      }
    },

    test: function(done) {
      var Mongos = this.configuration.mongo.Mongos,
          ObjectId = this.configuration.mongo.BSON.ObjectId,
          Logger = this.configuration.mongo.Logger;

      // Contain mock server
      var mongos1 = null;
      var mongos2 = null;
      var running = true;

      // Default message fields
      var defaultFields = {
        'ismaster': true,
        'msg': 'isdbgrid',
        'maxBsonObjectSize': 16777216,
        'maxMessageSizeBytes': 48000000,
        'maxWriteBatchSize': 1000,
        'localTime': new Date(),
        'maxWireVersion': 3,
        'minWireVersion': 0,
        'ok': 1
      };

      // Default message fields
      var defaultRSFields = {
        'setName': 'rs', 'setVersion': 1, 'electionId': new ObjectId(),
        'maxBsonObjectSize': 16777216, 'maxMessageSizeBytes': 48000000,
        'maxWriteBatchSize': 1000, 'localTime': new Date(), 'maxWireVersion': 4,
        'minWireVersion': 0, 'ok': 1, 'hosts': ['localhost:32000', 'localhost:32001', 'localhost:32002'], 'arbiters': ['localhost:32002']
      };

      // Primary server states
      var serverIsMaster = [assign({}, defaultFields), assign({}, defaultRSFields)];

      // Boot the mock
      co(function*() {
        mongos1 = yield mockupdb.createServer(52005, 'localhost');
        mongos2 = yield mockupdb.createServer(52006, 'localhost');

        // Mongos
        co(function*() {
          while (running) {
            var request = yield mongos1.receive();

            // Get the document
            var doc = request.document;
            if (doc.ismaster) {
              request.reply(serverIsMaster[0]);
            } else if (doc.insert) {
              request.reply({ok: 1, n: doc.documents, lastOp: new Date()});
            }
          }
        }).catch(function(err) {
        });

        // Mongos
        co(function*() {
          while (running) {
            var request = yield mongos2.receive();

            // Get the document
            var doc = request.document;
            if (doc.ismaster) {
              request.reply(serverIsMaster[1]);
            } else if (doc.insert) {
              request.reply({ok: 1, n: doc.documents, lastOp: new Date()});
            }
          }
        }).catch(function(err) {
        });

        // Attempt to connect
        var server = new Mongos([
          { host: 'localhost', port: 52005 },
          { host: 'localhost', port: 52006 }
        ], {
          connectionTimeout: 3000,
          socketTimeout: 1000,
          haInterval: 1000,
          localThresholdMS: 500,
          size: 1
        });

        var logger = Logger.currentLogger();
        Logger.setCurrentLogger(function(msg, state) {
          expect(state.type).to.equal('warn');
          expect(state.message)
            .to.equal('expected mongos proxy, but found replicaset member mongod for server localhost:52006');
        });

        // Add event listeners
        server.once('connect', function(_server) {
          Logger.setCurrentLogger(logger);

          running = false;
          server.destroy();
          mongos1.destroy();
          mongos2.destroy();
          done();
        });

        server.on('error', done);
        setTimeout(function() { server.connect(); }, 100);
      });
    }
  });

  /* change this to `it.skip` when that is fixed in metamocha
  it('Should correctly print warning and error when no mongos proxies in seed list', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single'
      }
    },

    test: function(done) {
      var Mongos = this.configuration.mongo.Mongos,
          Logger = this.configuration.mongo.Logger,
          ObjectId = this.configuration.mongo.BSON.ObjectId;

      // Contain mock server
      var mongos1 = null;
      var mongos2 = null;
      var running = true;

      // Default message fields
      var defaultRSFields = {
        'setName': 'rs', 'setVersion': 1, 'electionId': new ObjectId(),
        'maxBsonObjectSize': 16777216, 'maxMessageSizeBytes': 48000000,
        'maxWriteBatchSize': 1000, 'localTime': new Date(), 'maxWireVersion': 4,
        'minWireVersion': 0, 'ok': 1, 'hosts': ['localhost:32000', 'localhost:32001', 'localhost:32002'], 'arbiters': ['localhost:32002']
      };

      // Primary server states
      var serverIsMaster = [assign({}, defaultRSFields), assign({}, defaultRSFields)];

      // Boot the mock
      co(function*() {
        mongos1 = yield mockupdb.createServer(52002, 'localhost');
        mongos2 = yield mockupdb.createServer(52003, 'localhost');

        // Mongos
        co(function*() {
          console.log('running1');
          while (running) {
            var request = yield mongos1.receive();

            // Get the document
            var doc = request.document;
            if (doc.ismaster) {
              request.reply(serverIsMaster[0]);
            } else if (doc.insert) {
              request.reply({ok: 1, n: doc.documents, lastOp: new Date()});
            }
          }
        }).catch(function(err) {
        });

        // Mongos
        co(function*() {
          console.log('running2');
          while (running) {
            var request = yield mongos2.receive();

            // Get the document
            var doc = request.document;
            if (doc.ismaster) {
              request.reply(serverIsMaster[1]);
            } else if (doc.insert) {
              request.reply({ok: 1, n: doc.documents, lastOp: new Date()});
            }
          }
        }).catch(function(err) {
        });

        // Attempt to connect
        var server = new Mongos([
          { host: 'localhost', port: 52002 },
          { host: 'localhost', port: 52003 }
        ], {
          connectionTimeout: 3000,
          socketTimeout: 1000,
          haInterval: 1000,
          localThresholdMS: 500,
          size: 1
        });

        // Add event listeners
        server.once('connect', function(_server) {});

        var warnings = [];
        var logger = Logger.currentLogger();
        Logger.setCurrentLogger(function(msg, state) {
          console.log('pushed: ', state);
          expect(state.type).to.equal('warn');
          warnings.push(state);
        });

        server.on('error', function(err) {
          Logger.setCurrentLogger(logger);
          var errors = [
            'expected mongos proxy, but found replicaset member mongod for server localhost:52002',
            'expected mongos proxy, but found replicaset member mongod for server localhost:52003',
            'no mongos proxies found in seed list, did you mean to connect to a replicaset'
          ];

          expect(warnings).to.have.length(3);
          expect(warnings[0].message).to.be.oneOf(errors);
          expect(warnings[1].message).to.be.oneOf(errors);
          expect(warnings[2].message).to.be.oneOf(errors);

          running = false;
          server.destroy();
          mongos1.destroy();
          mongos2.destroy();
          done();
        });

        setTimeout(function() { server.connect(); }, 100);
      }).catch(function(err) {
      });
    }
  });
  */
});
