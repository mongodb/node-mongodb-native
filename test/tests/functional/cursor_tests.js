"use strict";

var f = require('util').format;

exports['Should iterate cursor'] = {
  metadata: {
    requires: {
      topology: "single"
    }
  },

  test: function(configuration, test) {
    configuration.newTopology(function(err, server) {
      var ns = f("%s.cursor1", configuration.db);
      // Add event listeners
      server.on('connect', function(_server) {
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
      })

      // Start connection
      server.connect();
    });
  }
}

exports['Should iterate cursor but readBuffered'] = {
  metadata: {
    requires: {
      topology: "single"
    }
  },

  test: function(configuration, test) {
    configuration.newTopology(function(err, server) {
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
      })

      // Start connection
      server.connect();
    });
  }
}

exports['Should callback exhausted cursor with error'] = {
  metadata: {
    requires: {
      topology: "single"
    }
  },

  test: function(configuration, test) {
    configuration.newTopology(function(err, server) {
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
          var cursor =
            _server.cursor(ns, { find: ns, query: {}, batchSize: 5 });

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
    });
  }
};

exports['Handles overflow sort error when exhausting cursor'] = {
  metadata: {
    requires: {
      topology: "single"
    }
  },

  test: function(configuration, test) {
    configuration.newTopology(function(err, server) {
      var ns = f("%s.cursor4", configuration.db);
      // Add event listeners
      server.on('connect', function(_server) {
        var totalCount = 1024;
        var numOutstanding = totalCount;
        for (var i = 0; i < totalCount; ++i) {
          var doc = { f: require('crypto').pseudoRandomBytes(32 * totalCount) };
          _server.insert(ns, doc, { w: 1 }, function(error) {
            test.equal(error, null);
            if (!--totalCount) {
              doQuery();
            }
          });
        }

        var numInCursor = 0;
        var exhaust = function(cursor, callback) {
          cursor.next(function(error, res) {
            if (error) {
              return callback(error);
            }
            if (!res) {
              return callback(null);
            }
            exhaust(cursor, callback);
          });
        };

        var doQuery = function() {
          var sort = { f: 1, _id: 1 }
          var cursor = _server.cursor(ns,
            { find: ns, query: {}, batchSize: totalCount, sort: sort });
          exhaust(cursor, function(error) {
            test.ok(error);
            var message = error.toString();
            test.ok(message.indexOf('Overflow sort stage') !== -1);
            _server.destroy();
            test.done();
          });
        };
      });

      // Start connection
      server.connect();
    });
  }
};
