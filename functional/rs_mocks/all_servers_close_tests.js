'use strict';
var expect = require('chai').expect,
  co = require('co'),
  assign = require('../../../../lib/utils').assign,
  Connection = require('../../../../lib/connection/connection'),
  mock = require('../../../mock'),
  ConnectionSpy = require('../shared').ConnectionSpy;

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
        primaryServer = yield mock.createServer(32000, 'localhost');
        firstSecondaryServer = yield mock.createServer(32001, 'localhost');
        arbiterServer = yield mock.createServer(32002, 'localhost');

        primaryServer.setMessageHandler(request => {
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
        });

        firstSecondaryServer.setMessageHandler(request => {
          if (die) {
            request.connection.destroy();
          } else {
            var doc = request.document;

            if (doc.ismaster) {
              request.reply(firstSecondary[0]);
            }
          }
        });

        arbiterServer.setMessageHandler(request => {
          if (die) {
            request.connection.destroy();
          } else {
            var doc = request.document;

            if (doc.ismaster) {
              request.reply(arbiter[0]);
            }
          }
        });
      });

      const spy = new ConnectionSpy();
      Connection.enableConnectionAccounting(spy);

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

                mock.cleanup(
                  [primaryServer, firstSecondaryServer, arbiterServer, server],
                  spy,
                  () => {
                    Connection.disableConnectionAccounting();
                    done();
                  }
                );
              });
            }, 12000);
          }, 2500);
        }, 2500);
      });

      // Gives proxies a chance to boot up
      setTimeout(function() {
        server.connect();
      }, 100);
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
        primaryServer = yield mock.createServer(34000, 'localhost');
        firstSecondaryServer = yield mock.createServer(34001, 'localhost');
        arbiterServer = yield mock.createServer(34002, 'localhost');

        primaryServer.setMessageHandler(request => {
          if (die) {
            request.connection.destroy();
          } else {
            var doc = request.document;
            if (doc.ismaster) {
              request.reply(primary[0]);
            }
          }
        });

        firstSecondaryServer.setMessageHandler(request => {
          if (die) {
            request.connection.destroy();
          } else {
            var doc = request.document;
            if (doc.ismaster) {
              request.reply(firstSecondary[0]);
            }
          }
        });

        arbiterServer.setMessageHandler(request => {
          if (die) {
            request.connection.destroy();
          } else {
            var doc = request.document;
            if (doc.ismaster) {
              request.reply(arbiter[0]);
            }
          }
        });
      });

      const spy = new ConnectionSpy();
      Connection.enableConnectionAccounting(spy);

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

                mock.cleanup(
                  [primaryServer, firstSecondaryServer, arbiterServer, server],
                  spy,
                  () => {
                    Connection.disableConnectionAccounting();
                    done();
                  }
                );
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
