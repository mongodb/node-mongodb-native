"use strict";

/**
 * Correctly cause pool to grow
 */
exports['Poolsize should grown as concurrent operations are executed'] = {
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
      , size: 3
    })

    // Number of operations done
    var numberOfOpsDone = 0;
    var numberOfPoolConnectionExpansion = 1;

    // LINE var Server = require('mongodb-core').Server,
    // LINE   test = require('assert');
    // LINE var server = new Server({host: 'localhost', port: 27017});
    // REMOVE-LINE test.done();
    // BEGIN
    // Add event listeners
    server.on('connect', function(_server) {
      _server.s.pool.on('connection', function() {
        numberOfPoolConnectionExpansion = numberOfPoolConnectionExpansion + 1;
      });

      var left = 100;
      for(var i = 0; i < 100; i++) {
        // Execute the insert
        _server.insert('integration_tests.inserts_example1', [{a:i}], {
          writeConcern: {w:1}, ordered:true
        }, function(err, results) {
          test.equal(null, err);
          test.equal(1, results.result.n);

          left = left - 1;
          if(left == 0) {
            test.equal(3, numberOfPoolConnectionExpansion);
            _server.destroy();
            test.done();
          }
        });
      }
    });

    // Start connection
    server.connect();
    // END
  }
}

/**
 * Correctly cause pool to grow
 */
exports['Destroyed connection should only affect operations on the particular connection'] = {
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
      , connectionTimeout: 3000
      , socketTimeout: 2000
      , reconnectInterval: 50
      , size: 3
    })

    // Number of operations done
    var numberOfOpsDone = 0;
    var numberOfPoolConnectionExpansion = 1;
    var numberOfErrors = 0;
    var numberOfSuccesses = 0;

    // Add event listeners
    server.on('connect', function(_server) {
      _server.s.pool.on('connection', function() {
        numberOfPoolConnectionExpansion = numberOfPoolConnectionExpansion + 1;
      });

      var left = 100;
      for(var i = 0; i < 100; i++) {
        // console.log("-------------- 0")
        // Execute the insert
        _server.insert('integration_tests.inserts_example1', [{a:i}], {
          writeConcern: {w:1}, ordered:true
        }, function(err, results) {

          // if(left == 90 && results) {
          //   var connections = _server.s.pool.getAll();
          //   // connections[0].connection.write('§§12§3e1e213123213123')
          //   for(var i = 0; i < connections.length; i++) {
          //     connections[i].connection.write('§§12§3e1e213123213123')
          //   }
          //   // results.connection.write('§§12§3e1e213123213123')
          // }

          // console.log("-------------- 1")
          // console.dir(results)
          // if(results) console.dir(results.result)
          if(err) numberOfErrors += 1;
          if(results) numberOfSuccesses += 1;

          left = left - 1;
          if(left == 0) {
            // console.log("------------------------------------------------------")
            // console.log("numberOfErrors = " + numberOfErrors)
            // console.log("numberOfSuccesses = " + numberOfSuccesses)
            // console.log("numberOfPoolConnectionExpansion = " + numberOfPoolConnectionExpansion)
            // test.equal(1, numberOfErrors);
            test.ok(numberOfErrors == 0 || numberOfErrors == 1)
            test.ok(numberOfSuccesses == 99 || numberOfSuccesses == 100)
            test.ok(numberOfPoolConnectionExpansion >= 3);

            _server.destroy();
            test.done();
          }
        });

        // Destroy a connection
        if(i == 10) {
          // try {
          //   var connections = _server.s.pool.getAll();
          //   console.dir(connections)
          //   var a = new Buffer(100);
          //   for(var i = 0; i < 100; i++) a[i] = i;
          //   connections[0].connection.write(a);
          // } catch(err) {
          //   console.log(err.stack)
          // }

          var connections = _server.s.pool.getAll();
          connections[0].connection.write('§§12§3e1e213123213123')
          // for(var i = 0; i < connections.length; i++) {
          //   connections[i].connection.write('§§12§3e1e213123213123')
          // }
        }
      }
    });

    // Start connection
    server.connect();
  }
}

/**
 * Correctly cause pool to grow
 */
exports['Fast operations should not be affected by slow train operation'] = {
  metadata: {
    requires: {
      topology: "single"
    }
  },

  test: function(configuration, test) {
    var Server = configuration.require.Server
      , f = require('util').format
      , ReadPreference = configuration.require.ReadPreference;

    // Attempt to connect
    var server = new Server({
        host: configuration.host
      , port: configuration.port
      , reconnect: true
      , connectionTimeout: 3000
      , socketTimeout: 5000
      , reconnectInterval: 50
      , size: 3
    })

    // Number of operations done
    var numberOfOpsDone = 0;
    var numberOfPoolConnectionExpansion = 1;
    var numberOfErrors = 0;
    var numberOfSuccesses = 0;

    // Add event listeners
    server.on('connect', function(_server) {
      var ns = f("%s.cursor1", configuration.db);

      // Execute the write
      _server.insert(ns, [{a:1}, {a:2}, {a:3}], {
        writeConcern: {w:1}, ordered:true
      }, function(err, results) {
        test.equal(null, err);
        test.equal(3, results.result.n);

        // Execute find
        var cursor = _server.cursor(ns, {
            find: ns
          , query: {"$where": "sleep(200) || true"}
          , batchSize: 2
        });

        var totalInsertTime = 0;
        var s = new Date();
        // Perform a slow query
        cursor.next(function(err, r) {
          var totalQueryTime = new Date().getTime() - s.getTime();
          // console.log("totalQueryTime = " + totalQueryTime)
          // console.log("totalInsertTime = " + totalInsertTime)
          test.ok(totalInsertTime < totalQueryTime);

          _server.destroy();
          test.done();
        });

        var left = 100;
        var s = new Date();

        for(var i = 0; i < 100; i++) {
          _server.insert(ns, [{a:i}], {
            writeConcern: {w:1}, ordered:true
          }, function(err, results) {
            left = left - 1;

            if(left == 0) {
              totalInsertTime = new Date().getTime() - s.getTime();
            }
          });
        }
      });
    });

    // Start connection
    server.connect();
  }
}
