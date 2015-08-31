"use strict";

var f = require('util').format
  , Long = require('bson').Long;

var restartAndDone = function(configuration, test) {
  configuration.manager.restart({kill:true}, function() {
    test.done();
  });
}

exports.beforeTests = function(configuration, callback) {
  configuration.restart({purge:false, kill:true}, function() {
    callback();
  });
}

exports['Should correctly remove and re-add secondary and detect removal and re-addition of the server'] = {
  metadata: {
    requires: {
        topology: "replicaset"
      , mongodb: ">=2.6.0"
    }
  },

  test: function(configuration, test) {
    var ReplSet = configuration.require.ReplSet
      , ReadPreference = configuration.require.ReadPreference;
    // Attempt to connect
    var server = new ReplSet([{
        host: configuration.host
      , port: configuration.port
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
        
        if(t == 'secondary' && leftServer && s.name == leftServer.host) {          
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

      // Shutdown the first secondary
      configuration.manager.remove('secondary', function(err, serverDetails) {
        if(err) console.dir(err);
        leftServer = serverDetails;

        setTimeout(function() {
          configuration.manager.add(serverDetails, function(err, result) {});
        }, 10000)
      });      
    });

    // Start connection
    server.connect();
  }
}

exports['Should correctly recover from secondary shutdowns'] = {
  metadata: {
    requires: {
      topology: "replicaset"
    }
  },

  test: function(configuration, test) {
    var ReplSet = configuration.require.ReplSet
      , ReadPreference = configuration.require.ReadPreference;
    // Attempt to connect
    var server = new ReplSet([{
        host: configuration.host
      , port: configuration.port
    }], { 
      setName: configuration.setName 
    });

    // The state
    var primary = false;

    // Var shutdown server
    var servers = [];
    var leftServers = [];
    var joinedServers = [];

    // Add event listeners
    server.on('fullsetup', function(_server) {
      // The state
      var left = {};
      var joined = 0;

      // Wait for left events
      _server.on('left', function(t, s) {
        if(servers.indexOf(s.name) != -1) {
          leftServers.push(s.name);
        }

        if(leftServers.length == servers.length) {
          _server.removeAllListeners('left');

          // Wait for both servers to join
          _server.on('joined', function(t, s) {
            if(servers.indexOf(s.name) != -1) {
              joinedServers.push(s.name);
            }

            if(joinedServers.length == servers.length) {
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
          });

          // Let's restart a secondary
          configuration.manager.restartServer('secondary', function(err, result) {
            if(err) console.dir(err);

            // Let's restart a secondary
            configuration.manager.restartServer('secondary', function(err, result) {
              if(err) console.dir(err);
            });
          });
        }
      });

      // Wait for a second and shutdown secondaries
      setTimeout(function() {
        // Shutdown the first secondary
        configuration.manager.shutdown('secondary', {signal:-3}, function(err, server) {
          if(err) console.dir(err);
          servers.push(server.name);

          // Shutdown the second secondary
          configuration.manager.shutdown('secondary', {signal:-3}, function(err, server) {
            servers.push(server.name);
            if(err) console.dir(err);
          });
        });
      }, 1000);
    });

    // Start connection
    server.connect();
  }
}

exports['Should correctly recover from primary stepdown'] = {
  metadata: {
    requires: {
      topology: "replicaset"
    }
  },

  test: function(configuration, test) {
    var ReplSet = configuration.require.ReplSet;
    // Attempt to connect
    var server = new ReplSet([{
        host: configuration.host
      , port: configuration.port
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
      setTimeout(function() {
        configuration.manager.stepDown({force: true}, function(err, result) {
          test.ok(err != null);
        });
      }, 1000);
    });

    // Start connection
    server.connect();
  }
}

exports['Should correctly fire single no-repeat ha state update due to not master error'] = {
  metadata: {
    requires: {
        topology: "replicaset"
      , mongodb: ">=2.6.0"
    }
  },

  test: function(configuration, test) {
    var ReplSet = configuration.require.ReplSet
      , ReadPreference = configuration.require.ReadPreference;
    // Attempt to connect
    var server = new ReplSet([{
        host: configuration.host
      , port: configuration.port
    }], { 
      setName: configuration.setName 
    });

    // Add event listeners
    server.on('fullsetup', function(_server) {
      _server.on('ha', function(e, options) {

        // Manual status request issues correctly
        if(options.norepeat) {
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
        
        if(t == 'secondary') {
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
        }
      });

      // Wait for a second and then step down primary
      setTimeout(function() {
        
        configuration.manager.stepDown({force: true}, function(err, result) {
          test.ok(err != null);
        });
      }, 1000);      
    });

    // Start connection
    server.connect();
  }
}

exports['Should correctly remove and re-add secondary with new priority and detect removal and re-addition of the server as new new primary'] = {
  metadata: {
    requires: {
        topology: "replicaset"
      , mongodb: ">=2.6.0"
    }
  },

  test: function(configuration, test) {
    var ReplSet = configuration.require.ReplSet
      , ReadPreference = configuration.require.ReadPreference;
    // Attempt to connect
    var server = new ReplSet([{
        host: configuration.host
      , port: configuration.port
    }], { 
      setName: configuration.setName 
    });

    // The state
    var leftServer = null;

    // Add event listeners
    server.on('fullsetup', function(_server) {
      _server.on('joined', function(t, s) {
        if(t == 'primary' && leftServer && s.name == leftServer.host) {
          _server.destroy();
          restartAndDone(configuration, test);
        }
      });

      _server.on('left', function(t, s) {
      });

      // Shutdown the first secondary
      configuration.manager.remove('secondary', function(err, serverDetails) {
        if(err) console.dir(err);
        serverDetails.priority = 10;
        leftServer = serverDetails;

        // Listening function
        var listener = function(t, s) {
          if(t == 'primary') {
            _server.removeListener('joined', listener);

            // Shutdown the second secondary
            configuration.manager.add(serverDetails, function(err, result) {
            });          
          }
        };

        _server.on('joined', listener);
      });      
    });

    // Start connection
    server.connect();
  }
}
