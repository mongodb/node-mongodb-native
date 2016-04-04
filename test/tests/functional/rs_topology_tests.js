"use strict";

var fs = require('fs')
  , f = require('util').format;

var restartAndDone = function(configuration, test) {
  configuration.manager.restart().then(function() {
    test.done();
  });
}

// ../topology_test_descriptions/rs/discover_arbiters.json
exports['Discover arbiters'] = {
  metadata: { requires: { topology: "replicaset" } },

  test: function(configuration, test) {
    var Server = configuration.require.Server
      , ReplSet = configuration.require.ReplSet
      , manager = configuration.manager;

    // Get the primary server
    manager.primary().then(function(manager) {
      // Attempt to connect
      var server = new ReplSet([{
          host: manager.host
        , port: manager.port
      }], {
        setName: configuration.setName
      });

      server.on('joined', function(_type, _server) {
        if(_type == 'arbiter') {
          server.destroy();
          restartAndDone(configuration, test);
        }
      });

      // Start connection
      server.connect();
    });
  }
}

// ../topology_test_descriptions/rs/discover_passives.json
exports['Discover passives'] = {
  metadata: { requires: { topology: "replicaset" } },

  test: function(configuration, test) {
    var Server = configuration.require.Server
      , ReplSet = configuration.require.ReplSet
      , manager = configuration.manager;

    // Get the primary server
    manager.primary().then(function(manager) {
      // Attempt to connect
      var server = new ReplSet([{
          host: manager.host
        , port: manager.port
      }], {
        setName: configuration.setName
      });

      server.on('joined', function(_type, _server) {
        if(_type == 'passive') {
          server.destroy();
          restartAndDone(configuration, test);
        }
      });

      // Start connection
      server.connect();
    });
  }
}

// ../topology_test_descriptions/rs/discover_primary.json
exports['Discover primary'] = {
  metadata: { requires: { topology: "replicaset" } },

  test: function(configuration, test) {
    var Server = configuration.require.Server
      , ReplSet = configuration.require.ReplSet
      , manager = configuration.manager;

    // Get the primary server
    manager.primary().then(function(manager) {
      // Attempt to connect
      var server = new ReplSet([{
          host: manager.host
        , port: manager.port
      }], {
        setName: configuration.setName
      });

      server.on('joined', function(_type, _server) {
        if(_type == 'primary') {
          server.destroy();
          restartAndDone(configuration, test);
        }
      });

      // Start connection
      server.connect();
    });
  }
}

// ../topology_test_descriptions/rs/discover_secondary.json
exports['Discover secondaries'] = {
  metadata: { requires: { topology: "replicaset" } },

  test: function(configuration, test) {
    var Server = configuration.require.Server
      , ReplSet = configuration.require.ReplSet
      , manager = configuration.manager;

    // Get the primary server
    manager.primary().then(function(manager) {
      // Attempt to connect
      var server = new ReplSet([{
          host: manager.host
        , port: manager.port
      }], {
        setName: configuration.setName
      });

      var count = 0;
      server.on('joined', function(_type, _server) {
        if(_type == 'secondary') count = count + 1;
        if(count == 2) {
          server.destroy();
          restartAndDone(configuration, test);
        }
      });

      // Start connection
      server.connect();
    });
  }
}

// ../topology_test_descriptions/rs/discovery.json
exports['Replica set discovery'] = {
  metadata: { requires: { topology: "replicaset" } },

  test: function(configuration, test) {
    var Server = configuration.require.Server
      , ReplSet = configuration.require.ReplSet
      , manager = configuration.manager;

    // State
    var state = {'primary':1, 'secondary': 2, 'arbiter': 1, 'passive': 1};
    // Get the primary server
    manager.primary().then(function(manager) {
      // Attempt to connect
      var server = new ReplSet([{
          host: manager.host
        , port: manager.port
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
          restartAndDone(configuration, test);
        }
      });

      // Start connection
      server.connect();
    });
  }
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
      , ServerManager = require('mongodb-topology-manager').Server
      , ReplSet = configuration.require.ReplSet
      , manager = configuration.manager;

    // State
    var state = {'primary':1, 'secondary': 1, 'arbiter': 1, 'passive': 1};
    // Get the primary server
    manager.primary().then(function(primaryManager) {
      // Get the secondary server
      manager.secondaries().then(function(managers) {
        var serverManager = managers[0];

        // Stop the secondary
        serverManager.stop().then(function() {
          // Start a new server manager
          var nonReplSetMember = new ServerManager('mongod', {
            bind_ip: serverManager.host,
            port: serverManager.port,
            dbpath: serverManager.options.dbpath
          });

          // Start a non replset member
          nonReplSetMember.start().then(function() {
            var config = [{
                host: primaryManager.host
              , port: primaryManager.port
            }];

            var options = {
              setName: configuration.setName
            };

            // Wait for primary
            manager.waitForPrimary().then(function() {

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
                  nonReplSetMember.stop().then(function() {
                    // Restart the secondary server
                    serverManager.start().then(function() {
                      restartAndDone(configuration, test);
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
    manager.primary().then(function(manager) {

      // Attempt to connect
      var server = new ReplSet([{
          host: manager.host
        , port: manager.port
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
          restartAndDone(configuration, test);
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
      , ReplSet = configuration.require.ReplSet
      , manager = configuration.manager;

    // State
    var state = {'primary':[], 'secondary': [], 'arbiter': [], 'passive': []};
    // Get the primary server
    manager.primary().then(function(primaryServerManager) {
      // Get the secondary server
      manager.secondaries().then(function(managers) {
        var secondaryServerManager = managers[0];

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
          // console.log("------------------------------------------ 0")
          var removedServer = null;

          // Save number of secondaries
          var numberOfSecondaries = server.state.secondaries.length;
          var numberOfArbiters = server.state.arbiters.length;
          var numberOfPassives = server.state.passives.length;

          // Let's listen to changes
          server.on('left', function(_t, _server) {
            // console.log("--------- left :: " + _t + " :: " + _server.name)
          });

          server.on('joined', function(_t, _server) {
            // console.log("--------- joined :: " + _t + " :: " + _server.name)
            if(_t == 'primary') {
              // console.log("------------------------------------------ 4")
              // console.log("server.state.primary = " + (server.state.primary != null))
              // console.log("numberOfSecondaries = " + numberOfSecondaries)
              // console.log("server.state.secondaries.length = " + server.state.secondaries.length)
              // console.log("server.state.arbiters.length = " + server.state.arbiters.length)
              // console.log("server.state.passives.length = " + server.state.passives.length)
              test.ok(server.state.primary != null);
              test.ok(numberOfSecondaries <= server.state.secondaries.length);
              test.equal(1, server.state.arbiters.length);
              test.equal(1, server.state.passives.length);
              server.destroy();

              // console.log("------------------------------------------ 5")

              // Add a new member to the set
              manager.addMember(secondaryServerManager, {
                returnImmediately: false, force:false
              }).then(function(x) {
                // console.log("------------------------------------------ 6")
                restartAndDone(configuration, test);
              });
            }
          });

          // console.log("------------------------------------------ 1")
          // Remove the secondary server
          manager.removeMember(secondaryServerManager, {
            returnImmediately: false, force: false, skipWait:true
          }).then(function() {
            // console.log("------------------------------------------ 2")

            // Step down primary and block until we have a new primary
            manager.stepDownPrimary(true, {stepDownSecs: 10}).then(function() {
              // console.log("------------------------------------------ 3")

            });
          });
        });

        // Start connection
        server.connect();
      });
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
      , ServerManager = require('mongodb-topology-manager').Server
      , ReplSet = configuration.require.ReplSet
      , manager = configuration.manager;

    // State
    var joined = {'primary':[], 'secondary': [], 'arbiter': [], 'passive': []};
    var left = {'primary':[], 'secondary': [], 'arbiter': [], 'passive': []};

    // Get the primary server
    manager.primary().then(function(primaryServerManager) {
      // Get the secondary server
      manager.secondaries().then(function(managers) {
        var serverManager = managers[0];

        // Start a new server manager
        var nonReplSetMember = new ServerManager('mongod', {
          bind_ip: primaryServerManager.host,
          port: primaryServerManager.port,
          dbpath: primaryServerManager.options.dbpath
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
          primaryServerManager.stop().then(function(r) {
            // Start a non replset member
            nonReplSetMember.start().then(function() {

              // Wait for Primary
              manager.waitForPrimary().then(function(r) {

                // Stop the normal server
                nonReplSetMember.stop().then(function() {

                  // Restart the primary server
                  primaryServerManager.purge().then(function() {

                    // Restart the primary server
                    primaryServerManager.start().then(function() {
                      restartAndDone(configuration, test);
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
