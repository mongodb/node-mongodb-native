'use strict';
const co = require('co');
const Connection = require('../../../../lib/connection/connection');
const mock = require('mongodb-mock-server');
const ConnectionSpy = require('../shared').ConnectionSpy;

let test = {};
describe('ReplSet Primary Loses Network (mocks)', function() {
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

  it('Recover from Primary losing network connectivity', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single'
      }
    },

    test: function(done) {
      var ReplSet = this.configuration.mongo.ReplSet,
        ObjectId = this.configuration.mongo.BSON.ObjectId;

      var currentIsMasterIndex = 0;
      var step = 0;
      var defaultFields = Object.assign({}, mock.DEFAULT_ISMASTER, {
        setName: 'rs',
        setVersion: 1,
        electionId: new ObjectId(),
        hosts: ['localhost:32000', 'localhost:32001', 'localhost:32002']
      });

      // Primary server states
      var primary = [
        Object.assign({}, defaultFields, {
          ismaster: true,
          secondary: false,
          me: 'localhost:32000',
          primary: 'localhost:32000',
          tags: { loc: 'ny' }
        }),
        Object.assign({}, defaultFields, {
          ismaster: true,
          secondary: false,
          me: 'localhost:32000',
          primary: 'localhost:32000',
          tags: { loc: 'ny' }
        })
      ];

      // Primary server states
      var firstSecondary = [
        Object.assign({}, defaultFields, {
          ismaster: false,
          secondary: true,
          me: 'localhost:32001',
          primary: 'localhost:32000',
          tags: { loc: 'sf' }
        }),
        Object.assign({}, defaultFields, {
          ismaster: false,
          secondary: true,
          me: 'localhost:32001',
          primary: 'localhost:32002',
          tags: { loc: 'sf' }
        })
      ];

      // Primary server states
      var secondSecondary = [
        Object.assign({}, defaultFields, {
          ismaster: false,
          secondary: true,
          me: 'localhost:32002',
          primary: 'localhost:32000',
          tags: { loc: 'sf' }
        }),
        Object.assign({}, defaultFields, {
          ismaster: true,
          secondary: false,
          me: 'localhost:32002',
          primary: 'localhost:32002',
          tags: { loc: 'sf' }
        })
      ];

      // Boot the mock
      co(function*() {
        const primaryServer = yield mock.createServer(32000, 'localhost');
        const firstSecondaryServer = yield mock.createServer(32001, 'localhost');
        const secondSecondaryServer = yield mock.createServer(32002, 'localhost');

        primaryServer.setMessageHandler(request => {
          var doc = request.document;
          // Fail primary
          if (step >= 1) return;

          if (doc.ismaster) {
            request.reply(primary[currentIsMasterIndex]);
          }
        });

        firstSecondaryServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(firstSecondary[currentIsMasterIndex]);
          }
        });

        secondSecondaryServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(secondSecondary[currentIsMasterIndex]);
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
            connectionTimeout: 3000,
            socketTimeout: 0,
            haInterval: 2000,
            size: 1
          }
        );

        let cleaningUp = false;
        server.on('error', done);
        server.on('left', function(_type) {
          if (_type === 'primary') {
            server.on('joined', function(__type, __server) {
              if (__type === 'primary' && __server.name === 'localhost:32002') {
                if (cleaningUp) {
                  return;
                }

                cleaningUp = true;
                server.destroy();
                done();
              }
            });
          }
        });

        server.on('connect', function(_server) {
          server.__connected = true;

          setInterval(function() {
            _server.command('system.$cmd', { ismaster: 1 }, function(err) {
              if (err) {
                // console.error(err);
              } else {
                // console.log({ok: true});
              }
            });
          }, 1000);

          // Primary dies
          setTimeout(function() {
            step = step + 1;

            // Election happened
            setTimeout(function() {
              step = step + 1;
              currentIsMasterIndex = currentIsMasterIndex + 1;
            }, 1000);
          }, 2000);
        });

        server.connect();
      });
    }
  });
});
