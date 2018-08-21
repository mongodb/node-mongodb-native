'use strict';
var expect = require('chai').expect,
  mock = require('mongodb-mock-server'),
  ObjectId = require('bson').ObjectId;

const test = {};
describe('ReplSet (mocks)', function() {
  afterEach(() => mock.cleanup());
  beforeEach(() => {
    // Default message fields
    const defaultFields = Object.assign({}, mock.DEFAULT_ISMASTER, {
      msg: 'isdbgrid'
    });

    // Default message fields
    const defaultRSFields = Object.assign({}, mock.DEFAULT_ISMASTER, {
      setName: 'rs',
      setVersion: 1,
      electionId: new ObjectId(),
      hosts: ['localhost:32000', 'localhost:32001', 'localhost:32002'],
      arbiters: ['localhost:32002']
    });

    // Primary server states
    const serverIsMaster = [Object.assign({}, defaultFields), Object.assign({}, defaultRSFields)];

    return Promise.all([mock.createServer(), mock.createServer()]).then(servers => {
      test.mongos1 = servers[0];
      test.mongos2 = servers[1];

      test.mongos1.setMessageHandler(request => {
        var doc = request.document;
        if (doc.ismaster) {
          request.reply(serverIsMaster[0]);
        } else if (doc.insert) {
          request.reply({ ok: 1, n: doc.documents, lastOp: new Date() });
        } else if (doc.endSessions) {
          request.reply({ ok: 1 });
        }
      });

      test.mongos2.setMessageHandler(request => {
        var doc = request.document;
        if (doc.ismaster) {
          request.reply(serverIsMaster[1]);
        } else if (doc.insert) {
          request.reply({ ok: 1, n: doc.documents, lastOp: new Date() });
        } else if (doc.endSessions) {
          request.reply({ ok: 1 });
        }
      });
    });
  });

  it('Should correctly print warning when non mongos proxy passed in seed list', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single'
      }
    },

    test: function(done) {
      var configuration = this.configuration;
      var Logger = configuration.require.Logger;
      var logger = Logger.currentLogger();
      Logger.setLevel('warn');
      Logger.setCurrentLogger(function(msg, state) {
        expect(state.type).to.equal('warn');
        expect(state.message).to.equal(
          `expected mongos proxy, but found replicaset member mongod for server ${test.mongos2.uri()}`
        );
      });

      const client = configuration.newClient(
        `mongodb://${test.mongos1.uri()},${test.mongos2.uri()}/test`
      );
      client.connect(function(err, client) {
        Logger.setCurrentLogger(logger);
        Logger.reset();
        expect(err).to.not.exist;

        client.close();
        done();
      });
    }
  });

  it('Should correctly print warning and error when no mongos proxies in seed list', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single'
      },
      ignore: { travis: true }
    },

    test: function(done) {
      var configuration = this.configuration;
      var Logger = configuration.require.Logger;
      var warnings = [];
      var logger = Logger.currentLogger();
      Logger.setLevel('warn');
      Logger.setCurrentLogger(function(msg, state) {
        expect(state.type).to.equal('warn');
        warnings.push(state);
      });

      const client = configuration.newClient(
        `mongodb://${test.mongos1.uri()},${test.mongos2.uri()}/test`
      );

      client.connect(function(err, client) {
        Logger.setCurrentLogger(logger);
        Logger.reset();

        // Assert all warnings
        expect(warnings[0].message).to.equal(
          `expected mongos proxy, but found replicaset member mongod for server ${test.mongos1.uri()}`
        );

        expect(warnings[1].message).to.equal(
          `expected mongos proxy, but found replicaset member mongod for server ${test.mongos2.uri()}`
        );

        expect(warnings[2].message).to.equal(
          'no mongos proxies found in seed list, did you mean to connect to a replicaset'
        );

        expect(warnings[3].message).to.equal(
          'seed list contains no mongos proxies, replicaset connections requires the parameter replicaSet to be supplied in the URI or options object, mongodb://server:port/db?replicaSet=name'
        );

        // Assert error
        expect(err.message).to.equal(
          'seed list contains no mongos proxies, replicaset connections requires the parameter replicaSet to be supplied in the URI or options object, mongodb://server:port/db?replicaSet=name'
        );

        client.close();
        done();
      });
    }
  });

  // NOTE: skipped for inspection of private variables
  it.skip('Should correctly set socketTimeoutMS and connectTimeoutMS for mongos', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single'
      }
    },

    test: function(done) {
      var configuration = this.configuration;
      const client = configuration.newClient(
        `mongodb://${test.mongos1.uri()},${test.mongos2.uri()}/test?socketTimeoutMS=120000&connectTimeoutMS=15000`
      );

      client.connect(function(err, client) {
        expect(err).to.not.exist;
        expect(client.topology.s.coreTopology.s.options.connectionTimeout).to.equal(15000);
        expect(client.topology.s.coreTopology.s.options.socketTimeout).to.equal(120000);

        client.close();
        done();
      });
    }
  });
});
