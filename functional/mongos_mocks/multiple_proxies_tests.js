'use strict';
var expect = require('chai').expect,
  co = require('co'),
  mock = require('mongodb-mock-server');

describe('Mongos Multiple Proxies (mocks)', function() {
  afterEach(() => mock.cleanup());

  it('Should correctly load-balance the operations', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single'
      }
    },

    test: function(done) {
      var Mongos = this.configuration.mongo.Mongos;

      // Contain mock server
      var mongos1 = null;
      var mongos2 = null;

      // Default message fields
      var defaultFields = Object.assign({}, mock.DEFAULT_ISMASTER, {
        msg: 'isdbgrid'
      });

      // Primary server states
      var serverIsMaster = [Object.assign({}, defaultFields)];
      // Boot the mock
      co(function*() {
        mongos1 = yield mock.createServer();
        mongos2 = yield mock.createServer();

        mongos1.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(serverIsMaster[0]);
          } else if (doc.insert) {
            request.reply({ ok: 1, n: doc.documents, lastOp: new Date() });
          }
        });

        mongos2.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(serverIsMaster[0]);
          } else if (doc.insert) {
            request.reply({ ok: 1, n: doc.documents, lastOp: new Date() });
          }
        });

        // Attempt to connect
        var server = new Mongos([mongos1.address(), mongos2.address()], {
          connectionTimeout: 3000,
          socketTimeout: 1000,
          haInterval: 1000,
          localThresholdMS: 500,
          size: 1
        });

        var lastPort;

        // Add event listeners
        server.once('connect', function(_server) {
          _server.insert('test.test', [{ created: new Date() }], function(err, r) {
            expect(err).to.be.null;
            expect(r.connection.port).to.be.oneOf([mongos1.address().port, mongos2.address().port]);
            lastPort =
              r.connection.port === mongos1.address().port
                ? mongos2.address().port
                : mongos1.address().port;

            _server.insert('test.test', [{ created: new Date() }], function(_err, _r) {
              expect(_err).to.be.null;
              expect(_r.connection.port).to.equal(lastPort);
              lastPort =
                _r.connection.port === mongos1.address().port
                  ? mongos2.address().port
                  : mongos1.address().port;

              _server.insert('test.test', [{ created: new Date() }], function(__err, __r) {
                expect(__err).to.be.null;
                expect(__r.connection.port).to.equal(lastPort);

                server.destroy();
                done();
              });
            });
          });
        });

        server.on('error', done);
        server.connect();
      });
    }
  });

  it('Should ignore one of the mongos instances due to being outside the latency window', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single'
      }
    },

    test: function(done) {
      var Mongos = this.configuration.mongo.Mongos;

      // Default message fields
      var defaultFields = Object.assign({}, mock.DEFAULT_ISMASTER, {
        msg: 'isdbgrid'
      });

      // Primary server states
      var serverIsMaster = [Object.assign({}, defaultFields)];
      // Boot the mock
      co(function*() {
        const mongos1 = yield mock.createServer();
        const mongos2 = yield mock.createServer();

        mongos1.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(serverIsMaster[0]);
          } else if (doc.insert) {
            request.reply({ ok: 1, n: doc.documents, lastOp: new Date() });
          }
        });

        mongos2.setMessageHandler(request => {
          setTimeout(() => {
            var doc = request.document;
            if (doc.ismaster) {
              request.reply(serverIsMaster[0]);
            } else if (doc.insert) {
              request.reply({ ok: 1, n: doc.documents, lastOp: new Date() });
            }
          }, 500);
        });

        // Attempt to connect
        var server = new Mongos([mongos1.address(), mongos2.address()], {
          connectionTimeout: 3000,
          localThresholdMS: 50,
          socketTimeout: 1000,
          haInterval: 1000,
          size: 1
        });

        // Add event listeners
        server.once('fullsetup', function() {
          server.insert('test.test', [{ created: new Date() }], function(err, r) {
            expect(err).to.be.null;
            expect(r.connection.port).to.equal(mongos1.address().port);

            server.insert('test.test', [{ created: new Date() }], function(_err, _r) {
              expect(_err).to.be.null;
              expect(_r.connection.port).to.equal(mongos1.address().port);
              server.destroy();

              // Attempt to connect
              var server2 = new Mongos([mongos1.address(), mongos2.address()], {
                connectionTimeout: 3000,
                localThresholdMS: 1000,
                socketTimeout: 1000,
                haInterval: 1000,
                size: 1
              });

              // Add event listeners
              server2.once('fullsetup', function() {
                server2.insert('test.test', [{ created: new Date() }], function(__err, __r) {
                  expect(__err).to.be.null;
                  expect(__r.connection.port).to.equal(mongos1.address().port);

                  server2.insert('test.test', [{ created: new Date() }], function(___err, ___r) {
                    expect(___err).to.be.null;
                    expect(___r.connection.port).to.equal(mongos2.address().port);

                    server.destroy();
                    server2.destroy();
                    done();
                  });
                });
              });

              setTimeout(function() {
                server2.connect();
              }, 100);
            });
          });
        });

        server.on('error', done);
        server.connect();
      });
    }
  });
});
