'use strict';
const expect = require('chai').expect;
const co = require('co');
const mock = require('mongodb-mock-server');
const ConnectionSpy = require('../shared').ConnectionSpy;

const core = require('../../../../src/core');
const Connection = core.Connection;
const ReplSet = core.ReplSet;
const ObjectId = core.BSON.ObjectId;

let test = {};
describe('ReplSet Maintenance Mode (mocks)', function () {
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

  it('Successfully detect server in maintanance mode', {
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
        hosts: ['localhost:32000', 'localhost:32001', 'localhost:32002', 'localhost:32003'],
        arbiters: ['localhost:32002']
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
          primary: 'localhost:32000',
          tags: { loc: 'sf' }
        })
      ];

      // Primary server states
      var secondSecondary = [
        Object.assign({}, defaultFields, {
          ismaster: false,
          secondary: true,
          me: 'localhost:32003',
          primary: 'localhost:32000',
          tags: { loc: 'sf' }
        }),
        {
          ismaster: false,
          secondary: false,
          arbiterOnly: false,
          me: 'localhost:32003',
          primary: 'localhost:32000',
          tags: { loc: 'sf' }
        }
      ];

      // Primary server states
      var arbiter = [
        Object.assign({}, defaultFields, {
          ismaster: false,
          secondary: false,
          arbiterOnly: true,
          me: 'localhost:32002',
          primary: 'localhost:32000'
        }),
        Object.assign({}, defaultFields, {
          ismaster: false,
          secondary: false,
          arbiterOnly: true,
          me: 'localhost:32002',
          primary: 'localhost:32000'
        })
      ];

      // Boot the mock
      co(function* () {
        const primaryServer = yield mock.createServer(32000, 'localhost');
        const firstSecondaryServer = yield mock.createServer(32001, 'localhost');
        const secondSecondaryServer = yield mock.createServer(32003, 'localhost');
        const arbiterServer = yield mock.createServer(32002, 'localhost');

        primaryServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster || doc.hello) {
            request.reply(primary[currentIsMasterIndex]);
          }
        });

        firstSecondaryServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster || doc.hello) {
            request.reply(firstSecondary[currentIsMasterIndex]);
          }
        });

        secondSecondaryServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster || doc.hello) {
            request.reply(secondSecondary[currentIsMasterIndex]);
          }
        });

        arbiterServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster || doc.hello) {
            request.reply(arbiter[currentIsMasterIndex]);
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

            size: 1
          }
        );

        // Joined
        var joined = 0;

        server.on('joined', function () {
          joined = joined + 1;

          // primary, secondary and arbiter have joined
          if (joined === 4) {
            expect(server.s.replicaSetState.secondaries).to.have.length(2);
            expect(server.s.replicaSetState.secondaries[0].name).to.equal('localhost:32001');
            expect(server.s.replicaSetState.secondaries[1].name).to.equal('localhost:32003');

            expect(server.s.replicaSetState.arbiters).to.have.length(1);
            expect(server.s.replicaSetState.arbiters[0].name).to.equal('localhost:32002');

            expect(server.s.replicaSetState.primary).to.not.be.null;
            expect(server.s.replicaSetState.primary.name).to.equal('localhost:32000');

            // Flip the ismaster message
            currentIsMasterIndex = currentIsMasterIndex + 1;
          }
        });

        server.on('left', function (_type, _server) {
          if (_type === 'secondary' && _server.name === 'localhost:32003') {
            server.destroy();
            done();
          }
        });

        server.connect();
      });
    }
  });
});
