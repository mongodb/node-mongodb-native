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
        // console.log("======================= joined :: " + _type + " :: " + server.name)
        if(_type == 'arbiter') {
          server.destroy();
          test.done();
          // restartAndDone(configuration, test);
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
        // console.log("======================= joined :: " + _type + " :: " + server.name)
        // console.dir(_server.lastIsMaster())
        if(_type == 'secondary' && _server.lastIsMaster().passive) {
          // console.log("=== ")
          // console.dir(_server.lastIsMaster())
          server.destroy();
          test.done();
          // restartAndDone(configuration, test);
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
          test.done();
          // restartAndDone(configuration, test);
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
          test.done();
          // restartAndDone(configuration, test);
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
        if(_type == 'secondary' && _server.lastIsMaster().passive) {
          state['passive'] = state['passive'] - 1;
        } else {
          state[_type] = state[_type] - 1;
        }

        if(state.primary == 0
          && state.secondary == 0
          && state.arbiter == 0
          && state.passive == 0) {
          server.destroy();
          test.done();
          // restartAndDone(configuration, test);
        }
      });

      // Start connection
      server.connect();
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
      console.log("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! STARTING")
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
        console.log("======= joined :: " + _type + " :: " + _server.name)
        if(_type == 'secondary' && _server.lastIsMaster().passive) {
          state['passive'] = state['passive'] - 1;
        } else {
          state[_type] = state[_type] - 1;
        }

        // console.dir(state)

        if(state.primary == 0
          && state.secondary == 0
          && state.arbiter == 0
          && state.passive == 0) {
          server.destroy();
          test.done();
          // restartAndDone(configuration, test);
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
    console.log("------------------------ 0")
    // Get the primary server
    manager.primary().then(function(primaryManager) {
      console.log("------------------------ 1")
      // Get the secondary server
      manager.secondaries().then(function(managers) {
        console.log("------------------------ 2")
        var serverManager = managers[0];

        // Stop the secondary
        serverManager.stop().then(function() {
          console.log("------------------------ 3")
          // Start a new server manager
          var nonReplSetMember = new ServerManager('mongod', {
            bind_ip: serverManager.host,
            port: serverManager.port,
            dbpath: serverManager.options.dbpath
          });

          // Start a non replset member
          nonReplSetMember.start().then(function() {
            console.log("------------------------ 4")
            var config = [{
                host: primaryManager.host
              , port: primaryManager.port
            }];

            var options = {
              setName: configuration.setName
            };
            console.log("------------------------ 4:1")

            // Wait for primary
            manager.waitForPrimary().then(function() {
              console.log("------------------------ 5")

              // Attempt to connect
              var server = new ReplSet(config, options);
              server.on('joined', function(_type, _server) {
                console.log("------------------------ 6")
                console.log("======= joined :: " + _type + " :: " + _server.name)
                if(_type == 'secondary' && _server.lastIsMaster().passive) {
                  state['passive'] = state['passive'] - 1;
                } else {
                  state[_type] = state[_type] - 1;
                }
                console.dir(state)

                if(state.primary == 0
                  && state.secondary == 0
                  && state.arbiter == 0
                  && state.passive == 0) {
                    console.log("------------------------ 7")
                  server.destroy();

                  // Stop the normal server
                  nonReplSetMember.stop().then(function() {
                    console.log("------------------------ 8")
                    // Restart the secondary server
                    serverManager.start().then(function() {
                      console.log("------------------------ 9")
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
        var removedServer = false;
        // Attempt to connect
        var server = new ReplSet(config, options);
        server.on('fullsetup', function(_server) {
          console.log("------------------------------------------ 0")
          // Save number of secondaries
          var numberOfSecondaries = server.s.replicaSetState.secondaries.length;
          var numberOfArbiters = server.s.replicaSetState.arbiters.length;
          var numberOfPassives = server.s.replicaSetState.passives.length;

          // Let's listen to changes
          server.on('left', function(_t, _server) {
            console.log("--------- left :: " + _t + " :: " + _server.name)
            if(_server.s.options.port == secondaryServerManager.options.port) {
              console.log("server.state.primary = " + (server.s.replicaSetState.primary != null))
              console.log("numberOfSecondaries = " + numberOfSecondaries)
              console.log("server.state.secondaries.length = " + server.s.replicaSetState.secondaries.length)
              console.log("server.state.arbiters.length = " + server.s.replicaSetState.arbiters.length)
              console.log("server.state.passives.length = " + server.s.replicaSetState.passives.length)
                test.ok(server.s.replicaSetState.primary != null);
                test.ok(server.s.replicaSetState.secondaries.length < numberOfSecondaries);
                test.equal(1, server.s.replicaSetState.arbiters.length);
                server.destroy();
                restartAndDone(configuration, test);
              //   test.equal(1, server.s.replicaSetState.passives.length);
            }
          });

          server.on('joined', function(_t, _server) {
            // console.log("--------- joined :: " + _t + " :: " + _server.name)
            // // if(_t == 'primary') {
            // if(removedServer) {
            //   console.log("------------------------------------------ 4")
            //   console.log("server.state.primary = " + (server.state.primary != null))
            //   console.log("numberOfSecondaries = " + numberOfSecondaries)
            //   console.log("server.state.secondaries.length = " + server.s.replicaSetState.secondaries.length)
            //   console.log("server.state.arbiters.length = " + server.s.replicaSetState.arbiters.length)
            //   console.log("server.state.passives.length = " + server.s.replicaSetState.passives.length)
            //   test.ok(server.s.replicaSetState.primary != null);
            //   test.ok(server.s.replicaSetState.secondaries.length > numberOfSecondaries);
            //   test.equal(1, server.s.replicaSetState.arbiters.length);
            //   test.equal(1, server.s.replicaSetState.passives.length);
            //   server.destroy();
            //
            //   console.log("------------------------------------------ 5")
            //
            //   // // Add a new member to the set
            //   // manager.addMember(secondaryServerManager, {
            //   //   returnImmediately: false, force:false
            //   // }).then(function(x) {
            //     // console.log("------------------------------------------ 6")
            //     restartAndDone(configuration, test);
            //   // });
            // }
          });

          console.log("------------------------------------------ 1")
          console.dir(secondaryServerManager.options)
          // Remove the secondary server
          manager.removeMember(secondaryServerManager, {
            returnImmediately: false, force: false, skipWait:true
          }).then(function() {
            console.log("------------------------------------------ 2")

            // // Step down primary and block until we have a new primary
            // manager.stepDownPrimary(false, {stepDownSecs: 10}).then(function() {
            //   console.log("------------------------------------------ 3")
            setTimeout(function() {
              removedServer = true;

            }, 15000)
            // });
          });
        });

        // Start connection
        server.connect();
      });
    });
  }
}
