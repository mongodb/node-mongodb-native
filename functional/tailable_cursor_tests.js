'use strict';

var expect = require('chai').expect,
  f = require('util').format;

describe('Tailable cursor tests', function() {
  it('should correctly perform awaitdata', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded'] }
    },

    test: function(done) {
      var self = this;

      this.configuration.newTopology(function(err, server) {
        var ns = f('%s.cursor_tailable', self.configuration.db);
        // Add event listeners
        server.on('connect', function(_server) {
          // Create a capped collection
          _server.command(
            f('%s.$cmd', self.configuration.db),
            { create: 'cursor_tailable', capped: true, size: 10000 },
            function(cmdErr, cmdRes) {
              expect(cmdErr).to.not.exist;
              expect(cmdRes).to.exist;

              // Execute the write
              _server.insert(
                ns,
                [{ a: 1 }],
                {
                  writeConcern: { w: 1 },
                  ordered: true
                },
                function(insertErr, results) {
                  expect(insertErr).to.be.null;
                  expect(results.result.n).to.equal(1);

                  // Execute find
                  var cursor = _server.cursor(ns, {
                    find: ns,
                    query: {},
                    batchSize: 2,
                    tailable: true,
                    awaitData: true
                  });

                  // Execute next
                  cursor.next(function(cursorErr, cursorD) {
                    expect(cursorErr).to.be.null;
                    expect(cursorD).to.exist;

                    var s = new Date();

                    cursor.next(function(secondCursorErr, secondCursorD) {
                      expect(secondCursorErr).to.not.exist;
                      expect(secondCursorD).to.exist;

                      var e = new Date();
                      expect(e.getTime() - s.getTime()).to.be.at.least(300);

                      // Destroy the server connection
                      _server.destroy();
                      // Finish the test
                      done();
                    });

                    setTimeout(function() {
                      cursor.kill();
                    }, 300);
                  });
                }
              );
            }
          );
        });

        // Start connection
        server.connect();
      });
    }
  });
});
