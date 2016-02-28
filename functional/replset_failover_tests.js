"use strict";

var f = require('util').format
  , Long = require('bson').Long;

var restartAndDone = function(configuration, test) {
  configuration.manager.restart().then(function() {
    test.done();
  });
}

exports.beforeTests = function(configuration, callback) {
  configuration.manager.restart().then(function() {
    callback();
  });
}

exports['Should correctly remove and re-add secondary and detect removal and re-addition of the server'] = {
  metadata: { requires: { topology: "replicaset", mongodb: ">=2.6.0" } },

  test: function(configuration, test) {
    var ReplSet = configuration.require.ReplSet
      , ReadPreference = configuration.require.ReadPreference
      , manager = configuration.manager;

    // Get the primary server
    manager.primary().then(function(m) {
      // Attempt to connect
      var server = new ReplSet([{
          host: m.host
        , port: m.port
      }], {
        setName: configuration.setName
      });

      // The state
      var state = 0;
      var leftServer = null;
      var done = null;

      // Add event listeners
      server.on('fullsetup', function(_server) {

        _server.on('joined', function(t, s) {
          if(t == 'secondary' && leftServer && s.name == f('%s:%s', leftServer.host, leftServer.port)) {
            server.destroy();

            if(!done) {
              done = true;

              setTimeout(function() {
                restartAndDone(configuration, test);
              }, 10000)
            }
          }
        });

        _server.on('left', function(t, s) {
          if(t == 'secondary' && leftServer && s.name == leftServer.host) state++;
        });

        // Get the secondary server
        manager.secondaries().then(function(managers) {
          leftServer = managers[0];

          setTimeout(function() {
            // Remove the secondary server
            manager.removeMember(managers[0], {
              returnImmediately: false, force: false, skipWait:true
            }).then(function() {

              // Add a new member to the set
              manager.addMember(managers[0], {
                returnImmediately: false, force:false
              }).then(function(x) {
              });
            });
          }, 10000)
        });
      });

      // Start connection
      server.connect();
    });
  }
}

exports['Should correctly recover from secondary shutdowns'] = {
  metadata: { requires: { topology: "replicaset" } },

  test: function(configuration, test) {
    var ReplSet = configuration.require.ReplSet
      , ReadPreference = configuration.require.ReadPreference
      , manager = configuration.manager;

    // Get the primary server
    manager.primary().then(function(m) {
      // Attempt to connect
      var server = new ReplSet([{
          host: m.host
        , port: m.port
      }], {
        setName: configuration.setName
      });

      // The state
      var primary = false;

      // Var shutdown server
      var servers = [];
      var leftServers = [];
      var joinedServers = [];
      // Managers
      var secondaryManagers = [];

      // Add event listeners
      server.on('fullsetup', function(_server) {
        // // The state
        // var left = {};
        // var joined = 0;

        // Secondaries left
        var secondariesLeft = [];
        var secondariesJoined = [];
        var start = false;

        // Get all the servers that leave the replicaset
        _server.on('left', function(t, s) {
          if(t == 'secondary' && start) {
            // console.log(" left ----- " + t + " :: " + s.name)
            secondariesLeft.push(s.name);
          }
        });

        _server.on('joined', function(t, s) {
          if(t == 'secondary' && start) {
            // console.log(" joined ----- " + t + " :: " + s.name)
            secondariesJoined.push(s.name);

            // We got all the servers that joined
            if(secondariesJoined.length == 2) {
              _server.removeAllListeners('left');

              // Execute the write
              _server.insert(f("%s.replset_insert0", configuration.db), [{a:1}], {
                writeConcern: {w:1}, ordered:true
              }, function(err, results) {
                test.equal(null, err);
                test.equal(1, results.result.n);

                // Attempt a write and a read
                _server.command("system.$cmd", {ismaster: true}
                  , {readPreference: new ReadPreference('secondary')}, function(err, result) {
                    test.equal(null, err);
                    // Destroy the connection
                    _server.destroy();
                    // Finish the test
                    restartAndDone(configuration, test);
                });
              });
            }
          }
        });

        // Wait for a second and shutdown secondaries
        manager.secondaries().then(function(managers) {
          start = true;

          managers[0].stop().then(function() {
            servers.push(f('%s:%s', managers[0].host, managers[0].port));

            managers[1].stop().then(function() {
              servers.push(f('%s:%s', managers[1].host, managers[1].port));

              managers[0].start().then(function() {});
              managers[1].start().then(function() {});
            });
          });
        });
      });

      // Start connection
      server.connect();
    });
  }
}

exports['Should correctly recover from primary stepdown'] = {
  metadata: {
    requires: {
      topology: "replicaset"
    }
  },

  test: function(configuration, test) {
    var ReplSet = configuration.require.ReplSet
      , ReadPreference = configuration.require.ReadPreference
      , manager = configuration.manager;

    // Get the primary server
    manager.primary().then(function(m) {
      // Attempt to connect
      var server = new ReplSet([{
          host: m.host
        , port: m.port
      }], {
        setName: configuration.setName
      });

      // The state
      var state = 0;

      // Add event listeners
      server.on('fullsetup', function(_server) {
        _server.on('ha', function(e, options) {});
        // Wait for close event due to primary stepdown
        _server.on('joined', function(t, s) {
          if(t == 'primary') state++;
        });

        _server.on('left', function(t, s) {
          if(t == 'primary') state++;
        });

        // Wait fo rthe test to be done
        var interval = setInterval(function() {
          if(state == 2) {
            clearInterval(interval);
            _server.destroy();
            // test.done();
            restartAndDone(configuration, test);
          }
        }, 500);

        // Wait for a second and then step down primary
        manager.stepDownPrimary(false, {stepDownSecs: 1, force:true}).then(function() {
        });
      });

      // Start connection
      server.connect();
    });
  }
}

exports['Should correctly fire single no-repeat ha state update due to not master error'] = {
  metadata: { requires: { topology: "replicaset", mongodb: ">=2.6.0" } },

  test: function(configuration, test) {
    var ReplSet = configuration.require.ReplSet
      , ReadPreference = configuration.require.ReadPreference
      , manager = configuration.manager;

    // Set up the parameter
    var steppedDownPrimary = false;
    var detectedNewPrimary = false;

    // Get the primary server
    manager.primary().then(function(m) {
      // Attempt to connect
      var server = new ReplSet([{
          host: m.host
        , port: m.port
      }], {
        setName: configuration.setName
      });

      // Add event listeners
      server.on('fullsetup', function(_server) {
        _server.on('ha', function(e, options) {
          // console.log("-- ha :: ")
          // console.dir(options)

          // Manual status request issues correctly
          if(detectedNewPrimary) {
            process.nextTick(function() {
              // Destroy the connection
              _server.destroy();
              // Finish the test
              // test.done();
              restartAndDone(configuration, test);
            });
          }
        });

        // Wait for close event due to primary stepdown
        _server.on('joined', function(t, s) {
          // console.log("-- joined :: " + t + " :: " + s.name)
          if(t == 'secondary' && steppedDownPrimary) {
            // Execute write command
            _server.command(f("%s.$cmd", configuration.db)
              , {
                  insert: 'replset_insert1'
                , documents: [{a:1}]
                , ordered: false
                , writeConcern: {w:1}
              }
              , {readPreference: new ReadPreference('secondary')}, function(err, result) {
                test.equal('not master', result.result.errmsg);
            });
          } else if(t == 'primary' && steppedDownPrimary) {
            detectedNewPrimary = true;
          }
        });

        // console.log("+++++++++++++++++++++++++++++++++++++++++++++++++ 0")
        steppedDownPrimary = true;
        // Wait for a second and then step down primary
        manager.stepDownPrimary(false, {stepDownSecs: 1, force:true}).then(function() {
          // console.log("+++++++++++++++++++++++++++++++++++++++++++++++++ 1")
        });
      });

      // Start connection
      server.connect();
    });
  }
}

exports['Should correctly remove and re-add secondary with new priority and detect removal and re-addition of the server as new new primary'] = {
  metadata: { requires: { topology: "replicaset", mongodb: ">=2.6.0" } },

  test: function(configuration, test) {
    var ReplSet = configuration.require.ReplSet
      , ReadPreference = configuration.require.ReadPreference
      , manager = configuration.manager;

    // Get the primary server
    manager.primary().then(function(m) {
      // Attempt to connect
      var server = new ReplSet([{
          host: m.host
        , port: m.port
      }], {
        setName: configuration.setName
      });

      // The state
      var leftServer = null;
      // Add event listeners
      server.on('fullsetup', function(_server) {
        _server.on('joined', function(t, s) {
          if(t == 'primary' && leftServer && s.name == f('%s:%s', leftServer.host, leftServer.port)) {
            _server.destroy();
            restartAndDone(configuration, test);
          }
        });

        _server.on('left', function(t, s) {
        });

        manager.secondaries().then(function(managers) {
          // Remove the secondary server
          manager.removeMember(managers[0], {
            returnImmediately: false, force: false, skipWait:true
          }).then(function() {
            leftServer = managers[0];

            // Get the node information and modify the internal sate
            var node = manager.serverConfiguration(managers[0]);
            node.priority = 10;

            // Add back the member
            manager.addMember(managers[0], {
              returnImmediately: false, force:false
            }).then(function(x) {
            });
          });
        })
      });

      // Start connection
      server.connect();
    });
  }
}
