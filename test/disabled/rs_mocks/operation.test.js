'use strict';
const co = require('co');
const mock = require('mongodb-mock-server');
const ConnectionSpy = require('../shared').ConnectionSpy;

const core = require('../../../../src/core');
const Connection = core.Connection;
const ReplSet = core.ReplSet;
const ObjectId = core.BSON.ObjectId;
const ReadPreference = core.ReadPreference;

let test = {};
describe('ReplSet Operations (mocks)', function () {
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

  it('Correctly execute count command against replicaset with a single member', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single'
      }
    },

    test: function (done) {
      var currentIsMasterIndex = 0;
      var defaultFields = Object.assign({}, mock.DEFAULT_ISMASTER, {
        setName: 'rs',
        setVersion: 1,
        electionId: new ObjectId(),
        hosts: ['localhost:32000']
      });

      // Primary server states
      var primary = [
        Object.assign({}, defaultFields, {
          ismaster: true,
          secondary: false,
          me: 'localhost:32000',
          primary: 'localhost:32000',
          tags: { loc: 'ny' }
        })
      ];

      // Boot the mock
      co(function* () {
        const primaryServer = yield mock.createServer(32000, 'localhost');

        primaryServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster || doc.hello) {
            request.reply(primary[currentIsMasterIndex]);
          } else if (doc.count) {
            request.reply({ ok: 1, n: 1 });
          }
        });

        // Attempt to connect
        var server = new ReplSet([{ host: 'localhost', port: 32000 }], {
          setName: 'rs',
          connectionTimeout: 3000,
          socketTimeout: 0,

          size: 1,
          disconnectHandler: {
            add: function () {},
            execute: function () {}
          }
        });

        server.on('connect', function (_server) {
          _server.command('test.test', { count: 'test' }, function () {
            server.destroy();
            done();
          });
        });

        server.connect();
      });
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

      test: function (done) {
        var currentIsMasterIndex = 0;
        var defaultFields = Object.assign({}, mock.DEFAULT_ISMASTER, {
          setName: 'rs',
          setVersion: 1,
          electionId: new ObjectId(),
          hosts: ['localhost:32000']
        });

        // Primary server states
        var primary = [
          Object.assign({}, defaultFields, {
            ismaster: true,
            secondary: false,
            me: 'localhost:32000',
            primary: 'localhost:32000',
            tags: { loc: 'ny' }
          })
        ];

        // Boot the mock
        co(function* () {
          const primaryServer = yield mock.createServer(32000, 'localhost');

          primaryServer.setMessageHandler(request => {
            var doc = request.document;
            if (doc.ismaster || doc.hello) {
              request.reply(primary[currentIsMasterIndex]);
            } else if (doc.count) {
              request.reply({ ok: 1, n: 1 });
            }
          });

          // Attempt to connect
          var server = new ReplSet([{ host: 'localhost', port: 32000 }], {
            setName: 'rs',
            connectionTimeout: 3000,
            socketTimeout: 0,

            size: 1,
            disconnectHandler: {
              add: function () {},
              execute: function () {}
            }
          });

          server.on('connect', function () {
            server.command(
              'test.test',
              { count: 'test' },
              { readPreference: ReadPreference.secondaryPreferred },
              function () {
                server.destroy();
                done();
              }
            );
          });

          server.connect();
        });
      }
    }
  );
});
