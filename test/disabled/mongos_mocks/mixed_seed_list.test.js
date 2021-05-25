'use strict';
const expect = require('chai').expect;
const co = require('co');
const mock = require('mongodb-mock-server');

const core = require('../../../../src/core');
const Logger = core.Logger;
const Mongos = core.Mongos;
const ObjectId = core.BSON.ObjectId;

describe('Mongos Mixed Seed List (mocks)', function () {
  afterEach(() => mock.cleanup());

  it.skip('Should correctly print warning when non mongos proxy passed in seed list', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single'
      }
    },

    test: function (done) {
      // Contain mock server
      var mongos1 = null;
      var mongos2 = null;

      // Default message fields
      var defaultFields = Object.assign({}, mock.DEFAULT_ISMASTER, {
        msg: 'isdbgrid'
      });

      // Default message fields
      var defaultRSFields = Object.assign({}, mock.DEFAULT_ISMASTER, {
        setName: 'rs',
        setVersion: 1,
        electionId: new ObjectId(),
        hosts: ['localhost:32000', 'localhost:32001', 'localhost:32002'],
        arbiters: ['localhost:32002']
      });

      // Primary server states
      var serverIsMaster = [Object.assign({}, defaultFields), Object.assign({}, defaultRSFields)];

      // Boot the mock
      co(function* () {
        mongos1 = yield mock.createServer();
        mongos2 = yield mock.createServer();

        mongos1.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster || doc.hello) {
            request.reply(serverIsMaster[0]);
          } else if (doc.insert) {
            request.reply({ ok: 1, n: doc.documents, lastOp: new Date() });
          }
        });

        mongos2.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster || doc.hello) {
            request.reply(serverIsMaster[1]);
          } else if (doc.insert) {
            request.reply({ ok: 1, n: doc.documents, lastOp: new Date() });
          }
        });

        // Attempt to connect
        var server = new Mongos([mongos1.address(), mongos2.address()], {
          connectionTimeout: 3000,
          socketTimeout: 1000,

          localThresholdMS: 500,
          size: 1
        });

        const logger = Logger.currentLogger();
        Logger.setCurrentLogger(function (msg, state) {
          expect(state.type).to.equal('warn');
          expect(state.message).to.equal(
            `expected mongos proxy, but found replicaset member mongod for server ${mongos2.uri()}`
          );

          Logger.setCurrentLogger(logger);
          server.destroy();
          done();
        });

        // Add event listeners
        server.on('error', done);
        server.connect();
      });
    }
  });

  it.skip('Should correctly print warning and error when no mongos proxies in seed list', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single'
      }
    },

    test: function (done) {
      // Contain mock server
      var mongos1 = null;
      var mongos2 = null;

      // Default message fields
      var defaultRSFields = Object.assign({}, mock.DEFAULT_ISMASTER, {
        setName: 'rs',
        setVersion: 1,
        electionId: new ObjectId(),
        hosts: ['localhost:32000', 'localhost:32001', 'localhost:32002'],
        arbiters: ['localhost:32002']
      });

      // Primary server states
      var serverIsMaster = [Object.assign({}, defaultRSFields), Object.assign({}, defaultRSFields)];

      // Boot the mock
      co(function* () {
        mongos1 = yield mock.createServer();
        mongos2 = yield mock.createServer();

        mongos1.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster || doc.hello) {
            request.reply(serverIsMaster[0]);
          } else if (doc.insert) {
            request.reply({ ok: 1, n: doc.documents, lastOp: new Date() });
          }
        });

        mongos2.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster || doc.hello) {
            request.reply(serverIsMaster[1]);
          } else if (doc.insert) {
            request.reply({ ok: 1, n: doc.documents, lastOp: new Date() });
          }
        });

        // Attempt to connect
        var server = new Mongos([mongos1.address(), mongos2.address()], {
          connectionTimeout: 3000,
          socketTimeout: 1000,

          localThresholdMS: 500,
          size: 1
        });

        var warnings = [];
        var logger = Logger.currentLogger();
        Logger.setCurrentLogger(function (msg, state) {
          console.log('pushed: ', state);
          expect(state.type).to.equal('warn');
          warnings.push(state);
        });

        server.on('error', function () {
          Logger.setCurrentLogger(logger);
          var errors = [
            'expected mongos proxy, but found replicaset member mongod for server localhost:52002',
            'expected mongos proxy, but found replicaset member mongod for server localhost:52003',
            'no mongos proxies found in seed list, did you mean to connect to a replicaset'
          ];

          expect(warnings).to.have.length(3);
          expect(warnings[0].message).to.be.oneOf(errors);
          expect(warnings[1].message).to.be.oneOf(errors);
          expect(warnings[2].message).to.be.oneOf(errors);

          server.destroy();
          done();
        });

        server.connect();
      });
    }
  });
});
