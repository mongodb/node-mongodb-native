"use strict";

var f = require('util').format,
  locateAuthMethod = require('./shared').locateAuthMethod,
  executeCommand = require('./shared').executeCommand;

exports['Should iterate cursor'] = {
  metadata: {
    requires: { topology: ["single", "replicaset", "mongos"] }
  },

  test: function(configuration, test) {
    var Server = require('../../../lib2/topologies/server')
      , bson = require('bson').BSONPure.BSON;

    // Attempt to connect
    var server = new Server({
      host: configuration.host, port: configuration.port, bson: new bson()
    });

    // Add event listeners
    server.on('connect', function(_server) {
      var ns = f("integration_tests.cursor1");
      // Execute the write
      _server.insert(ns, [{a:1}, {a:2}, {a:3}], {
        writeConcern: {w:1}, ordered:true
      }, function(err, results) {
        test.equal(null, err);
        test.equal(3, results.result.n);

        // Execute find
        var cursor = _server.cursor(ns, {
            find: ns
          , query: {}
          , batchSize: 2
        });

        // Execute next
        cursor.next(function(err, d) {
          test.equal(null, err);
          test.equal(1, d.a);
          test.equal(1, cursor.bufferedCount());

          // Kill the cursor
          cursor.next(function(err, d) {
            test.equal(null, err);
            test.equal(2, d.a);
            test.equal(0, cursor.bufferedCount());
            // Destroy the server connection
            _server.destroy();
            // Finish the test
            test.done();
          });
        });
      });
    });

    // Start connection
    server.connect();
  }
}

exports['Should iterate cursor but readBuffered'] = {
  metadata: {
    requires: { topology: ["single", "replicaset", "mongos"] }
  },

  test: function(configuration, test) {
    var Server = require('../../../lib2/topologies/server')
      , bson = require('bson').BSONPure.BSON;

    // Attempt to connect
    var server = new Server({
      host: configuration.host, port: configuration.port, bson: new bson()
    });

    var ns = f("%s.cursor2", configuration.db);
    // Add event listeners
    server.on('connect', function(_server) {
      // Execute the write
      _server.insert(ns, [{a:1}, {a:2}, {a:3}, {a:4}, {a:5}], {
        writeConcern: {w:1}, ordered:true
      }, function(err, results) {
        test.equal(null, err);
        test.equal(5, results.result.n);

        // Execute find
        var cursor = _server.cursor(ns, {
            find: ns
          , query: {}
          , batchSize: 5
        });

        // Execute next
        cursor.next(function(err, d) {
          test.equal(null, err);
          test.equal(1, d.a);
          test.equal(4, cursor.bufferedCount());

          // Read the buffered Count
          var items = cursor.readBufferedDocuments(cursor.bufferedCount());

          // Get the next item
          cursor.next(function(err, d) {
            test.equal(null, err);
            test.equal(null, d);

            // Destroy the server connection
            _server.destroy();
            // Finish the test
            test.done();
          });
        });
      });
    });

    // Start connection
    server.connect();
  }
}

exports['Should callback exhausted cursor with error'] = {
  metadata: {
    requires: { topology: ["single", "replicaset", "mongos"] }
  },

  test: function(configuration, test) {
    var Server = require('../../../lib2/topologies/server')
      , bson = require('bson').BSONPure.BSON;

    // Attempt to connect
    var server = new Server({
      host: configuration.host, port: configuration.port, bson: new bson()
    });

    var ns = f("%s.cursor3", configuration.db);
    // Add event listeners
    server.on('connect', function(_server) {
      // Execute the write
      _server.insert(ns, [{a:1}], {
        writeConcern: {w:1}, ordered:true
      }, function(err, results) {
        test.equal(null, err);
        test.equal(1, results.result.n);

        // Execute find
        var cursor = _server.cursor(ns, { find: ns, query: {}, batchSize: 5 });

        // Execute next
        cursor.next(function(err, d) {
          test.equal(null, err);
          test.equal(1, d.a);

          // Get the next item
          cursor.next(function(err, d) {
            test.equal(null, err);
            test.equal(null, d);

            cursor.next(function(err, d) {
              test.ok(err);
              test.equal(null, d);
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
};

exports['Should force a getMore call to happen'] = {
  metadata: {
    requires: { topology: ["single", "replicaset", "mongos"] }
  },

  test: function(configuration, test) {
    var Server = require('../../../lib2/topologies/server')
      , bson = require('bson').BSONPure.BSON;

    // Attempt to connect
    var server = new Server({
      host: configuration.host, port: configuration.port, bson: new bson()
    });

    var ns = f("%s.cursor4", configuration.db);
    // Add event listeners
    server.on('connect', function(_server) {
      // Execute the write
      _server.insert(ns, [{a:1}, {a:2}, {a:3}], {
        writeConcern: {w:1}, ordered:true
      }, function(err, results) {
        test.equal(null, err);
        test.equal(3, results.result.n);

        // Execute find
        var cursor = _server.cursor(ns, { find: ns, query: {}, batchSize: 2 });

        // Execute next
        cursor.next(function(err, d) {
          test.equal(null, err);
          test.equal(1, d.a);

          // Get the next item
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
};

exports['Should force a getMore call to happen then call killCursor'] = {
  metadata: {
    requires: { topology: ["single", "replicaset", "mongos"] }
  },

  test: function(configuration, test) {
    var Server = require('../../../lib2/topologies/server')
      , bson = require('bson').BSONPure.BSON;

    // Attempt to connect
    var server = new Server({
      host: configuration.host, port: configuration.port, bson: new bson()
    });

    var ns = f("%s.cursor4", configuration.db);
    // Add event listeners
    server.on('connect', function(_server) {
      // Execute the write
      _server.insert(ns, [{a:1}, {a:2}, {a:3}], {
        writeConcern: {w:1}, ordered:true
      }, function(err, results) {
        test.equal(null, err);
        test.equal(3, results.result.n);

        // Execute find
        var cursor = _server.cursor(ns, { find: ns, query: {}, batchSize: 2 });

        // Execute next
        cursor.next(function(err, d) {
          test.equal(null, err);
          test.equal(1, d.a);

          // Get the next item
          cursor.next(function(err, d) {
            test.equal(null, err);
            test.equal(2, d.a);

            // Kill cursor
            cursor.kill(function() {
              // Should error out
              cursor.next(function(err, d) {
                test.equal(null, err);
                test.equal(null, d);

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
};

exports['Should force a getMore call to happen then call killCursor'] = {
  metadata: {
    requires: { topology: ["single", "replicaset", "mongos"] }
  },

  test: function(configuration, test) {
    var Server = require('../../../lib2/topologies/server')
      , bson = require('bson').BSONPure.BSON;

    // Attempt to connect
    var server = new Server({
      host: configuration.host, port: configuration.port, bson: new bson()
    });

    var ns = f("%s.cursor4", configuration.db);
    // Add event listeners
    server.on('connect', function(_server) {
      // Execute the write
      _server.insert(ns, [{a:1}, {a:2}, {a:3}], {
        writeConcern: {w:1}, ordered:true
      }, function(err, results) {
        test.equal(null, err);
        test.equal(3, results.result.n);

        // Execute find
        var cursor = _server.cursor(ns, { find: ns, query: {}, batchSize: 2 });

        // Execute next
        cursor.next(function(err, d) {
          test.equal(null, err);
          test.equal(1, d.a);

          // Get the next item
          cursor.next(function(err, d) {
            test.equal(null, err);
            test.equal(2, d.a);

            // Kill cursor
            cursor.kill(function() {
              // Should error out
              cursor.next(function(err, d) {
                test.equal(null, err);
                test.equal(null, d);

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
};

exports['Should fail cursor correctly after server restart'] = {
  metadata: {
    requires: { topology: ["single", "replicaset", "mongos"] }
  },

  test: function(configuration, test) {
    var Server = require('../../../lib2/topologies/server')
      , bson = require('bson').BSONPure.BSON;

    // Attempt to connect
    var server = new Server({
      host: configuration.host, port: configuration.port, bson: new bson()
    });

    var ns = f("%s.cursor5", configuration.db);
    // Add event listeners
    server.on('connect', function(_server) {
      // Execute the write
      _server.insert(ns, [{a:1}, {a:2}, {a:3}], {
        writeConcern: {w:1}, ordered:true
      }, function(err, results) {
        test.equal(null, err);
        test.equal(3, results.result.n);

        // Execute find
        var cursor = _server.cursor(ns, { find: ns, query: {}, batchSize: 2 });

        // Execute next
        cursor.next(function(err, d) {
          test.equal(null, err);
          test.equal(1, d.a);

          // Get the next item
          cursor.next(function(err, d) {
            test.equal(null, err);
            test.equal(2, d.a);

            configuration.manager.restart(false).then(function() {
              // Should error out
              cursor.next(function(err, d) {
                test.ok(err);
                test.equal(null, d);

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
};

exports['Should finish cursor correctly after all sockets to pool destroyed'] = {
  metadata: {
    requires: { topology: ["single", "replicaset", "mongos"] }
  },

  test: function(configuration, test) {
    var Server = require('../../../lib2/topologies/server')
      , bson = require('bson').BSONPure.BSON;

    // Attempt to connect
    var server = new Server({
      host: configuration.host, port: configuration.port, bson: new bson()
    });

    var ns = f("%s.cursor6", configuration.db);
    // Add event listeners
    server.on('connect', function(_server) {
      // Execute the write
      _server.insert(ns, [{a:1}, {a:2}, {a:3}], {
        writeConcern: {w:1}, ordered:true
      }, function(err, results) {
        test.equal(null, err);
        test.equal(3, results.result.n);

        // Execute find
        var cursor = _server.cursor(ns, { find: ns, query: {}, batchSize: 2 });

        // Execute next
        cursor.next(function(err, d) {
          test.equal(null, err);
          test.equal(1, d.a);

          // Get the next item
          cursor.next(function(err, d) {
            test.equal(null, err);
            test.equal(2, d.a);

            // Should be able to continue cursor after reconnect
            _server.once('reconnect', function() {
              cursor.next(function(err, d) {
                test.equal(null, err);
                test.equal(3, d.a);

                // Destroy the server connection
                _server.destroy();
                // Finish the test
                test.done();
              });
            });

            // Destroy all active connections in the pool
            var connections = _server.s.pool.allConnections();
            for(var i = 0; i < connections.length; i++) {
              connections[i].write("!@#!@#SADASDSA!@#!@#!@#!@#!@");
            };
          });
        });
      });
    })

    // Start connection
    server.connect();
  }
};
