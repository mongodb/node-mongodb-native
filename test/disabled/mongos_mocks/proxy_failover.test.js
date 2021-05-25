'use strict';
const expect = require('chai').expect;
const co = require('co');
const mock = require('mongodb-mock-server');

const core = require('../../../../src/core');
const Mongos = core.Mongos;

describe('Mongos Proxy Failover (mocks)', function () {
  afterEach(() => mock.cleanup());

  it('Should correctly failover due to proxy going away causing timeout', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single'
      }
    },

    test: function (done) {
      // Default message fields
      var defaultFields = Object.assign({}, mock.DEFAULT_ISMASTER, {
        msg: 'isdbgrid'
      });

      // Primary server states
      var serverIsMaster = [Object.assign({}, defaultFields)];
      // Boot the mock
      co(function* () {
        const mongos1 = yield mock.createServer();
        const mongos2 = yield mock.createServer();

        mongos1.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster || doc.hello) {
            request.reply(serverIsMaster[0]);
          } else if (doc.insert) {
            mongos1.destroy();
            request.reply({ ok: 1, n: doc.documents, lastOp: new Date() });
          }
        });

        mongos2.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster || doc.hello) {
            request.reply(serverIsMaster[0]);
          } else if (doc.insert) {
            request.reply({ ok: 1, n: doc.documents, lastOp: new Date() });
          }
        });

        // Attempt to connect
        var server = new Mongos([mongos1.address(), mongos2.address()], {
          connectionTimeout: 3000,
          socketTimeout: 5000,

          size: 1
        });

        // Add event listeners
        server.once('fullsetup', function () {
          var intervalId = setInterval(function () {
            server.insert('test.test', [{ created: new Date() }], function (err, r) {
              // If we have a successful insert
              // validate that it's the expected proxy
              if (r) {
                clearInterval(intervalId);
                expect(r.connection.port).to.equal(mongos2.address().port);

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

    test: function (done) {
      // Current index for the ismaster
      var currentStep = 0;

      // Default message fields
      var defaultFields = Object.assign({}, mock.DEFAULT_ISMASTER, {
        msg: 'isdbgrid'
      });

      // Primary server states
      var serverIsMaster = [Object.assign({}, defaultFields)];
      // Boot the mock
      co(function* () {
        const mongos1 = yield mock.createServer();
        const mongos2 = yield mock.createServer();

        mongos1.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster || doc.hello) {
            request.reply(serverIsMaster[0]);
          } else if (doc.insert && currentStep === 0) {
            setTimeout(() => request.connection.destroy(), 1600);
          } else if (doc.insert && currentStep === 1) {
            request.reply({ ok: 1, n: doc.documents, lastOp: new Date() });
          }
        });

        mongos2.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster || doc.hello) {
            request.reply(serverIsMaster[0]);
          } else if (doc.insert) {
            request.reply({ ok: 1, n: doc.documents, lastOp: new Date() });
          }
        });

        // Attempt to connect
        var server = new Mongos([mongos1.address(), mongos2.address()], {
          connectionTimeout: 3000,
          socketTimeout: 1500,

          size: 1
        });

        // Add event listeners
        server.once('fullsetup', function () {
          var intervalId = setInterval(function () {
            server.insert('test.test', [{ created: new Date() }], function (err, r) {
              // If we have a successful insert
              // validate that it's the expected proxy
              if (r) {
                clearInterval(intervalId);
                expect(r.connection.port).to.equal(mongos2.address().port);

                // Proxies seen
                var proxies = {};

                // Perform interval inserts waiting for both proxies to come back
                var intervalId2 = setInterval(function () {
                  // Bring back the missing proxy
                  if (currentStep === 0) currentStep = currentStep + 1;
                  // Perform inserts
                  server.insert('test.test', [{ created: new Date() }], function (_err, _r) {
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

    test: function (done) {
      // Current index for the ismaster
      var currentStep = 0;

      // Default message fields
      var defaultFields = Object.assign({}, mock.DEFAULT_ISMASTER, {
        msg: 'isdbgrid'
      });

      // Primary server states
      var serverIsMaster = [Object.assign({}, defaultFields)];
      // Boot the mock
      co(function* () {
        const mongos1 = yield mock.createServer();
        const mongos2 = yield mock.createServer();

        mongos1.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster || doc.hello) {
            request.reply(serverIsMaster[0]);
          } else if (doc.insert && currentStep === 0) {
            setTimeout(() => request.connection.destroy(), 1600);
          } else if (doc.insert && currentStep === 1) {
            request.reply({ ok: 1, n: doc.documents, lastOp: new Date() });
          }
        });

        mongos2.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster || doc.hello) {
            request.reply(serverIsMaster[0]);
          } else if (doc.insert && currentStep === 0) {
            setTimeout(() => request.connection.destroy(), 1600);
          } else if (doc.insert && currentStep === 1) {
            request.reply({ ok: 1, n: doc.documents, lastOp: new Date() });
          }
        });

        // Attempt to connect
        var server = new Mongos([mongos1.address(), mongos2.address()], {
          connectionTimeout: 3000,
          socketTimeout: 500,

          size: 1
        });

        // Add event listeners
        server.once('fullsetup', function () {
          var intervalId = setInterval(function () {
            server.insert('test.test', [{ created: new Date() }], function () {
              if (intervalId === null) return;
              // Clear out the interval
              clearInterval(intervalId);
              intervalId = null;
              // Let the proxies come back
              if (currentStep === 0) currentStep = currentStep + 1;

              // Proxies seen
              var proxies = {};

              // Perform interval inserts waiting for both proxies to come back
              var intervalId2 = setInterval(function () {
                // Perform inserts
                server.insert('test.test', [{ created: new Date() }], function (_err, _r) {
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
