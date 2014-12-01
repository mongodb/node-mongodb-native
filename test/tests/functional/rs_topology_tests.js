"use strict";

var fs = require('fs')
  , f = require('util').format;

var restartAndDone = function(configuration, test) {
  configuration.manager.restart(function() {
    test.done();
  });
}

// ../topology_test_descriptions/rs/discover_arbiters.json
exports['Discover arbiters'] = {
  metadata: {
    requires: {
      topology: "replicaset"
    }
  },

  test: function(configuration, test) {
    var Server = configuration.require.Server
      , ReplSet = configuration.require.ReplSet
      , manager = configuration.manager;

    // Get the primary server
    manager.getServerManagerByType('primary', function(err, serverManager) {
      test.equal(null, err);

      // Attempt to connect
      var server = new ReplSet([{
          host: serverManager.host
        , port: serverManager.port
      }], { 
        setName: configuration.setName 
      });

      server.on('joined', function(_type, _server) {
        if(_type == 'arbiter') {
          server.destroy();
          test.done();          
        }
      });

      // Start connection
      server.connect();
    });
  }
}

// ../topology_test_descriptions/rs/discover_passives.json
exports['Discover passives'] = {
  metadata: {
    requires: {
      topology: "replicaset"
    }
  },

  test: function(configuration, test) {
    var Server = configuration.require.Server
      , ReplSet = configuration.require.ReplSet
      , manager = configuration.manager;

    // Get the primary server
    manager.getServerManagerByType('primary', function(err, serverManager) {
      test.equal(null, err);

      // Attempt to connect
      var server = new ReplSet([{
          host: serverManager.host
        , port: serverManager.port
      }], { 
        setName: configuration.setName
      });

      server.on('joined', function(_type, _server) {
        if(_type == 'passive') {
          server.destroy();
          test.done();          
        }
      });

      // Start connection
      server.connect();
    });
  }
}

// ../topology_test_descriptions/rs/discover_primary.json
exports['Discover primary'] = {
  metadata: {
    requires: {
      topology: "replicaset"
    }
  },

  test: function(configuration, test) {
    var Server = configuration.require.Server
      , ReplSet = configuration.require.ReplSet
      , manager = configuration.manager;

    // Get the primary server
    manager.getServerManagerByType('primary', function(err, serverManager) {
      test.equal(null, err);

      // Attempt to connect
      var server = new ReplSet([{
          host: serverManager.host
        , port: serverManager.port
      }], { 
        setName: configuration.setName 
      });

      server.on('joined', function(_type, _server) {
        if(_type == 'primary') {
          server.destroy();
          test.done();          
        }
      });

      // Start connection
      server.connect();
    });
  }
}

// ../topology_test_descriptions/rs/discover_secondary.json
exports['Discover secondaries'] = {
  metadata: {
    requires: {
      topology: "replicaset"
    }
  },

  test: function(configuration, test) {
    var Server = configuration.require.Server
      , ReplSet = configuration.require.ReplSet
      , manager = configuration.manager;

    // Get the primary server
    manager.getServerManagerByType('primary', function(err, serverManager) {
      test.equal(null, err);

      // Attempt to connect
      var server = new ReplSet([{
          host: serverManager.host
        , port: serverManager.port
      }], { 
        setName: configuration.setName 
      });

      var count = 0;
      server.on('joined', function(_type, _server) {
        if(_type == 'secondary') count = count + 1;
        if(count == 2) {
          server.destroy();
          test.done();          
        }
      });

      // Start connection
      server.connect();
    });
  }
}

// ../topology_test_descriptions/rs/discovery.json
exports['Replica set discovery'] = {
  metadata: {
    requires: {
      topology: "replicaset"
    }
  },

  test: function(configuration, test) {
    var Server = configuration.require.Server
      , ReplSet = configuration.require.ReplSet
      , manager = configuration.manager;

    // State
    var state = {'primary':1, 'secondary': 2, 'arbiter': 1, 'passive': 1};
    // Get the primary server
    manager.getServerManagerByType('primary', function(err, serverManager) {
      test.equal(null, err);

      // Attempt to connect
      var server = new ReplSet([{
          host: serverManager.host
        , port: serverManager.port
      }], { 
        setName: configuration.setName 
      });

      server.on('joined', function(_type, _server) {
        state[_type] = state[_type] - 1;

        if(state.primary == 0
          && state.secondary == 0
          && state.arbiter == 0
          && state.passive == 0) {
          server.destroy();
          test.done();          
        }
      });

      // Start connection
      server.connect();
    });
  }
}

var waitForPrimary = function(ReplSet, count, config, options, callback) {
  if(count == 0) return callback(new Error("could not connect"));
  // Attempt to connect
  var server = new ReplSet(config, options);
  server.on('error', function(err) {
    server.destroy();
    
    setTimeout(function() {
      waitForPrimary(ReplSet, count - 1, config, options, callback);
    }, 1000);
  });

  server.on('fullsetup', function(_server) {
    server.destroy();
    callback();
  });

  // Start connection
  server.connect();
}

// ../topology_test_descriptions/rs/ghost_discovery.json
exports['Ghost discovered/Member brought up as standalone'] = {
  metadata: {
    requires: {
      topology: "replicaset"
    }
  },

  test: function(configuration, test) {
    var Server = configuration.require.Server
      , ServerManager = configuration.require.ServerManager
      , ReplSet = configuration.require.ReplSet
      , manager = configuration.manager;

    // State
    var state = {'primary':1, 'secondary': 1, 'arbiter': 1, 'passive': 1};
    // Get the primary server
    manager.getServerManagerByType('primary', function(err, primaryServerManager) {
      test.equal(null, err);

      // Get the secondary server
      manager.getServerManagerByType('secondary', function(err, serverManager) {
        test.equal(null, err);

        // Stop the secondary
        serverManager.stop(function(err, r) {

          // Start a new server manager
          var nonReplSetMember = new ServerManager({
              host: serverManager.host
            , port: serverManager.port
            , dbpath: serverManager.dbpath
            , logpath: serverManager.logpath
          });

          // Start a non replset member
          nonReplSetMember.start(function() {
            var config = [{
                host: primaryServerManager.host
              , port: primaryServerManager.port
            }];

            var options = { 
              setName: configuration.setName 
            };

            // Wait for primary
            waitForPrimary(ReplSet, 30, config, options, function(err, r) {
              test.equal(null, err);

              // Attempt to connect
              var server = new ReplSet(config, options);
              server.on('joined', function(_type, _server) {
                state[_type] = state[_type] - 1;

                if(state.primary == 0
                  && state.secondary == 0
                  && state.arbiter == 0
                  && state.passive == 0) {
                  server.destroy();

                  // Stop the normal server
                  nonReplSetMember.stop(function() {
                    // Restart the secondary server
                    serverManager.start(function() {
                      test.done();
                    });
                  });
                }
              });

              // Start connection
              server.connect();
            });
          });
        });
      });
    });
  }
}

// ../topology_test_descriptions/rs/hosts_differ_from_seeds.json
exports['Host list differs from seeds'] = {
  metadata: {
    requires: {
      topology: "replicaset"
    }
  },

  test: function(configuration, test) {
    var Server = configuration.require.Server
      , ReplSet = configuration.require.ReplSet
      , manager = configuration.manager;

    // State
    var state = {'primary':1, 'secondary': 2, 'arbiter': 1, 'passive': 1};
    // Get the primary server
    manager.getServerManagerByType('primary', function(err, serverManager) {
      test.equal(null, err);

      // Attempt to connect
      var server = new ReplSet([{
          host: serverManager.host
        , port: serverManager.port
      }, {
          host: 'localhost'
        , port: 41000
      }], { 
        setName: configuration.setName 
      });

      server.on('joined', function(_type, _server) {
        state[_type] = state[_type] - 1;

        if(state.primary == 0
          && state.secondary == 0
          && state.arbiter == 0
          && state.passive == 0) {
          server.destroy();
          test.done();          
        }
      });

      // Start connection
      server.connect();
    });
  }
}

// ../topology_test_descriptions/rs/member_reconfig.json
exports['Member removed by reconfig'] = {
  metadata: {
    requires: {
      topology: "replicaset"
    }
  },

  test: function(configuration, test) {
    var Server = configuration.require.Server
      , ServerManager = configuration.require.ServerManager
      , ReplSet = configuration.require.ReplSet
      , manager = configuration.manager;

    // State
    var state = {'primary':[], 'secondary': [], 'arbiter': [], 'passive': []};
    // Get the primary server
    manager.getServerManagerByType('primary', function(err, primaryServerManager) {
      test.equal(null, err);

      manager.getServerManagerByType('secondary', function(err, secondaryServerManager) {
        test.equal(null, err);

        var config = [{
            host: primaryServerManager.host
          , port: primaryServerManager.port
        }];

        var options = { 
          setName: configuration.setName 
        };

        // Contains the details for the removed server
        var removedSever = null;
        // Attempt to connect
        var server = new ReplSet(config, options);
        server.on('fullsetup', function(_server) {
          var removedServer = null;

          // Let's listen to changes
          server.on('left', function(_t, _server) {});

          server.on('joined', function(_t, _server) {
            if(_t == 'primary') {
              test.ok(server.state.primary != null);
              test.equal(1, server.state.secondaries.length);
              test.equal(1, server.state.arbiters.length);
              test.equal(1, server.state.passives.length);
              server.destroy();

              // Add back the secondary
              manager.add(removedServer, function(err) {
                test.equal(null, err);
                restartAndDone(configuration, test);
              });
            }
          });

          // Get the secondary server
          manager.remove('secondary', function(err, _removedServer) {
            test.equal(null, err);
            removedServer = _removedServer;
          });
        });

        // Start connection
        server.connect();
      });
    });
  }
}

// ../topology_test_descriptions/rs/new_primary.json
exports['New primary'] = {
  metadata: {
    requires: {
      topology: "replicaset"
    }
  },

  test: function(configuration, test) {
    var Server = configuration.require.Server
      , ServerManager = configuration.require.ServerManager
      , ReplSet = configuration.require.ReplSet
      , manager = configuration.manager;

    // State
    var state = {'primary':[], 'secondary': [], 'arbiter': [], 'passive': []};
    // Get the primary server
    manager.getServerManagerByType('primary', function(err, primaryServerManager) {
      test.equal(null, err);

      var config = [{
          host: primaryServerManager.host
        , port: primaryServerManager.port
      }];

      var options = { 
        setName: configuration.setName 
      };

      // Attempt to connect
      var server = new ReplSet(config, options);
      server.on('fullsetup', function(_server) {
        var removedServer = null;

        // Let's listen to changes
        server.on('left', function(_t, _server) {
          if(_t == 'primary') {
            test.equal(f('%s:%s', primaryServerManager.host, primaryServerManager.port), _server.name);
          }
        });

        server.on('joined', function(_t, _server) {
          if(_t == 'primary') {
            test.ok(server.state.primary != null);
            test.equal(2, server.state.secondaries.length);
            test.equal(1, server.state.arbiters.length);
            test.equal(1, server.state.passives.length);
            server.destroy();
            test.done();
          }
        });

        manager.stepDown(function(err) {});
      });

      // Start connection
      server.connect();
    });
  }
}

// ../topology_test_descriptions/rs/primary_becomes_standalone.json
exports['Primary becomes standalone'] = {
  metadata: {
    requires: {
      topology: "replicaset"
    }
  },

  test: function(configuration, test) {
    var Server = configuration.require.Server
      , ServerManager = configuration.require.ServerManager
      , ReplSet = configuration.require.ReplSet
      , manager = configuration.manager;

    // State
    var joined = {'primary':[], 'secondary': [], 'arbiter': [], 'passive': []};
    var left = {'primary':[], 'secondary': [], 'arbiter': [], 'passive': []};
    // Get the primary server
    manager.getServerManagerByType('primary', function(err, primaryServerManager) {
      test.equal(null, err);

      // Get the secondary server
      manager.getServerManagerByType('secondary', function(err, serverManager) {
        test.equal(null, err);

        // Start a new server manager
        var nonReplSetMember = new ServerManager({
            host: primaryServerManager.host
          , port: primaryServerManager.port
          , dbpath: primaryServerManager.dbpath
          , logpath: primaryServerManager.logpath
        });

        var config = [{
            host: serverManager.host
          , port: serverManager.port
        }];

        var options = { 
          setName: configuration.setName 
        };

        // Attempt to connect
        var server = new ReplSet(config, options);
        server.on('fullsetup', function(_server) {
          server.on('joined', function(_type, _server) {
            joined[_type].push(_server);

            if(_type == 'primary') {
              server.destroy();
              restartAndDone(configuration, test);
            }
          });

          server.on('left', function(_type, _server) {
            left[_type].push(_server);
          });

          // Stop the primary
          primaryServerManager.stop(function(err, r) {

            // Start a non replset member
            nonReplSetMember.start(function() {

              // Wait for primary
              waitForPrimary(ReplSet, 30, config, options, function(err, r) {
                test.equal(null, err);

                // Stop the normal server
                nonReplSetMember.stop(function() {
                  
                  // Restart the primary server
                  primaryServerManager.start(function() {

                    // Wait for primary
                    waitForPrimary(ReplSet, 30, config, options, function(err, r) {
                      test.equal(null, err);
                      test.equal(1, left.primary.length);
                      test.equal(1, left.secondary.length);
                    });
                  });
                });
              });
            });
          });
        });

        // Start connection
        server.connect();
      });
    });
  }
}
