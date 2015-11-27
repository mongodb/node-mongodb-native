"use strict";

var fs = require('fs')
  , f = require('util').format;

// ../topology_test_descriptions/single/direct_connection_external_ip.json
exports['Direct connection to RSPrimary via external IP'] = {
  metadata: {
    requires: {
      topology: "replicaset"
    }
  },

  test: function(configuration, test) {
    var Server = configuration.require.Server
      , manager = configuration.manager;

    // Get the primary server
    manager.primary().then(function(serverManager) {

      // Attempt to connect
      var server = new Server({
          host: serverManager.host
        , port: serverManager.port
      });

      server.on('connect', function(_server) {
        _server.destroy();
        test.done();
      });

      // Start connection
      server.connect();
    });
  }
}

// ../topology_test_descriptions/single/direct_connection_mongos.json
exports['Connect to mongos'] = {
  metadata: {
    requires: {
      topology: "mongos"
    }
  },

  test: function(configuration, test) {
    var Server = configuration.require.Server
      , manager = configuration.manager;

    // Attempt to connect
    var server = new Server({
        host: 'localhost'
      , port: manager.mongosStartPort
    });

    server.on('connect', function(_server) {
      _server.destroy();
      test.done();
    });

    // Start connection
    server.connect();
  }
}

// ../topology_test_descriptions/single/direct_connection_rsarbiter.json
exports['Connect to RSArbiter'] = {
  metadata: {
    requires: {
      topology: "replicaset"
    }
  },

  test: function(configuration, test) {
    var Server = configuration.require.Server
      , manager = configuration.manager;

    // Get the primary server
    manager.arbiters().then(function(managers) {
      // Attempt to connect
      var server = new Server({
          host: managers[0].host
        , port: managers[0].port
      });

      server.on('connect', function(_server) {
        _server.destroy();
        test.done();
      });

      // Start connection
      server.connect();
    });
  }
}

// ../topology_test_descriptions/single/direct_connection_rssecondary.json
exports['Connect to RSSecondary'] = {
  metadata: {
    requires: {
      topology: "replicaset"
    }
  },

  test: function(configuration, test) {
    var Server = configuration.require.Server
      , manager = configuration.manager;

      // Get the primary server
      manager.secondaries().then(function(managers) {
        // Attempt to connect
        var server = new Server({
            host: managers[0].host
          , port: managers[0].port
        });

      server.on('connect', function(_server) {
        _server.destroy();
        test.done();
      });

      // Start connection
      server.connect();
    });
  }
}

// ../topology_test_descriptions/single/direct_connection_standalone.json
exports['Connect to mongos'] = {
  metadata: {
    requires: {
      topology: "single"
    }
  },

  test: function(configuration, test) {
    var Server = configuration.require.Server
      , manager = configuration.manager;

    // Attempt to connect
    var server = new Server({
        host: manager.host
      , port: manager.port
    });

    server.on('connect', function(_server) {
      _server.destroy();
      test.done();
    });

    // Start connection
    server.connect();
  }
}
