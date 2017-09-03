'use strict';
var Server = require('../../../../lib/topologies/server'),
  expect = require('chai').expect,
  co = require('co'),
  mockupdb = require('../../../mock');

// NOTE: eventually use `this.configuration.mongo.Server` instead of direct import when
// https://github.com/malexandert/mongodb-test-runner/issues/3 is fixed

describe('Single Compression (mocks)', function() {
  it("server should recieve list of client's supported compressors in handshake", {
    metadata: {
      requires: {
        generators: true,
        topology: 'single'
      }
    },

    test: function(done) {
      // Contain mock server
      var server = null;
      var running = true;

      // Prepare the server's response
      var serverResponse = {
        ismaster: true,
        maxBsonObjectSize: 16777216,
        maxMessageSizeBytes: 48000000,
        maxWriteBatchSize: 1000,
        localTime: new Date(),
        maxWireVersion: 3,
        minWireVersion: 0,
        ok: 1
      };

      // Boot the mock
      co(function*() {
        server = yield mockupdb.createServer(37046, 'localhost');

        // Primary state machine
        co(function*() {
          while (running) {
            var request = yield server.receive();
            expect(request.response.documents[0].compression).to.have.members(['snappy', 'zlib']);
            request.reply(serverResponse);
            running = false;
          }
        });
      }).catch(done);

      // Attempt to connect
      var client = new Server({
        host: 'localhost',
        port: '37046',
        connectionTimeout: 5000,
        socketTimeout: 1000,
        size: 1,
        compression: { compressors: ['snappy', 'zlib'], zlibCompressionLevel: -1 }
      });

      client.on('connect', function() {
        client.destroy();
        running = false;
        setTimeout(done, 1000);
      });

      setTimeout(function() {
        client.connect();
      }, 100);
    }
  });

  it(
    'should connect and insert document when server is responding with OP_COMPRESSED with no compression',
    {
      metadata: {
        requires: {
          generators: true,
          topology: 'single'
        }
      },

      test: function(done) {
        // Contain mock server
        var server = null;
        var running = true;
        var currentStep = 0;

        // Prepare the server's response
        let serverResponse = {
          ismaster: true,
          maxBsonObjectSize: 16777216,
          maxMessageSizeBytes: 48000000,
          maxWriteBatchSize: 1000,
          localTime: new Date(),
          maxWireVersion: 3,
          minWireVersion: 0,
          ok: 1
        };

        // Boot the mock
        co(function*() {
          server = yield mockupdb.createServer(37047, 'localhost');

          // Primary state machine
          co(function*() {
            while (running) {
              var request = yield server.receive();
              var doc = request.document;

              if (currentStep === 0) {
                expect(request.response.documents[0].compression).to.have.members([
                  'snappy',
                  'zlib'
                ]);
                expect(server.isCompressed).to.be.false;
                // Acknowledge connection using OP_COMPRESSED with no compression
                request.reply(serverResponse, { compression: { compressor: 'no_compression' } });
              } else if (currentStep === 1) {
                expect(server.isCompressed).to.be.false;
                // Acknowledge insertion using OP_COMPRESSED with no compression
                request.reply(
                  { ok: 1, n: doc.documents.length, lastOp: new Date() },
                  { compression: { compressor: 'no_compression' } }
                );
              } else if (currentStep === 2 || currentStep === 3) {
                expect(server.isCompressed).to.be.false;
                // Acknowledge update using OP_COMPRESSED with no compression
                request.reply({ ok: 1, n: 1 }, { compression: { compressor: 'no_compression' } });
              } else if (currentStep === 4) {
                expect(server.isCompressed).to.be.false;
                request.reply({ ok: 1 }, { compression: { compressor: 'no_compression' } });
              }
              currentStep++;
            }
          });
        }).catch(done);

        // Attempt to connect
        var client = new Server({
          host: 'localhost',
          port: '37047',
          connectionTimeout: 5000,
          socketTimeout: 1000,
          size: 1,
          compression: { compressors: ['snappy', 'zlib'] }
        });

        // Connect and try inserting, updating, and removing
        // All outbound messages from the driver will be uncompressed
        // Inbound messages from the server should be OP_COMPRESSED with no compression
        client.on('connect', function(_server) {
          _server.insert('test.test', [{ a: 1, created: new Date() }], function(err, r) {
            expect(err).to.be.null;
            expect(r.result.n).to.equal(1);

            _server.update('test.test', { q: { a: 1 }, u: { $set: { b: 1 } } }, function(_err, _r) {
              expect(_err).to.be.null;
              expect(_r.result.n).to.equal(1);

              _server.remove('test.test', { q: { a: 1 } }, function(__err, __r) {
                expect(__err).to.be.null;
                expect(__r.result.n).to.equal(1);

                _server.command('system.$cmd', { ping: 1 }, function(___err, ___r) {
                  expect(___err).to.be.null;
                  expect(___r.result.ok).to.equal(1);

                  client.destroy();
                  setTimeout(function() {
                    running = false;
                    done();
                  }, 500);
                });
              });
            });
          });
        });

        setTimeout(function() {
          client.connect();
        }, 100);
      }
    }
  );

  it(
    'should connect and insert document when server is responding with OP_COMPRESSED with snappy compression',
    {
      metadata: {
        requires: {
          generators: true,
          topology: 'single'
        }
      },

      test: function(done) {
        // Contain mock server
        var server = null;
        var running = true;
        var currentStep = 0;

        // Prepare the server's response
        var serverResponse = {
          ismaster: true,
          maxBsonObjectSize: 16777216,
          maxMessageSizeBytes: 48000000,
          maxWriteBatchSize: 1000,
          localTime: new Date(),
          maxWireVersion: 3,
          minWireVersion: 0,
          compression: ['snappy'],
          ok: 1
        };

        // Boot the mock
        co(function*() {
          server = yield mockupdb.createServer(37048, 'localhost');

          // Primary state machine
          co(function*() {
            while (running) {
              var request = yield server.receive();
              var doc = request.document;

              if (currentStep === 0) {
                expect(request.response.documents[0].compression).to.have.members([
                  'snappy',
                  'zlib'
                ]);
                expect(server.isCompressed).to.be.false;
                // Acknowledge connection using OP_COMPRESSED with snappy
                request.reply(serverResponse, { compression: { compressor: 'snappy' } });
              } else if (currentStep === 1) {
                expect(server.isCompressed).to.be.true;
                // Acknowledge insertion using OP_COMPRESSED with snappy
                request.reply(
                  { ok: 1, n: doc.documents.length, lastOp: new Date() },
                  { compression: { compressor: 'snappy' } }
                );
              } else if (currentStep === 2 || currentStep === 3) {
                expect(server.isCompressed).to.be.true;
                // Acknowledge update using OP_COMPRESSED with snappy
                request.reply({ ok: 1, n: 1 }, { compression: { compressor: 'snappy' } });
              } else if (currentStep === 4) {
                expect(server.isCompressed).to.be.true;
                request.reply({ ok: 1 }, { compression: { compressor: 'snappy' } });
              }
              currentStep++;
            }
          });
        }).catch(done);

        // Attempt to connect
        var client = new Server({
          host: 'localhost',
          port: '37048',
          connectionTimeout: 5000,
          socketTimeout: 1000,
          size: 1,
          compression: { compressors: ['snappy', 'zlib'] }
        });

        // Connect and try inserting, updating, and removing
        // All outbound messages from the driver (after initial connection) will be OP_COMPRESSED using snappy
        // Inbound messages from the server should be OP_COMPRESSED with snappy
        client.on('connect', function(_server) {
          _server.insert('test.test', [{ a: 1, created: new Date() }], function(err, r) {
            expect(err).to.be.null;
            expect(r.result.n).to.equal(1);

            _server.update('test.test', { q: { a: 1 }, u: { $set: { b: 1 } } }, function(_err, _r) {
              expect(_err).to.be.null;
              expect(_r.result.n).to.equal(1);

              _server.remove('test.test', { q: { a: 1 } }, function(__err, __r) {
                expect(__err).to.be.null;
                expect(__r.result.n).to.equal(1);

                _server.command('system.$cmd', { ping: 1 }, function(___err, ___r) {
                  expect(___err).to.be.null;
                  expect(___r.result.ok).to.equal(1);

                  client.destroy();
                  setTimeout(function() {
                    running = false;
                    done();
                  }, 500);
                });
              });
            });
          });
        });

        setTimeout(function() {
          client.connect();
        }, 100);
      }
    }
  );

  it(
    'should connect and insert document when server is responding with OP_COMPRESSED with zlib compression',
    {
      metadata: {
        requires: {
          generators: true,
          topology: 'single'
        }
      },

      test: function(done) {
        // Contain mock server
        var server = null;
        var running = true;
        var currentStep = 0;

        // Prepare the server's response
        var serverResponse = {
          ismaster: true,
          maxBsonObjectSize: 16777216,
          maxMessageSizeBytes: 48000000,
          maxWriteBatchSize: 1000,
          localTime: new Date(),
          maxWireVersion: 3,
          minWireVersion: 0,
          compression: ['zlib'],
          ok: 1
        };

        // Boot the mock
        co(function*() {
          server = yield mockupdb.createServer(37049, 'localhost');

          // Primary state machine
          co(function*() {
            while (running) {
              var request = yield server.receive();
              var doc = request.document;

              if (currentStep === 0) {
                expect(request.response.documents[0].compression).to.have.members([
                  'snappy',
                  'zlib'
                ]);
                expect(server.isCompressed).to.be.false;
                // Acknowledge connection using OP_COMPRESSED with zlib
                request.reply(serverResponse, { compression: { compressor: 'zlib' } });
              } else if (currentStep === 1) {
                expect(server.isCompressed).to.be.true;
                // Acknowledge insertion using OP_COMPRESSED with zlib
                request.reply(
                  { ok: 1, n: doc.documents.length, lastOp: new Date() },
                  { compression: { compressor: 'zlib' } }
                );
              } else if (currentStep === 2 || currentStep === 3) {
                // Acknowledge update using OP_COMPRESSED with zlib
                expect(server.isCompressed).to.be.true;
                request.reply({ ok: 1, n: 1 }, { compression: { compressor: 'zlib' } });
              } else if (currentStep === 4) {
                expect(server.isCompressed).to.be.true;
                request.reply({ ok: 1 }, { compression: { compressor: 'zlib' } });
              }
              currentStep++;
            }
          });
        }).catch(done);

        // Attempt to connect
        var client = new Server({
          host: 'localhost',
          port: '37049',
          connectionTimeout: 5000,
          socketTimeout: 1000,
          size: 1,
          compression: { compressors: ['snappy', 'zlib'] }
        });

        // Connect and try inserting, updating, and removing
        // All outbound messages from the driver (after initial connection) will be OP_COMPRESSED using zlib
        // Inbound messages from the server should be OP_COMPRESSED with zlib
        client.on('connect', function(_server) {
          _server.insert('test.test', [{ a: 1, created: new Date() }], function(err, r) {
            expect(err).to.be.null;
            expect(r.result.n).to.equal(1);

            _server.update('test.test', { q: { a: 1 }, u: { $set: { b: 1 } } }, function(_err, _r) {
              expect(_err).to.be.null;
              expect(_r.result.n).to.equal(1);

              _server.remove('test.test', { q: { a: 1 } }, function(__err, __r) {
                expect(__err).to.be.null;
                expect(__r.result.n).to.equal(1);

                _server.command('system.$cmd', { ping: 1 }, function(___err, ___r) {
                  expect(___err).to.be.null;
                  expect(___r.result.ok).to.equal(1);

                  client.destroy();
                  setTimeout(function() {
                    running = false;
                    done();
                  }, 500);
                });
              });
            });
          });
        });

        setTimeout(function() {
          client.connect();
        }, 100);
      }
    }
  );

  it('should not compress uncompressible commands', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single'
      }
    },

    test: function(done) {
      // Contain mock server
      var server = null;
      var running = true;
      var currentStep = 0;

      // Prepare the server's response
      var serverResponse = {
        ismaster: true,
        maxBsonObjectSize: 16777216,
        maxMessageSizeBytes: 48000000,
        maxWriteBatchSize: 1000,
        localTime: new Date(),
        maxWireVersion: 3,
        minWireVersion: 0,
        compression: ['snappy'],
        ok: 1
      };

      // Boot the mock
      co(function*() {
        server = yield mockupdb.createServer(37050, 'localhost');

        // Primary state machine
        co(function*() {
          while (running) {
            var request = yield server.receive();

            if (currentStep === 0) {
              expect(request.response.documents[0].compression).to.have.members(['snappy', 'zlib']);
              expect(server.isCompressed).to.be.false;
              // Acknowledge connection using OP_COMPRESSED with snappy
              request.reply(serverResponse, { compression: { compressor: 'snappy' } });
            } else if (currentStep === 1) {
              expect(server.isCompressed).to.be.true;
              // Acknowledge ping using OP_COMPRESSED with snappy
              request.reply({ ok: 1 }, { compression: { compressor: 'snappy' } });
            } else if (currentStep >= 2) {
              expect(server.isCompressed).to.be.false;
              // Acknowledge further uncompressible commands using OP_COMPRESSED with snappy
              request.reply({ ok: 1 }, { compression: { compressor: 'snappy' } });
            }
            currentStep++;
          }
        });
      }).catch(done);

      // Attempt to connect
      var client = new Server({
        host: 'localhost',
        port: '37050',
        connectionTimeout: 5000,
        socketTimeout: 1000,
        size: 1,
        compression: { compressors: ['snappy', 'zlib'] }
      });

      // Connect and try some commands, checking that uncompressible commands are indeed not compressed
      client.on('connect', function(_server) {
        _server.command('system.$cmd', { ping: 1 }, function(err, r) {
          expect(err).to.be.null;
          expect(r.result.ok).to.equal(1);

          _server.command('system.$cmd', { ismaster: 1 }, function(_err, _r) {
            expect(_err).to.be.null;
            expect(_r.result.ok).to.equal(1);

            _server.command('system.$cmd', { getnonce: 1 }, function(__err, __r) {
              expect(__err).to.be.null;
              expect(__r.result.ok).to.equal(1);

              _server.command('system.$cmd', { ismaster: 1 }, function(___err, ___r) {
                expect(___err).to.be.null;
                expect(___r.result.ok).to.equal(1);

                client.destroy();
                setTimeout(function() {
                  running = false;
                  done();
                }, 500);
              });
            });
          });
        });
      });

      setTimeout(function() {
        client.connect();
      }, 100);
    }
  });
});
