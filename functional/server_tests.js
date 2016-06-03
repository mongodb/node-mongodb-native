"use strict";

var f = require('util').format
  , Long = require('bson').Long;

exports['Should correctly reconnect to server with automatic reconnect enabled'] = {
  metadata: {
    requires: {
      topology: "single"
    },
    ignore: { travis:true }
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
        _server.s.currentReconnectRetry = 10;

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
      // console.log('!!!!!!!!!!! reconnect')
      test.equal(true, emittedClose);
      test.equal(true, server.isConnected());
      test.equal(30, server.s.currentReconnectRetry);
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
    },
    ignore: { travis:true }
  },

  test: function(configuration, test) {
    var Server = configuration.require.Server
      , ReadPreference = configuration.require.ReadPreference;

    // Attempt to connect
    var server = new Server({
        host: configuration.host
      , port: configuration.port
      , reconnect: false
      , size: 1
    })

    // Test flags
    var emittedClose = false;
    var emittedError = false;

    // Add event listeners
    server.on('connect', function(_server) {
      // Execute the command
      _server.command("system.$cmd", {ismaster: true}, {readPreference: new ReadPreference('primary')}, function(err, result) {
        test.equal(null, err)
        // Write garbage, force socket closure
        try {
          result.connection.destroy();
        } catch(err) {}

        process.nextTick(function() {
          // Attempt a proper command
          _server.command("system.$cmd", {ismaster: true}, {readPreference: new ReadPreference('primary')}, function(err, result) {
            test.ok(err != null);
          });
        });
      });
    });

    server.on('close', function() {
      emittedClose = true;
    });

    server.on('error', function() {
      emittedError = true;
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

exports['Should reconnect when initial connection failed'] = {
  metadata: {
    requires: {
      topology: 'single'
    },
    ignore: { travis:true }
  },

  test: function(configuration, test) {
    var Server = configuration.require.Server
      , ReadPreference = configuration.require.ReadPreference
      , manager = configuration.manager;

    manager.stop('SIGINT').then(function() {
      // Attempt to connect while server is down
      var server = new Server({
          host: configuration.host
        , port: configuration.port
        , reconnect: true
        , reconnectTries: 2
        , size: 1
        , emitError: true
      });

      server.on('connect', function() {
        // console.log("----------- connect")
        test.done();
      });

      server.once('error', function() {
        // console.log("----------- error")
        manager.start().then(function() {});
      });

      server.connect();
    })
  }
}

exports['Should correctly place new connections in available list on reconnect'] = {
  metadata: {
    requires: {
      topology: "single"
    },
    ignore: { travis:true }
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
        _server.s.currentReconnectRetry = 10;

        // Write garbage, force socket closure
        try {
          var a = new Buffer(100);
          for(var i = 0; i < 100; i++) a[i] = i;
          result.connection.write(a);
        } catch(err) {}
      });
    });

    server.once('close', function() {
      emittedClose = true;
    });

    server.once('reconnect', function() {
      console.log('!!!!!!!!!!! reconnect')

      for(var i = 0; i < 100; i++) {
        server.command("system.$cmd", {ismaster: true}, function(err, result) {
          test.equal(null, err);
        });
      }

      server.command("system.$cmd", {ismaster: true}, function(err, result) {
        test.equal(null, err);

        setTimeout(function() {
          console.log("-- availableConnections.length :: " + server.s.pool.availableConnections.length)
          console.log("-- inUseConnections.length :: " + server.s.pool.inUseConnections.length)
          console.log("-- newConnections.length :: " + server.s.pool.newConnections.length)
          console.log("-- connectingConnections.length :: " + server.s.pool.connectingConnections.length)
          // console.log(server.s.pool.)
          test.ok(server.s.pool.inUseConnections.length > 0);
          test.equal(0, server.s.pool.inUseConnections.length);
          test.equal(0, server.s.pool.newConnections.length);
          test.equal(0, server.s.pool.connectingConnections.length);

          server.destroy();
          test.done();
        }, 1000);
      });


      // test.equal(true, emittedClose);
      // test.equal(true, server.isConnected());
      // test.equal(30, server.s.currentReconnectRetry);
      // server.destroy();
      // test.done();
    });

    // Start connection
    server.connect();
  }
}
