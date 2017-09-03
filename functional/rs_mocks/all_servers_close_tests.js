'use strict';
var expect = require('chai').expect,
  co = require('co'),
  assign = require('../../../../lib/utils').assign,
  Connection = require('../../../../lib/connection/connection'),
  mockupdb = require('../../../mock');

describe('ReplSet All Servers Close (mocks)', function() {
  it('Successful reconnect when driver loses touch with entire replicaset', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single'
      }
    },

    test: function(done) {
      var ReplSet = this.configuration.mongo.ReplSet,
        ObjectId = this.configuration.mongo.BSON.ObjectId;

      // Contain mock server
      var primaryServer = null;
      var firstSecondaryServer = null;
      var arbiterServer = null;
      var running = true;
      var electionIds = [new ObjectId(), new ObjectId()];
      var die = false;

      // Default message fields
      var defaultFields = {
        setName: 'rs',
        setVersion: 1,
        electionId: electionIds[0],
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
      var primary = [
        assign({}, defaultFields, {
          ismaster: true,
          secondary: false,
          me: 'localhost:32000',
          primary: 'localhost:32000',
          tags: { loc: 'ny' }
        })
      ];

      // Primary server states
      var firstSecondary = [
        assign({}, defaultFields, {
          ismaster: false,
          secondary: true,
          me: 'localhost:32001',
          primary: 'localhost:32000',
          tags: { loc: 'sf' }
        })
      ];

      // Primary server states
      var arbiter = [
        assign({}, defaultFields, {
          ismaster: false,
          secondary: false,
          arbiterOnly: true,
          me: 'localhost:32002',
          primary: 'localhost:32000'
        })
      ];

      // Boot the mock
      co(function*() {
        primaryServer = yield mockupdb.createServer(32000, 'localhost');
        firstSecondaryServer = yield mockupdb.createServer(32001, 'localhost');
        arbiterServer = yield mockupdb.createServer(32002, 'localhost');

        // Primary state machine
        co(function*() {
          while (running) {
            var request = yield primaryServer.receive();
            if (die) {
              request.connection.destroy();
            } else {
              var doc = request.document;

              if (doc.ismaster) {
                request.reply(primary[0]);
              } else if (doc.insert) {
                request.reply({ ok: 1, n: 1 });
              }
            }
          }
        }).catch(function() {
          // console.log(err.stack);
        });

        // First secondary state machine
        co(function*() {
          while (running) {
            var request = yield firstSecondaryServer.receive();
            if (die) {
              request.connection.destroy();
            } else {
              var doc = request.document;

              if (doc.ismaster) {
                request.reply(firstSecondary[0]);
              }
            }
          }
        }).catch(function() {
          // console.log(err.stack);
        });

        // Second secondary state machine
        co(function*() {
          while (running) {
            var request = yield arbiterServer.receive();
            if (die) {
              request.connection.destroy();
            } else {
              var doc = request.document;

              if (doc.ismaster) {
                request.reply(arbiter[0]);
              }
            }
          }
        }).catch(function() {
          // console.log(err.stack);
        });

        Connection.enableConnectionAccounting();
        // Attempt to connect
        var server = new ReplSet(
          [
            { host: 'localhost', port: 32000 },
            { host: 'localhost', port: 32001 },
            { host: 'localhost', port: 32002 }
          ],
          {
            setName: 'rs',
            connectionTimeout: 2000,
            socketTimeout: 2000,
            haInterval: 500,
            size: 500
          }
        );

        server.on('connect', function(_server) {
          setTimeout(function() {
            die = true;

            setTimeout(function() {
              die = false;

              setTimeout(function() {
                _server.command('admin.$cmd', { ismaster: true }, function(err, r) {
                  expect(r).to.exist;
                  expect(err).to.be.null;
                  expect(_server.s.replicaSetState.primary).to.not.be.null;
                  expect(_server.s.replicaSetState.secondaries).to.have.length(1);
                  expect(_server.s.replicaSetState.arbiters).to.have.length(1);

                  primaryServer.destroy();
                  firstSecondaryServer.destroy();
                  arbiterServer.destroy();
                  server.destroy();
                  running = false;

                  setTimeout(function() {
                    expect(Object.keys(Connection.connections())).to.have.length(0);
                    Connection.disableConnectionAccounting();
                    done();
                  }, 1000);
                });
              }, 12000);
            }, 2500);
          }, 2500);
        });

        // Gives proxies a chance to boot up
        setTimeout(function() {
          server.connect();
        }, 100);
      });
    }
  });

  it('Successfully come back from a dead replicaset that has been unavailable for a long time', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single'
      }
    },

    test: function(done) {
      this.timeout(60000);

      var ReplSet = this.configuration.mongo.ReplSet,
        ObjectId = this.configuration.mongo.BSON.ObjectId;

      // Contain mock server
      var primaryServer = null;
      var firstSecondaryServer = null;
      var arbiterServer = null;
      var running = true;
      var electionIds = [new ObjectId(), new ObjectId()];
      var die = false;

      // Default message fields
      var defaultFields = {
        setName: 'rs',
        setVersion: 1,
        electionId: electionIds[0],
        maxBsonObjectSize: 16777216,
        maxMessageSizeBytes: 48000000,
        maxWriteBatchSize: 1000,
        localTime: new Date(),
        maxWireVersion: 4,
        minWireVersion: 0,
        ok: 1,
        hosts: ['localhost:34000', 'localhost:34001', 'localhost:34002'],
        arbiters: ['localhost:34002']
      };

      // Primary server states
      var primary = [
        assign({}, defaultFields, {
          ismaster: true,
          secondary: false,
          me: 'localhost:34000',
          primary: 'localhost:34000',
          tags: { loc: 'ny' }
        })
      ];

      // Primary server states
      var firstSecondary = [
        assign({}, defaultFields, {
          ismaster: false,
          secondary: true,
          me: 'localhost:34001',
          primary: 'localhost:34000',
          tags: { loc: 'sf' }
        })
      ];

      // Primary server states
      var arbiter = [
        assign({}, defaultFields, {
          ismaster: false,
          secondary: false,
          arbiterOnly: true,
          me: 'localhost:34002',
          primary: 'localhost:34000'
        })
      ];

      // Boot the mock
      co(function*() {
        primaryServer = yield mockupdb.createServer(34000, 'localhost');
        firstSecondaryServer = yield mockupdb.createServer(34001, 'localhost');
        arbiterServer = yield mockupdb.createServer(34002, 'localhost');

        // Primary state machine
        co(function*() {
          while (running) {
            var request = yield primaryServer.receive();
            if (die) {
              request.connection.destroy();
            } else {
              var doc = request.document;

              if (doc.ismaster) {
                request.reply(primary[0]);
              }
            }
          }
        }).catch(function() {
          // console.log(err.stack);
        });

        // First secondary state machine
        co(function*() {
          while (running) {
            var request = yield firstSecondaryServer.receive();
            if (die) {
              request.connection.destroy();
            } else {
              var doc = request.document;

              if (doc.ismaster) {
                request.reply(firstSecondary[0]);
              }
            }
          }
        }).catch(function() {
          // console.log(err.stack);
        });

        // Second secondary state machine
        co(function*() {
          while (running) {
            var request = yield arbiterServer.receive();
            if (die) {
              request.connection.destroy();
            } else {
              var doc = request.document;

              if (doc.ismaster) {
                request.reply(arbiter[0]);
              }
            }
          }
        }).catch(function() {
          // console.log(err.stack);
        });
      });

      Connection.enableConnectionAccounting();
      // Attempt to connect
      var server = new ReplSet(
        [
          { host: 'localhost', port: 34000 },
          { host: 'localhost', port: 34001 },
          { host: 'localhost', port: 34002 }
        ],
        {
          setName: 'rs',
          connectionTimeout: 5000,
          socketTimeout: 5000,
          haInterval: 1000,
          size: 1
        }
      );

      server.on('connect', function() {
        setTimeout(function() {
          die = true;

          var intervalId = setInterval(function() {
            server.command('admin.$cmd', { ismaster: true }, function() {});
          }, 2000);

          setTimeout(function() {
            die = false;
            setTimeout(function() {
              clearInterval(intervalId);

              server.command('admin.$cmd', { ismaster: true }, function(err, r) {
                expect(r).to.exist;
                expect(err).to.be.null;
                expect(server.s.replicaSetState.primary).to.not.be.null;
                expect(server.s.replicaSetState.secondaries).to.have.length(1);
                expect(server.s.replicaSetState.arbiters).to.have.length(1);

                primaryServer.destroy();
                firstSecondaryServer.destroy();
                arbiterServer.destroy();
                server.destroy();
                running = false;

                setTimeout(function() {
                  expect(Object.keys(Connection.connections())).to.have.length(0);
                  Connection.disableConnectionAccounting();
                  done();
                }, 1000);
              });
            }, 5000);
          }, 25000);
        }, 2500);
      });

      // Gives proxies a chance to boot up
      setTimeout(function() {
        server.connect();
      }, 100);
    }
  });
});
