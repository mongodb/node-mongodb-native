'use strict';
var expect = require('chai').expect,
  f = require('util').format,
  co = require('co'),
  assign = require('../../../../lib/utils').assign,
  mockupdb = require('../../../mock');

var timeoutPromise = function(timeout) {
  return new Promise(function(resolve) {
    setTimeout(function() {
      resolve();
    }, timeout);
  });
};

describe('Mongos Single Proxy Connection (mocks)', function() {
  it('Should correctly timeout mongos socket operation and then correctly re-execute', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single'
      }
    },

    test: function(done) {
      var Mongos = this.configuration.mongo.Mongos;

      // Contain mock server
      var server = null;
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
        maxWireVersion: 3,
        minWireVersion: 0,
        ok: 1
      };

      // Primary server states
      var serverIsMaster = [assign({}, defaultFields)];

      // Boot the mock
      co(function*() {
        server = yield mockupdb.createServer(52017, 'localhost');

        // Primary state machine
        co(function*() {
          while (running) {
            var request = yield server.receive();

            // Get the document
            var doc = request.document;

            if (doc.ismaster && currentStep === 0) {
              request.reply(serverIsMaster[0]);
              currentStep += 1;
            } else if (doc.insert && currentStep === 1) {
              // Stop responding to any calls (emulate dropping packets on the floor)
              if (stopRespondingPrimary) {
                currentStep += 1;
                stopRespondingPrimary = false;
                // Timeout after 1500 ms
                yield timeoutPromise(1500);
                request.connection.destroy();
              }
            } else if (doc.ismaster) {
              request.reply(serverIsMaster[0]);
            } else if (doc.insert && currentStep === 2) {
              request.reply({ ok: 1, n: doc.documents, lastOp: new Date() });
            }
          }
        }).catch(function() {});

        // Start dropping the packets
        setTimeout(function() {
          stopRespondingPrimary = true;
        }, 500);
      }).catch(function() {});

      // Attempt to connect
      var _server = new Mongos([{ host: 'localhost', port: 52017 }], {
        connectionTimeout: 3000,
        socketTimeout: 1000,
        haInterval: 500,
        size: 1
      });

      // Are we done
      var finished = false;

      // Add event listeners
      _server.once('connect', function() {
        // Run an interval
        var intervalId = setInterval(function() {
          _server.insert('test.test', [{ created: new Date() }], function(err, r) {
            if (r && !finished) {
              finished = true;
              clearInterval(intervalId);
              expect(r.connection.port).to.equal(52017);
              running = false;
              server.destroy();
              done();
            }
          });
        }, 500);
      });

      _server.on('error', done);
      _server.connect();
    }
  });

  it('Should not fail due to available connections equal to 0 during ha process', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single'
      }
    },

    test: function(done) {
      var Mongos = this.configuration.mongo.Mongos,
        Long = this.configuration.mongo.BSON.Long,
        ObjectId = this.configuration.mongo.BSON.ObjectId;

      // Contain mock server
      var server = null;
      var running = true;

      // Default message fields
      var defaultFields = {
        ismaster: true,
        msg: 'isdbgrid',
        maxBsonObjectSize: 16777216,
        maxMessageSizeBytes: 48000000,
        maxWriteBatchSize: 1000,
        localTime: new Date(),
        maxWireVersion: 4,
        minWireVersion: 0,
        ok: 1
      };

      // Primary server states
      var serverIsMaster = [assign({}, defaultFields)];

      // Boot the mock
      co(function*() {
        server = yield mockupdb.createServer(52018, 'localhost');

        // Primary state machine
        co(function*() {
          while (running) {
            var request = yield server.receive();

            // Get the document
            var doc = request.document;

            if (doc.ismaster) {
              request.reply(serverIsMaster[0]);
            } else if (doc.find) {
              yield timeoutPromise(600);
              // Reply with first batch
              request.reply({
                cursor: {
                  id: Long.fromNumber(1),
                  ns: f('%s.cursor1', 'test'),
                  firstBatch: [{ _id: new ObjectId(), a: 1 }]
                },
                ok: 1
              });
            } else if (doc.getMore) {
              // Reply with first batch
              request.reply({
                cursor: {
                  id: Long.fromNumber(1),
                  ns: f('%s.cursor1', 'test'),
                  nextBatch: [{ _id: new ObjectId(), a: 1 }]
                },
                ok: 1
              });
            }
          }
        }).catch(function() {});
      }).catch(function() {});

      // Attempt to connect
      var _server = new Mongos([{ host: 'localhost', port: 52018 }], {
        connectionTimeout: 30000,
        socketTimeout: 30000,
        haInterval: 500,
        size: 1
      });

      // Add event listeners
      _server.once('connect', function() {
        // Execute find
        var cursor = _server.cursor('test.test', {
          find: 'test',
          query: {},
          batchSize: 2
        });

        // Execute next
        cursor.next(function(err, d) {
          expect(err).to.not.exist;
          expect(d).to.exist;

          cursor.next(function(_err, _d) {
            expect(_err).to.not.exist;
            expect(_d).to.exist;

            running = false;
            server.destroy();
            done();
          });
        });
      });

      _server.on('error', done);
      setTimeout(function() {
        _server.connect();
      }, 100);
    }
  });
});
