'use strict';
var expect = require('chai').expect,
  assign = require('../../../../lib/utils').assign,
  co = require('co'),
  mock = require('../../../mock');

describe('Single Timeout (mocks)', function() {
  it('Should correctly timeout socket operation and then correctly re-execute', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single'
      }
    },

    test: function(done) {
      var Server = this.configuration.mongo.Server;

      // Contain mock server
      var server = null;
      // Current index for the ismaster
      var currentStep = 0;
      // Primary stop responding
      var stopRespondingPrimary = false;

      // Default message fields
      var defaultFields = {
        ismaster: true,
        maxBsonObjectSize: 16777216,
        maxMessageSizeBytes: 48000000,
        maxWriteBatchSize: 1000,
        localTime: new Date(),
        maxWireVersion: 3,
        minWireVersion: 0,
        ok: 1
      };

      // Primary server states
      var serverIsMaster = [assign({}, defaultFields)];

      // Boot the mock
      co(function*() {
        server = yield mock.createServer(37019, 'localhost');

        server.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster && currentStep === 0) {
            request.reply(serverIsMaster[0]);
            currentStep += 1;
          } else if (doc.insert && currentStep === 1) {
            // Stop responding to any calls (emulate dropping packets on the floor)
            if (stopRespondingPrimary) {
              // yield timeoutPromise(3000);
              // continue;
              return;
            }

            currentStep += 1;
          } else if (doc.ismaster && currentStep === 2) {
            request.reply(serverIsMaster[0]);
          } else if (doc.insert && currentStep === 2) {
            request.reply({ ok: 1, n: doc.documents, lastOp: new Date() });
          }
        });

        // Start dropping the packets
        setTimeout(function() {
          stopRespondingPrimary = true;
        }, 5000);
      });

      // Attempt to connect
      var replset = new Server({
        host: 'localhost',
        port: '37019',
        connectionTimeout: 5000,
        socketTimeout: 1000,
        size: 1
      });

      // Not done
      var finished = false;

      // Add event listeners
      replset.once('connect', function(_server) {
        _server.insert('test.test', [{ created: new Date() }], function(err, r) {
          expect(r).to.not.exist;
          expect(err).to.exist;

          function wait() {
            setTimeout(function() {
              _server.insert('test.test', [{ created: new Date() }], function(_err, _r) {
                if (_r && !finished) {
                  finished = true;
                  expect(_r.connection.port).to.equal('37019');
                  replset.destroy({ force: true });
                  mock.cleanup([server], () => done());
                } else {
                  wait();
                }
              });
            }, 500);
          }

          wait();
        });
      });

      replset.on('error', done);
      setTimeout(function() {
        replset.connect();
      }, 100);
    }
  });

  it('Should correctly recover from an immediate shutdown mid insert', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single'
      }
    },

    test: function(done) {
      var Server = this.configuration.mongo.Server;

      // Contain mock server
      var server = null;
      // Current index for the ismaster
      var currentStep = 0;
      // Should fail due to broken pipe
      var brokenPipe = false;

      // Default message fields
      var defaultFields = {
        ismaster: true,
        maxBsonObjectSize: 16777216,
        maxMessageSizeBytes: 48000000,
        maxWriteBatchSize: 1000,
        localTime: new Date(),
        maxWireVersion: 3,
        minWireVersion: 0,
        ok: 1
      };

      // Primary server states
      var serverIsMaster = [assign({}, defaultFields)];

      // Boot the mock
      var __server;
      co(function*() {
        __server = yield mock.createServer(37017, 'localhost', {
          onRead: function(_server, connection) {
            // Force EPIPE error
            if (currentStep === 1) {
              // Destroy connection mid write
              connection.destroy();
              // Reset the mock to accept ismasters
              setTimeout(function() {
                currentStep += 1;
              }, 10);
              // Return connection was destroyed
              return true;
            }
          }
        });

        __server.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster && currentStep === 0) {
            currentStep += 1;
            request.reply(serverIsMaster[0]);
          } else if (doc.insert && currentStep === 2) {
            currentStep += 1;
            request.reply({ ok: 1, n: doc.documents, lastOp: new Date() });
          } else if (doc.ismaster) {
            request.reply(serverIsMaster[0]);
          }
        });
      });

      // Attempt to connect
      server = new Server({
        host: 'localhost',
        port: '37017',
        connectionTimeout: 3000,
        socketTimeout: 2000,
        size: 1
      });

      var docs = [];
      // Create big insert message
      for (var i = 0; i < 1000; i++) {
        docs.push({
          a: i,
          string:
            'hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world',
          string1:
            'hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world',
          string2:
            'hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world',
          string3:
            'hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world',
          string4:
            'hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world',
          string5:
            'hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world',
          string6:
            'hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world',
          string7:
            'hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world',
          string8:
            'hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world',
          string9:
            'hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world',
          string10:
            'hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world',
          string11:
            'hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world',
          string12:
            'hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world',
          string13:
            'hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world',
          string14:
            'hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world',
          string15:
            'hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world',
          string16:
            'hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world',
          string17:
            'hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world',
          string18:
            'hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world',
          string19:
            'hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world',
          string20:
            'hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world',
          string21:
            'hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world',
          string22:
            'hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world',
          string23:
            'hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world',
          string24:
            'hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world',
          string25:
            'hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world',
          string26:
            'hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world',
          string27:
            'hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world',
          string28:
            'hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world hello world'
        });
      }

      // Add event listeners
      server.once('connect', function(_server) {
        _server.insert('test.test', docs, function(err, r) {
          expect(r).to.not.exist;
          expect(err).to.exist;
          brokenPipe = true;
        });
      });

      server.once('reconnect', function(_server) {
        _server.insert('test.test', [{ created: new Date() }], function(err, r) {
          expect(r).to.exist;
          expect(brokenPipe).to.equal(true);
          _server.destroy();
          mock.cleanup([__server, _server], () => done());
        });
      });

      server.on('error', done);
      setTimeout(function() {
        server.connect();
      }, 100);
    }
  });

  it.skip(
    'Should not start double reconnect timeouts due to socket timeout during attemptReconnect',
    {
      metadata: {
        requires: {
          generators: true,
          topology: 'single'
        }
      },

      test: function(done) {
        var Server = this.configuration.mongo.Server;

        // Contain mock server
        var server = null;
        // Current index for the ismaster
        var currentStep = 0;

        // Default message fields
        var defaultFields = {
          ismaster: true,
          maxBsonObjectSize: 16777216,
          maxMessageSizeBytes: 48000000,
          maxWriteBatchSize: 1000,
          localTime: new Date(),
          maxWireVersion: 3,
          minWireVersion: 0,
          ok: 1
        };

        // Primary server states
        var serverIsMaster = [assign({}, defaultFields)];

        // Boot the mock
        co(function*() {
          server = yield mock.createServer(37019, 'localhost');

          server.setMessageHandler(request => {
            if (currentStep === 1) {
              // yield timeoutPromise(5000);
              // continue;
              return;
            }

            var doc = request.document;
            if (doc.ismaster && currentStep === 0) {
              request.reply(serverIsMaster[0]);
              currentStep += 1;
            }
          });
        });

        // Attempt to connect
        server = new Server({
          host: 'localhost',
          port: 37019,
          connectionTimeout: 2000,
          socketTimeout: 1000,
          size: 1
        });

        // Add event listeners
        server.once('connect', function() {
          // _server.insert('test.test', [{created:new Date()}], function(err, r) {
          //   test.ok(err != null);
          //   // console.dir(err)
          //
          //   function wait() {
          //     setTimeout(function() {
          //       _server.insert('test.test', [{created:new Date()}], function(err, r) {
          //         if (r && !done) {
          //           done = true;
          //           test.equal(37019, r.connection.port);
          //           replset.destroy();
          //           running = false;
          //           test.done();
          //         } else {
          //           wait();
          //         }
          //       });
          //     }, 500);
          //   }
          //
          //   wait();
          // });
        });

        server.on('error', done);
        server.connect();
      }
    }
  );
});
