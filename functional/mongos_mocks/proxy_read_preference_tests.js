'use strict';
var expect = require('chai').expect,
  assign = require('../../../../lib/utils').assign,
  co = require('co'),
  mock = require('../../../mock');

describe('Mongos Proxy Read Preference (mocks)', function() {
  afterEach(() => mock.cleanup());

  it('Should correctly set query and readpreference field on wire protocol for 3.2', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single'
      }
    },

    test: function(done) {
      var Mongos = this.configuration.mongo.Mongos,
        Long = this.configuration.mongo.BSON.Long,
        ReadPreference = this.configuration.mongo.ReadPreference;

      // Contain mock server
      var mongos1 = null;

      // Default message fields
      var defaultFields = {
        ismaster: true,
        msg: 'isdbgrid',
        maxBsonObjectSize: 16777216,
        maxMessageSizeBytes: 48000000,
        maxWriteBatchSize: 1000,
        localTime: new Date(),
        maxWireVersion: 5,
        minWireVersion: 0,
        ok: 1
      };

      // Primary server states
      var serverIsMaster = [assign({}, defaultFields)];
      // Received command on server
      var command = null;
      // Boot the mock
      co(function*() {
        mongos1 = yield mock.createServer(52013, 'localhost');

        mongos1.setMessageHandler(request => {
          var doc = request.document;

          if (doc.ismaster) {
            request.reply(serverIsMaster[0]);
          } else if (doc.$query && doc.$readPreference) {
            command = doc;
            request.reply({
              waitedMS: Long.ZERO,
              cursor: {
                id: Long.ZERO,
                ns: 'test.t',
                firstBatch: []
              },
              ok: 1
            });
          }
        });
      });

      // Attempt to connect
      var server = new Mongos([{ host: 'localhost', port: 52013 }], {
        connectionTimeout: 3000,
        socketTimeout: 5000,
        haInterval: 1000,
        size: 1
      });

      // Add event listeners
      server.once('fullsetup', function() {
        // Execute find
        var cursor = server.cursor('test.test', {
          find: 'test',
          query: {},
          batchSize: 2,
          readPreference: ReadPreference.secondary
        });

        // Execute next
        cursor.next(function(err, d) {
          expect(err).to.not.exist;
          expect(d).to.be.null;
          expect(command).to.have.keys(['$query', '$readPreference']);
          expect(command.$readPreference.mode).to.equal('secondary');

          server.destroy();
          done();
        });
      });

      server.on('error', done);
      setTimeout(function() {
        server.connect();
      }, 100);
    }
  });

  it('Should correctly set query and near readpreference field on wire protocol for 3.2', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single'
      }
    },

    test: function(done) {
      var Mongos = this.configuration.mongo.Mongos,
        Long = this.configuration.mongo.BSON.Long,
        ReadPreference = this.configuration.mongo.ReadPreference;

      // Contain mock server
      var mongos1 = null;

      // Default message fields
      var defaultFields = {
        ismaster: true,
        msg: 'isdbgrid',
        maxBsonObjectSize: 16777216,
        maxMessageSizeBytes: 48000000,
        maxWriteBatchSize: 1000,
        localTime: new Date(),
        maxWireVersion: 5,
        minWireVersion: 0,
        ok: 1
      };

      // Primary server states
      var serverIsMaster = [assign({}, defaultFields)];
      // Received command on server
      var command = null;
      // Boot the mock
      co(function*() {
        mongos1 = yield mock.createServer(52014, 'localhost');

        mongos1.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(serverIsMaster[0]);
          } else if (doc.$query && doc.$readPreference) {
            command = doc;
            request.reply({
              waitedMS: Long.ZERO,
              cursor: {
                id: Long.ZERO,
                ns: 'test.t',
                firstBatch: []
              },
              ok: 1
            });
          }
        });
      });

      // Attempt to connect
      var server = new Mongos([{ host: 'localhost', port: 52014 }], {
        connectionTimeout: 3000,
        socketTimeout: 5000,
        haInterval: 1000,
        size: 1
      });

      // Add event listeners
      server.once('fullsetup', function() {
        // Execute find
        var cursor = server.cursor('test.test', {
          find: 'test',
          query: {},
          batchSize: 2,
          readPreference: new ReadPreference('nearest', [{ db: 'sf' }])
        });

        // Execute next
        cursor.next(function(err, d) {
          expect(err).to.be.null;
          expect(d).to.be.null;
          expect(command).to.have.keys(['$query', '$readPreference']);
          expect(command.$readPreference.mode).to.equal('nearest');
          expect(command.$readPreference.tags).to.eql([{ db: 'sf' }]);

          server.destroy();
          done();
        });
      });

      server.on('error', done);
      setTimeout(function() {
        server.connect();
      }, 100);
    }
  });

  it('Should correctly set query and readpreference field on wire protocol for 2.6', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single'
      }
    },

    test: function(done) {
      var Mongos = this.configuration.mongo.Mongos,
        ReadPreference = this.configuration.mongo.ReadPreference;

      // Contain mock server
      var mongos1 = null;

      // Default message fields
      var defaultFields = {
        ismaster: true,
        msg: 'isdbgrid',
        maxBsonObjectSize: 16777216,
        maxMessageSizeBytes: 48000000,
        maxWriteBatchSize: 1000,
        localTime: new Date(),
        maxWireVersion: 3,
        minWireVersion: 0,
        ok: 1
      };

      // Primary server states
      var serverIsMaster = [assign({}, defaultFields)];
      // Received command on server
      var command = null;
      // Boot the mock
      co(function*() {
        mongos1 = yield mock.createServer(52015, 'localhost');

        mongos1.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(serverIsMaster[0]);
          } else if (doc.$query && doc.$readPreference) {
            command = doc;
            request.reply([]);
          }
        });
      });

      // Attempt to connect
      var server = new Mongos([{ host: 'localhost', port: 52015 }], {
        connectionTimeout: 3000,
        socketTimeout: 5000,
        haInterval: 1000,
        size: 1
      });

      // Add event listeners
      server.once('connect', function() {
        // Execute find
        var cursor = server.cursor('test.test', {
          find: 'test',
          query: {},
          batchSize: 2,
          readPreference: ReadPreference.secondary
        });

        // Execute next
        cursor.next(function(err, d) {
          expect(err).to.be.null;
          expect(d).to.be.null;
          expect(command).to.have.keys(['$query', '$readPreference']);
          expect(command.$readPreference.mode, 'secondary');

          server.destroy();
          done();
        });
      });

      server.on('error', done);
      setTimeout(function() {
        server.connect();
      }, 100);
    }
  });
});
