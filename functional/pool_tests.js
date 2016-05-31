"use strict";

exports['Should correctly connect pool to single server'] = {
  metadata: {
    requires: {
      topology: "single"
    }
  },

  test: function(configuration, test) {
    var Pool = require('../../../lib/connection/pool')
      , bson = require('bson').BSONPure.BSON;

    // Attempt to connect
    var pool = new Pool({
        host: configuration.host
      , port: configuration.port
      , bson: bson
    })

    // Add event listeners
    pool.on('connect', function(_pool) {
      _pool.destroy();
      test.done();
    })

    // Start connection
    pool.connect();
  }
}

exports['Should not leak connection marked as immediateRelease'] = {
  metadata: {
    requires: {
      topology: "single"
    }
  },

  test: function(configuration, test) {
    var Server = configuration.require.Server
      , f = require('util').format;

    // Attempt to connect
    var server = new Server({
        host: configuration.host
      , port: configuration.port
      , socketTimeout: 1000
      , size: 3
      , reconnectInterval: 5000
    });

    // Add event listeners
    server.on('connect', function(_server) {
      // Insert some data
      var ns = f("%s.immediateRelease1", configuration.db);
      _server.insert(ns, [{a:1}, {a:2}, {a:3}], {
        writeConcern: {w:1}, ordered:true
      }, function(err, results) {
        test.equal(null, err);
        test.equal(3, results.result.n);

        // Execute find
        var cursor1 = _server.cursor(ns, {
            find: ns
          , query: {}
          , batchSize: 2
        });
        cursor1.next(function(err, r1) {
          test.equal(null, err);
          test.equal(1, _server.s.pool.getAll().length);

          cursor1.next(function(err, r1) {
            test.equal(null, err);
            test.equal(1, _server.s.pool.getAll().length);

            var cursor2 = _server.cursor(ns, {
                find: ns
              , query: {}
              , batchSize: 2
            });
            cursor2.next(function (err, r2) {
              test.equal(null, err);
              test.equal(1, _server.s.pool.getAll().length);

              // kill cursor -- uses an immediateRelease connection
              cursor2.kill(function (err) {
                test.equal(null, err);
                test.equal(1, _server.s.pool.getAll().length);

                // wait for socketTimeout to destroy connection
                setTimeout(function() {
                  test.equal(0, _server.s.pool.getAll().length);

                  // continue find -- a new connection should be created
                  cursor1.next(function (err, r1) {
                    test.equal(null, err);
                    test.equal(1, _server.s.pool.getAll().length);

                    _server.destroy();
                    test.done();
                  });
                }, 2000);
              });
            });
          });
        });
      });
    });

    // Start connection
    server.connect();
  }
}
