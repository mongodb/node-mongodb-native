"use strict";

var f = require('util').format;

exports['Should correctly perform awaitdata'] = {
  metadata: {
    requires: { topology: ["single", "replicaset", "sharded"] }
  },

  test: function(configuration, test) {
    configuration.newTopology(function(err, server) {
      var ns = f("%s.cursor_tailable", configuration.db);
      // Add event listeners
      server.on('connect', function(_server) {
        // Create a capped collection
        _server.command(f("%s.$cmd", configuration.db), {create: 'cursor_tailable', capped:true, size: 10000}, function(err, r) {
          // Execute the write
          _server.insert(ns, [{a:1}], {
            writeConcern: {w:1}, ordered:true
          }, function(err, results) {
            test.equal(null, err);
            test.equal(1, results.result.n);

            // Execute find
            var cursor = _server.cursor(ns, {
                find: ns
              , query: {}
              , batchSize: 2
              , tailable: true
              , awaitData: true
            });

            // Execute next
            cursor.next(function(err, d) {
              // console.log("==================================== Should correctly perform awaitdata 0")
              test.equal(null, err);
              var s = new Date();

              cursor.next(function(err, d) {
                var e = new Date();
                // console.log("==================================== Should correctly perform awaitdata")
                // console.log((e.getTime() - s.getTime()));

                test.ok((e.getTime() - s.getTime()) >= 300);

                // Destroy the server connection
                _server.destroy();
                // Finish the test
                test.done();
              });

              setTimeout(function() {
                cursor.kill();
              }, 300)
            });
          });
        });
      })

      // Start connection
      server.connect();
    });
  }
}
