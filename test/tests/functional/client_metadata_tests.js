"use strict";

var f = require('util').format
  , Long = require('bson').Long;

exports['Should correctly pass the configuration settings to server'] = {
  metadata: { requires: { topology: "single" } },

  test: function(configuration, test) {
    var Server = require('../../../lib/topologies/server')
      , bson = require('bson').BSONPure.BSON;

    // Attempt to connect
    var server = new Server({
        host: configuration.host
      , port: configuration.port
      , bson: new bson()
      , appname: 'My application name'
    })

    test.equal('My application name', server.clientInfo.application.name);
    test.done();
  }
}

exports['Should correctly pass the configuration settings to replset'] = {
  metadata: { requires: { topology: "replicaset" } },

  test: function(configuration, test) {
    var ReplSet = configuration.require.ReplSet,
      manager = configuration.manager;

    // Get the primary server
    manager.primary().then(function(manager) {
      // Attempt to connect
      var server = new ReplSet([{
          host: manager.host
        , port: manager.port
      }], {
        setName: configuration.setName, appname: 'My application name'
      });

      server.on('connect', function(_server) {
        _server.s.replicaSetState.allServers().forEach(function(x) {
          // console.dir(x.clientInfo)
          test.equal('My application name', x.clientInfo.application.name);
          test.equal(2, x.clientInfo.platform.split('mongodb-core').length);
        })

        _server.destroy();
        test.done();
      });

      server.connect();
    });
  }
}

exports['Should correctly pass the configuration settings to mongos'] = {
  metadata: { requires: { topology: "sharded" } },

  test: function(configuration, test) {
    var Mongos = require('../../../lib/topologies/mongos')
      , bson = require('bson').BSONPure.BSON;

      // Attempt to connect
      var _server = new Mongos([
          { host: 'localhost', port: 51000 },
        ], {
        appname: 'My application name'
      });

      // Add event listeners
      _server.once('connect', function(server) {
        server.connectedProxies.forEach(function(x) {
          // console.dir(x.clientInfo)
          test.equal('My application name', x.clientInfo.application.name);
          test.equal(2, x.clientInfo.platform.split('mongodb-core').length);
        })

        server.destroy();
        test.done();
      });

      _server.connect();
  }
}
