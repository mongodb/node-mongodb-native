'use strict';

var expect = require('chai').expect,
  f = require('util').format,
  Server = require('../../../lib/topologies/server'),
  Bson = require('bson');

describe('Cursor tests', function() {
  it('Should iterate cursor', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded'] }
    },

    test: function(done) {
      // Attempt to connect
      var server = new Server({
        host: this.configuration.host,
        port: this.configuration.port,
        bson: new Bson()
      });

      // Add event listeners
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
            cursor.next(function(nextCursorErr, nextCursorD) {
              expect(nextCursorErr).to.be.null;
              expect(nextCursorD.a).to.equal(1);
              expect(cursor.bufferedCount()).to.equal(1);

              // Kill the cursor
              cursor.next(function(killCursorErr, killCursorD) {
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
      // Attempt to connect
      var server = new Server({
        host: this.configuration.host,
        port: this.configuration.port,
        bson: new Bson()
      });

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
            cursor.next(function(nextCursorErr, nextCursorD) {
              expect(nextCursorErr).to.be.null;
              expect(nextCursorD.a).to.equal(1);
              expect(cursor.bufferedCount()).to.equal(4);

              // Read the buffered Count
              cursor.readBufferedDocuments(cursor.bufferedCount());

              // Get the next item
              cursor.next(function(secondCursorErr, secondCursorD) {
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
      // Attempt to connect
      var server = new Server({
        host: this.configuration.host,
        port: this.configuration.port,
        bson: new Bson()
      });

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
            cursor.next(function(nextCursorErr, nextCursorD) {
              expect(nextCursorErr).to.be.null;
              expect(nextCursorD.a).to.equal(1);

              // Get the next item
              cursor.next(function(secondCursorErr, secondCursorD) {
                expect(secondCursorErr).to.be.null;
                expect(secondCursorD).to.be.null;

                cursor.next(function(thirdCursorErr, thirdCursorD) {
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
      // Attempt to connect
      var server = new Server({
        host: this.configuration.host,
        port: this.configuration.port,
        bson: new Bson()
      });

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
            cursor.next(function(nextCursorErr, nextCursorD) {
              expect(nextCursorErr).to.be.null;
              expect(nextCursorD.a).to.equal(1);

              // Get the next item
              cursor.next(function(secondCursorErr, secondCursorD) {
                expect(secondCursorErr).to.be.null;
                expect(secondCursorD.a).to.equal(2);

                cursor.next(function(thirdCursorErr, thirdCursorD) {
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
      // Attempt to connect
      var server = new Server({
        host: this.configuration.host,
        port: this.configuration.port,
        bson: new Bson()
      });

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
            cursor.next(function(nextCursorErr, nextCursorD) {
              expect(nextCursorErr).to.be.null;
              expect(nextCursorD.a).to.equal(1);

              // Get the next item
              cursor.next(function(secondCursorErr, secondCursorD) {
                expect(secondCursorErr).to.be.null;
                expect(secondCursorD.a).to.equal(2);

                // Kill cursor
                cursor.kill(function() {
                  // Should error out
                  cursor.next(function(thirdCursorErr, thirdCursorD) {
                    expect(thirdCursorErr).to.be.null;
                    expect(thirdCursorD).to.be.null;

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

  it('Should force a getMore call to happen then call killCursor', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded'] }
    },

    test: function(done) {
      // Attempt to connect
      var server = new Server({
        host: this.configuration.host,
        port: this.configuration.port,
        bson: new Bson()
      });

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
            cursor.next(function(nextCursorErr, nextCursorD) {
              expect(nextCursorErr).to.be.null;
              expect(nextCursorD.a).to.equal(1);

              // Get the next item
              cursor.next(function(secondCursorErr, secondCursorD) {
                expect(secondCursorErr).to.be.null;
                expect(secondCursorD.a).to.equal(2);

                // Kill cursor
                cursor.kill(function() {
                  // Should error out
                  cursor.next(function(thirdCursorErr, thirdCursorD) {
                    expect(thirdCursorErr).to.be.null;
                    expect(thirdCursorD).to.be.null;

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

  it('Should fail cursor correctly after server restart', {
    metadata: {
      requires: { topology: ['single'] }
    },

    test: function(done) {
      var self = this;

      // Attempt to connect
      var server = new Server({
        host: this.configuration.host,
        port: this.configuration.port,
        bson: new Bson()
      });

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
            cursor.next(function(nextCursorErr, nextCursorD) {
              expect(nextCursorErr).to.be.null;
              expect(nextCursorD.a).to.equal(1);

              // Get the next item
              cursor.next(function(secondCursorErr, secondCursorD) {
                expect(secondCursorErr).to.be.null;
                expect(secondCursorD.a).to.equal(2);

                self.configuration.manager.restart(false).then(function() {
                  // Should error out
                  cursor.next(function(thirdCursorErr, thirdCursorD) {
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
    metadata: {
      requires: {
        topology: ['single'],
        os: '!darwin' // remove os restriction when SERVER-32477 is resolved
      }
    },

    test: function(done) {
      // Attempt to connect
      var server = new Server({
        host: this.configuration.host,
        port: this.configuration.port,
        bson: new Bson()
      });

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
            cursor.next(function(nextCursorErr, nextCursorD) {
              expect(nextCursorErr).to.be.null;
              expect(nextCursorD.a).to.equal(1);

              // Get the next item
              cursor.next(function(secondCursorErr, secondCursorD) {
                expect(secondCursorErr).to.be.null;
                expect(secondCursorD.a).to.equal(2);

                // Should be able to continue cursor after reconnect
                _server.once('reconnect', function() {
                  cursor.next(function(thirdCursorErr, thirdCursorD) {
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
      requires: { topology: ['single', 'replicaset', 'sharded'] }
    },

    test: function(done) {
      // Attempt to connect
      var server = new Server({
        host: this.configuration.host,
        port: this.configuration.port,
        bson: new Bson()
      });

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
            cursor.next(function(nextCursorErr, nextCursorD) {
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

  it('should not hang if autoReconnect=false and pools sockets all timed out', {
    metadata: { requires: { topology: ['single'] } },
    test: function(done) {
      var configuration = this.configuration,
        Server = require('../../../lib/topologies/server'),
        bson = require('bson');

      // Attempt to connect
      var server = new Server({
        host: configuration.host,
        port: configuration.port,
        bson: new bson(),
        // Nasty edge case: small timeout, small pool, no auto reconnect
        socketTimeout: 100,
        size: 1,
        reconnect: false
      });

      var ns = f('%s.cursor7', configuration.db);
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
            expect(err).to.not.exist;
            expect(results.result.n).to.equal(1);

            // Execute slow find
            var cursor = _server.cursor(ns, {
              find: ns,
              query: { $where: 'sleep(250) || true' },
              batchSize: 1
            });

            // Execute next
            cursor.next(function(err) {
              expect(err).to.exist;

              cursor = _server.cursor(ns, {
                find: ns,
                query: {},
                batchSize: 1
              });

              cursor.next(function(err) {
                expect(err).to.exist;
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
});
