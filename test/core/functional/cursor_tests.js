'use strict';

const expect = require('chai').expect;
const f = require('util').format;
const setupDatabase = require('./shared').setupDatabase;

describe('Cursor tests', function() {
  before(function() {
    return setupDatabase(this.configuration);
  });

  it('Should iterate cursor', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded'] }
    },

    test: function(done) {
      const server = this.configuration.newTopology();
      server.on('connect', function(_server) {
        var ns = f('integration_tests.cursor1');
        // Execute the write
        _server.insert(
          ns,
          [{ a: 1 }, { a: 2 }, { a: 3 }],
          {
            writeConcern: { w: 1 },
            ordered: true
          },
          function(err, results) {
            expect(err).to.be.null;
            expect(results.result.n).to.equal(3);

            // Execute find
            var cursor = _server.cursor(ns, {
              find: ns,
              query: {},
              batchSize: 2
            });

            // Execute next
            cursor._next(function(nextCursorErr, nextCursorD) {
              expect(nextCursorErr).to.be.null;
              expect(nextCursorD.a).to.equal(1);
              expect(cursor.bufferedCount()).to.equal(1);

              // Kill the cursor
              cursor._next(function(killCursorErr, killCursorD) {
                expect(killCursorErr).to.be.null;
                expect(killCursorD.a).to.equal(2);
                expect(cursor.bufferedCount()).to.equal(0);
                // Destroy the server connection
                _server.destroy();
                // Finish the test
                done();
              });
            });
          }
        );
      });

      // Start connection
      server.connect();
    }
  });

  it('Should iterate cursor but readBuffered', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded'] }
    },

    test: function(done) {
      const server = this.configuration.newTopology();
      var ns = f('%s.cursor2', this.configuration.db);
      // Add event listeners
      server.on('connect', function(_server) {
        // Execute the write
        _server.insert(
          ns,
          [{ a: 1 }, { a: 2 }, { a: 3 }, { a: 4 }, { a: 5 }],
          {
            writeConcern: { w: 1 },
            ordered: true
          },
          function(err, results) {
            expect(err).to.be.null;
            expect(results.result.n).to.equal(5);

            // Execute find
            var cursor = _server.cursor(ns, {
              find: ns,
              query: {},
              batchSize: 5
            });

            // Execute next
            cursor._next(function(nextCursorErr, nextCursorD) {
              expect(nextCursorErr).to.be.null;
              expect(nextCursorD.a).to.equal(1);
              expect(cursor.bufferedCount()).to.equal(4);

              // Read the buffered Count
              cursor.readBufferedDocuments(cursor.bufferedCount());

              // Get the next item
              cursor._next(function(secondCursorErr, secondCursorD) {
                expect(secondCursorErr).to.be.null;
                expect(secondCursorD).to.be.null;

                // Destroy the server connection
                _server.destroy();
                // Finish the test
                done();
              });
            });
          }
        );
      });

      // Start connection
      server.connect();
    }
  });

  it('Should callback exhausted cursor with error', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded'] }
    },

    test: function(done) {
      const server = this.configuration.newTopology();
      var ns = f('%s.cursor3', this.configuration.db);
      // Add event listeners
      server.on('connect', function(_server) {
        // Execute the write
        _server.insert(
          ns,
          [{ a: 1 }],
          {
            writeConcern: { w: 1 },
            ordered: true
          },
          function(err, results) {
            expect(err).to.be.null;
            expect(results.result.n).to.equal(1);

            // Execute find
            var cursor = _server.cursor(ns, { find: ns, query: {}, batchSize: 5 });

            // Execute next
            cursor._next(function(nextCursorErr, nextCursorD) {
              expect(nextCursorErr).to.be.null;
              expect(nextCursorD.a).to.equal(1);

              // Get the next item
              cursor._next(function(secondCursorErr, secondCursorD) {
                expect(secondCursorErr).to.be.null;
                expect(secondCursorD).to.be.null;

                cursor._next(function(thirdCursorErr, thirdCursorD) {
                  expect(thirdCursorErr).to.be.ok;
                  expect(thirdCursorD).to.be.undefined;
                  // Destroy the server connection
                  _server.destroy();
                  // Finish the test
                  done();
                });
              });
            });
          }
        );
      });

      // Start connection
      server.connect();
    }
  });

  it('Should force a getMore call to happen', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded'] }
    },

    test: function(done) {
      const server = this.configuration.newTopology();
      var ns = f('%s.cursor4', this.configuration.db);
      // Add event listeners
      server.on('connect', function(_server) {
        // Execute the write
        _server.insert(
          ns,
          [{ a: 1 }, { a: 2 }, { a: 3 }],
          {
            writeConcern: { w: 1 },
            ordered: true
          },
          function(err, results) {
            expect(err).to.be.null;
            expect(results.result.n).to.equal(3);

            // Execute find
            var cursor = _server.cursor(ns, { find: ns, query: {}, batchSize: 2 });

            // Execute next
            cursor._next(function(nextCursorErr, nextCursorD) {
              expect(nextCursorErr).to.be.null;
              expect(nextCursorD.a).to.equal(1);

              // Get the next item
              cursor._next(function(secondCursorErr, secondCursorD) {
                expect(secondCursorErr).to.be.null;
                expect(secondCursorD.a).to.equal(2);

                cursor._next(function(thirdCursorErr, thirdCursorD) {
                  expect(thirdCursorErr).to.be.null;
                  expect(thirdCursorD.a).to.equal(3);
                  // Destroy the server connection
                  _server.destroy();
                  // Finish the test
                  done();
                });
              });
            });
          }
        );
      });

      // Start connection
      server.connect();
    }
  });

  it('Should force a getMore call to happen then call killCursor', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded'] }
    },

    test: function(done) {
      const server = this.configuration.newTopology();
      var ns = f('%s.cursor4', this.configuration.db);
      // Add event listeners
      server.on('connect', function(_server) {
        // Execute the write
        _server.insert(
          ns,
          [{ a: 1 }, { a: 2 }, { a: 3 }],
          {
            writeConcern: { w: 1 },
            ordered: true
          },
          function(err, results) {
            expect(err).to.be.null;
            expect(results.result.n).to.equal(3);

            // Execute find
            var cursor = _server.cursor(ns, { find: ns, query: {}, batchSize: 2 });

            // Execute next
            cursor._next(function(nextCursorErr, nextCursorD) {
              expect(nextCursorErr).to.be.null;
              expect(nextCursorD.a).to.equal(1);

              // Get the next item
              cursor._next(function(secondCursorErr, secondCursorD) {
                expect(secondCursorErr).to.be.null;
                expect(secondCursorD.a).to.equal(2);

                // Kill cursor
                cursor.kill(function() {
                  // Should error out
                  cursor._next(function(thirdCursorErr, thirdCursorD) {
                    expect(thirdCursorErr).to.not.exist;
                    expect(thirdCursorD).to.not.exist;

                    // Destroy the server connection
                    _server.destroy();
                    // Finish the test
                    done();
                  });
                });
              });
            });
          }
        );
      });

      // Start connection
      server.connect();
    }
  });

  // Skipped due to usage of the topology manager
  it.skip('Should fail cursor correctly after server restart', {
    metadata: {
      requires: { topology: ['single'] }
    },

    test: function(done) {
      var self = this;
      const server = this.configuration.newTopology();
      var ns = f('%s.cursor5', this.configuration.db);
      // Add event listeners
      server.on('connect', function(_server) {
        // Execute the write
        _server.insert(
          ns,
          [{ a: 1 }, { a: 2 }, { a: 3 }],
          {
            writeConcern: { w: 1 },
            ordered: true
          },
          function(err, results) {
            expect(err).to.be.null;
            expect(results.result.n).to.equal(3);

            // Execute find
            var cursor = _server.cursor(ns, { find: ns, query: {}, batchSize: 2 });

            // Execute next
            cursor._next(function(nextCursorErr, nextCursorD) {
              expect(nextCursorErr).to.be.null;
              expect(nextCursorD.a).to.equal(1);

              // Get the next item
              cursor._next(function(secondCursorErr, secondCursorD) {
                expect(secondCursorErr).to.be.null;
                expect(secondCursorD.a).to.equal(2);

                self.configuration.manager.restart(false).then(function() {
                  // Should error out
                  cursor._next(function(thirdCursorErr, thirdCursorD) {
                    expect(thirdCursorErr).to.be.ok;
                    expect(thirdCursorD).to.be.undefined;

                    // Destroy the server connection
                    _server.destroy();
                    // Finish the test
                    done();
                  });
                });
              });
            });
          }
        );
      });

      // Start connection
      server.connect();
    }
  });

  it('Should finish cursor correctly after all sockets to pool destroyed', {
    metadata: { requires: { topology: ['single'] } },
    test: function(done) {
      if (this.configuration.usingUnifiedTopology()) {
        // This test tries to inspect the connection pool directly on the topology, which
        // will no longer work with the new Topology type. The test should be reworked.
        return this.skip();
      }

      const server = this.configuration.newTopology();
      var ns = f('%s.cursor6', this.configuration.db);
      // Add event listeners
      server.on('connect', function(_server) {
        // Execute the write
        _server.insert(
          ns,
          [{ a: 1 }, { a: 2 }, { a: 3 }],
          {
            writeConcern: { w: 1 },
            ordered: true
          },
          function(err, results) {
            expect(err).to.be.null;
            expect(results.result.n).to.equal(3);

            // Execute find
            var cursor = _server.cursor(ns, { find: ns, query: {}, batchSize: 2 });

            // Execute next
            cursor._next(function(nextCursorErr, nextCursorD) {
              expect(nextCursorErr).to.be.null;
              expect(nextCursorD.a).to.equal(1);

              // Get the next item
              cursor._next(function(secondCursorErr, secondCursorD) {
                expect(secondCursorErr).to.be.null;
                expect(secondCursorD.a).to.equal(2);

                // Should be able to continue cursor after reconnect
                _server.once('reconnect', function() {
                  cursor._next(function(thirdCursorErr, thirdCursorD) {
                    expect(thirdCursorErr).to.be.null;
                    expect(thirdCursorD.a).to.equal(3);

                    // Destroy the server connection
                    _server.destroy();
                    // Finish the test
                    done();
                  });
                });

                // Destroy all active connections in the pool
                var connections = _server.s.pool.allConnections();
                for (var i = 0; i < connections.length; i++) {
                  connections[i].write('!@#!@#SADASDSA!@#!@#!@#!@#!@');
                }
              });
            });
          }
        );
      });

      // Start connection
      server.connect();
    }
  });

  it('Should not leak connnection workItem elements when using killCursor', {
    metadata: {
      requires: { topology: ['single'] }
    },

    test: function(done) {
      const configuration = this.configuration;
      if (configuration.usingUnifiedTopology()) {
        // This test tries to inspect the connection pool directly on the topology, which
        // will no longer work with the new Topology type. The test should be reworked.
        return this.skip();
      }

      const server = this.configuration.newTopology();
      var ns = f('%s.cursor4', this.configuration.db);
      // Add event listeners
      server.on('connect', function(_server) {
        // Execute the write
        _server.insert(
          ns,
          [{ a: 1 }, { a: 2 }, { a: 3 }],
          {
            writeConcern: { w: 1 },
            ordered: true
          },
          function(err, results) {
            expect(err).to.be.null;
            expect(results.result.n).to.equal(3);

            // Execute find
            var cursor = _server.cursor(ns, { find: ns, query: {}, batchSize: 2 });

            // Execute next
            cursor._next(function(nextCursorErr, nextCursorD) {
              expect(nextCursorErr).to.be.null;
              expect(nextCursorD.a).to.equal(1);

              // Kill cursor
              cursor.kill(function() {
                // Add a small delay so that the work can be queued after the kill
                // callback has executed
                setImmediate(function() {
                  var connections = _server.s.pool.allConnections();
                  for (var i = 0; i < connections.length; i++) {
                    expect(connections[i].workItems.length).to.equal(0);
                  }

                  // Destroy the server connection
                  _server.destroy();
                  // Finish the test
                  done();
                }, 100);
              });
            });
          }
        );
      });

      // Start connection
      server.connect();
    }
  });

  // NOTE: a notoriously flakey test, needs rewriting
  // Commented out to stop before task from running and breaking auth tests
  // it.skip('should not hang if autoReconnect=false and pools sockets all timed out', {
  //   metadata: { requires: { topology: ['single'] } },
  //   test: function(done) {
  //     var configuration = this.configuration,
  //       Server = require('../../../lib/core/topologies/server'),
  //       bson = require('bson');

  //     // Attempt to connect
  //     var server = new Server({
  //       host: configuration.host,
  //       port: configuration.port,
  //       bson: new bson(),
  //       // Nasty edge case: small timeout, small pool, no auto reconnect
  //       socketTimeout: 250,
  //       size: 1,
  //       reconnect: false
  //     });

  //     var ns = f('%s.cursor7', configuration.db);
  //     server.on('connect', function() {
  //       // Execute the write
  //       server.insert(
  //         ns,
  //         [{ a: 1 }],
  //         {
  //           writeConcern: { w: 1 },
  //           ordered: true
  //         },
  //         function(err, results) {
  //           expect(err).to.not.exist;
  //           expect(results.result.n).to.equal(1);

  //           // Execute slow find
  //           var cursor = server.cursor(ns, {
  //             find: ns,
  //             query: { $where: 'sleep(250) || true' },
  //             batchSize: 1
  //           });

  //           // Execute next
  //           cursor._next(function(err) {
  //             expect(err).to.exist;

  //             cursor = server.cursor(ns, {
  //               find: ns,
  //               query: {},
  //               batchSize: 1
  //             });

  //             cursor._next(function(err) {
  //               expect(err).to.exist;
  //               done();
  //             });
  //           });
  //         }
  //       );
  //     });

  //     // Start connection
  //     server.connect();
  //   }
  // });
});
