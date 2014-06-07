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
