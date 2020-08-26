'use strict';

const { expect } = require('chai');
const { CoreCursor } = require('../../../src/cursor');

describe('Extend cursor tests', function () {
  it('should correctly extend the cursor with custom implementation', {
    metadata: {
      requires: { topology: ['single'], mongodb: '>=3.2' }
    },

    test: function (done) {
      var self = this;
      const config = this.configuration;

      // Create an extended cursor that adds a toArray function
      class ExtendedCursor extends CoreCursor {
        constructor(topology, ns, cmd, options) {
          super(topology, ns, cmd, options);
          var extendedCursorSelf = this;

          // Resolve all the next
          var getAllNexts = function (items, callback) {
            extendedCursorSelf._next(function (err, item) {
              if (err) return callback(err);
              if (item === null) return callback(null, null);
              items.push(item);
              getAllNexts(items, callback);
            });
          };

          // Adding a toArray function to the cursor
          this.toArray = function (callback) {
            var items = [];

            getAllNexts(items, function (err) {
              if (err) return callback(err, null);
              callback(null, items);
            });
          };
        }
      }

      // Attempt to connect, adding a custom cursor creator
      const topology = config.newTopology(this.configuration.host, this.configuration.port, {
        cursorFactory: ExtendedCursor
      });

      topology.connect(err => {
        expect(err).to.not.exist;
        this.defer(() => topology.close());

        topology.selectServer('primary', (err, server) => {
          expect(err).to.not.exist;

          const ns = `${self.configuration.db}.inserts_extend_cursors`;
          // Execute the write
          server.insert(
            ns,
            [{ a: 1 }, { a: 2 }, { a: 3 }],
            {
              writeConcern: { w: 1 },
              ordered: true
            },
            (err, results) => {
              expect(err).to.not.exist;
              expect(results).property('n').to.equal(3);

              // Execute find
              const cursor = topology.cursor(ns, { find: 'inserts_extend_cursors', filter: {} });

              // Force a single
              // Logger.setLevel('debug');
              // Set the batch size
              cursor.batchSize = 2;
              // Execute next
              cursor.toArray((cursorErr, cursorItems) => {
                expect(cursorErr).to.not.exist;
                expect(cursorItems.length).to.equal(3);
                // Destroy the connection
                server.destroy(done);
              });
            }
          );
        });
      });
    }
  });
});
