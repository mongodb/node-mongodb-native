"use strict";

var f = require('util').format
  , Long = require('bson').Long;

exports['Should correctly connect server to single instance'] = {
  metadata: { requires: { topology: "single" } },

  test: function(configuration, test) {
    var Server = require('../../../lib/topologies/server')
      , bson = require('bson');

    // Attempt to connect
    var server = new Server({
        host: configuration.host
      , port: configuration.port
      , bson: new bson()
    })

    // Add event listeners
    server.on('connect', function(server) {
      server.destroy();
      test.done();
    });

    // Start connection
    server.connect();
  }
}

exports['Should correctly connect server to single instance and execute ismaster'] = {
  metadata: { requires: { topology: "single" } },

  test: function(configuration, test) {
    var Server = require('../../../lib/topologies/server')
      , bson = require('bson');

    // Attempt to connect
    var server = new Server({
        host: configuration.host
      , port: configuration.port
      , bson: new bson()
    })

    // Add event listeners
    server.on('connect', function(server) {
      server.command('admin.$cmd', {ismaster:true}, function(err, r) {
        test.equal(null, err);
        test.equal(true, r.result.ismaster);
        test.ok(r.connection != null)

        server.destroy();
        test.done();
      });
    });

    // Start connection
    server.connect();
  }
}

exports['Should correctly connect server to single instance and execute ismaster returning raw'] = {
  metadata: { requires: { topology: "single" } },

  test: function(configuration, test) {
    var Server = require('../../../lib/topologies/server')
      , bson = require('bson');

    // Attempt to connect
    var server = new Server({
        host: configuration.host
      , port: configuration.port
      , bson: new bson()
    })

    // Add event listeners
    server.on('connect', function(server) {
      server.command('admin.$cmd', {ismaster:true}, {
        raw: true
      }, function(err, r) {
        test.equal(null, err);
        test.ok(r.result instanceof Buffer);
        test.ok(r.connection != null)

        server.destroy();
        test.done();
      });
    });

    // Start connection
    server.connect();
  }
}

exports['Should correctly connect server to single instance and execute insert'] = {
  metadata: { requires: { topology: "single" } },

  test: function(configuration, test) {
    var Server = require('../../../lib/topologies/server')
      , bson = require('bson');

    // Attempt to connect
    var server = new Server({
        host: configuration.host
      , port: configuration.port
      , bson: new bson()
    })

    // Add event listeners
    server.on('connect', function(server) {
      server.insert('integration_tests.inserts', {a:1}, function(err, r) {
        test.equal(null, err);
        test.equal(1, r.result.n);

        server.insert('integration_tests.inserts', {a:1}, {ordered:false}, function(err, r) {
          test.equal(null, err);
          test.equal(1, r.result.n);

          server.destroy();
          test.done();
        });
      });
    });

    // Start connection
    server.connect();
  }
}

exports['Should correctly connect server to single instance and execute bulk insert'] = {
  metadata: { requires: { topology: "single" } },

  test: function(configuration, test) {
    var Server = require('../../../lib/topologies/server')
      , bson = require('bson');

    // Attempt to connect
    var server = new Server({
        host: configuration.host
      , port: configuration.port
      , bson: new bson()
    })

    // Add event listeners
    server.on('connect', function(server) {
      server.insert('integration_tests.inserts', [{a:1}, {b:1}], function(err, r) {
        test.equal(null, err);
        test.equal(2, r.result.n);

        server.insert('integration_tests.inserts', [{a:1}, {b:1}], {ordered:false}, function(err, r) {
          test.equal(null, err);
          test.equal(2, r.result.n);

          server.destroy();
          test.done();
        });
      });
    });

    // Start connection
    server.connect();
  }
}

exports['Should correctly connect server to single instance and execute insert with w:0'] = {
  metadata: { requires: { topology: "single" } },

  test: function(configuration, test) {
    var Server = require('../../../lib/topologies/server')
      , bson = require('bson');

    // Attempt to connect
    var server = new Server({
        host: configuration.host
      , port: configuration.port
      , bson: new bson()
    })

    // Add event listeners
    server.on('connect', function(server) {
      server.insert('integration_tests.inserts', {a:1}, {writeConcern: {w:0}}, function(err, r) {
        test.equal(null, err);
        test.equal(1, r.result.ok);

        server.insert('integration_tests.inserts', {a:1}, {ordered:false, writeConcern: {w:0}}, function(err, r) {
          test.equal(null, err);
          test.equal(1, r.result.ok);

          server.destroy();
          test.done();
        });
      });
    });

    // Start connection
    server.connect();
  }
}

exports['Should correctly connect server to single instance and execute update'] = {
  metadata: { requires: { topology: "single" } },

  test: function(configuration, test) {
    var Server = require('../../../lib/topologies/server')
      , bson = require('bson');

    // Attempt to connect
    var server = new Server({
        host: configuration.host
      , port: configuration.port
      , bson: new bson()
    })

    // Add event listeners
    server.on('connect', function(_server) {
      _server.update('integration_tests.inserts_example2', [{
        q: {a: 1}, u: {'$set': {b:1}}, upsert:true
      }], {
        writeConcern: {w:1}, ordered:true
      }, function(err, results) {
        test.equal(null, err);
        test.equal(1, results.result.n);

        _server.destroy();
        test.done();
      });
    });

    // Start connection
    server.connect();
  }
}

exports['Should correctly connect server to single instance and execute remove'] = {
  metadata: { requires: { topology: "single" } },

  test: function(configuration, test) {
    var Server = require('../../../lib/topologies/server')
      , bson = require('bson');

    // Attempt to connect
    var server = new Server({
        host: configuration.host
      , port: configuration.port
      , bson: new bson()
    })

    // Add event listeners
    server.on('connect', function(_server) {
      server.insert('integration_tests.remove_example', {a:1}, function(err, r) {
        test.equal(null, err);
        test.equal(true, r.result.ok);

        _server.remove('integration_tests.remove_example', [{q: {a:1}, limit:1}], {
          writeConcern: {w:1}, ordered:true
        }, function(err, results) {
          test.equal(null, err);
          test.equal(1, results.result.n);

          _server.destroy();
          test.done();
        });
      });
    });

    // Start connection
    server.connect();
  }
}

/**
 * @ignore
 */
exports['Should correctly recover with multiple restarts'] = {
  metadata: {
    requires: { topology: ['single'] },
    ignore: { travis: true }
  },

  // The actual test we wish to run
  test: function(configuration, test) {
    var Server = require('../../../lib/topologies/server')
      , bson = require('bson');

    var done = false;

    // Attempt to connect
    var server = new Server({
        host: configuration.host
      , port: configuration.port
      , bson: new bson()
    })

    // Add event listeners
    server.on('connect', function(_server) {
      var count = 1;
      var allDone = 0;
      var ns = "integration_tests.t";

      var execute = function() {
        if(!done) {
          server.insert(ns, {a:1, count: count}, function(err, r) {
            count = count + 1;

            // Execute find
            var cursor = _server.cursor(ns, {
              find: ns, query: {}, batchSize: 2
            });

            // Execute next
            cursor.next(function(err, d) {
              setTimeout(execute, 500);
            });
          })
        } else {
          server.insert(ns, {a:1, count: count}, function(err, r) {
            test.equal(null, err);

            // Execute find
            var cursor = _server.cursor(ns, {
              find: ns, query: {}, batchSize: 2
            });

            // Execute next
            cursor.next(function(err, d) {
              test.equal(null, err);
              server.destroy();
              test.done();
            });
          })
        }
      }

      setTimeout(execute, 500);
    });

    var count = 2

    var restartServer = function() {
      if(count == 0) {
        done = true;
        return;
      }

      count = count - 1;

      configuration.manager.stop().then(function() {
        setTimeout(function() {
          configuration.manager.start().then(function() {
            setTimeout(restartServer, 1000);
          });
        }, 2000);
      });
    }

    setTimeout(restartServer, 1000);
    server.connect();
  }
}

exports['Should correctly reconnect to server with automatic reconnect enabled'] = {
  metadata: {
    requires: {
      topology: "single"
    },
    // ignore: { travis:true }
  },

  test: function(configuration, test) {
    var Server = configuration.require.Server
      , ReadPreference = configuration.require.ReadPreference;

    // Attempt to connect
    var server = new Server({
        host: configuration.host
      , port: configuration.port
      , reconnect: true
      , size: 1
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
            // console.dir(err)
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
      test.equal(30, server.s.pool.retriesLeft);
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
    // ignore: { travis:true }
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

      var errors = [];

      server.on('connect', function() {
        test.done();
        server.destroy();
      });

      server.on('reconnect', function() {
        test.done();
        server.destroy();
      });

      server.on('error', function(err) {
        test.ok(err);
        test.ok(err.message.indexOf('failed to') != -1);
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
    // ignore: { travis:true }
  },

  test: function(configuration, test) {
    var Server = configuration.require.Server
      , ReadPreference = configuration.require.ReadPreference;

    // Attempt to connect
    var server = new Server({
        host: configuration.host
      , port: configuration.port
      , reconnect: true
      , size: 1
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
      for(var i = 0; i < 100; i++) {
        server.command("system.$cmd", {ismaster: true}, function(err, result) {
          test.equal(null, err);
        });
      }

      server.command("system.$cmd", {ismaster: true}, function(err, result) {
        test.equal(null, err);

        setTimeout(function() {
          test.ok(server.s.pool.availableConnections.length > 0);
          test.equal(0, server.s.pool.inUseConnections.length);
          test.equal(0, server.s.pool.connectingConnections.length);

          server.destroy();
          test.done();
        }, 1000);
      });
    });

    // Start connection
    server.connect();
  }
}

exports['Should not overflow the poolSize due to concurrent operations'] = {
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

    // Attempt to connect while server is down
    var server = new Server({
        host: configuration.host
      , port: configuration.port
      , reconnect: true
      , reconnectTries: 2
      , size: 50
      , emitError: true
    });

    server.on('connect', function() {
      var left = 5000;

      for(var i = 0; i < 5000; i++) {
        server.insert(f("%s.massInsertsTest", configuration.db), [{a:1}], {
          writeConcern: {w:1}, ordered:true
        }, function(err, results) {
          left = left - 1;

          if(!left) {
            test.equal(50, server.connections().length);

            test.done();
            server.destroy();
          }
        });
      }
    });

    server.connect();
  }
}

exports['Should correctly connect execute 5 evals in parallel'] = {
  metadata: { requires: { topology: "single" } },

  test: function(configuration, test) {
    var Server = require('../../../lib/topologies/server')
      , bson = require('bson');

    // Attempt to connect
    var server = new Server({
        host: configuration.host
      , port: configuration.port
      , size: 10
      , bson: new bson()
    })

    // Add event listeners
    server.on('connect', function(server) {
      var left = 5;
      var start = new Date().getTime();

      for (var i = 0; i < left; i++) {
        server.command('system.$cmd', {eval: 'sleep(100);'}, function(err, r) {
          left = left - 1;

          if(left == 0) {
            var total = new Date().getTime() - start;
            test.ok(total > 5*100 && total < 1000);

            server.destroy();
            test.done();
          }
        });
      }
    });

    // Start connection
    server.connect();
  }
}
