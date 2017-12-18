'use strict';
var expect = require('chai').expect,
  co = require('co'),
  mock = require('../../../mock');

describe('Mongos Proxy Failover (mocks)', function() {
  afterEach(() => mock.cleanup());

  it('Should correctly failover due to proxy going away causing timeout', {
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
        const mongos1 = yield mock.createServer(52007, 'localhost');
        const mongos2 = yield mock.createServer(52008, 'localhost');

        mongos1.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(serverIsMaster[0]);
          } else if (doc.insert) {
            mongos1.destroy();
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
        var server = new Mongos(
          [{ host: 'localhost', port: 52007 }, { host: 'localhost', port: 52008 }],
          {
            connectionTimeout: 3000,
            socketTimeout: 5000,
            haInterval: 1000,
            size: 1
          }
        );

        // Add event listeners
        server.once('fullsetup', function() {
          var intervalId = setInterval(function() {
            server.insert('test.test', [{ created: new Date() }], function(err, r) {
              // If we have a successful insert
              // validate that it's the expected proxy
              if (r) {
                clearInterval(intervalId);
                expect(r.connection.port).to.equal(52008);

                server.destroy();
                done();
              }
            });
          }, 500);
        });

        server.on('error', done);
        server.connect();
      });
    }
  });

  it('Should correctly bring back proxy and use it', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single'
      }
    },

    test: function(done) {
      var Mongos = this.configuration.mongo.Mongos;

      // Current index for the ismaster
      var currentStep = 0;

      // Default message fields
      var defaultFields = Object.assign({}, mock.DEFAULT_ISMASTER, {
        msg: 'isdbgrid'
      });

      // Primary server states
      var serverIsMaster = [Object.assign({}, defaultFields)];
      // Boot the mock
      co(function*() {
        const mongos1 = yield mock.createServer(52009, 'localhost');
        const mongos2 = yield mock.createServer(52010, 'localhost');

        mongos1.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(serverIsMaster[0]);
          } else if (doc.insert && currentStep === 0) {
            setTimeout(() => request.connection.destroy(), 1600);
          } else if (doc.insert && currentStep === 1) {
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
        var server = new Mongos(
          [{ host: 'localhost', port: 52009 }, { host: 'localhost', port: 52010 }],
          {
            connectionTimeout: 3000,
            socketTimeout: 1500,
            haInterval: 1000,
            size: 1
          }
        );

        // Add event listeners
        server.once('fullsetup', function() {
          var intervalId = setInterval(function() {
            server.insert('test.test', [{ created: new Date() }], function(err, r) {
              // If we have a successful insert
              // validate that it's the expected proxy
              if (r) {
                clearInterval(intervalId);
                expect(r.connection.port).to.equal(52010);

                // Proxies seen
                var proxies = {};

                // Perform interval inserts waiting for both proxies to come back
                var intervalId2 = setInterval(function() {
                  // Bring back the missing proxy
                  if (currentStep === 0) currentStep = currentStep + 1;
                  // Perform inserts
                  server.insert('test.test', [{ created: new Date() }], function(_err, _r) {
                    if (_r) {
                      proxies[_r.connection.port] = true;
                    }

                    // Do we have both proxies answering
                    if (Object.keys(proxies).length === 2) {
                      clearInterval(intervalId2);

                      server.destroy();
                      done();
                    }
                  });
                }, 500);
              }
            });
          }, 500);
        });

        server.on('error', done);
        server.connect();
      });
    }
  });

  it('Should correctly bring back both proxies and use it', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single'
      }
    },

    test: function(done) {
      var Mongos = this.configuration.mongo.Mongos;

      // Current index for the ismaster
      var currentStep = 0;

      // Default message fields
      var defaultFields = Object.assign({}, mock.DEFAULT_ISMASTER, {
        msg: 'isdbgrid'
      });

      // Primary server states
      var serverIsMaster = [Object.assign({}, defaultFields)];
      // Boot the mock
      co(function*() {
        const mongos1 = yield mock.createServer(52011, 'localhost');
        const mongos2 = yield mock.createServer(52012, 'localhost');

        mongos1.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(serverIsMaster[0]);
          } else if (doc.insert && currentStep === 0) {
            setTimeout(() => request.connection.destroy(), 1600);
          } else if (doc.insert && currentStep === 1) {
            request.reply({ ok: 1, n: doc.documents, lastOp: new Date() });
          }
        });

        mongos2.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(serverIsMaster[0]);
          } else if (doc.insert && currentStep === 0) {
            setTimeout(() => request.connection.destroy(), 1600);
          } else if (doc.insert && currentStep === 1) {
            request.reply({ ok: 1, n: doc.documents, lastOp: new Date() });
          }
        });

        // Attempt to connect
        var server = new Mongos(
          [{ host: 'localhost', port: 52011 }, { host: 'localhost', port: 52012 }],
          {
            connectionTimeout: 3000,
            socketTimeout: 500,
            haInterval: 1000,
            size: 1
          }
        );

        // Add event listeners
        server.once('fullsetup', function() {
          var intervalId = setInterval(function() {
            server.insert('test.test', [{ created: new Date() }], function() {
              if (intervalId === null) return;
              // Clear out the interval
              clearInterval(intervalId);
              intervalId = null;
              // Let the proxies come back
              if (currentStep === 0) currentStep = currentStep + 1;

              // Proxies seen
              var proxies = {};

              // Perform interval inserts waiting for both proxies to come back
              var intervalId2 = setInterval(function() {
                // Perform inserts
                server.insert('test.test', [{ created: new Date() }], function(_err, _r) {
                  if (intervalId2 === null) return;
                  if (_r) {
                    proxies[_r.connection.port] = true;
                  }

                  // Do we have both proxies answering
                  if (Object.keys(proxies).length === 2) {
                    clearInterval(intervalId2);
                    intervalId2 = null;

                    server.destroy();
                    done();
                  }
                });
              }, 100);
            });
          }, 500);
        });

        server.on('error', done);
        server.connect();
      });
    }
  });
});
