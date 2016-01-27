"use strict";

/**
 * Correctly cause pool to grow
 */
exports['Example of simple parallel insert into db'] = {
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

    // Number of operations done
    var numberOfOpsDone = 0;
    var numberOfPoolConnectionExpansion = 0;

    // LINE var Server = require('mongodb-core').Server,
    // LINE   test = require('assert');
    // LINE var server = new Server({host: 'localhost', port: 27017});
    // REMOVE-LINE test.done();
    // BEGIN
    // Add event listeners
    server.on('connect', function(_server) {
      _server.s.pool.once('connection', function() {
        numberOfPoolConnectionExpansion = numberOfPoolConnectionExpansion + 1;
      });


      // Execute the insert
      _server.insert('integration_tests.inserts_example1', [{a:1}], {
        writeConcern: {w:1}, ordered:true
      }, function(err, results) {
        test.equal(null, err);
        test.equal(1, results.result.n);
        numberOfOpsDone = numberOfOpsDone + 1;

        if(numberOfOpsDone == 3) {
          test.ok(numberOfPoolConnectionExpansion > 0);
          _server.destroy();
          test.done();          
        }
      });

      // Execute the insert
      _server.insert('integration_tests.inserts_example1', [{a:1}], {
        writeConcern: {w:1}, ordered:true
      }, function(err, results) {
        test.equal(null, err);
        test.equal(1, results.result.n);
        numberOfOpsDone = numberOfOpsDone + 1;

        if(numberOfOpsDone == 3) {
          test.ok(numberOfPoolConnectionExpansion > 0);
          _server.destroy();
          test.done();          
        }
      });

      // Execute the insert
      _server.insert('integration_tests.inserts_example1', [{a:1}], {
        writeConcern: {w:1}, ordered:true
      }, function(err, results) {
        test.equal(null, err);
        test.equal(1, results.result.n);
        numberOfOpsDone = numberOfOpsDone + 1;

        if(numberOfOpsDone == 3) {
          test.ok(numberOfPoolConnectionExpansion > 0);
          _server.destroy();
          test.done();          
        }
      });
    });

    // Start connection
    server.connect();
    // END
  }
}
