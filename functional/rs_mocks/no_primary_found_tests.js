'use strict';
const co = require('co');
const Connection = require('../../../../lib/connection/connection');
const mock = require('../../../mock');
const ConnectionSpy = require('../shared').ConnectionSpy;

let test = {};
describe('ReplSet No Primary Found (mocks)', function() {
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

  it('Should correctly connect to a replicaset where the arbiter hangs no primary found error', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single'
      }
    },

    test: function(done) {
      var ReplSet = this.configuration.mongo.ReplSet,
        ObjectId = this.configuration.mongo.BSON.ObjectId;

      var defaultFields = Object.assign({}, mock.DEFAULT_ISMASTER, {
        setName: 'rs',
        setVersion: 1,
        electionId: new ObjectId(),
        hosts: ['localhost:32000', 'localhost:32001', 'localhost:32002'],
        arbiters: ['localhost:32003']
      });

      // Primary server states
      var primary = [
        Object.assign({}, defaultFields, {
          ismaster: true,
          secondary: false,
          me: 'localhost:32000',
          primary: 'localhost:32000'
        })
      ];

      // Primary server states
      var firstSecondary = [
        Object.assign({}, defaultFields, {
          ismaster: false,
          secondary: true,
          me: 'localhost:32001',
          primary: 'localhost:32000'
        })
      ];

      // Primary server states
      var secondSecondary = [
        Object.assign({}, defaultFields, {
          ismaster: false,
          secondary: true,
          me: 'localhost:32002',
          primary: 'localhost:32000'
        })
      ];

      // Primary server states
      var arbiter = [
        Object.assign({}, defaultFields, {
          ismaster: false,
          secondary: false,
          arbiterOnly: true,
          me: 'localhost:32003',
          primary: 'localhost:32000'
        })
      ];

      // Boot the mock
      co(function*() {
        const primaryServer = yield mock.createServer(32000, 'localhost');
        const firstSecondaryServer = yield mock.createServer(32001, 'localhost');
        const secondSecondaryServer = yield mock.createServer(32002, 'localhost');
        const arbiterServer = yield mock.createServer(32003, 'localhost');

        primaryServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(primary[0]);
          }
        });

        firstSecondaryServer.setMessageHandler(request => {
          setTimeout(() => {
            var doc = request.document;
            if (doc.ismaster) {
              request.reply(firstSecondary[0]);
            }
          }, 9000000); // never respond?
        });

        secondSecondaryServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(secondSecondary[0]);
          }
        });

        arbiterServer.setMessageHandler(request => {
          setTimeout(() => {
            var doc = request.document;
            if (doc.ismaster) {
              request.reply(arbiter[0]);
            }
          }, 9000000); // never respond?
        });

        // Attempt to connect
        var server = new ReplSet([{ host: 'localhost', port: 32000 }], {
          setName: 'rs',
          connectionTimeout: 2000,
          socketTimeout: 4000,
          haInterval: 2000,
          size: 1
        });

        // Add event listeners
        server.on('connect', function() {
          server.destroy();
          done();
        });

        server.on('error', done);
        server.connect();
      });
    }
  });
});
