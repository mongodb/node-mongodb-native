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
    }])

    // The state
    var state = 0;

    // Add event listeners
    server.on('connect', function(_server) {
      var interval = setInterval(function() {
        try {
          _server.insert(f("%s.repl_insert",configuration.db), [{a:1}], function(err, r) {
            // console.log(state)
            if(err) state = 1;
            if(err == null && state == 1) {
              clearInterval(interval);
              _server.destroy();
              test.done();
            }
          });          
        } catch(err) {
          state = 1;
        }
      }, 500);

      // Wait for a second and then step down primary
      setTimeout(function() {
        configuration.manager.stepDown({force: true}, function(err, result) {
          if(err) console.dir(err)
        });
      }, 1000);
    })

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
    var ReplSet = configuration.require.ReplSet;
    // Attempt to connect
    var server = new ReplSet([{
        host: configuration.host
      , port: configuration.port
    }])

    // The state
    var state = 0;

    // Add event listeners
    server.on('connect', function(_server) {
      _server.insert(f("%s.repl_insert1",configuration.db), [{a:1}], function(err, r) {
        var interval = setInterval(function() {
          try {

            // Create a cursor
            var cursor = _server.cursor(f("%s.repl_insert1",configuration.db), {
                find: f("%s.repl_insert1", configuration.db)
              , query: {}              
            }, {readPreference: 'secondary'});

            // Execute next
            cursor.next(function(err, d) {
              if(err && state == 0) state = 1;
              if(err && state == 2) state = 3;
              if(err == null && state == 1) {
                state = 2;
                // Let's restart a secondary
                configuration.manager.restartServer('secondary', function(err, result) {
                  if(err) console.dir(err);
                });
              }
              
              if(err == null && state == 2) {
                try {
                  // Attempt to perform a write, waiting for a primary to be elected
                  _server.insert(f("%s.repl_insert1",configuration.db), [{a:1}], function(err, r) {
                    if(err == null) {                      
                      clearInterval(interval);
                      _server.destroy();
                      // Restart
                      configuration.manager.restart(function() {
                        test.done();
                      });
                    }
                  });                  
                } catch(err) {}
              }
            });          
          } catch(err) {
            if(state == 0) state = 1;
          }
        }, 500);

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
    });

    // Start connection
    server.connect();
  }
}
