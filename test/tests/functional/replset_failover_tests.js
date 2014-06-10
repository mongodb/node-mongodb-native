var f = require('util').format
  , Long = require('bson').Long;

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
    server.on('connect', function(_server) {
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
          test.done();
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

exports['Should correctly recover from secondary shutdowns'] = {
  metadata: {
    requires: {
      topology: "replicaset"
    }
  },

  test: function(configuration, test) {
    var ReplSet = configuration.require.ReplSet
      , ReadPreference = configuration.require.ReadPreference;;
    // Attempt to connect
    var server = new ReplSet([{
        host: configuration.host
      , port: configuration.port
    }], { 
      setName: configuration.setName 
    });

    // The state
    var primary = false;

    // Add event listeners
    server.on('connect', function(_server) {
      // The state
      var left = {};
      var joined = 0;

      // Wait for left events
      _server.on('left', function(t, s) {
        left[s.name] = ({type: t, server: s});

        // Restart the servers
        if(Object.keys(left).length == 3) {
          // Wait for close event due to primary stepdown
          _server.on('joined', function(t, s) {
            if('primary' == t && left[s.name]) {
              joined++;
              primary = true;
            } else if('secondary' == t && left[s.name]) {
              joined++;
            }

            if(joined >= Object.keys(left).length && primary) {
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
                    test.done();
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
        configuration.manager.shutdown('secondary', {signal:15}, function(err, result) {
          if(err) console.dir(err);
          // Shutdown the second secondary
          configuration.manager.shutdown('secondary', {signal:15}, function(err, result) {
            if(err) console.dir(err);
          });
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
    server.on('connect', function(_server) {
      _server.on('ha', function(e, options) {
        // Manual status request issues correctly
        if(options.norepeat) {
          process.nextTick(function() {
            // Destroy the connection
            _server.destroy();
            // Finish the test
            test.done();          
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
    });

    // Start connection
    server.connect();
  }
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

    // Add event listeners
    server.on('connect', function(_server) {
      _server.on('joined', function(t, s) {
        if(t == 'secondary' && leftServer && s.name == leftServer.host) {
          _server.destroy();
          test.done();
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
          // Shutdown the second secondary
          configuration.manager.add(serverDetails, function(err, result) {});          
        }, 10000)
      });      
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
    var state = 0;
    var leftServer = null;

    // Add event listeners
    server.on('connect', function(_server) {
      _server.on('joined', function(t, s) {
        if(t == 'primary' && leftServer && s.name == leftServer.host) {
          _server.destroy();
          test.done();
        }
      });

      _server.on('left', function(t, s) {
        if(t == 'secondary' && leftServer && s.name == leftServer.host) state++;
      });

      // Shutdown the first secondary
      configuration.manager.remove('secondary', function(err, serverDetails) {
        if(err) console.dir(err);
        serverDetails.priority = 10;
        leftServer = serverDetails;

        setTimeout(function() {
          // Shutdown the second secondary
          configuration.manager.add(serverDetails, function(err, result) {});          
        }, 10000)
      });      
    });

    // Start connection
    server.connect();
  }
}
