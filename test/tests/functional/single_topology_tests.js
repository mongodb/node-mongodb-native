var fs = require('fs')
  , f = require('util').format;

// var parseTopologyTestFiles = function(dir) {
//   console.dir()
//   // Get all the entries
//   var entries = fs.readdirSync(dir);
//   // Filter out all the entries that are not json files
//   entries = entries.filter(function(entry) {
//     return entry.indexOf('.json') != -1;
//   });
//   // Read in and parse all the entries
//   entries = entries.map(function(entry) {
//     var file = fs.readFileSync(f("%s/%s", dir, entry), 'utf8');
//     return JSON.parse(file);
//   });

//   return entries;
// }

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
    manager.getServerManagerByType('primary', function(err, serverManager) {
      test.equal(null, err);

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
    manager.getServerManagerByType('arbiter', function(err, serverManager) {
      test.equal(null, err);

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
    manager.getServerManagerByType('secondary', function(err, serverManager) {
      test.equal(null, err);

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
