"use strict";

var f = require('util').format
  , Long = require('bson').Long;

exports['Should correctly reconnect to server with automatic reconnect enabled'] = {
  metadata: {
    requires: {
      topology: "single"
    }
  },

  test: function(configuration, test) {
    var Server = configuration.require.Server
      , ReadPreference = configuration.require.ReadPreference;

    // Attempt to connect
    var server = new Server({
        host: configuration.host
      , port: configuration.port
      , reconnect: true
      , reconnectInterval: 50
    })

    // Test flags
    var emittedClose = false;

    // Add event listeners
    server.on('connect', function(_server) {
      // Execute the command
      _server.command("system.$cmd", {ismaster: true}, {readPreference: new ReadPreference('primary')}, function(err, result) {
        test.equal(null, err)
        // Write garbage, force socket closure
        try {
          var a = new Buffer(100);
          for(var i = 0; i < 100; i++) a[i] = i;
          result.connection.write(a);
        } catch(err) {}

        // Ensure the server died
        setTimeout(function() {
          // Attempt a proper command
          _server.command("system.$cmd", {ismaster: true}, {readPreference: new ReadPreference('primary')}, function(err, result) {
            test.ok(err != null);
          });          
        }, 100);
      });
    });

    server.once('close', function() {
      emittedClose = true;
    });

    server.once('reconnect', function() {
      test.equal(true, emittedClose);
      test.equal(true, server.isConnected());
      server.destroy();
      test.done();
    });

    // Start connection
    server.connect();
  }
}

exports['Should correctly reconnect to server with automatic reconnect disabled'] = {
  metadata: {
    requires: {
      topology: "single"
    }
  },

  test: function(configuration, test) {
    var Server = configuration.require.Server
      , ReadPreference = configuration.require.ReadPreference;

    // Attempt to connect
    var server = new Server({
        host: configuration.host
      , port: configuration.port
      , reconnect: false
    })

    // Test flags
    var emittedClose = false;

    // Add event listeners
    server.on('connect', function(_server) {
      // Execute the command
      _server.command("system.$cmd", {ismaster: true}, {readPreference: new ReadPreference('primary')}, function(err, result) {
        test.equal(null, err)
        // Write garbage, force socket closure
        try {
          var a = new Buffer(1000);
          for(var i = 0; i < 100; i++) a[i] = i;
          result.connection.write(a);
        } catch(err) {}

        setTimeout(function() {
          // Attempt a proper command
          _server.command("system.$cmd", {ismaster: true}, {readPreference: new ReadPreference('primary')}, function(err, result) {
            console.dir(err)
            test.ok(err != null);
          });
        }, 1);
      });
    });

    server.on('close', function() {
      emittedClose = true;
    });

    setTimeout(function() {
      test.equal(true, emittedClose);
      test.equal(false, server.isConnected());
      server.destroy();
      test.done();
    }, 500);

    // Start connection
    server.connect();
  }
}