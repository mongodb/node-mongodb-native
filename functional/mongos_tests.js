"use strict";

var f = require('util').format
  , Long = require('bson').Long;

exports['Should correctly connect using mongos object'] = {
  metadata: {
    requires: {
      topology: "mongos"
    }
  },

  test: function(configuration, test) {
    var Mongos = configuration.require.Mongos;

    // Attempt to connect
    var server = new Mongos([{
        host: configuration.host
      , port: configuration.port
    }, {
        host: configuration.host
      , port: configuration.port + 1
    }])

    // Add event listeners
    server.on('connect', function(_server) {
      setTimeout(function() {
        test.equal(true, _server.isConnected());
        _server.destroy();
        test.equal(false, _server.isConnected());
        test.done();
      }, 100);
    })

    // Start connection
    server.connect();
  }
}

exports['Should correctly execute command using mongos'] = {
  metadata: {
    requires: {
      topology: "mongos"
    }
  },

  test: function(configuration, test) {
    var Mongos = configuration.require.Mongos
      , ReadPreference = configuration.require.ReadPreference;

    // Attempt to connect
    var server = new Mongos([{
        host: configuration.host
      , port: configuration.port
    }]);

    // Add event listeners
    server.on('connect', function(_server) {
      // Execute the command
      _server.command("system.$cmd", {ismaster: true}, {readPreference: new ReadPreference('primary')}, function(err, result) {
        test.equal(null, err);
        test.equal(true, result.result.ismaster);
        // Destroy the connection
        _server.destroy();
        // Finish the test
        test.done();
      });
    });

    // Start connection
    server.connect();
  }
}

exports['Should correctly execute write using mongos'] = {
  metadata: {
    requires: {
      topology: "mongos"
    }
  },

  test: function(configuration, test) {
    var Mongos = configuration.require.Mongos;

    // Attempt to connect
    var server = new Mongos([{
        host: configuration.host
      , port: configuration.port
    }]);

    // Add event listeners
    server.on('connect', function(_server) {
      // Execute the write
      _server.insert(f("%s.inserts_mongos1", configuration.db), [{a:1}], {
        writeConcern: {w:1}, ordered:true
      }, function(err, results) {
        test.equal(null, err);
        test.equal(1, results.result.n);
        // Destroy the connection
        _server.destroy();
        // Finish the test
        test.done();
      });
    })

    // Start connection
    server.connect();
  }
}

exports['Should correctly execute read using readPreference secondary'] = {
  metadata: {
    requires: {
      topology: "mongos"
    }
  },

  test: function(configuration, test) {
    var Mongos = configuration.require.Mongos,
      ReadPreference = configuration.require.ReadPreference;

    // Attempt to connect
    var server = new Mongos([{
        host: configuration.host
      , port: configuration.port
    }]);

    // Add event listeners
    server.on('connect', function(_server) {
      // Execute the write
      _server.insert(f("%s.inserts_mongos10", configuration.db), [{a:1}], {
        writeConcern: {w:'majority'}, ordered:true
      }, function(err, results) {
        test.equal(null, err);
        test.equal(1, results.result.n);

        // Execute find
        var cursor = _server.cursor(f("%s.inserts_mongos10", configuration.db), {
            find: 'inserts_mongos10'
          , query: {}
          , batchSize: 2
          , readPreference: ReadPreference.secondary
        });

        // Execute next
        cursor.next(function(err, d) {
          test.equal(null, err);
          test.ok(d != null);
          // Destroy the connection
          _server.destroy();
          // Finish the test
          test.done();
        });
      });
    })

    // Start connection
    server.connect();
  }
}

exports['Should correctly remove mongos and re-add it'] = {
  metadata: {
    requires: {
      topology: "mongos"
    }
  },

  test: function(configuration, test) {
    var Mongos = configuration.require.Mongos
      , ReadPreference = configuration.require.ReadPreference;
    // Attempt to connect
    // Attempt to connect
    var server = new Mongos([{
        host: configuration.host
      , port: configuration.port
    }, {
        host: configuration.host
      , port: configuration.port + 1
    }])

    // The state
    var joined = 0;
    var left = 0;

    // Add event listeners
    server.on('connect', function(_server) {
      var done = false;

      var interval = setInterval(function() {
        // We are done
        if(joined == 2 && left == 2 && !done) {
          done = true;
          clearInterval(interval);
          server.destroy();
          return test.done();
        }

        // Execute the write
        _server.insert(f("%s.inserts_mongos2", configuration.db), [{a:1}], {
          writeConcern: {w:1}, ordered:true
        }, function(err, results) {
          // test.equal(null, err);
        });
      }, 1000)

      setTimeout(function() {
        var proxies = configuration.manager.proxies();

        _server.on('joined', function(t, s) {
          joined = joined + 1;
        });

        _server.on('left', function(t, s) {
          left = left + 1;
        });

        proxies[0].stop().then(function() {
          setTimeout(function() {

            proxies[0].start().then(function() {

              proxies[1].stop().then(function() {

                setTimeout(function() {

                  proxies[1].start().then(function() {
                  });
                }, 2000)
              });
            });
          }, 2000)
        });
      }, 5000);
    });

    // Start connection
    server.connect();
  }
}
