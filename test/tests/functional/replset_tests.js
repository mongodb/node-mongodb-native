var f = require('util').format
  , Long = require('bson').Long;

exports['Should correctly connect using replset object'] = {
  metadata: {},

  test: function(configuration, test) {
    var ReplSet = configuration.require.ReplSet;

    // Attempt to connect
    var server = new ReplSet([{
        host: configuration.host
      , port: configuration.port
    }])

    // Add event listeners
    server.on('connect', function(_server) {
      _server.destroy();
      test.done();
    })

    // Start connection
    server.connect();
  }
}

exports['Should correctly execute command using replset'] = {
  metadata: {},

  test: function(configuration, test) {
    var ReplSet = configuration.require.ReplSet;

    // Attempt to connect
    var server = new ReplSet([{
        host: configuration.host
      , port: configuration.port
    }]);

    // Add event listeners
    server.on('connect', function(_server) {
      // Execute the command
      _server.command("system.$cmd", {ismaster: true}, {readPreference: 'primary'}, function(err, result) {
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

exports['Should correctly execute write using replset'] = {
  metadata: {},

  test: function(configuration, test) {
    var ReplSet = configuration.require.ReplSet;

    // Attempt to connect
    var server = new ReplSet([{
        host: configuration.host
      , port: configuration.port
    }]);

    // Add event listeners
    server.on('connect', function(_server) {
      // Execute the write
      _server.insert(f("%s.inserts", configuration.db), [{a:1}], {
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
