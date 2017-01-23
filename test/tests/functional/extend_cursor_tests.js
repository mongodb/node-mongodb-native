"use strict";

var inherits = require('util').inherits
  , f = require('util').format
  , Logger = require('../../../lib/connection/logger')
  , EventEmitter = require('events').EventEmitter;

exports['Should correctly extend the cursor with custom implementation'] = {
  metadata: {
    requires: { topology: ["single", "replicaset", "sharded"] }
  },

  test: function(configuration, test) {
    var Server = configuration.require.Server;
    var Cursor = configuration.require.Cursor;

    //
    // Create an extended cursor that adds a toArray function
    var ExtendedCursor = function(bson, ns, cmd, options, connection, callbacks, topologyOptions) {
      Cursor.apply(this, Array.prototype.slice.call(arguments, 0));
      var self = this;

      // Resolve all the next
      var getAllNexts = function(items, callback) {
        self.next(function(err, item) {
          if(err) return callback(err);
          if(item == null) return callback(null, null);
          items.push(item);
          getAllNexts(items, callback);
        });
      }

      // Adding a toArray function to the cursor
      this.toArray = function(callback) {
        var items = [];

        getAllNexts(items, function(err, r) {
          if(err) return callback(err, null);
          callback(null, items);
        });
      }
    }

    // Extend the Cursor
    inherits(ExtendedCursor, Cursor);

    //
    // Attempt to connect, adding a custom cursor creator
    var server = new Server({
        host: configuration.host
      , port: configuration.port
      , cursorFactory: ExtendedCursor
    });

    // Add event listeners
    server.on('connect', function(_server) {
      // Execute the write
      _server.insert(f("%s.inserts_extend_cursors", configuration.db), [{a:1}, {a:2}, {a:3}], {
        writeConcern: {w:1}, ordered:true
      }, function(err, results) {
        test.equal(null, err);
        test.equal(3, results.result.n);

        // Execute find
        var cursor = _server.cursor(f("%s.inserts_extend_cursors", configuration.db), {
            find: f("%s.inserts_extend_cursors", configuration.db)
          , query: {}
        });

        // Force a single
        // Logger.setLevel('debug');
        // Set the batch size
        cursor.batchSize = 2;
        // Execute next
        cursor.toArray(function(err, items) {
          test.equal(null, err);
          test.equal(3, items.length);
          // Destroy the connection
          _server.destroy();
          // Finish the test
          test.done();
        });
      });
    })

    // Start connection
    server.connect();
  }
}
