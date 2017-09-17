'use strict';
var expect = require('chai').expect,
  assign = require('../../../../lib/utils').assign,
  co = require('co'),
  Connection = require('../../../../lib/connection/connection'),
  mock = require('../../../mock'),
  ConnectionSpy = require('../shared').ConnectionSpy;

let test = {};
describe('ReplSet Failover (mocks)', function() {
  beforeEach(() => {
    test.spy = new ConnectionSpy();
    Connection.enableConnectionAccounting(test.spy);
  });

  afterEach(() => {
    return mock.cleanup(test.spy).then(() => {
      test.spy = undefined;
      Connection.disableConnectionAccounting();
    });
  });

  it('Successfully failover to new primary', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single'
      }
    },

    test: function(done) {
      var ReplSet = this.configuration.mongo.ReplSet,
        Server = this.configuration.mongo.Server,
        ObjectId = this.configuration.mongo.BSON.ObjectId;

      // Contain mock server
      var primaryServer = null;
      var firstSecondaryServer = null;
      var secondSecondaryServer = null;
      var currentIsMasterIndex = 0;

      // Election Ids
      var electionIds = [new ObjectId(0), new ObjectId(1)];
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
        }),
        assign({}, defaultFields, {
          ismaster: false,
          secondary: true,
          me: 'localhost:32000',
          primary: 'localhost:32000',
          tags: { loc: 'ny' }
        }),
        assign({}, defaultFields, {
          ismaster: false,
          secondary: true,
          me: 'localhost:32000',
          primary: 'localhost:32001',
          tags: { loc: 'ny' },
          electionId: electionIds[1]
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
        }),
        assign({}, defaultFields, {
          ismaster: false,
          secondary: true,
          me: 'localhost:32001',
          primary: 'localhost:32000',
          tags: { loc: 'sf' }
        }),
        assign({}, defaultFields, {
          ismaster: true,
          secondary: false,
          me: 'localhost:32001',
          primary: 'localhost:32001',
          tags: { loc: 'ny' },
          electionId: electionIds[1]
        })
      ];

      // Primary server states
      var secondSecondary = [
        assign({}, defaultFields, {
          ismaster: false,
          secondary: true,
          me: 'localhost:32002',
          primary: 'localhost:32000',
          tags: { loc: 'sf' }
        }),
        assign({}, defaultFields, {
          ismaster: false,
          secondary: true,
          me: 'localhost:32002',
          primary: 'localhost:32000',
          tags: { loc: 'sf' }
        }),
        assign({}, defaultFields, {
          ismaster: false,
          secondary: true,
          me: 'localhost:32002',
          primary: 'localhost:32001',
          tags: { loc: 'ny' },
          electionId: electionIds[1]
        })
      ];

      // Die
      var die = false;

      // Boot the mock
      co(function*() {
        primaryServer = yield mock.createServer(32000, 'localhost');
        firstSecondaryServer = yield mock.createServer(32001, 'localhost');
        secondSecondaryServer = yield mock.createServer(32002, 'localhost');

        primaryServer.setMessageHandler(request => {
          var doc = request.document;
          if (die) {
            request.connection.destroy();
          } else {
            if (doc.ismaster) {
              request.reply(primary[currentIsMasterIndex]);
            }
          }
        });

        firstSecondaryServer.setMessageHandler(request => {
          var doc = request.document;
          if (die) {
            request.connection.destroy();
          } else {
            if (doc.ismaster) {
              request.reply(firstSecondary[currentIsMasterIndex]);
            }
          }
        });

        secondSecondaryServer.setMessageHandler(request => {
          var doc = request.document;
          if (die) {
            request.connection.destroy();
          } else {
            if (doc.ismaster) {
              request.reply(secondSecondary[currentIsMasterIndex]);
            }
          }
        });
      });

      // Attempt to connect
      var server = new ReplSet(
        [
          { host: 'localhost', port: 32000 },
          { host: 'localhost', port: 32001 },
          { host: 'localhost', port: 32002 }
        ],
        {
          setName: 'rs',
          connectionTimeout: 3000,
          socketTimeout: 0,
          haInterval: 100,
          size: 1
        }
      );

      Server.enableServerAccounting();

      server.on('connect', function() {
        server.__connected = true;

        // Perform the two steps
        setTimeout(function() {
          die = true;
          currentIsMasterIndex = currentIsMasterIndex + 1;

          // Keep the count of joined events
          var joinedEvents = 0;

          // Add listener
          server.on('joined', function(_type, _server) {
            if (_type === 'secondary' && _server.name === 'localhost:32000') {
              joinedEvents = joinedEvents + 1;
            } else if (_type === 'primary' && _server.name === 'localhost:32001') {
              joinedEvents = joinedEvents + 1;
            } else if (_type === 'secondary' && _server.name === 'localhost:32002') {
              joinedEvents = joinedEvents + 1;
            }

            // Got both events
            if (joinedEvents === 3) {
              var expectedServers = ['localhost:32002', 'localhost:32000'];
              expect(server.s.replicaSetState.secondaries).to.have.length(2);
              expect(server.s.replicaSetState.secondaries[0].name).to.be.oneOf(expectedServers);
              expect(server.s.replicaSetState.secondaries[1].name).to.be.oneOf(expectedServers);

              expect(server.s.replicaSetState.primary).to.not.be.null;
              expect(server.s.replicaSetState.primary.name).to.equal('localhost:32001');

              server.destroy();
              Server.disableServerAccounting();
              done();
            }
          });

          setTimeout(function() {
            die = false;
            currentIsMasterIndex = currentIsMasterIndex + 1;
          }, 500);
        }, 100);
      });

      server.on('error', done);
      // Gives proxies a chance to boot up
      setTimeout(function() {
        server.connect();
      }, 100);
    }
  });

  it('Successfully failover to new primary and emit reconnect event', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single'
      }
    },

    test: function(done) {
      var ReplSet = this.configuration.mongo.ReplSet,
        Server = this.configuration.mongo.Server,
        ObjectId = this.configuration.mongo.BSON.ObjectId;

      // Contain mock server
      var primaryServer = null;
      var firstSecondaryServer = null;
      var secondSecondaryServer = null;
      var currentIsMasterIndex = 0;

      // Election Ids
      var electionIds = [new ObjectId(0), new ObjectId(1)];
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
        }),
        assign({}, defaultFields, {
          ismaster: false,
          secondary: true,
          me: 'localhost:32000',
          primary: 'localhost:32000',
          tags: { loc: 'ny' }
        }),
        assign({}, defaultFields, {
          ismaster: false,
          secondary: true,
          me: 'localhost:32000',
          primary: 'localhost:32001',
          tags: { loc: 'ny' },
          electionId: electionIds[1]
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
        }),
        assign({}, defaultFields, {
          ismaster: false,
          secondary: true,
          me: 'localhost:32001',
          primary: 'localhost:32000',
          tags: { loc: 'sf' }
        }),
        assign({}, defaultFields, {
          ismaster: true,
          secondary: false,
          me: 'localhost:32001',
          primary: 'localhost:32001',
          tags: { loc: 'ny' },
          electionId: electionIds[1]
        })
      ];

      // Primary server states
      var secondSecondary = [
        assign({}, defaultFields, {
          ismaster: false,
          secondary: true,
          me: 'localhost:32002',
          primary: 'localhost:32000',
          tags: { loc: 'sf' }
        }),
        assign({}, defaultFields, {
          ismaster: false,
          secondary: true,
          me: 'localhost:32002',
          primary: 'localhost:32000',
          tags: { loc: 'sf' }
        }),
        assign({}, defaultFields, {
          ismaster: false,
          secondary: true,
          me: 'localhost:32002',
          primary: 'localhost:32001',
          tags: { loc: 'ny' },
          electionId: electionIds[1]
        })
      ];

      // Die
      var die = false;

      // Boot the mock
      co(function*() {
        primaryServer = yield mock.createServer(32000, 'localhost');
        firstSecondaryServer = yield mock.createServer(32001, 'localhost');
        secondSecondaryServer = yield mock.createServer(32002, 'localhost');

        primaryServer.setMessageHandler(request => {
          var doc = request.document;
          if (die) {
            request.connection.destroy();
          } else {
            if (doc.ismaster) {
              request.reply(primary[currentIsMasterIndex]);
            }
          }
        });

        firstSecondaryServer.setMessageHandler(request => {
          var doc = request.document;
          if (die) {
            request.connection.destroy();
          } else {
            if (doc.ismaster) {
              request.reply(firstSecondary[currentIsMasterIndex]);
            }
          }
        });

        secondSecondaryServer.setMessageHandler(request => {
          var doc = request.document;
          if (die) {
            request.connection.destroy();
          } else {
            if (doc.ismaster) {
              request.reply(secondSecondary[currentIsMasterIndex]);
            }
          }
        });
      });

      // Attempt to connect
      var server = new ReplSet(
        [
          { host: 'localhost', port: 32000 },
          { host: 'localhost', port: 32001 },
          { host: 'localhost', port: 32002 }
        ],
        {
          setName: 'rs',
          connectionTimeout: 3000,
          socketTimeout: 0,
          haInterval: 100,
          size: 1
        }
      );

      Server.enableServerAccounting();

      server.on('connect', function() {
        server.__connected = true;

        // Perform the two steps
        setTimeout(function() {
          die = true;
          currentIsMasterIndex = currentIsMasterIndex + 1;

          server.on('reconnect', function() {
            server.destroy();
            Server.disableServerAccounting();
            done();
          });

          setTimeout(function() {
            die = false;
            currentIsMasterIndex = currentIsMasterIndex + 1;
          }, 500);
        }, 100);
      });

      server.on('error', done);
      // Gives proxies a chance to boot up
      setTimeout(function() {
        server.connect();
      }, 100);
    }
  });
});
