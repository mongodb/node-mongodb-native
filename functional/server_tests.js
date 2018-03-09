'use strict';
const expect = require('chai').expect;
const f = require('util').format;
const locateAuthMethod = require('./shared').locateAuthMethod;
const executeCommand = require('./shared').executeCommand;
const Server = require('../../../lib/topologies/server');
const Bson = require('bson');
const Connection = require('../../../lib/connection/connection');
const mock = require('mongodb-mock-server');

describe('Server tests', function() {
  it('should correctly connect server to single instance', {
    metadata: { requires: { topology: 'single' } },

    test: function(done) {
      // Attempt to connect
      var server = new Server({
        host: this.configuration.host,
        port: this.configuration.port,
        bson: new Bson()
      });

      // Add event listeners
      server.on('connect', function() {
        server.destroy();
        done();
      });

      // Start connection
      server.connect();
    }
  });

  it('should correctly connect server to single instance and execute ismaster', {
    metadata: { requires: { topology: 'single' } },

    test: function(done) {
      // Attempt to connect
      var server = new Server({
        host: this.configuration.host,
        port: this.configuration.port,
        bson: new Bson()
      });

      // Add event listeners
      server.on('connect', function() {
        server.command('admin.$cmd', { ismaster: true }, function(err, r) {
          expect(err).to.be.null;
          expect(r.result.ismaster).to.be.true;
          expect(r.connection).to.not.be.null;

          server.destroy();
          done();
        });
      });

      // Start connection
      server.connect();
    }
  });

  it('should correctly connect server to single instance and execute ismaster returning raw', {
    metadata: { requires: { topology: 'single' } },

    test: function(done) {
      // Attempt to connect
      var server = new Server({
        host: this.configuration.host,
        port: this.configuration.port,
        bson: new Bson()
      });

      // Add event listeners
      server.on('connect', function() {
        server.command(
          'admin.$cmd',
          { ismaster: true },
          {
            raw: true
          },
          function(err, r) {
            expect(err).to.be.null;
            expect(r.result).to.be.an.instanceof(Buffer);
            expect(r.connection).to.not.be.null;

            server.destroy();
            done();
          }
        );
      });

      // Start connection
      server.connect();
    }
  });

  it('should correctly connect server to single instance and execute insert', {
    metadata: { requires: { topology: 'single' } },

    test: function(done) {
      // Attempt to connect
      var server = new Server({
        host: this.configuration.host,
        port: this.configuration.port,
        bson: new Bson()
      });

      // Add event listeners
      server.on('connect', function() {
        server.insert('integration_tests.inserts', { a: 1 }, function(insertOneErr, insertOneR) {
          expect(insertOneErr).to.be.null;
          expect(insertOneR.result.n).to.equal(1);

          server.insert('integration_tests.inserts', { a: 1 }, { ordered: false }, function(
            insertTwoErr,
            insertTwoR
          ) {
            expect(insertTwoErr).to.be.null;
            expect(insertTwoR.result.n).to.equal(1);

            server.destroy();
            done();
          });
        });
      });

      // Start connection
      server.connect();
    }
  });

  it(
    'should correctly connect server to single instance and send an uncompressed message if an uncompressible command is specified',
    {
      metadata: { requires: { topology: 'single' } },

      test: function(done) {
        var Server = this.configuration.mongo.Server,
          ReadPreference = this.configuration.mongo.ReadPreference;

        // Attempt to connect
        var server = new Server({
          host: this.configuration.host,
          port: this.configuration.port,
          bson: new Bson(),
          compression: { compressors: ['snappy', 'zlib'] }
        });

        // Add event listeners
        server.on('connect', function() {
          server.command(
            'system.$cmd',
            { ismaster: true },
            { readPreference: new ReadPreference('primary') },
            function(err, result) {
              if (err) {
                console.log(err);
              }
              expect(err).to.be.null;
              expect(result).to.exist;

              server.destroy();
              done();
            }
          );
        });

        // Start connection
        server.connect();
      }
    }
  );

  it('should correctly connect server to single instance and execute bulk insert', {
    metadata: { requires: { topology: 'single' } },

    test: function(done) {
      // Attempt to connect
      var server = new Server({
        host: this.configuration.host,
        port: this.configuration.port,
        bson: new Bson()
      });

      // Add event listeners
      server.on('connect', function() {
        server.insert('integration_tests.inserts', [{ a: 1 }, { b: 1 }], function(
          insertOneErr,
          insertOneR
        ) {
          expect(insertOneErr).to.be.null;
          expect(insertOneR.result.n).to.equal(2);

          server.insert(
            'integration_tests.inserts',
            [{ a: 1 }, { b: 1 }],
            { ordered: false },
            function(insertTwoErr, insertTwoR) {
              expect(insertTwoErr).to.be.null;
              expect(insertTwoR.result.n).to.equal(2);

              server.destroy();
              done();
            }
          );
        });
      });

      // Start connection
      server.connect();
    }
  });

  it('should correctly connect server to single instance and execute insert with w:0', {
    metadata: { requires: { topology: 'single' } },

    test: function(done) {
      // Attempt to connect
      var server = new Server({
        host: this.configuration.host,
        port: this.configuration.port,
        bson: new Bson()
      });

      // Add event listeners
      server.on('connect', function() {
        server.insert('integration_tests.inserts', { a: 1 }, { writeConcern: { w: 0 } }, function(
          insertOneErr,
          insertOneR
        ) {
          expect(insertOneErr).to.be.null;
          expect(insertOneR.result.ok).to.equal(1);

          server.insert(
            'integration_tests.inserts',
            { a: 1 },
            { ordered: false, writeConcern: { w: 0 } },
            function(insertTwoErr, insertTwoR) {
              expect(insertTwoErr).to.be.null;
              expect(insertTwoR.result.ok).to.equal(1);

              server.destroy();
              done();
            }
          );
        });
      });

      // Start connection
      server.connect();
    }
  });

  it('should correctly connect server to single instance and execute update', {
    metadata: { requires: { topology: 'single' } },

    test: function(done) {
      // Attempt to connect
      var server = new Server({
        host: this.configuration.host,
        port: this.configuration.port,
        bson: new Bson()
      });

      // Add event listeners
      server.on('connect', function(_server) {
        _server.update(
          'integration_tests.inserts_example2',
          [
            {
              q: { a: 1 },
              u: { $set: { b: 1 } },
              upsert: true
            }
          ],
          {
            writeConcern: { w: 1 },
            ordered: true
          },
          function(err, results) {
            expect(err).to.be.null;
            expect(results.result.n).to.equal(1);

            _server.destroy();
            done();
          }
        );
      });

      // Start connection
      server.connect();
    }
  });

  it('should correctly connect server to single instance and execute remove', {
    metadata: { requires: { topology: 'single' } },

    test: function(done) {
      // Attempt to connect
      var server = new Server({
        host: this.configuration.host,
        port: this.configuration.port,
        bson: new Bson()
      });

      // Add event listeners
      server.on('connect', function(_server) {
        server.insert('integration_tests.remove_example', { a: 1 }, function(err, r) {
          expect(err).to.be.null;
          expect(r.result.ok).to.equal(1);

          _server.remove(
            'integration_tests.remove_example',
            [{ q: { a: 1 }, limit: 1 }],
            {
              writeConcern: { w: 1 },
              ordered: true
            },
            function(removeErr, results) {
              expect(removeErr).to.be.null;
              expect(results.result.n).to.equal(1);

              _server.destroy();
              done();
            }
          );
        });
      });

      // Start connection
      server.connect();
    }
  });

  // Skipped due to use of topology manager
  it.skip('should correctly recover with multiple restarts', {
    metadata: {
      requires: { topology: ['single'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var self = this;
      var testDone = false;

      // Attempt to connect
      var server = new Server({
        host: this.configuration.host,
        port: this.configuration.port,
        bson: new Bson()
      });

      // Add event listeners
      server.on('connect', function(_server) {
        var count = 1;
        var ns = 'integration_tests.t';

        var execute = function() {
          if (!testDone) {
            server.insert(ns, { a: 1, count: count }, function() {
              count = count + 1;

              // Execute find
              var cursor = _server.cursor(ns, {
                find: ns,
                query: {},
                batchSize: 2
              });

              // Execute next
              cursor.next(function() {
                setTimeout(execute, 500);
              });
            });
          } else {
            server.insert(ns, { a: 1, count: count }, function(err, r) {
              expect(err).to.be.null;
              expect(r).to.exist;

              // Execute find
              var cursor = _server.cursor(ns, {
                find: ns,
                query: {},
                batchSize: 2
              });

              // Execute next
              cursor.next(function(cursorErr, d) {
                expect(err).to.be.null;
                expect(d).to.exist;
                server.destroy();
                done();
              });
            });
          }
        };

        setTimeout(execute, 500);
      });

      var count = 2;

      var restartServer = function() {
        if (count === 0) {
          testDone = true;
          return;
        }

        count = count - 1;

        self.configuration.manager.stop().then(function() {
          setTimeout(function() {
            self.configuration.manager.start().then(function() {
              setTimeout(restartServer, 1000);
            });
          }, 2000);
        });
      };

      setTimeout(restartServer, 1000);
      server.connect();
    }
  });

  it('should correctly reconnect to server with automatic reconnect enabled', {
    metadata: {
      requires: {
        topology: 'single',
        os: '!darwin' // remove os restriction when SERVER-32477 is resolved
      }
    },

    test: function(done) {
      var Server = this.configuration.mongo.Server,
        ReadPreference = this.configuration.mongo.ReadPreference;

      // Attempt to connect
      var server = new Server({
        host: this.configuration.host,
        port: this.configuration.port,
        reconnect: true,
        size: 1,
        reconnectInterval: 50
      });

      // Test flags
      var emittedClose = false;

      // Add event listeners
      server.on('connect', function(_server) {
        // Execute the command
        _server.command(
          'system.$cmd',
          { ismaster: true },
          { readPreference: new ReadPreference('primary') },
          function(err, result) {
            expect(err).to.be.null;
            _server.s.currentReconnectRetry = 10;

            // Write garbage, force socket closure
            try {
              var a = new Buffer(100);
              for (var i = 0; i < 100; i++) a[i] = i;
              result.connection.write(a);
            } catch (loopErr) {
              console.log(loopErr);
            }

            // Ensure the server died
            setTimeout(function() {
              // Attempt a proper command
              _server.command(
                'system.$cmd',
                { ismaster: true },
                { readPreference: new ReadPreference('primary') },
                function(cmdErr) {
                  expect(cmdErr).to.not.be.null;
                }
              );
            }, 100);
          }
        );
      });

      server.once('close', function() {
        emittedClose = true;
      });

      server.once('reconnect', function() {
        expect(emittedClose).to.be.true;
        expect(server.isConnected()).to.be.true;
        expect(server.s.pool.retriesLeft).to.equal(30);
        server.destroy();
        done();
      });

      // Start connection
      server.connect();
    }
  });

  it('should correctly reconnect to server with automatic reconnect disabled', {
    metadata: {
      requires: {
        topology: 'single'
      }
      // ignore: { travis:true }
    },

    test: function(done) {
      var Server = this.configuration.require.Server,
        ReadPreference = this.configuration.require.ReadPreference;

      // Attempt to connect
      var server = new Server({
        host: this.configuration.host,
        port: this.configuration.port,
        reconnect: false,
        size: 1
      });

      // Test flags
      var emittedClose = false;

      // Add event listeners
      server.on('connect', function(_server) {
        // Execute the command
        _server.command(
          'system.$cmd',
          { ismaster: true },
          { readPreference: new ReadPreference('primary') },
          function(err, result) {
            expect(err).to.be.null;
            // Write garbage, force socket closure
            try {
              result.connection.destroy();
            } catch (destroyErr) {
              console.log(destroyErr);
            }

            process.nextTick(function() {
              // Attempt a proper command
              _server.command(
                'system.$cmd',
                { ismaster: true },
                { readPreference: new ReadPreference('primary') },
                function(cmdErr) {
                  expect(cmdErr).to.not.be.null;
                }
              );
            });
          }
        );
      });

      server.on('close', function() {
        emittedClose = true;
      });

      setTimeout(function() {
        expect(emittedClose).to.be.true;
        expect(server.isConnected()).to.be.false;
        server.destroy();
        done();
      }, 500);

      // Start connection
      server.connect();
    }
  });

  it('should reconnect when initial connection failed', {
    metadata: {
      requires: {
        topology: 'single'
      },
      ignore: { travis: true }
    },

    test: function(done) {
      var self = this;

      var Server = this.configuration.require.Server,
        manager = this.configuration.manager;

      manager.stop('SIGINT').then(function() {
        // Attempt to connect while server is down
        var server = new Server({
          host: self.configuration.host,
          port: self.configuration.port,
          reconnect: true,
          reconnectTries: 2,
          size: 1,
          emitError: true
        });

        server.on('connect', function() {
          server.destroy();
          done();
        });

        server.on('reconnect', function() {
          server.destroy();
          done();
        });

        server.on('error', function(err) {
          expect(err).to.exist;
          expect(err.message.indexOf('failed to')).to.not.equal(-1);
          manager.start().then(function() {});
        });

        server.connect();
      });
    }
  });

  it('should correctly place new connections in available list on reconnect', {
    metadata: {
      requires: {
        topology: 'single',
        os: '!darwin' // remove os restriction when SERVER-32477 is resolved
      }
    },

    test: function(done) {
      var Server = this.configuration.require.Server,
        ReadPreference = this.configuration.require.ReadPreference;

      // Attempt to connect
      var server = new Server({
        host: this.configuration.host,
        port: this.configuration.port,
        reconnect: true,
        size: 1,
        reconnectInterval: 50
      });

      // Add event listeners
      server.on('connect', function(_server) {
        // Execute the command
        _server.command(
          'system.$cmd',
          { ismaster: true },
          { readPreference: new ReadPreference('primary') },
          function(err, result) {
            expect(err).to.be.null;
            _server.s.currentReconnectRetry = 10;

            // Write garbage, force socket closure
            try {
              var a = new Buffer(100);
              for (var i = 0; i < 100; i++) a[i] = i;
              result.connection.write(a);
            } catch (garbageErr) {
              console.log(garbageErr);
            }
          }
        );
      });

      server.once('reconnect', function() {
        for (var i = 0; i < 100; i++) {
          server.command('system.$cmd', { ismaster: true }, function(err, result) {
            expect(err).to.be.null;
            expect(result).to.exist;
          });
        }

        server.command('system.$cmd', { ismaster: true }, function(err, result) {
          expect(err).to.be.null;
          expect(result).to.exist;

          setTimeout(function() {
            expect(server.s.pool.availableConnections.length).to.be.above(0);
            expect(server.s.pool.inUseConnections.length).to.equal(0);
            expect(server.s.pool.connectingConnections.length).to.equal(0);

            server.destroy();
            done();
          }, 1000);
        });
      });

      // Start connection
      server.connect();
    }
  });

  it('should not overflow the poolSize due to concurrent operations', {
    metadata: {
      requires: {
        topology: 'single'
      },
      ignore: { travis: true }
    },

    test: function(done) {
      var self = this;

      var Server = this.configuration.require.Server;

      // Attempt to connect while server is down
      var server = new Server({
        host: this.configuration.host,
        port: this.configuration.port,
        reconnect: true,
        reconnectTries: 2,
        size: 50,
        emitError: true
      });

      server.on('connect', function() {
        var left = 5000;

        var leftDecrement = function(err, results) {
          expect(err).to.not.exist;
          expect(results).to.exist;

          left = left - 1;

          if (!left) {
            expect(server.connections().length).to.equal(50);

            done();
            server.destroy();
          }
        };

        for (var i = 0; i < 5000; i++) {
          server.insert(
            f('%s.massInsertsTest', self.configuration.db),
            [{ a: 1 }],
            {
              writeConcern: { w: 1 },
              ordered: true
            },
            leftDecrement
          );
        }
      });

      server.connect();
    }
  });

  it('should correctly connect execute 5 evals in parallel', {
    metadata: { requires: { topology: 'single' } },

    test: function(done) {
      // Attempt to connect
      var server = new Server({
        host: this.configuration.host,
        port: this.configuration.port,
        size: 10,
        bson: new Bson()
      });

      // Add event listeners
      server.on('connect', function() {
        var left = 5;
        var start = new Date().getTime();

        var leftDecrement = function(err, r) {
          expect(err).to.not.exist;
          expect(r).to.exist;

          left = left - 1;

          if (left === 0) {
            var total = new Date().getTime() - start;
            expect(total).to.be.at.least(5 * 100);
            expect(total).to.be.at.most(1000);

            server.destroy();
            done();
          }
        };

        for (var i = 0; i < left; i++) {
          server.command('system.$cmd', { eval: 'sleep(100);' }, leftDecrement);
        }
      });

      // Start connection
      server.connect();
    }
  });

  it('should correctly promoteValues when calling getMore on queries', {
    metadata: {
      requires: {
        node: '>0.8.0',
        topology: ['single', 'ssl', 'wiredtiger']
      }
    },

    // The actual test we wish to run
    test: function(done) {
      // Attempt to connect
      var server = new Server({
        host: this.configuration.host,
        port: this.configuration.port,
        size: 10,
        bson: new Bson()
      });
      // Namespace
      var ns = 'integration_tests.remove_example';

      // Add event listeners
      server.on('connect', function() {
        var docs = new Array(150).fill(0).map(function(_, i) {
          return {
            _id: 'needle_' + i,
            is_even: i % 2,
            long: Bson.Long.fromString('1234567890'),
            double: 0.23456,
            int: 1234
          };
        });

        server.insert(ns, docs, function(err, r) {
          expect(err).to.be.null;
          expect(r.result.ok).to.equal(1);

          // Execute find
          var cursor = server.cursor(
            ns,
            {
              find: ns,
              query: {},
              limit: 102
            },
            {
              promoteValues: false
            }
          );

          function callNext(_cursor) {
            _cursor.next(function(cursorErr, doc) {
              if (!doc) {
                return done();
              }

              expect(doc.int).to.be.an('object');
              expect(doc.int._bsontype).to.equal('Int32');
              expect(doc.long).to.be.an('object');
              expect(doc.long._bsontype).to.equal('Long');
              expect(doc.double).to.be.an('object');

              // Call next
              callNext(_cursor);
            });
          }

          callNext(cursor);
        });
      });

      // Start connection
      server.connect();
    }
  });

  it('should error when invalid compressors are specified', {
    metadata: { requires: { topology: 'single' } },

    test: function(done) {
      // Attempt to connect
      try {
        new Server({
          host: this.configuration.host,
          port: this.configuration.port,
          bson: new Bson(),
          compression: { compressors: ['notACompressor', 'alsoNotACompressor', 'snappy'] }
        });
      } catch (err) {
        expect(err.message).to.equal('compressors must be at least one of snappy or zlib');
        done();
      }
    }
  });

  // Skipped due to use of topology manager
  it.skip(
    'should correctly connect server specifying compression to single instance with authentication and insert documents',
    {
      metadata: { requires: { topology: ['auth', 'snappyCompression'] } },

      test: function(done) {
        var self = this;

        Connection.enableConnectionAccounting();

        self.configuration.manager.restart(true).then(function() {
          locateAuthMethod(self.configuration, function(err, method) {
            expect(err).to.be.null;

            // Attempt to connect
            executeCommand(
              self.configuration,
              'admin',
              {
                createUser: 'root',
                pwd: 'root',
                roles: [{ role: 'root', db: 'admin' }],
                digestPassword: true
              },
              function(cmdErr, r) {
                expect(cmdErr).to.not.exist;
                expect(r).to.exist;

                var server = new Server({
                  host: self.configuration.host,
                  port: self.configuration.port,
                  bson: new Bson(),
                  compression: { compressors: ['snappy', 'zlib'] }
                });

                // Add event listeners
                server.on('connect', function() {
                  server.insert('integration_tests.inserts', { a: 1 }, function(
                    insertOneErr,
                    insertOneRes
                  ) {
                    expect(insertOneErr).to.be.null;
                    expect(insertOneRes.result.n).to.equal(1);

                    server.insert(
                      'integration_tests.inserts',
                      { a: 1 },
                      { ordered: false },
                      function(insertTwoErr, insertTwoR) {
                        expect(insertTwoErr).to.be.null;
                        expect(insertTwoR.result.n).to.equal(1);

                        server.destroy();
                        Connection.disableConnectionAccounting();
                        done();
                      }
                    );
                  });
                });

                server.connect({ auth: [method, 'admin', 'root', 'root'] });
              }
            );
          });
        });
      }
    }
  );

  // Skipped due to use of topology manager
  it.skip(
    'should fail to connect server specifying compression to single instance with incorrect authentication credentials',
    {
      metadata: { requires: { topology: ['auth', 'snappyCompression'] } },

      test: function(done) {
        var self = this;

        Connection.enableConnectionAccounting();

        this.configuration.manager.restart(true).then(function() {
          locateAuthMethod(self.configuration, function(err, method) {
            expect(err).to.be.null;

            // Attempt to connect
            executeCommand(
              self.configuration,
              'admin',
              {
                createUser: 'root',
                pwd: 'root',
                roles: [{ role: 'root', db: 'admin' }],
                digestPassword: true
              },
              function(cmdErr, r) {
                expect(cmdErr).to.not.exist;
                expect(r).to.exist;

                var server = new Server({
                  host: self.configuration.host,
                  port: self.configuration.port,
                  bson: new Bson(),
                  compression: { compressors: ['snappy', 'zlib'] }
                });

                // Add event listeners
                server.on('error', function() {
                  expect(Object.keys(Connection.connections()).length).to.equal(0);
                  Connection.disableConnectionAccounting();
                  done();
                });

                server.connect({ auth: [method, 'admin', 'root2', 'root'] });
              }
            );
          });
        });
      }
    }
  );

  it(
    'should correctly connect server to single instance and execute insert with snappy compression',
    {
      metadata: { requires: { topology: ['single'], mongodb: '>=3.5.x' } },

      test: function(done) {
        // Attempt to connect to server
        var server = new Server({
          host: this.configuration.host,
          port: this.configuration.port,
          bson: new Bson(),
          compression: {
            compressors: ['snappy', 'zlib']
          }
        });

        // Add event listeners
        server.on('connect', function() {
          // Check compression has been negotiated
          expect(server.s.pool.options.agreedCompressor).to.equal('snappy');

          server.insert('integration_tests.inserts', { a: 1 }, function(insertOneErr, insertOneR) {
            expect(insertOneErr).to.be.null;
            expect(insertOneR.result.n).to.equal(1);
            expect(insertOneR.message.fromCompressed).to.be.true;

            server.insert('integration_tests.inserts', { a: 2 }, { ordered: false }, function(
              err,
              r
            ) {
              expect(err).to.be.null;
              expect(r.result.n).to.equal(1);
              expect(r.message.fromCompressed).to.be.true;

              server.destroy();
              done();
            });
          });
        });

        // Start connection
        server.connect();
      }
    }
  );

  describe('Unsupported wire protocols', function() {
    let server;
    beforeEach(() => mock.createServer().then(_server => (server = _server)));
    afterEach(() => mock.cleanup());

    it('errors when unsupported wire protocol is returned from isMaster', {
      metadata: { requires: { topology: ['single'] } },

      test: function(done) {
        server.setMessageHandler(request => {
          request.reply(Object.assign({}, mock.DEFAULT_ISMASTER, { maxWireVersion: 1 }));
        });

        const client = new Server(server.address());
        client.on('error', error => {
          let err;
          try {
            expect(error).to.be.an.instanceOf(Error);
            expect(error.message).to.have.string('but this version of Node.js Driver requires');
          } catch (e) {
            err = e;
          }
          done(err);
        });
        client.on('connect', () => {
          done(new Error('This should not connect'));
        });
        client.connect();
      }
    });
  });

  it('Should not try to reconnect forever if reconnectTries = 0', {
    metadata: { requires: { topology: 'single' } },

    test: function(done) {
      // Attempt to connect
      let server = new Server({
        host: 'doesntexist',
        bson: new Bson(),
        reconnectTries: 0
      });

      // Add event listeners
      server.on('error', function() {});

      // Start connection
      server.connect();

      server.s.pool.on('reconnectFailed', function() {
        done();
      });
    }
  });
});
