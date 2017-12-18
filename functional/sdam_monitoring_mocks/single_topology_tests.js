'use strict';
var expect = require('chai').expect,
  co = require('co'),
  mock = require('../../../mock');

describe.skip('Single SDAM Monitoring (mocks)', function() {
  afterEach(() => mock.cleanup());

  it('Should correctly emit sdam monitoring events for single server', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single'
      }
    },

    test: function(done) {
      var Server = this.configuration.mongo.Server;

      // Contain mock server
      var server = null;

      // Default message fields
      var defaultFields = {
        ismaster: true,
        maxBsonObjectSize: 16777216,
        maxMessageSizeBytes: 48000000,
        maxWriteBatchSize: 1000,
        localTime: new Date(),
        maxWireVersion: 3,
        minWireVersion: 0,
        ok: 1
      };

      // Primary server states
      var serverIsMaster = [Object.assign({}, defaultFields)];

      // Boot the mock
      var mockServer;
      co(function*() {
        mockServer = yield mock.createServer(37018, 'localhost');

        mockServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(serverIsMaster[0]);
          }
        });
      });

      // Attempt to connect
      server = new Server({
        host: 'localhost',
        port: '37018',
        connectionTimeout: 3000,
        socketTimeout: 1000,
        size: 1
      });

      // Results
      var flags = [];
      var id = null;

      // Add event listeners
      server.once('connect', function(_server) {
        id = _server.id;
        _server.destroy({ emitClose: true });
      });

      server.on('serverOpening', function(event) {
        flags[0] = event;
      });

      server.on('serverClosed', function(event) {
        flags[1] = event;
      });

      server.on('serverDescriptionChanged', function(event) {
        flags[2] = event;
      });

      server.on('topologyOpening', function(event) {
        flags[3] = event;
      });

      server.on('topologyClosed', function(event) {
        flags[4] = event;
      });

      server.on('topologyDescriptionChanged', function(event) {
        flags[5] = event;
      });

      server.on('error', done);
      server.on('close', function() {
        setTimeout(function() {
          expect({ topologyId: id, address: 'localhost:37018' }).to.eql(flags[0]);
          expect({ topologyId: id, address: 'localhost:37018' }).to.eql(flags[1]);
          expect({
            topologyId: id,
            address: 'localhost:37018',
            previousDescription: {
              address: 'localhost:37018',
              arbiters: [],
              hosts: [],
              passives: [],
              type: 'Unknown'
            },
            newDescription: {
              address: 'localhost:37018',
              arbiters: [],
              hosts: [],
              passives: [],
              type: 'Standalone'
            }
          }).to.eql(flags[2]);

          expect({ topologyId: id }).to.eql(flags[3]);
          expect({ topologyId: id }).to.eql(flags[4]);
          expect({
            topologyId: id,
            address: 'localhost:37018',
            previousDescription: {
              topologyType: 'Unknown',
              servers: [
                {
                  address: 'localhost:37018',
                  arbiters: [],
                  hosts: [],
                  passives: [],
                  type: 'Unknown'
                }
              ]
            },
            newDescription: {
              topologyType: 'Single',
              servers: [
                {
                  address: 'localhost:37018',
                  arbiters: [],
                  hosts: [],
                  passives: [],
                  type: 'Standalone'
                }
              ]
            }
          }).to.eql(flags[5]);

          server.destroy();
          done();
        }, 100);
      });

      setTimeout(function() {
        server.connect();
      }, 100);
    }
  });

  it('Should correctly emit sdam monitoring events for single server, with correct server type', {
    metadata: { requires: { generators: true, topology: 'single' } },

    test: function(done) {
      var Server = this.configuration.mongo.Server;

      // Contain mock server
      var server = null;

      // Default message fields
      var defaultFields = {
        ismaster: true,
        maxBsonObjectSize: 16777216,
        maxMessageSizeBytes: 48000000,
        maxWriteBatchSize: 1000,
        localTime: new Date(),
        maxWireVersion: 3,
        minWireVersion: 0,
        ok: 1,
        hosts: ['a:27017', 'b:27017'] // <-- this makes it an RSPrimary
      };

      // Primary server states
      var serverIsMaster = [Object.assign({}, defaultFields)];

      // Boot the mock
      var mockServer;
      co(function*() {
        mockServer = yield mock.createServer(37008, 'localhost');

        mockServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(serverIsMaster[0]);
          }
        });
      });

      // Attempt to connect
      server = new Server({
        host: 'localhost',
        port: '37008',
        connectionTimeout: 3000,
        socketTimeout: 1000,
        size: 1
      });

      // Results
      var flags = [];
      var id = null;

      // Add event listeners
      server.once('connect', function(_server) {
        id = _server.id;
        _server.destroy({ emitClose: true });
      });

      server.on('serverOpening', function(event) {
        flags[0] = event;
      });

      server.on('serverClosed', function(event) {
        flags[1] = event;
      });

      server.on('serverDescriptionChanged', function(event) {
        flags[2] = event;
      });

      server.on('topologyOpening', function(event) {
        flags[3] = event;
      });

      server.on('topologyClosed', function(event) {
        flags[4] = event;
      });

      server.on('topologyDescriptionChanged', function(event) {
        flags[5] = event;
      });

      server.on('error', done);
      server.on('close', function() {
        setTimeout(function() {
          expect({ topologyId: id, address: 'localhost:37008' }, flags[0]);
          expect({ topologyId: id, address: 'localhost:37008' }, flags[1]);
          expect({
            topologyId: id,
            address: 'localhost:37008',
            previousDescription: {
              address: 'localhost:37008',
              arbiters: [],
              hosts: [],
              passives: [],
              type: 'Unknown'
            },
            newDescription: {
              address: 'localhost:37008',
              arbiters: [],
              hosts: [],
              passives: [],
              type: 'RSPrimary'
            }
          }).to.eql(flags[2]);
          expect({ topologyId: id }).to.eql(flags[3]);
          expect({ topologyId: id }).to.eql(flags[4]);
          expect({
            topologyId: id,
            address: 'localhost:37008',
            previousDescription: {
              topologyType: 'Unknown',
              servers: [
                {
                  address: 'localhost:37008',
                  arbiters: [],
                  hosts: [],
                  passives: [],
                  type: 'Unknown'
                }
              ]
            },
            newDescription: {
              topologyType: 'Single',
              servers: [
                {
                  address: 'localhost:37008',
                  arbiters: [],
                  hosts: [],
                  passives: [],
                  type: 'RSPrimary'
                }
              ]
            }
          }).to.eql(flags[5]);

          server.destroy();
          done();
        }, 100);
      });

      setTimeout(function() {
        server.connect();
      }, 100);
    }
  });
});
