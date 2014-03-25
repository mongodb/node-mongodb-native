var f = require('util').format;

exports['Should correctly connect using server object'] = {
  metadata: {},

  test: function(configuration, test) {
    var Server = configuration.require.Server;

    // Attempt to connect
    var server = new Server({
        host: configuration.host
      , port: configuration.port
    })

    // Add event listeners
    server.on('connect', function(_server) {
      _server.destroy();
      test.done();
    })

    // Start connection
    server.connect();
  }
}

exports['Should correctly execute command'] = {
  metadata: {},

  test: function(configuration, test) {
    var Server = configuration.require.Server;

    // Attempt to connect
    var server = new Server({
        host: configuration.host
      , port: configuration.port
    })

    // Add event listeners
    server.on('connect', function(_server) {
      // Execute the command
      _server.command("system.$cmd", {ismaster: true}, {readPreference: 'primary'}, function(err, result) {
        test.equal(null, err);
        test.equal(true, result.ismaster);
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

exports['Should correctly execute write'] = {
  metadata: {},

  test: function(configuration, test) {
    var Server = configuration.require.Server;

    // Attempt to connect
    var server = new Server({
        host: configuration.host
      , port: configuration.port
    })

    // Add event listeners
    server.on('connect', function(_server) {
      // Execute the write
      _server.insert(f("%s.inserts", configuration.db), [{a:1}], {
        writeConcern: {w:1}, ordered:true
      }, function(err, results) {
        test.equal(null, err);
        test.equal(1, results.n);
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

exports['Should correctly execute find'] = {
  metadata: {},

  test: function(configuration, test) {
    var Server = configuration.require.Server;

    // Attempt to connect
    var server = new Server({
        host: configuration.host
      , port: configuration.port
    })

    // Add event listeners
    server.on('connect', function(_server) {
      // Execute the write
      _server.insert(f("%s.inserts1", configuration.db), [{a:1}], {
        writeConcern: {w:1}, ordered:true
      }, function(err, results) {
        test.equal(null, err);

        // Execute find
        var cursor = _server.find(f("%s.inserts1", configuration.db), {
            find: f("%s.inserts1", configuration.db)
          , query: {}
        });

        // Execute next
        cursor.next(function(err, d) {
          test.equal(null, err)
          test.equal(1, d.a);

          // Execute next
          cursor.next(function(err, d) {
            test.equal(null, err)
            test.equal(null, d);
            // Destroy the server connection        
            _server.destroy();
            // Finish the test
            test.done();
          });
        });
      });
    })

    // Start connection
    server.connect();
  }
}
