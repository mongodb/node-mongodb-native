'use strict';

const expect = require('chai').expect;

const core = require('../../../lib/core');
const BSON = core.BSON;
const Mongos = core.Mongos;
const ReplSet = core.ReplSet;

describe('Client metadata tests', function() {
  it('should correctly pass the configuration settings to server', {
    metadata: { requires: { topology: 'single' } },

    test: function(done) {
      // Attempt to connect
      var server = this.configuration.newTopology(
        this.configuration.host,
        this.configuration.port,
        {
          bson: new BSON(),
          appname: 'My application name'
        }
      );

      expect(server.clientInfo.application.name).to.equal('My application name');
      done();
    }
  });

  // Skipped due to use of topology manager
  it.skip('should correctly pass the configuration settings to replset', {
    metadata: { requires: { topology: 'replicaset' } },

    test: function(done) {
      const self = this;
      const manager = this.configuration.manager;

      // Get the primary server
      manager.primary().then(function(_manager) {
        // Attempt to connect
        var server = new ReplSet(
          [
            {
              host: _manager.host,
              port: _manager.port
            }
          ],
          {
            setName: self.configuration.setName,
            appname: 'My application name'
          }
        );

        server.on('connect', function(_server) {
          _server.s.replicaSetState.allServers().forEach(function(x) {
            // console.dir(x.clientInfo)
            expect(x.clientInfo.application.name).to.equal('My application name');
            expect(x.clientInfo.platform.split('mongodb-core').length).to.equal(2);
          });

          _server.destroy();
          done();
        });

        server.connect();
      });
    }
  });

  it('should correctly pass the configuration settings to mongos', {
    metadata: { requires: { topology: 'sharded' } },

    test: function(done) {
      // Attempt to connect
      var _server = new Mongos(
        [
          {
            host: 'localhost',
            port: 51000
          }
        ],
        {
          appname: 'My application name'
        }
      );

      // Add event listeners
      _server.once('connect', function(server) {
        server.connectedProxies.forEach(function(x) {
          // console.dir(x.clientInfo)
          expect(x.clientInfo.application.name).to.equal('My application name');
          expect(x.clientInfo.platform.split('mongodb-core').length).to.equal(2);
        });

        server.destroy();
        done();
      });

      _server.connect();
    }
  });
});
