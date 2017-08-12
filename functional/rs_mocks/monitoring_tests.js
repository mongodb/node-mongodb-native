'use strict';
var expect = require('chai').expect,
    assign = require('../../../../lib/utils').assign,
    co = require('co'),
    Connection = require('../../../../lib/connection/connection');

var timeoutPromise = function(timeout) {
  return new Promise(function(resolve, reject) {
    setTimeout(function() {
      resolve();
    }, timeout);
  });
};

describe('ReplSet Monitoring (mocks)', function() {
  it('Should correctly connect to a replicaset where the primary hangs causing monitoring thread to hang', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single'
      }
    },

    test: function(done) {
      var ReplSet = this.configuration.mongo.ReplSet,
          ObjectId = this.configuration.mongo.BSON.ObjectId,
          mockupdb = require('../../../mock');

      // Contain mock server
      var primaryServer = null;
      var firstSecondaryServer = null;
      var secondSecondaryServer = null;
      var running = true;
      var electionIds = [new ObjectId(), new ObjectId()];
      // Current index for the ismaster
      var currentIsMasterState = 0;
      // Primary stop responding
      var stopRespondingPrimary = false;

      // Default message fields
      var defaultFields = {
        'setName': 'rs', 'setVersion': 1, 'electionId': electionIds[currentIsMasterState],
        'maxBsonObjectSize': 16777216, 'maxMessageSizeBytes': 48000000,
        'maxWriteBatchSize': 1000, 'localTime': new Date(), 'maxWireVersion': 3,
        'minWireVersion': 0, 'ok': 1, 'hosts': ['localhost:32000', 'localhost:32001', 'localhost:32002']
      };

      // Primary server states
      var primary = [assign({}, defaultFields, {
        'ismaster': true, 'secondary': false, 'me': 'localhost:32000', 'primary': 'localhost:32000'
      }), assign({}, defaultFields, {
        'ismaster': false, 'secondary': true, 'me': 'localhost:32000', 'primary': 'localhost:32001'
      })];

      // Primary server states
      var firstSecondary = [assign({}, defaultFields, {
        'ismaster': false, 'secondary': true, 'me': 'localhost:32001', 'primary': 'localhost:32000'
      }), assign({}, defaultFields, {
        'ismaster': true, 'secondary': false, 'me': 'localhost:32001', 'primary': 'localhost:32001'
      })];

      // Primary server states
      var secondSecondary = [assign({}, defaultFields, {
        'ismaster': false, 'secondary': true, 'me': 'localhost:32002', 'primary': 'localhost:32000'
      }), assign({}, defaultFields, {
        'ismaster': false, 'secondary': true, 'me': 'localhost:32002', 'primary': 'localhost:32001'
      })];

      // Joined servers
      var joinedPrimaries = {};
      var joinedSecondaries = {};
      var leftPrimaries = {};

      // Boot the mock
      co(function*() {
        primaryServer = yield mockupdb.createServer(32000, 'localhost');
        firstSecondaryServer = yield mockupdb.createServer(32001, 'localhost');
        secondSecondaryServer = yield mockupdb.createServer(32002, 'localhost');

        // Primary state machine
        co(function*() {
          while (running) {
            var request = yield primaryServer.receive();

            // Stop responding to any calls (emulate dropping packets on the floor)
            if (stopRespondingPrimary) {
              yield timeoutPromise(10000);
              continue;
            }

            // Get the document
            var doc = request.document;
            if (doc.ismaster && currentIsMasterState === 0) {
              request.reply(primary[currentIsMasterState]);
            } else if (doc.insert && currentIsMasterState === 0) {
              request.reply({ ok: 1, n: doc.documents, lastOp: new Date(), electionId: electionIds[currentIsMasterState] });
            } else if (doc.insert && currentIsMasterState === 1) {
              request.reply({ 'note': 'from execCommand', 'ok': 0, 'errmsg': 'not master' });
            }
          }
        });

        // First secondary state machine
        co(function*() {
          while (running) {
            var request = yield firstSecondaryServer.receive();
            var doc = request.document;

            if (doc.ismaster) {
              request.reply(firstSecondary[currentIsMasterState]);
            } else if (doc.insert && currentIsMasterState === 1) {
              request.reply({ ok: 1, n: doc.documents, lastOp: new Date(), electionId: electionIds[currentIsMasterState] });
            } else if (doc.insert && currentIsMasterState === 0) {
              request.reply({ 'note': 'from execCommand', 'ok': 0, 'errmsg': 'not master' });
            }
          }
        });

        // Second secondary state machine
        co(function*() {
          while (running) {
            var request = yield secondSecondaryServer.receive();
            var doc = request.document;

            if (doc.ismaster) {
              request.reply(secondSecondary[currentIsMasterState]);
            } else if (doc.insert && currentIsMasterState === 0) {
              request.reply({ 'note': 'from execCommand', 'ok': 0, 'errmsg': 'not master' });
            }
          }
        });

        // Start dropping the packets
        setTimeout(function() {
          stopRespondingPrimary = true;
          currentIsMasterState = 1;
        }, 5000);
      });

      Connection.enableConnectionAccounting();
      // Attempt to connect
      var server = new ReplSet([
        { host: 'localhost', port: 32000 },
        { host: 'localhost', port: 32001 },
        { host: 'localhost', port: 32002 }
      ], {
        setName: 'rs',
        connectionTimeout: 5000,
        socketTimeout: 3000,
        haInterval: 2000,
        size: 1
      });

      // Add event listeners
      server.on('connect', function(_server) {
        // Set up a write
        function schedule() {
          setTimeout(function() {
            _server.insert('test.test', [{ created: new Date() }], function(err, r) {
              // Did we switch servers
              if (r && r.connection.port === 32001) {
                expect(stopRespondingPrimary).to.be.true;
                expect(currentIsMasterState).to.equal(1);

                // Ensure the state is correct
                expect(joinedPrimaries).to.eql({ 'localhost:32000': 1, 'localhost:32001': 1 });
                expect(joinedSecondaries).to.eql({ 'localhost:32001': 1, 'localhost:32002': 1 });

                // Destroy mock
                primaryServer.destroy();
                firstSecondaryServer.destroy();
                secondSecondaryServer.destroy();
                server.destroy();
                running = false;

                setTimeout(function() {
                  expect(Object.keys(Connection.connections())).to.have.length(0);
                  Connection.disableConnectionAccounting();
                  done();
                }, 1000);
                return;
              }

              schedule();
            });
          }, 1);
        }

        // Schedule an insert
        schedule();
      });

      server.on('error', done);
      server.on('joined', function(type, _server) {
        if (type === 'primary') joinedPrimaries[_server.name] = 1;
        if (type === 'secondary') joinedSecondaries[_server.name] = 1;
      });

      server.on('left', function(type, _server) {
        if (type === 'primary') leftPrimaries[_server.name] = 1;
      });

      // Gives proxies a chance to boot up
      setTimeout(function() {
        server.connect();
      }, 100);
    }
  });

  it('Should correctly prune intervalIds array', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single'
      }
    },

    test: function(done) {
      var ReplSet = this.configuration.mongo.ReplSet,
          ObjectId = this.configuration.mongo.BSON.ObjectId,
          mockupdb = require('../../../mock');

      // Contain mock server
      var primaryServer = null;
      var firstSecondaryServer = null;
      var secondSecondaryServer = null;
      var running = true;
      var electionIds = [new ObjectId(), new ObjectId()];
      // Current index for the ismaster
      var currentIsMasterState = 0;

      // Default message fields
      var defaultFields = {
        'setName': 'rs', 'setVersion': 1, 'electionId': electionIds[currentIsMasterState],
        'maxBsonObjectSize': 16777216, 'maxMessageSizeBytes': 48000000,
        'maxWriteBatchSize': 1000, 'localTime': new Date(), 'maxWireVersion': 3,
        'minWireVersion': 0, 'ok': 1, 'hosts': ['localhost:32000', 'localhost:32001', 'localhost:32002']
      };

      // Primary server states
      var primary = [assign({}, defaultFields, {
        'ismaster': true, 'secondary': false, 'me': 'localhost:32000', 'primary': 'localhost:32000'
      }), assign({}, defaultFields, {
        'ismaster': false, 'secondary': true, 'me': 'localhost:32000', 'primary': 'localhost:32001'
      })];

      // Primary server states
      var firstSecondary = [assign({}, defaultFields, {
        'ismaster': false, 'secondary': true, 'me': 'localhost:32001', 'primary': 'localhost:32000'
      }), assign({}, defaultFields, {
        'ismaster': true, 'secondary': false, 'me': 'localhost:32001', 'primary': 'localhost:32001'
      })];

      // Primary server states
      var secondSecondary = [assign({}, defaultFields, {
        'ismaster': false, 'secondary': true, 'me': 'localhost:32002', 'primary': 'localhost:32000'
      }), assign({}, defaultFields, {
        'ismaster': false, 'secondary': true, 'me': 'localhost:32002', 'primary': 'localhost:32001'
      })];

      // Boot the mock
      co(function*() {
        primaryServer = yield mockupdb.createServer(32000, 'localhost');
        firstSecondaryServer = yield mockupdb.createServer(32001, 'localhost');
        secondSecondaryServer = yield mockupdb.createServer(32002, 'localhost');

        // Primary state machine
        co(function*() {
          while (running) {
            var request = yield primaryServer.receive();

            // Get the document
            var doc = request.document;
            if (doc.ismaster && currentIsMasterState == 0) {
              request.reply(primary[currentIsMasterState]);
            }
          }
        });

        // First secondary state machine
        co(function*() {
          while (running) {
            var request = yield firstSecondaryServer.receive();
            var doc = request.document;

            if (doc.ismaster) {
              request.reply(firstSecondary[currentIsMasterState]);
            }
          }
        });

        // Second secondary state machine
        co(function*() {
          while (running) {
            var request = yield secondSecondaryServer.receive();
            var doc = request.document;

            if (doc.ismaster) {
              request.reply(secondSecondary[currentIsMasterState]);
            }
          }
        });
      });

      // Attempt to connect
      var server = new ReplSet([
        { host: 'localhost', port: 32000 },
        { host: 'localhost', port: 32001 },
        { host: 'localhost', port: 32002 }
      ], {
        setName: 'rs',
        connectionTimeout: 5000,
        socketTimeout: 60000,
        haInterval: 200,
        size: 1
      });

      // Add event listeners
      server.on('connect', function(_server) {
        setTimeout(function() {
          expect(_server.intervalIds.length).to.be.greaterThan(1);

          // Destroy mock
          primaryServer.destroy();
          firstSecondaryServer.destroy();
          secondSecondaryServer.destroy();
          server.destroy();
          running = false;

          expect(_server.intervalIds.length).to.equal(0);
          done();
        }, 1000);
      });

      // Gives proxies a chance to boot up
      setTimeout(function() {
        server.connect();
      }, 100);
    }
  });
});
