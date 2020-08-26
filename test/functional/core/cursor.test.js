'use strict';

const expect = require('chai').expect;
const f = require('util').format;
const setupDatabase = require('./shared').setupDatabase;

describe('Cursor tests', function () {
  before(function () {
    return setupDatabase(this.configuration);
  });

  it('Should iterate cursor', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded'], mongodb: '>=3.2' }
    },

    test: function (done) {
      const topology = this.configuration.newTopology();
      topology.connect(err => {
        expect(err).to.not.exist;
        this.defer(() => topology.close());

        topology.selectServer('primary', (err, server) => {
          expect(err).to.not.exist;

          var ns = f('integration_tests.cursor1');
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
              expect(results.n).to.equal(3);

              // Execute find
              var cursor = topology.cursor(ns, {
                find: 'cursor1',
                filter: {},
                batchSize: 2
              });

              // Execute next
              cursor._next((nextCursorErr, nextCursorD) => {
                expect(nextCursorErr).to.not.exist;
                expect(nextCursorD.a).to.equal(1);
                expect(cursor.bufferedCount()).to.equal(1);

                // Kill the cursor
                cursor._next((killCursorErr, killCursorD) => {
                  expect(killCursorErr).to.not.exist;
                  expect(killCursorD.a).to.equal(2);
                  expect(cursor.bufferedCount()).to.equal(0);
                  // Destroy the server connection
                  server.destroy(done);
                });
              });
            }
          );
        });
      });
    }
  });

  it('Should iterate cursor but readBuffered', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded'], mongodb: '>=3.2' }
    },

    test: function (done) {
      const topology = this.configuration.newTopology();
      const ns = f('%s.cursor2', this.configuration.db);

      topology.connect(err => {
        expect(err).to.not.exist;
        this.defer(() => topology.close());

        topology.selectServer('primary', (err, server) => {
          expect(err).to.not.exist;

          // Execute the write
          server.insert(
            ns,
            [{ a: 1 }, { a: 2 }, { a: 3 }, { a: 4 }, { a: 5 }],
            {
              writeConcern: { w: 1 },
              ordered: true
            },
            (err, results) => {
              expect(err).to.not.exist;
              expect(results.n).to.equal(5);

              // Execute find
              const cursor = topology.cursor(ns, {
                find: 'cursor2',
                filter: {},
                batchSize: 5
              });

              // Execute next
              cursor._next((nextCursorErr, nextCursorD) => {
                expect(nextCursorErr).to.not.exist;
                expect(nextCursorD.a).to.equal(1);
                expect(cursor.bufferedCount()).to.equal(4);

                // Read the buffered Count
                cursor.readBufferedDocuments(cursor.bufferedCount());

                // Get the next item
                cursor._next((secondCursorErr, secondCursorD) => {
                  expect(secondCursorErr).to.not.exist;
                  expect(secondCursorD).to.not.exist;

                  // Destroy the server connection
                  server.destroy(done);
                });
              });
            }
          );
        });
      });
    }
  });

  it('Should callback exhausted cursor with error', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded'], mongodb: '>=3.2' }
    },

    test: function (done) {
      const topology = this.configuration.newTopology();
      const ns = f('%s.cursor3', this.configuration.db);

      topology.connect(err => {
        expect(err).to.not.exist;
        this.defer(() => topology.close());

        topology.selectServer('primary', (err, server) => {
          expect(err).to.not.exist;

          // Execute the write
          server.insert(
            ns,
            [{ a: 1 }],
            {
              writeConcern: { w: 1 },
              ordered: true
            },
            (err, results) => {
              expect(err).to.not.exist;
              expect(results.n).to.equal(1);

              // Execute find
              const cursor = topology.cursor(ns, { find: 'cursor3', filter: {}, batchSize: 5 });

              // Execute next
              cursor._next((nextCursorErr, nextCursorD) => {
                expect(nextCursorErr).to.not.exist;
                expect(nextCursorD.a).to.equal(1);

                // Get the next item
                cursor._next((secondCursorErr, secondCursorD) => {
                  expect(secondCursorErr).to.not.exist;
                  expect(secondCursorD).to.not.exist;

                  cursor._next((thirdCursorErr, thirdCursorD) => {
                    expect(thirdCursorErr).to.be.ok;
                    expect(thirdCursorD).to.be.undefined;
                    // Destroy the server connection
                    server.destroy(done);
                  });
                });
              });
            }
          );
        });
      });
    }
  });

  it('Should force a getMore call to happen', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded'], mongodb: '>=3.2' }
    },

    test: function (done) {
      const topology = this.configuration.newTopology();
      const ns = f('%s.cursor4', this.configuration.db);

      topology.connect(err => {
        expect(err).to.not.exist;
        this.defer(() => topology.close());

        topology.selectServer('primary', (err, server) => {
          expect(err).to.not.exist;

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
              expect(results.n).to.equal(3);

              // Execute find
              const cursor = topology.cursor(ns, { find: 'cursor4', filter: {}, batchSize: 2 });

              // Execute next
              cursor._next((nextCursorErr, nextCursorD) => {
                expect(nextCursorErr).to.not.exist;
                expect(nextCursorD.a).to.equal(1);

                // Get the next item
                cursor._next((secondCursorErr, secondCursorD) => {
                  expect(secondCursorErr).to.not.exist;
                  expect(secondCursorD.a).to.equal(2);

                  cursor._next((thirdCursorErr, thirdCursorD) => {
                    expect(thirdCursorErr).to.not.exist;
                    expect(thirdCursorD.a).to.equal(3);
                    // Destroy the server connection
                    server.destroy(done);
                  });
                });
              });
            }
          );
        });
      });
    }
  });

  it('Should force a getMore call to happen then call killCursor', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded'], mongodb: '>=3.2' }
    },

    test: function (done) {
      const topology = this.configuration.newTopology();
      const ns = f('%s.cursor4', this.configuration.db);

      topology.connect(err => {
        expect(err).to.not.exist;
        this.defer(() => topology.close());

        topology.selectServer('primary', (err, server) => {
          expect(err).to.not.exist;

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
              expect(results.n).to.equal(3);

              // Execute find
              const cursor = topology.cursor(ns, { find: 'cursor4', filter: {}, batchSize: 2 });

              // Execute next
              cursor._next((nextCursorErr, nextCursorD) => {
                expect(nextCursorErr).to.not.exist;
                expect(nextCursorD.a).to.equal(1);

                // Get the next item
                cursor._next((secondCursorErr, secondCursorD) => {
                  expect(secondCursorErr).to.not.exist;
                  expect(secondCursorD.a).to.equal(2);

                  // Kill cursor
                  cursor.kill(() => {
                    // Should error out
                    cursor._next((thirdCursorErr, thirdCursorD) => {
                      expect(thirdCursorErr).to.not.exist;
                      expect(thirdCursorD).to.not.exist;

                      // Destroy the server connection
                      server.destroy(done);
                    });
                  });
                });
              });
            }
          );
        });
      });
    }
  });

  // Skipped due to usage of the topology manager
  it.skip('Should fail cursor correctly after server restart', {
    metadata: {
      requires: { topology: ['single'], mongodb: '>=3.2' }
    },

    test: function (done) {
      var self = this;
      const server = this.configuration.newTopology();
      var ns = f('%s.cursor5', this.configuration.db);
      // Add event listeners
      server.on('connect', function (_server) {
        // Execute the write
        _server.insert(
          ns,
          [{ a: 1 }, { a: 2 }, { a: 3 }],
          {
            writeConcern: { w: 1 },
            ordered: true
          },
          function (err, results) {
            expect(err).to.not.exist;
            expect(results.n).to.equal(3);

            // Execute find
            var cursor = _server.cursor(ns, { find: 'cursor5', filter: {}, batchSize: 2 });

            // Execute next
            cursor._next(function (nextCursorErr, nextCursorD) {
              expect(nextCursorErr).to.not.exist;
              expect(nextCursorD.a).to.equal(1);

              // Get the next item
              cursor._next(function (secondCursorErr, secondCursorD) {
                expect(secondCursorErr).to.not.exist;
                expect(secondCursorD.a).to.equal(2);

                self.configuration.manager.restart(false).then(function () {
                  // Should error out
                  cursor._next(function (thirdCursorErr, thirdCursorD) {
                    expect(thirdCursorErr).to.be.ok;
                    expect(thirdCursorD).to.be.undefined;

                    // Destroy the server connection
                    _server.destroy(done);
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

  // NOTE: a notoriously flakey test, needs rewriting
  // Commented out to stop before task from running and breaking auth tests
  // it.skip('should not hang if autoReconnect=false and pools sockets all timed out', {
  //   metadata: { requires: { topology: ['single'], mongodb: '>=3.2' } },
  //   test: function(done) {
  //     var configuration = this.configuration,
  //       Server = require('../../../src/core/topologies/server'),
  //     // Attempt to connect
  //     var server = new Server({
  //       host: configuration.host,
  //       port: configuration.port,
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
  //           expect(results.n).to.equal(1);

  //           // Execute slow find
  //           var cursor = server.cursor(ns, {
  //             find: 'cursor7',
  //             filter: { $where: 'sleep(250) || true' },
  //             batchSize: 1
  //           });

  //           // Execute next
  //           cursor._next(function(err) {
  //             expect(err).to.exist;

  //             cursor = server.cursor(ns, {
  //               find: 'cursor7',
  //               filter: {},
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
