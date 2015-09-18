"use strict";

var f = require('util').format
  , Long = require('bson').Long
  , ObjectId = require('bson').ObjectId;

exports['Should correctly execute insert culling undefined'] = {
  metadata: {
    requires: {}
  },

  test: function(configuration, test) {
    configuration.newTopology(function(err, server) {
      // Add event listeners
      server.on('connect', function(_server) {
        // Drop collection
        _server.command(f('%s.$cmd', configuration.db), {drop: 'insert1'}, function() {
          var ns = f("%s.insert1", configuration.db);
          var objectId = new ObjectId();
          // Execute the write
          _server.insert(ns, [{_id: objectId, a:1, b:undefined}], {
            writeConcern: {w:1}, ordered:true, ignoreUndefined:true
          }, function(err, results) {
            test.equal(null, err);
            test.equal(1, results.result.n);

            // Execute find
            var cursor = _server.cursor(ns, {
                find: f("%s.insert1", configuration.db)
              , query: {_id: objectId}
              , batchSize: 2
            });

            // Execute next
            cursor.next(function(err, d) {
              test.equal(null, err);
              test.ok(d.b === undefined);

              // Destroy the connection
              _server.destroy();
              // Finish the test
              test.done();
            });
          });
        });
      });

      // Start connection
      server.connect();
    });
  }
}

exports['Should correctly execute update culling undefined'] = {
  metadata: {
    requires: {}
  },

  test: function(configuration, test) {
    configuration.newTopology(function(err, server) {
      // Add event listeners
      server.on('connect', function(_server) {
        // Drop collection
        _server.command(f('%s.$cmd', configuration.db), {drop: 'update1'}, function() {
          var ns = f("%s.update1", configuration.db);
          var objectId = new ObjectId();
          // Execute the write
          _server.update(ns, {
            q: {_id: objectId, a:1, b:undefined}, u: {$set: {a:1, b:undefined}}, upsert:true
          }, {
            writeConcern: {w:1}, ordered:true, ignoreUndefined:true
          }, function(err, results) {
            test.equal(null, err);
            test.equal(1, results.result.n);

            // Execute find
            var cursor = _server.cursor(ns, {
                find: f("%s.update1", configuration.db)
              , query: {_id: objectId}
              , batchSize: 2
            });

            // Execute next
            cursor.next(function(err, d) {
              test.equal(null, err);
              test.ok(d.b === undefined);

              // Destroy the connection
              _server.destroy();
              // Finish the test
              test.done();
            });
          });
        });
      });

      // Start connection
      server.connect();
    });
  }
}

exports['Should correctly execute remove culling undefined'] = {
  metadata: {
    requires: {}
  },

  test: function(configuration, test) {
    configuration.newTopology(function(err, server) {
      // Add event listeners
      server.on('connect', function(_server) {
        var ns = f("%s.remove1", configuration.db);
        var objectId = new ObjectId();

        _server.command(f('%s.$cmd', configuration.db), {drop: 'remove1'}, function() {
          
          // Execute the write
          _server.insert(ns, [{id: objectId, a:1, b:undefined}, {id: objectId, a:2, b:1}], {
            writeConcern: {w:1}, ordered:true
          }, function(err, results) {
            test.equal(null, err);
            test.equal(2, results.result.n);

            // Execute the write
            _server.remove(ns, [{
              q: {b:undefined}, limit: 0
            }], {
              writeConcern: {w:1}, ordered:true, ignoreUndefined:true
            }, function(err, results) {
              test.equal(null, err);
              test.equal(2, results.result.n);

              // Destroy the connection
              _server.destroy();
              // Finish the test
              test.done();
            });
          });

        });
      });

      // Start connection
      server.connect();
    });
  }
}

exports['Should correctly execute remove not culling undefined'] = {
  metadata: {
    requires: {}
  },

  test: function(configuration, test) {
    configuration.newTopology(function(err, server) {
      // Add event listeners
      server.on('connect', function(_server) {
        var ns = f("%s.remove1", configuration.db);
        var objectId = new ObjectId();

        _server.command(f('%s.$cmd', configuration.db), {drop: 'remove1'}, function() {
          
          // Execute the write
          _server.insert(ns, [{id: objectId, a:1, b:undefined}, {id: objectId, a:2, b:1}], {
            writeConcern: {w:1}, ordered:true
          }, function(err, results) {
            test.equal(null, err);
            test.equal(2, results.result.n);

            // Execute the write
            _server.remove(ns, [{
              q: {b:undefined}, limit: 0
            }], {
              writeConcern: {w:1}, ordered:true
            }, function(err, results) {
              test.equal(null, err);
              test.equal(1, results.result.n);

              // Destroy the connection
              _server.destroy();
              // Finish the test
              test.done();
            });
          });

        });
      });

      // Start connection
      server.connect();
    });
  }
}