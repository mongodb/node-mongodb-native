'use strict';
const expect = require('chai').expect;
const f = require('util').format;
const locateAuthMethod = require('./shared').locateAuthMethod;
const executeCommand = require('./shared').executeCommand;
const BSON = require('bson');
const mock = require('mongodb-mock-server');

const core = require('../../../src/core');
const ReadPreference = core.ReadPreference;
const MongoCredentials = core.MongoCredentials;
const Connection = core.Connection;

describe('Server tests', function () {
  it('should correctly connect server to single instance', {
    metadata: { requires: { topology: 'single' } },

    test: function (done) {
      const config = this.configuration;
      var server = config.newTopology(this.configuration.host, this.configuration.port);

      // Add event listeners
      server.on('connect', function () {
        server.destroy();
        done();
      });

      // Start connection
      server.connect();
    }
  });

  it('should correctly connect server to single instance and execute ismaster', {
    metadata: { requires: { topology: 'single' } },

    test: function (done) {
      const config = this.configuration;
      var server = config.newTopology(this.configuration.host, this.configuration.port);

      // Add event listeners
      server.on('connect', function () {
        server.command('admin.$cmd', { ismaster: true }, function (err, r) {
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

    test: function (done) {
      const config = this.configuration;
      var server = config.newTopology(this.configuration.host, this.configuration.port);

      // Add event listeners
      server.on('connect', function () {
        server.command(
          'admin.$cmd',
          { ismaster: true },
          {
            raw: true
          },
          function (err, r) {
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

    test: function (done) {
      const config = this.configuration;
      var server = config.newTopology(this.configuration.host, this.configuration.port);

      // Add event listeners
      server.on('connect', function () {
        server.insert('integration_tests.inserts', { a: 1 }, function (insertOneErr, insertOneR) {
          expect(insertOneErr).to.be.null;
          expect(insertOneR.result.n).to.equal(1);

          server.insert('integration_tests.inserts', { a: 1 }, { ordered: false }, function (
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

      test: function (done) {
        const config = this.configuration;
        var server = config.newTopology(this.configuration.host, this.configuration.port, {
          compression: { compressors: ['snappy', 'zlib'] }
        });

        // Add event listeners
        server.on('connect', function () {
          server.command(
            'system.$cmd',
            { ismaster: true },
            { readPreference: new ReadPreference('primary') },
            function (err, result) {
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

    test: function (done) {
      const config = this.configuration;
      var server = config.newTopology(this.configuration.host, this.configuration.port);

      // Add event listeners
      server.on('connect', function () {
        server.insert('integration_tests.inserts', [{ a: 1 }, { b: 1 }], function (
          insertOneErr,
          insertOneR
        ) {
          expect(insertOneErr).to.be.null;
          expect(insertOneR.result.n).to.equal(2);

          server.insert(
            'integration_tests.inserts',
            [{ a: 1 }, { b: 1 }],
            { ordered: false },
            function (insertTwoErr, insertTwoR) {
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

    test: function (done) {
      const config = this.configuration;
      var server = config.newTopology(this.configuration.host, this.configuration.port);

      // Add event listeners
      server.on('connect', function () {
        server.insert('integration_tests.inserts', { a: 1 }, { writeConcern: { w: 0 } }, function (
          insertOneErr,
          insertOneR
        ) {
          expect(insertOneErr).to.be.null;
          expect(insertOneR.result.ok).to.equal(1);

          server.insert(
            'integration_tests.inserts',
            { a: 1 },
            { ordered: false, writeConcern: { w: 0 } },
            function (insertTwoErr, insertTwoR) {
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

    test: function (done) {
      const config = this.configuration;
      var server = config.newTopology(this.configuration.host, this.configuration.port);

      // Add event listeners
      server.on('connect', function (_server) {
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
          function (err, results) {
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

    test: function (done) {
      const config = this.configuration;
      var server = config.newTopology(this.configuration.host, this.configuration.port);

      // Add event listeners
      server.on('connect', function (_server) {
        server.insert('integration_tests.remove_example', { a: 1 }, function (err, r) {
          expect(err).to.be.null;
          expect(r.result.ok).to.equal(1);

          _server.remove(
            'integration_tests.remove_example',
            [{ q: { a: 1 }, limit: 1 }],
            {
              writeConcern: { w: 1 },
              ordered: true
            },
            function (removeErr, results) {
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

    test: function (done) {
      var self = this;
      var testDone = false;

      const config = this.configuration;
      var server = config.newTopology(this.configuration.host, this.configuration.port);

      // Add event listeners
      server.on('connect', function (_server) {
        var count = 1;
        var ns = 'integration_tests.t';

        var execute = function () {
          if (!testDone) {
            server.insert(ns, { a: 1, count: count }, function () {
              count = count + 1;

              // Execute find
              var cursor = _server.cursor(ns, {
                find: ns,
                query: {},
                batchSize: 2
              });

              // Execute next
              cursor._next(function () {
                setTimeout(execute, 500);
              });
            });
          } else {
            server.insert(ns, { a: 1, count: count }, function (err, r) {
              expect(err).to.be.null;
              expect(r).to.exist;

              // Execute find
              var cursor = _server.cursor(ns, {
                find: ns,
                query: {},
                batchSize: 2
              });

              // Execute next
              cursor._next(function (cursorErr, d) {
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

      var restartServer = function () {
        if (count === 0) {
          testDone = true;
          return;
        }

        count = count - 1;

        self.configuration.manager.stop().then(function () {
          setTimeout(function () {
            self.configuration.manager.start().then(function () {
              setTimeout(restartServer, 1000);
            });
          }, 2000);
        });
      };

      setTimeout(restartServer, 1000);
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

    test: function (done) {
      const config = this.configuration;
      const manager = this.configuration.manager;

      manager.stop('SIGINT').then(function () {
        // Attempt to connect while server is down
        var server = config.newTopology(this.configuration.host, this.configuration.port, {
          reconnect: true,
          reconnectTries: 2,
          size: 1,
          emitError: true
        });

        server.on('connect', function () {
          server.destroy();
          done();
        });

        server.on('reconnect', function () {
          server.destroy();
          done();
        });

        server.on('error', function (err) {
          expect(err).to.exist;
          expect(err.message.indexOf('failed to')).to.not.equal(-1);
          manager.start().then(function () {});
        });

        server.connect();
      });
    }
  });

  it('should not overflow the poolSize due to concurrent operations', {
    metadata: {
      requires: {
        topology: 'single'
      },
      ignore: { travis: true }
    },

    test: function (done) {
      var self = this;
      const config = this.configuration;
      var server = config.newTopology(this.configuration.host, this.configuration.port, {
        reconnect: true,
        reconnectTries: 2,
        size: 50,
        emitError: true
      });

      server.on('connect', function () {
        var left = 5000;

        var leftDecrement = function (err, results) {
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

  it('should correctly promoteValues when calling getMore on queries', {
    metadata: {
      requires: {
        node: '>0.8.0',
        topology: ['single', 'ssl', 'wiredtiger']
      }
    },

    test: function (done) {
      const config = this.configuration;
      var server = config.newTopology(this.configuration.host, this.configuration.port, {
        size: 10
      });
      // Namespace
      var ns = 'integration_tests.remove_example';

      // Add event listeners
      server.on('connect', function () {
        var docs = new Array(150).fill(0).map(function (_, i) {
          return {
            _id: 'needle_' + i,
            is_even: i % 2,
            long: BSON.Long.fromString('1234567890'),
            double: 0.23456,
            int: 1234
          };
        });

        server.insert(ns, docs, function (err, r) {
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
            _cursor._next(function (cursorErr, doc) {
              expect(cursorErr).to.not.exist;
              if (!doc) {
                server.destroy(done);
                return;
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

    test: function (done) {
      const config = this.configuration;

      try {
        config.newTopology(this.configuration.host, this.configuration.port, {
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

      test: function (done) {
        var self = this;
        const config = this.configuration;

        Connection.enableConnectionAccounting();

        self.configuration.manager.restart(true).then(function () {
          locateAuthMethod(self.configuration, function (err, method) {
            expect(err).to.be.null;

            const credentials = new MongoCredentials({
              mechanism: method,
              source: 'admin',
              username: 'root',
              password: 'root'
            });

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
              function (cmdErr, r) {
                expect(cmdErr).to.not.exist;
                expect(r).to.exist;

                var server = config.newTopology(this.configuration.host, this.configuration.port, {
                  compression: { compressors: ['snappy', 'zlib'] }
                });

                // Add event listeners
                server.on('connect', function () {
                  server.insert('integration_tests.inserts', { a: 1 }, function (
                    insertOneErr,
                    insertOneRes
                  ) {
                    expect(insertOneErr).to.be.null;
                    expect(insertOneRes.result.n).to.equal(1);

                    server.insert(
                      'integration_tests.inserts',
                      { a: 1 },
                      { ordered: false },
                      function (insertTwoErr, insertTwoR) {
                        expect(insertTwoErr).to.be.null;
                        expect(insertTwoR.result.n).to.equal(1);

                        server.destroy();
                        Connection.disableConnectionAccounting();
                        done();
                      }
                    );
                  });
                });

                server.connect({ credentials });
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

      test: function (done) {
        var self = this;
        const config = this.configuration;

        Connection.enableConnectionAccounting();

        this.configuration.manager.restart(true).then(function () {
          locateAuthMethod(self.configuration, function (err, method) {
            expect(err).to.be.null;

            const credentials = new MongoCredentials({
              mechanism: method,
              source: 'admin',
              username: 'root',
              password: 'root'
            });

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
              function (cmdErr, r) {
                expect(cmdErr).to.not.exist;
                expect(r).to.exist;

                var server = config.newTopology(this.configuration.host, this.configuration.port, {
                  compression: { compressors: ['snappy', 'zlib'] }
                });

                // Add event listeners
                server.on('error', function () {
                  expect(Object.keys(Connection.connections()).length).to.equal(0);
                  Connection.disableConnectionAccounting();
                  done();
                });

                server.connect({ credentials });
              }
            );
          });
        });
      }
    }
  );

  describe('Unsupported wire protocols', function () {
    let server;
    beforeEach(() => mock.createServer().then(_server => (server = _server)));
    afterEach(() => mock.cleanup());

    it('errors when unsupported wire protocol is returned from isMaster', {
      metadata: { requires: { topology: ['single'] } },

      test: function (done) {
        server.setMessageHandler(request => {
          request.reply(Object.assign({}, mock.DEFAULT_ISMASTER, { maxWireVersion: 1 }));
        });

        const config = this.configuration;
        var client = config.newTopology(server.address().host, server.address().port, {
          serverSelectionTimeoutMS: 500
        });

        client.on('error', error => {
          let err;
          try {
            expect(error).to.be.an.instanceOf(Error);
            expect(error).to.match(/but this version of the Node.js Driver requires/);
          } catch (e) {
            err = e;
          }

          client.destroy(err2 => done(err || err2));
        });

        client.on('connect', () => {
          done(new Error('This should not connect'));
        });

        client.connect();
      }
    });
  });

  // NOTE: skipped for flakiness
  it.skip('Should not try to reconnect forever if reconnectTries = 0', {
    metadata: { requires: { topology: 'single' } },

    test: function (done) {
      const config = this.configuration;
      var server = config.newTopology('doesntexist', 12345, {
        reconnectTries: 0
      });

      // Add event listeners
      server.on('error', function () {});

      // Start connection
      server.connect();

      server.s.pool.on('reconnectFailed', function () {
        done();
      });
    }
  });
});
