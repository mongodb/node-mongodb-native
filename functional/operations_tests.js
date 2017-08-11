'use strict';

var expect = require('chai').expect,
    f = require('util').format;

describe('Operation tests', function() {
  it('should correctly connect using server object', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded'] }
    },

    test: function(done) {
      this.configuration.newTopology(function(err, server) {
        // Add event listeners
        server.on('connect', function(_server) {
          _server.destroy();
          done();
        });

        // Start connection
        server.connect();
      });
    }
  });

  it('should correctly execute command', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded'] }
    },

    test: function(done) {
      var Server = this.configuration.mongo.Server,
          ReadPreference = this.configuration.mongo.ReadPreference;

      this.configuration.newTopology(function(err, server) {
        // Add event listeners
        server.on('connect', function(_server) {
          // Execute the command
          _server.command('system.$cmd', {ismaster: true}, {readPreference: new ReadPreference('primary')}, function(cmdErr, cmdRes) {
            expect(cmdErr).to.be.null;
            expect(cmdRes.result.ismaster).to.be.true;
            // Destroy the connection
            _server.destroy();
            // Finish the test
            done();
          });
        });

        // Start connection
        server.connect();
      });
    }
  });

  it('should correctly execute write', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded'] }
    },

    test: function(done) {
      var self = this;

      self.configuration.newTopology(function(err, server) {
        // Add event listeners
        server.on('connect', function(_server) {
          // Execute the write
          _server.insert(f('%s.inserts', self.configuration.db), [{a: 1}], {
            writeConcern: {w: 1}, ordered: true
          }, function(insertErr, insertResults) {
            expect(insertErr).to.be.null;
            expect(insertResults.result.n).to.equal(1);
            // Destroy the connection
            _server.destroy();
            // Finish the test
            done();
          });
        });

        // Start connection
        server.connect();
      });
    }
  });

  it('should correctly execute find', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded'] }
    },

    test: function(done) {
      var self = this;

      self.configuration.newTopology(function(err, server) {
        var ReadPreference = self.configuration.mongo.ReadPreference;

        // Add event listeners
        server.on('connect', function(_server) {
          // Execute the write
          _server.insert(f('%s.inserts1', self.configuration.db), [{a: 1}], {
            writeConcern: {w: 1}, ordered: true
          }, function(insertErr, insertResults) {
            expect(insertErr).to.be.null;

            // Work around 2.4.x issue with mongos reporting write done but it has
            // not actually been written to the primary in the shard yet
            setTimeout(function() {
              // Execute find
              var cursor = _server.cursor(f('%s.inserts1', self.configuration.db), {
                find: f('%s.inserts1', self.configuration.db),
                query: {}
              }, {readPreference: ReadPreference.primary});

              // Execute next
              cursor.next(function(cursorErr, cursorD) {
                expect(cursorErr).to.be.null;
                expect(cursorD.a).to.equal(1);

                // Execute next
                cursor.next(function(secondCursorErr, secondCursorD) {
                  expect(secondCursorErr).to.be.null;
                  expect(secondCursorD).to.be.null;
                  // Destroy the server connection
                  _server.destroy();
                  // Finish the test
                  done();
                });
              });
            }, 1000);
          });
        });

        // Start connection
        server.connect();
      });
    }
  });

  it('should correctly execute find with limit and skip', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded'] }
    },

    test: function(done) {
      var self = this;

      self.configuration.newTopology(function(err, server) {
        var ReadPreference = self.configuration.mongo.ReadPreference;

        // Add event listeners
        server.on('connect', function(_server) {
          // Execute the write
          _server.insert(f('%s.inserts12', self.configuration.db), [{a: 1}, {a: 2}, {a: 3}], {
            writeConcern: {w: 1}, ordered: true
          }, function(insertErr, insertResults) {
            expect(insertErr).to.be.null;

            // Work around 2.4.x issue with mongos reporting write done but it has
            // not actually been written to the primary in the shard yet
            setTimeout(function() {
              // Execute find
              var cursor = _server.cursor(f('%s.inserts12', self.configuration.db), {
                find: f('%s.inserts12', self.configuration.db),
                query: {},
                limit: 1,
                skip: 1
              }, {readPreference: ReadPreference.primary});

              // Execute next
              cursor.next(function(cursorErr, cursorD) {
                expect(cursorErr).to.be.null;
                expect(cursorD.a).to.equal(2);

                // Execute next
                cursor.next(function(secondCursorErr, secondCursorD) {
                  expect(secondCursorErr).to.be.null;
                  expect(secondCursorD).to.be.null;
                  // Destroy the server connection
                  _server.destroy();
                  // Finish the test
                  done();
                });
              });
            }, 1000);
          });
        });

        // Start connection
        server.connect();
      });
    }
  });

  it('should correctly execute find against document with result array field', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded'] }
    },

    test: function(done) {
      var self = this;

      self.configuration.newTopology(function(err, server) {
        var ReadPreference = self.configuration.mongo.ReadPreference;

        // Add event listeners
        server.on('connect', function(_server) {
          // Execute the write
          _server.insert(f('%s.inserts_result_1', self.configuration.db), [{a: 1, result: [{c: 1}, {c: 2}]}], {
            writeConcern: {w: 1}, ordered: true
          }, function(insertErr, insertResults) {
            expect(insertErr).to.be.null;

            // Work around 2.4.x issue with mongos reporting write done but it has
            // not actually been written to the primary in the shard yet
            setTimeout(function() {
              // Execute find
              var cursor = _server.cursor(f('%s.inserts_result_1', self.configuration.db), {
                find: f('%s.inserts_result_1', self.configuration.db),
                query: {}
              }, {readPreference: ReadPreference.primary});

              // Execute next
              cursor.next(function(cursorErr, cursorD) {
                expect(cursorErr).to.be.null;
                expect(cursorD.a).to.equal(1);
                expect(cursorD.result[0].c).to.equal(1);
                expect(cursorD.result[1].c).to.equal(2);

                // Destroy the server connection
                _server.destroy();
                // Finish the test
                done();
              });
            }, 1000);
          });
        });

        // Start connection
        server.connect();
      });
    }
  });

  it('should correctly execute aggregation command', {
    metadata: {
      requires: {
        topology: ['single', 'replicaset', 'sharded'],
        mongodb: '>=2.6.0'
      }
    },

    test: function(done) {
      var self = this;
      var Server = this.configuration.mongo.Server;

      self.configuration.newTopology(function(err, server) {
        // Add event listeners
        server.on('connect', function(_server) {
          // Execute the write
          _server.insert(f('%s.inserts10', self.configuration.db), [{a: 1}, {a: 2}, {a: 3}], {
            writeConcern: {w: 1}, ordered: true
          }, function(insertErr, insertResults) {
            expect(insertErr).to.be.null;
            expect(insertResults.result.n).to.equal(3);

            // Execute find
            var cursor = _server.cursor(f('%s.inserts10', self.configuration.db), {
              aggregate: 'inserts10',
              pipeline: [{$match: {}}],
              cursor: {batchSize: 1}
            });

            // Execute next
            cursor.next(function(cursorErr, cursorD) {
              expect(cursorErr).to.be.null;
              expect(cursorD.a).to.equal(1);

              // Execute next
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
          });
        });

        // Start connection
        server.connect();
      });
    }
  });

  it('should correctly execute query against cursorId', {
    metadata: {
      requires: {
        mongodb: '>=2.6.0',
        topology: ['single', 'replicaset']
      }
    },

    test: function(done) {
      var self = this;

      self.configuration.newTopology(function(err, server) {
        // Add event listeners
        server.on('connect', function(_server) {
          // Execute the write
          _server.insert(f('%s.inserts11', self.configuration.db), [{a: 1}, {a: 2}, {a: 3}], {
            writeConcern: {w: 1}, ordered: true
          }, function(insertErr, insertResults) {
            expect(insertErr).to.be.null;
            expect(insertResults.result.n).to.equal(3);

            // Execute the command
            _server.command(f('%s.$cmd', self.configuration.db)
              , {parallelCollectionScan: 'inserts11', numCursors: 1}
              , function(cmdErr, cmdRes) {
                expect(cmdErr).to.be.null;
                expect(cmdRes).to.not.be.null;

                // Create cursor from parallel collection scan cursor id
                var cursor = _server.cursor(f('%s.inserts11', self.configuration.db)
                  , cmdRes.result.cursors[0].cursor.id
                  , { documents: cmdRes.result.cursors[0].cursor.firstBatch });

                // Execute next
                cursor.next(function(cursorErr, cursorD) {
                  expect(cursorErr).to.be.null;
                  expect(cursorD.a).to.equal(1);

                  // Execute next
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
              });
          });
        });

        // Start connection
        server.connect();
      });
    }
  });

  it('should correctly kill command cursor', {
    metadata: {
      requires: {
        mongodb: '>=2.6.0',
        topology: ['single', 'replicaset', 'sharded']
      }
    },

    test: function(done) {
      var self = this;

      self.configuration.newTopology(function(err, server) {
        // Add event listeners
        server.on('connect', function(_server) {
          // Execute the write
          _server.insert(f('%s.inserts20', self.configuration.db), [{a: 1}, {a: 2}, {a: 3}], {
            writeConcern: {w: 1}, ordered: true
          }, function(insertErr, insertResults) {
            expect(insertErr).to.be.null;
            expect(insertResults.result.n).to.equal(3);

            // Execute find
            var cursor = _server.cursor(f('%s.inserts20', self.configuration.db), {
              aggregate: 'inserts20',
              pipeline: [{$match: {}}],
              cursor: {batchSize: 1}
            });

            // Execute next
            cursor.next(function(cursorErr, cursorD) {
              expect(cursorErr).to.be.null;
              expect(cursorD.a).to.equal(1);

              // Kill the cursor
              cursor.kill(function() {
                cursor.next(function(secondCursorErr, secondCursorD) {
                  expect(secondCursorErr).to.be.null;
                  expect(secondCursorD).to.be.null;
                  // Destroy the server connection
                  _server.destroy();
                  // Finish the test
                  done();
                });
              });
            });
          });
        });

        // Start connection
        server.connect();
      });
    }
  });

  it('should correctly kill find command cursor', {
    metadata: {
      requires: {
        topology: ['single', 'replicaset', 'sharded']
      }
    },

    test: function(done) {
      var self = this;

      self.configuration.newTopology(function(err, server) {
        // Add event listeners
        server.on('connect', function(_server) {
          // Execute the write
          _server.insert(f('%s.inserts21', self.configuration.db), [{a: 1}, {a: 2}, {a: 3}], {
            writeConcern: {w: 1}, ordered: true
          }, function(insertErr, insertResults) {
            expect(insertErr).to.be.null;
            expect(insertResults.result.n).to.equal(3);

            // Execute find
            var cursor = _server.cursor(f('%s.inserts21', self.configuration.db), {
              find: f('%s.inserts21', self.configuration.db),
              query: {},
              batchSize: 1
            });

            // Execute next
            cursor.next(function(cursorErr, cursorD) {
              expect(cursorErr).to.be.null;
              expect(cursorD.a).to.equal(1);

              // Kill the cursor
              cursor.kill(function() {
                cursor.next(function(secondCursorErr, secondCursorD) {
                  expect(secondCursorErr).to.be.null;
                  expect(secondCursorD).to.be.null;
                  // Destroy the server connection
                  _server.destroy();
                  // Finish the test
                  done();
                });
              });
            });
          });
        });

        // Start connection
        server.connect();
      });
    }
  });

  it('should correctly execute unref and finish all operations', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded'] }
    },

    test: function(done) {
      var self = this;
      var Connection = require('../../../lib/connection/connection');

      self.configuration.newTopology(function(err, server) {
        // console.log('================ -- 1')
        // Add event listeners
        server.on('connect', function(_server) {
          var left = 100;

          var insertOps = function(insertErr, insertResults) {
            left = left - 1;
            expect(insertErr).to.be.null;
            expect(insertResults.result.n).to.equal(1);

            // Number of operations left
            if (left === 0) {
              self.configuration.newTopology(function(topologyErr, innerServer) {
                // Enable connections accounting
                Connection.enableConnectionAccounting();

                // Add event listeners
                innerServer.on('connect', function(_innerServer) {
                  _innerServer.command(f('%s.$cmd', self.configuration.db), {count: 'inserts_unref'}, function(e, result) {
                    expect(e).to.be.null;
                    expect(result.result.n).to.equal(100);

                    _innerServer.destroy();

                    setTimeout(function() {
                      expect(Object.keys(Connection.connections()).length).to.equal(0);
                      Connection.disableConnectionAccounting();
                      done();
                    }, 1000);
                  });
                });

                innerServer.connect();
              });
            }
          };

          for (var i = 0; i < 100; i++) {
            // console.log('================ insert doc')
            // Execute the write
            _server.insert(f('%s.inserts_unref', self.configuration.db), [{a: i}], {
              writeConcern: {w: 1}, ordered: true
            }, insertOps);

            // Unref all sockets
            if (i === 10) _server.unref();
          }
        });

        // Start connection
        server.connect();
      });
    }
  });
});
