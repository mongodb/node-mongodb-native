'use strict';
var test = require('./shared').assert;
var co = require('co');
var mock = require('../mock');
var assign = require('../../lib/utils').assign;

describe('ReplSet (mocks)', function() {
  afterEach(() => mock.cleanup());

  it('Should correctly print warning when non mongos proxy passed in seed list', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single'
      }
    },

    test: function(done) {
      var configuration = this.configuration;
      var MongoClient = configuration.require.MongoClient,
        ObjectId = configuration.require.ObjectId,
        Logger = configuration.require.Logger;

      // Default message fields
      var defaultFields = assign({}, mock.DEFAULT_ISMASTER, {
        msg: 'isdbgrid'
      });

      // Default message fields
      var defaultRSFields = assign({}, mock.DEFAULT_ISMASTER, {
        setName: 'rs',
        setVersion: 1,
        electionId: new ObjectId(),
        hosts: ['localhost:32000', 'localhost:32001', 'localhost:32002'],
        arbiters: ['localhost:32002']
      });

      // Primary server states
      var serverIsMaster = [assign({}, defaultFields), assign({}, defaultRSFields)];

      // Boot the mock
      co(function*() {
        const mongos1 = yield mock.createServer(52000, 'localhost');
        const mongos2 = yield mock.createServer(52001, 'localhost');

        mongos1.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(serverIsMaster[0]);
          } else if (doc.insert) {
            request.reply({ ok: 1, n: doc.documents, lastOp: new Date() });
          }
        });

        mongos2.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(serverIsMaster[1]);
          } else if (doc.insert) {
            request.reply({ ok: 1, n: doc.documents, lastOp: new Date() });
          }
        });

        var logger = Logger.currentLogger();
        Logger.setCurrentLogger(function(msg, state) {
          test.equal('warn', state.type);
          test.equal(
            'expected mongos proxy, but found replicaset member mongod for server localhost:52001',
            state.message
          );
        });

        MongoClient.connect('mongodb://localhost:52000,localhost:52001/test', function(
          err,
          client
        ) {
          Logger.setCurrentLogger(logger);
          test.equal(null, err);

          client.close();
          done();
        });
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
      var MongoClient = configuration.require.MongoClient,
        ObjectId = configuration.require.ObjectId,
        Logger = configuration.require.Logger;

      // Default message fields
      var defaultRSFields = assign({}, mock.DEFAULT_ISMASTER, {
        setName: 'rs',
        setVersion: 1,
        electionId: new ObjectId(),
        hosts: ['localhost:32000', 'localhost:32001', 'localhost:32002'],
        arbiters: ['localhost:32002']
      });

      // Primary server states
      var serverIsMaster = [assign({}, defaultRSFields), assign({}, defaultRSFields)];

      // Boot the mock
      co(function*() {
        const mongos1 = yield mock.createServer(52002, 'localhost');
        const mongos2 = yield mock.createServer(52003, 'localhost');

        mongos1.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(serverIsMaster[0]);
          } else if (doc.insert) {
            request.reply({ ok: 1, n: doc.documents, lastOp: new Date() });
          }
        });

        mongos2.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(serverIsMaster[1]);
          } else if (doc.insert) {
            request.reply({ ok: 1, n: doc.documents, lastOp: new Date() });
          }
        });

        var warnings = [];
        var logger = Logger.currentLogger();
        Logger.setCurrentLogger(function(msg, state) {
          console.log('HERE');
          test.equal('warn', state.type);
          warnings.push(state);
        });

        MongoClient.connect('mongodb://localhost:52002,localhost:52003/test', function(
          err,
          client
        ) {
          Logger.setCurrentLogger(logger);

          // Assert all warnings
          test.equal(
            'expected mongos proxy, but found replicaset member mongod for server localhost:52002',
            warnings[0].message
          );
          test.equal(
            'expected mongos proxy, but found replicaset member mongod for server localhost:52003',
            warnings[1].message
          );
          test.equal(
            'no mongos proxies found in seed list, did you mean to connect to a replicaset',
            warnings[2].message
          );
          test.equal(
            'seed list contains no mongos proxies, replicaset connections requires the parameter replicaSet to be supplied in the URI or options object, mongodb://server:port/db?replicaSet=name',
            warnings[3].message
          );
          // Assert error
          test.equal(
            'seed list contains no mongos proxies, replicaset connections requires the parameter replicaSet to be supplied in the URI or options object, mongodb://server:port/db?replicaSet=name',
            err.message
          );

          client.close();
          done();
        });
      });
    }
  });

  it('Should correctly set socketTimeoutMS and connectTimeoutMS for mongos', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single'
      }
    },

    test: function(done) {
      var configuration = this.configuration;
      var MongoClient = configuration.require.MongoClient;

      // Default message fields
      var defaultFields = assign({}, mock.DEFAULT_ISMASTER, {
        msg: 'isdbgrid'
      });

      // Primary server states
      var serverIsMaster = [assign({}, defaultFields)];
      // Boot the mock
      co(function*() {
        const mongos1 = yield mock.createServer(12004, 'localhost');
        const mongos2 = yield mock.createServer(12005, 'localhost');

        mongos1.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(serverIsMaster[0]);
          }
        });

        mongos2.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(serverIsMaster[0]);
          }
        });

        MongoClient.connect(
          'mongodb://localhost:12004,localhost:12005/test?socketTimeoutMS=120000&connectTimeoutMS=15000',
          function(err, client) {
            test.equal(null, err);
            test.equal(15000, client.topology.s.coreTopology.s.options.connectionTimeout);
            test.equal(120000, client.topology.s.coreTopology.s.options.socketTimeout);

            client.close();
            done();
          }
        );
      });
    }
  });
});
