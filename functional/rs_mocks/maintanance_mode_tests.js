'use strict';
var expect = require('chai').expect,
  assign = require('../../../../lib/utils').assign,
  co = require('co'),
  Connection = require('../../../../lib/connection/connection'),
  mock = require('../../../mock'),
  ConnectionSpy = require('../shared').ConnectionSpy;

let test = {};
describe('ReplSet Maintenance Mode (mocks)', function() {
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

    test: function(done) {
      var ReplSet = this.configuration.mongo.ReplSet,
        ObjectId = this.configuration.mongo.BSON.ObjectId;

      // Contain mock server
      var primaryServer = null;
      var firstSecondaryServer = null;
      var secondSecondaryServer = null;
      var arbiterServer = null;
      var currentIsMasterIndex = 0;

      // Default message fields
      var defaultFields = assign({}, mock.DEFAULT_ISMASTER, {
        setName: 'rs',
        setVersion: 1,
        electionId: new ObjectId(),
        hosts: ['localhost:32000', 'localhost:32001', 'localhost:32002', 'localhost:32003'],
        arbiters: ['localhost:32002']
      });

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
        }),
        assign({}, defaultFields, {
          ismaster: false,
          secondary: true,
          me: 'localhost:32001',
          primary: 'localhost:32000',
          tags: { loc: 'sf' }
        })
      ];

      // Primary server states
      var secondSecondary = [
        assign({}, defaultFields, {
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
        assign({}, defaultFields, {
          ismaster: false,
          secondary: false,
          arbiterOnly: true,
          me: 'localhost:32002',
          primary: 'localhost:32000'
        }),
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
        secondSecondaryServer = yield mock.createServer(32003, 'localhost');
        arbiterServer = yield mock.createServer(32002, 'localhost');

        primaryServer.setMessageHandler(request => {
          var doc = request.document;
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

        arbiterServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(arbiter[currentIsMasterIndex]);
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

      // Joined
      var joined = 0;

      server.on('joined', function() {
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

      server.on('left', function(_type, _server) {
        if (_type === 'secondary' && _server.name === 'localhost:32003') {
          server.destroy();
          done();
        }
      });

      // Gives proxies a chance to boot up
      setTimeout(function() {
        server.connect();
      }, 100);
    }
  });
});
