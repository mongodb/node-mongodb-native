var f = require('util').format
  , Long = require('bson').Long;

exports['Should correctly connect using server object'] = {
  metadata: {
    requires: {
      topology: "single"
    }
  },

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
    })

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
    })

    // Start connection
    server.connect();
  }
}

exports['Should correctly execute write'] = {
  metadata: {
    requires: {
      topology: "single"
    }
  },

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

exports['Should correctly execute find'] = {
  metadata: {
    requires: {
      topology: "single"
    }
  },

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
        var cursor = _server.cursor(f("%s.inserts1", configuration.db), {
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

        // Attempt a proper command
        _server.command("system.$cmd", {ismaster: true}, {readPreference: new ReadPreference('primary')}, function(err, result) {
          test.ok(err != null);
        });
      });
    });

    server.on('close', function() {
      emittedClose = true;
    });

    server.on('reconnect', function() {
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
          var a = new Buffer(100);
          for(var i = 0; i < 100; i++) a[i] = i;
          result.connection.write(a);
        } catch(err) {}

        // Attempt a proper command
        _server.command("system.$cmd", {ismaster: true}, {readPreference: new ReadPreference('primary')}, function(err, result) {
          test.ok(err != null);
        });
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

exports['Should correctly execute aggregation command'] = {
  metadata: {
    requires: {
      topology: "single"
    }
  },

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
      _server.insert(f("%s.inserts10", configuration.db), [{a:1}, {a:2}, {a:3}], {
        writeConcern: {w:1}, ordered:true
      }, function(err, results) {
        test.equal(null, err);
        test.equal(3, results.result.n);

        // Execute find
        var cursor = _server.cursor(f("%s.inserts10", configuration.db), {
            aggregate: "inserts10"
          , pipeline: [{$match: {}}]
          , cursor: {batchSize: 1}
        });

        // Execute next
        cursor.next(function(err, d) {
          test.equal(null, err);
          test.equal(1, d.a);

          // Execute next
          cursor.next(function(err, d) {
            test.equal(null, err);
            test.equal(2, d.a);

            cursor.next(function(err, d) {
              test.equal(null, err);
              test.equal(3, d.a);

              // Destroy the server connection        
              _server.destroy();
              // Finish the test
              test.done();
            });
          });
        });
      });
    })

    // Start connection
    server.connect();
  }
}

exports['Should correctly execute query against cursorId'] = {
  metadata: {
    requires: {
      topology: "single"
    }
  },

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
      _server.insert(f("%s.inserts11", configuration.db), [{a:1}, {a:2}, {a:3}], {
        writeConcern: {w:1}, ordered:true
      }, function(err, results) {
        test.equal(null, err);
        test.equal(3, results.result.n);

        // Execute the command
        _server.command(f("%s.$cmd", configuration.db)
          , {parallelCollectionScan: 'inserts11', numCursors: 1}
          , function(err, result) {
            test.equal(null, err);

            // Create cursor from parallel collection scan cursor id
            var cursor = _server.cursor(f("%s.inserts11", configuration.db)
              , result.result.cursors[0].cursor.id
              , { documents: result.result.cursors[0].cursor.firstBatch });

            // Execute next
            cursor.next(function(err, d) {
              test.equal(null, err);
              test.equal(1, d.a);

              // Execute next
              cursor.next(function(err, d) {
                test.equal(null, err);
                test.equal(2, d.a);

                cursor.next(function(err, d) {
                  test.equal(null, err);
                  test.equal(3, d.a);

                  // Destroy the server connection        
                  _server.destroy();
                  // Finish the test
                  test.done();
                });
              });
            });
        });
      });
    })

    // Start connection
    server.connect();
  }
}

exports['Should correctly correctly handle domain'] = {
  metadata: {},

  test: function(configuration, test) {
    var domain = require('domain');
    var d = domain.create();
    d.once('error', function(err) {
      d.exit();
      d.dispose();
      test.done()
    })

    configuration.newConnection(function(err, connection) {
      d.run(function() {
        connection.command('system.$cmd', {ismaster:true}, function() {
          testdfdma();
          test.ok(false);
        });
      });
    })
  }
}

exports['Should correctly kill command cursor'] = {
  metadata: {
    requires: {
      topology: "single"
    }
  },

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
      _server.insert(f("%s.inserts20", configuration.db), [{a:1}, {a:2}, {a:3}], {
        writeConcern: {w:1}, ordered:true
      }, function(err, results) {
        test.equal(null, err);
        test.equal(3, results.result.n);

        // Execute find
        var cursor = _server.cursor(f("%s.inserts20", configuration.db), {
            aggregate: "inserts20"
          , pipeline: [{$match: {}}]
          , cursor: {batchSize: 1}
        });

        // Execute next
        cursor.next(function(err, d) {
          test.equal(null, err);
          test.equal(1, d.a);

          // Kill the cursor
          cursor.kill(function() {
            cursor.next(function(err, d) {
              test.ok(err != null);
              // Destroy the server connection        
              _server.destroy();
              // Finish the test
              test.done();
            });
          });
        });
      });
    })

    // Start connection
    server.connect();
  }
}

exports['Should correctly kill find command cursor'] = {
  metadata: {
    requires: {
      topology: "single"
    }
  },

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
      _server.insert(f("%s.inserts21", configuration.db), [{a:1}, {a:2}, {a:3}], {
        writeConcern: {w:1}, ordered:true
      }, function(err, results) {
        test.equal(null, err);
        test.equal(3, results.result.n);

        // Execute find
        var cursor = _server.cursor(f("%s.inserts21", configuration.db), {
            find: f("%s.inserts1", configuration.db)
          , query: {}
          , batchSize: 1
        });

        // Execute next
        cursor.next(function(err, d) {
          test.equal(null, err);
          test.equal(1, d.a);

          // Kill the cursor
          cursor.kill(function() {
            cursor.next(function(err, d) {
              test.ok(err != null);
              // Destroy the server connection        
              _server.destroy();
              // Finish the test
              test.done();
            });
          });
        });
      });
    })

    // Start connection
    server.connect();
  }
}
