'use strict';

const expect = require('chai').expect;
const inherits = require('util').inherits;
const f = require('util').format;
const CoreCursor = require('../../../lib/core/cursor');

describe('Extend cursor tests', function() {
  it('should correctly extend the cursor with custom implementation', {
    metadata: {
      requires: { topology: ['single'] }
    },

    test: function(done) {
      var self = this;
      const config = this.configuration;

      // Create an extended cursor that adds a toArray function
      var ExtendedCursor = function() {
        CoreCursor.apply(this, Array.prototype.slice.call(arguments, 0));
        var extendedCursorSelf = this;

        // Resolve all the next
        var getAllNexts = function(items, callback) {
          extendedCursorSelf.next(function(err, item) {
            if (err) return callback(err);
            if (item === null) return callback(null, null);
            items.push(item);
            getAllNexts(items, callback);
          });
        };

        // Adding a toArray function to the cursor
        this.toArray = function(callback) {
          var items = [];

          getAllNexts(items, function(err) {
            if (err) return callback(err, null);
            callback(null, items);
          });
        };
      };

      // Extend the Cursor
      inherits(ExtendedCursor, CoreCursor);

      // Attempt to connect, adding a custom cursor creator
      var server = config.newTopology(this.configuration.host, this.configuration.port, {
        cursorFactory: ExtendedCursor
      });

      // Add event listeners
      server.on('connect', function(_server) {
        // Execute the write
        _server.insert(
          f('%s.inserts_extend_cursors', self.configuration.db),
          [{ a: 1 }, { a: 2 }, { a: 3 }],
          {
            writeConcern: { w: 1 },
            ordered: true
          },
          function(err, results) {
            expect(err).to.be.null;
            expect(results.result.n).to.equal(3);

            // Execute find
            var cursor = _server.cursor(f('%s.inserts_extend_cursors', self.configuration.db), {
              find: f('%s.inserts_extend_cursors', self.configuration.db),
              query: {}
            });

            // Force a single
            // Logger.setLevel('debug');
            // Set the batch size
            cursor.batchSize = 2;
            // Execute next
            cursor.toArray(function(cursorErr, cursorItems) {
              expect(cursorErr).to.be.null;
              expect(cursorItems.length).to.equal(3);
              // Destroy the connection
              _server.destroy();
              // Finish the test
              done();
            });
          }
        );
      });

      // Start connection
      server.connect();
    }
  });
});
