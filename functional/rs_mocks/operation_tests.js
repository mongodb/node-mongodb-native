'use strict';
var assign = require('../../../../lib/utils').assign,
  co = require('co'),
  Connection = require('../../../../lib/connection/connection'),
  mockupdb = require('../../../mock');

describe('ReplSet Operations (mocks)', function() {
  it('Correctly execute count command against replicaset with a single member', {
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
      var running = true;
      var currentIsMasterIndex = 0;

      // Default message fields
      var defaultFields = {
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
        hosts: ['localhost:32000']
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

      // Boot the mock
      co(function*() {
        primaryServer = yield mockupdb.createServer(32000, 'localhost');

        // Primary state machine
        co(function*() {
          while (running) {
            var request = yield primaryServer.receive();
            var doc = request.document;
            // console.log('======== doc')
            // console.dir(doc)

            if (doc.ismaster) {
              request.reply(primary[currentIsMasterIndex]);
            } else if (doc.count) {
              request.reply({ ok: 1, n: 1 });
            }
          }
        }).catch(function() {
          // console.log(err.stack);
        });
      });

      Connection.enableConnectionAccounting();
      // Attempt to connect
      var server = new ReplSet([{ host: 'localhost', port: 32000 }], {
        setName: 'rs',
        connectionTimeout: 3000,
        socketTimeout: 0,
        haInterval: 2000,
        size: 1,
        disconnectHandler: {
          add: function() {},
          execute: function() {}
        }
      });

      server.on('connect', function(_server) {
        _server.command('test.test', { count: 'test' }, function() {
          primaryServer.destroy();
          _server.destroy();
          running = false;
          done();
        });
      });

      // Gives proxies a chance to boot up
      setTimeout(function() {
        server.connect();
      }, 100);
    }
  });

  it(
    'Correctly execute count command against replicaset with a single member and secondaryPreferred',
    {
      metadata: {
        requires: {
          generators: true,
          topology: 'single'
        }
      },

      test: function(done) {
        var ReplSet = this.configuration.mongo.ReplSet,
          ObjectId = this.configuration.mongo.BSON.ObjectId,
          ReadPreference = this.configuration.mongo.ReadPreference;

        // Contain mock server
        var primaryServer = null;
        var running = true;
        var currentIsMasterIndex = 0;

        // Default message fields
        var defaultFields = {
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
          hosts: ['localhost:32000']
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

        // Boot the mock
        co(function*() {
          primaryServer = yield mockupdb.createServer(32000, 'localhost');

          // Primary state machine
          co(function*() {
            while (running) {
              var request = yield primaryServer.receive();
              var doc = request.document;

              if (doc.ismaster) {
                request.reply(primary[currentIsMasterIndex]);
              } else if (doc.count) {
                request.reply({ ok: 1, n: 1 });
              }
            }
          }).catch(function(err) {
            console.log(err.stack);
          });
        });

        Connection.enableConnectionAccounting();
        // Attempt to connect
        var server = new ReplSet([{ host: 'localhost', port: 32000 }], {
          setName: 'rs',
          connectionTimeout: 3000,
          socketTimeout: 0,
          haInterval: 2000,
          size: 1,
          disconnectHandler: {
            add: function() {},
            execute: function() {}
          }
        });

        server.on('connect', function(_server) {
          _server.command(
            'test.test',
            { count: 'test' },
            { readPreference: ReadPreference.secondaryPreferred },
            function() {
              primaryServer.destroy();
              _server.destroy();
              running = false;
              done();
            }
          );
        });

        // Gives proxies a chance to boot up
        setTimeout(function() {
          server.connect();
        }, 100);
      }
    }
  );
});
