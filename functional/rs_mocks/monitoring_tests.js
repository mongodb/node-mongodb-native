'use strict';
var expect = require('chai').expect,
  co = require('co'),
  Connection = require('../../../../lib/connection/connection'),
  mock = require('../../../mock'),
  ConnectionSpy = require('../shared').ConnectionSpy;

var delay = function(timeout) {
  return new Promise(resolve => setTimeout(() => resolve(), timeout));
};

let test = {};
describe('ReplSet Monitoring (mocks)', function() {
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

  it(
    'Should correctly connect to a replicaset where the primary hangs causing monitoring thread to hang',
    {
      metadata: {
        requires: {
          generators: true,
          topology: 'single'
        }
      },

      test: function(done) {
        var ReplSet = this.configuration.mongo.ReplSet,
          ObjectId = this.configuration.mongo.BSON.ObjectId;

        var electionIds = [new ObjectId(), new ObjectId()];
        var currentIsMasterState = 0;
        var stopRespondingPrimary = false;
        var defaultFields = Object.assign({}, mock.DEFAULT_ISMASTER, {
          setName: 'rs',
          setVersion: 1,
          electionId: electionIds[currentIsMasterState],
          hosts: ['localhost:32000', 'localhost:32001', 'localhost:32002']
        });

        // Primary server states
        var primary = [
          Object.assign({}, defaultFields, {
            ismaster: true,
            secondary: false,
            me: 'localhost:32000',
            primary: 'localhost:32000'
          }),
          Object.assign({}, defaultFields, {
            ismaster: false,
            secondary: true,
            me: 'localhost:32000',
            primary: 'localhost:32001'
          })
        ];

        // Primary server states
        var firstSecondary = [
          Object.assign({}, defaultFields, {
            ismaster: false,
            secondary: true,
            me: 'localhost:32001',
            primary: 'localhost:32000'
          }),
          Object.assign({}, defaultFields, {
            ismaster: true,
            secondary: false,
            me: 'localhost:32001',
            primary: 'localhost:32001'
          })
        ];

        // Primary server states
        var secondSecondary = [
          Object.assign({}, defaultFields, {
            ismaster: false,
            secondary: true,
            me: 'localhost:32002',
            primary: 'localhost:32000'
          }),
          Object.assign({}, defaultFields, {
            ismaster: false,
            secondary: true,
            me: 'localhost:32002',
            primary: 'localhost:32001'
          })
        ];

        // Joined servers
        var joinedPrimaries = {};
        var joinedSecondaries = {};
        var leftPrimaries = {};

        // Boot the mock
        co(function*() {
          const primaryServer = yield mock.createServer(32000, 'localhost');
          const firstSecondaryServer = yield mock.createServer(32001, 'localhost');
          const secondSecondaryServer = yield mock.createServer(32002, 'localhost');

          primaryServer.setMessageHandler(request => {
            var doc = request.document;

            // Stop responding to any calls (emulate dropping packets on the floor)
            if (stopRespondingPrimary) {
              delay(3000).then(() => handleMessage(doc));
            } else {
              handleMessage(doc);
            }

            function handleMessage(doc) {
              if (doc.ismaster && currentIsMasterState === 0) {
                request.reply(primary[currentIsMasterState]);
              } else if (doc.insert && currentIsMasterState === 0) {
                request.reply({
                  ok: 1,
                  n: doc.documents,
                  lastOp: new Date(),
                  electionId: electionIds[currentIsMasterState]
                });
              } else if (doc.insert && currentIsMasterState === 1) {
                request.reply({ note: 'from execCommand', ok: 0, errmsg: 'not master' });
              }
            }
          });

          firstSecondaryServer.setMessageHandler(request => {
            var doc = request.document;
            if (doc.ismaster) {
              request.reply(firstSecondary[currentIsMasterState]);
            } else if (doc.insert && currentIsMasterState === 1) {
              request.reply({
                ok: 1,
                n: doc.documents,
                lastOp: new Date(),
                electionId: electionIds[currentIsMasterState]
              });
            } else if (doc.insert && currentIsMasterState === 0) {
              request.reply({ note: 'from execCommand', ok: 0, errmsg: 'not master' });
            }
          });

          secondSecondaryServer.setMessageHandler(request => {
            var doc = request.document;
            if (doc.ismaster) {
              request.reply(secondSecondary[currentIsMasterState]);
            } else if (doc.insert && currentIsMasterState === 0) {
              request.reply({ note: 'from execCommand', ok: 0, errmsg: 'not master' });
            }
          });

          // Start dropping the packets
          setTimeout(function() {
            stopRespondingPrimary = true;
            currentIsMasterState = 1;
          }, 500);

          // Attempt to connect
          var server = new ReplSet(
            [
              { host: 'localhost', port: 32000 },
              { host: 'localhost', port: 32001 },
              { host: 'localhost', port: 32002 }
            ],
            {
              setName: 'rs',
              connectionTimeout: 5000,
              socketTimeout: 3000,
              haInterval: 100,
              size: 1
            }
          );

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
                    expect(joinedSecondaries).to.eql({
                      'localhost:32001': 1,
                      'localhost:32002': 1
                    });

                    server.destroy();
                    done();
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

          server.connect();
        });
      }
    }
  );

  it('Should correctly prune intervalIds array', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single'
      }
    },

    test: function(done) {
      var ReplSet = this.configuration.mongo.ReplSet,
        ObjectId = this.configuration.mongo.BSON.ObjectId;

      var electionIds = [new ObjectId(), new ObjectId()];
      var currentIsMasterState = 0;
      var defaultFields = Object.assign({}, mock.DEFAULT_ISMASTER, {
        setName: 'rs',
        setVersion: 1,
        electionId: electionIds[currentIsMasterState],
        hosts: ['localhost:32000', 'localhost:32001', 'localhost:32002']
      });

      // Primary server states
      var primary = [
        Object.assign({}, defaultFields, {
          ismaster: true,
          secondary: false,
          me: 'localhost:32000',
          primary: 'localhost:32000'
        }),
        Object.assign({}, defaultFields, {
          ismaster: false,
          secondary: true,
          me: 'localhost:32000',
          primary: 'localhost:32001'
        })
      ];

      // Primary server states
      var firstSecondary = [
        Object.assign({}, defaultFields, {
          ismaster: false,
          secondary: true,
          me: 'localhost:32001',
          primary: 'localhost:32000'
        }),
        Object.assign({}, defaultFields, {
          ismaster: true,
          secondary: false,
          me: 'localhost:32001',
          primary: 'localhost:32001'
        })
      ];

      // Primary server states
      var secondSecondary = [
        Object.assign({}, defaultFields, {
          ismaster: false,
          secondary: true,
          me: 'localhost:32002',
          primary: 'localhost:32000'
        }),
        Object.assign({}, defaultFields, {
          ismaster: false,
          secondary: true,
          me: 'localhost:32002',
          primary: 'localhost:32001'
        })
      ];

      // Boot the mock
      co(function*() {
        const primaryServer = yield mock.createServer(32000, 'localhost');
        const firstSecondaryServer = yield mock.createServer(32001, 'localhost');
        const secondSecondaryServer = yield mock.createServer(32002, 'localhost');

        primaryServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster && currentIsMasterState === 0) {
            request.reply(primary[currentIsMasterState]);
          }
        });

        firstSecondaryServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(firstSecondary[currentIsMasterState]);
          }
        });

        secondSecondaryServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(secondSecondary[currentIsMasterState]);
          }
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
            connectionTimeout: 5000,
            socketTimeout: 60000,
            haInterval: 100,
            size: 1
          }
        );

        // Add event listeners
        server.on('connect', function(_server) {
          setTimeout(function() {
            expect(_server.intervalIds.length).to.be.greaterThan(1);

            server.destroy();
            done();
          }, 100);
        });

        server.connect();
      });
    }
  });
});
