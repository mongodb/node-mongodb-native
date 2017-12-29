'use strict';
var expect = require('chai').expect,
  co = require('co'),
  mock = require('../../../mock');

describe.skip('Mongos SDAM Monitoring (mocks)', function() {
  it('SDAM Monitoring Should correctly connect to two proxies', {
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
      // Current index for the ismaster
      var currentStep = 0;

      // Default message fields
      var defaultFields = {
        ismaster: true,
        msg: 'isdbgrid',
        maxBsonObjectSize: 16777216,
        maxMessageSizeBytes: 48000000,
        maxWriteBatchSize: 1000,
        localTime: new Date(),
        maxWireVersion: 3,
        minWireVersion: 0,
        ok: 1
      };

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
      });

      // Attempt to connect
      var server = new Mongos([mongos1.address(), mongos2.address()], {
        connectionTimeout: 3000,
        socketTimeout: 1500,
        haInterval: 1000,
        size: 1
      });

      // Add event listeners
      server.once('fullsetup', function(_server) {
        var intervalId = setInterval(function() {
          server.insert('test.test', [{ created: new Date() }], function(err, r) {
            // If we have a successful insert
            // validate that it's the expected proxy
            if (r) {
              clearInterval(intervalId);
              expect(r.connection.port).to.equal(62001);

              // Proxies seen
              var proxies = {};

              // Perform interval inserts waiting for both proxies to come back
              var intervalId2 = setInterval(function() {
                // Bring back the missing proxy
                if (currentStep === 0) currentStep = currentStep + 1;
                // Perform inserts
                server.insert('test.test', [{ created: new Date() }], function(_err, _r) {
                  expect(_err).to.be.null;
                  if (_r) {
                    proxies[_r.connection.port] = true;
                  }

                  // Do we have both proxies answering
                  if (Object.keys(proxies).length === 2) {
                    clearInterval(intervalId2);
                    server.destroy();

                    mock.cleanup().then(() => {
                      setTimeout(function() {
                        var results = [
                          {
                            topologyId: _server.s.id,
                            previousDescription: {
                              topologyType: 'Sharded',
                              servers: []
                            },
                            newDescription: {
                              topologyType: 'Sharded',
                              servers: [
                                {
                                  type: 'Mongos',
                                  address: 'localhost:62000'
                                },
                                {
                                  type: 'Unknown',
                                  address: 'localhost:62001'
                                }
                              ]
                            }
                          },
                          {
                            topologyId: _server.s.id,
                            previousDescription: {
                              topologyType: 'Sharded',
                              servers: [
                                {
                                  type: 'Mongos',
                                  address: 'localhost:62000'
                                },
                                {
                                  type: 'Unknown',
                                  address: 'localhost:62001'
                                }
                              ]
                            },
                            newDescription: {
                              topologyType: 'Sharded',
                              servers: [
                                {
                                  type: 'Mongos',
                                  address: 'localhost:62000'
                                },
                                {
                                  type: 'Mongos',
                                  address: 'localhost:62001'
                                }
                              ]
                            }
                          }
                        ];

                        for (var i = 0; i < responses.topologyDescriptionChanged.length; i++) {
                          expect(results[i]).to.eql(responses.topologyDescriptionChanged[i]);
                        }

                        done();
                      }, 1000);
                    });
                  }
                });
              }, 500);
            }
          });
        }, 500);
      });

      var responses = {};
      var add = function(a) {
        if (!responses[a.type]) responses[a.type] = [];
        responses[a.type].push(a.event);
      };

      server.on('serverOpening', function(event) {
        add({ type: 'serverOpening', event: event });
      });

      server.on('serverClosed', function(event) {
        add({ type: 'serverClosed', event: event });
      });

      server.on('serverDescriptionChanged', function(event) {
        add({ type: 'serverDescriptionChanged', event: event });
      });

      server.on('topologyOpening', function(event) {
        add({ type: 'topologyOpening', event: event });
      });

      server.on('topologyClosed', function(event) {
        add({ type: 'topologyClosed', event: event });
      });

      server.on('topologyDescriptionChanged', function(event) {
        add({ type: 'topologyDescriptionChanged', event: event });
      });

      server.on('serverHeartbeatStarted', function(event) {
        add({ type: 'serverHeartbeatStarted', event: event });
      });

      server.on('serverHeartbeatSucceeded', function(event) {
        add({ type: 'serverHeartbeatSucceeded', event: event });
      });

      server.on('serverHeartbeatFailed', function(event) {
        add({ type: 'serverHeartbeatFailed', event: event });
      });

      server.on('error', done);
      setTimeout(function() {
        server.connect();
      }, 100);
    }
  });

  it('SDAM Monitoring Should correctly failover due to proxy going away causing timeout', {
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
      var defaultFields = {
        ismaster: true,
        msg: 'isdbgrid',
        maxBsonObjectSize: 16777216,
        maxMessageSizeBytes: 48000000,
        maxWriteBatchSize: 1000,
        localTime: new Date(),
        maxWireVersion: 3,
        minWireVersion: 0,
        ok: 1
      };

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
            mongos1.destroy();
            request.reply({ ok: 1, n: doc.documents, lastOp: new Date() });
            return;
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
      });

      // Attempt to connect
      var server = new Mongos([mongos1.address(), mongos2.address()], {
        connectionTimeout: 3000,
        socketTimeout: 5000,
        haInterval: 1000,
        size: 1
      });

      // Add event listeners
      server.once('fullsetup', function(_server) {
        var intervalId = setInterval(function() {
          server.insert('test.test', [{ created: new Date() }], function(err, r) {
            // If we have a successful insert
            // validate that it's the expected proxy
            if (r) {
              clearInterval(intervalId);
              // Wait to allow at least one heartbeat to pass
              setTimeout(function() {
                expect(r.connection.port).to.equal(62003);
                server.destroy();

                mock.cleanup().then(() => {
                  // Wait for a little bit to let all events fire
                  setTimeout(function() {
                    expect(responses.serverOpening.length).to.be.at.least(2);
                    expect(responses.serverClosed.length).to.be.at.least(2);
                    expect(responses.topologyOpening).to.have.length(1);
                    expect(responses.topologyClosed).to.have.length(1);
                    expect(responses.serverHeartbeatStarted.length).to.be.greaterThan(0);
                    expect(responses.serverHeartbeatSucceeded.length).to.be.greaterThan(0);
                    expect(responses.serverDescriptionChanged.length).to.be.greaterThan(0);
                    expect(responses.topologyDescriptionChanged).to.have.length(2);

                    var results = [
                      {
                        topologyId: _server.s.id,
                        previousDescription: {
                          topologyType: 'Sharded',
                          servers: []
                        },
                        newDescription: {
                          topologyType: 'Sharded',
                          servers: [
                            {
                              type: 'Mongos',
                              address: 'localhost:62002'
                            },
                            {
                              type: 'Unknown',
                              address: 'localhost:62003'
                            }
                          ]
                        }
                      },
                      {
                        topologyId: _server.s.id,
                        previousDescription: {
                          topologyType: 'Sharded',
                          servers: [
                            {
                              type: 'Mongos',
                              address: 'localhost:62002'
                            },
                            {
                              type: 'Unknown',
                              address: 'localhost:62003'
                            }
                          ]
                        },
                        newDescription: {
                          topologyType: 'Sharded',
                          servers: [
                            {
                              type: 'Mongos',
                              address: 'localhost:62002'
                            },
                            {
                              type: 'Mongos',
                              address: 'localhost:62003'
                            }
                          ]
                        }
                      }
                    ];

                    expect(results).to.eql(responses.topologyDescriptionChanged);
                    done();
                  }, 100);
                });
              });
            }
          });
        }, 500);
      });

      var responses = {};
      var add = function(a) {
        if (!responses[a.type]) responses[a.type] = [];
        responses[a.type].push(a.event);
      };

      server.on('serverOpening', function(event) {
        add({ type: 'serverOpening', event: event });
      });

      server.on('serverClosed', function(event) {
        add({ type: 'serverClosed', event: event });
      });

      server.on('serverDescriptionChanged', function(event) {
        add({ type: 'serverDescriptionChanged', event: event });
      });

      server.on('topologyOpening', function(event) {
        add({ type: 'topologyOpening', event: event });
      });

      server.on('topologyClosed', function(event) {
        add({ type: 'topologyClosed', event: event });
      });

      server.on('topologyDescriptionChanged', function(event) {
        add({ type: 'topologyDescriptionChanged', event: event });
      });

      server.on('serverHeartbeatStarted', function(event) {
        add({ type: 'serverHeartbeatStarted', event: event });
      });

      server.on('serverHeartbeatSucceeded', function(event) {
        add({ type: 'serverHeartbeatSucceeded', event: event });
      });

      server.on('serverHeartbeatFailed', function(event) {
        add({ type: 'serverHeartbeatFailed', event: event });
      });

      server.on('error', done);
      server.connect();
    }
  });

  it('SDAM Monitoring Should correctly bring back proxy and use it', {
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
      // Current index for the ismaster
      var currentStep = 0;

      // Default message fields
      var defaultFields = {
        ismaster: true,
        msg: 'isdbgrid',
        maxBsonObjectSize: 16777216,
        maxMessageSizeBytes: 48000000,
        maxWriteBatchSize: 1000,
        localTime: new Date(),
        maxWireVersion: 3,
        minWireVersion: 0,
        ok: 1
      };

      // Primary server states
      var serverIsMaster = [Object.assign({}, defaultFields)];
      // Boot the mock
      co(function*() {
        mongos1 = yield mock.createServer();
        mongos2 = yield mock.createServer();

        mongos1.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster && currentStep === 0) {
            request.reply(serverIsMaster[0]);
          } else if (doc.ismaster && currentStep === 1) {
            setTimeout(() => request.connection.destroy(), 1600);
          }
        });

        mongos2.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(serverIsMaster[0]);
          }
        });

        // Start dropping the packets
        setTimeout(function() {
          currentStep = 1;

          setTimeout(function() {
            currentStep = 0;

            setTimeout(function() {
              expect(responses.topologyDescriptionChanged.length).to.be.greaterThan(0);
              server.destroy();
              mock.cleanup().then(() => done());
            }, 2000);
          }, 2000);
        }, 2000);
      });

      // Attempt to connect
      var server = new Mongos([mongos1.address(), mongos2.address()], {
        connectionTimeout: 3000,
        socketTimeout: 1500,
        haInterval: 1000,
        size: 1
      });

      var responses = {};
      var add = function(a) {
        if (!responses[a.type]) responses[a.type] = [];
        responses[a.type].push(a.event);
      };

      server.on('serverOpening', function(event) {
        add({ type: 'serverOpening', event: event });
      });

      server.on('serverClosed', function(event) {
        add({ type: 'serverClosed', event: event });
      });

      server.on('serverDescriptionChanged', function(event) {
        add({ type: 'serverDescriptionChanged', event: event });
      });

      server.on('topologyOpening', function(event) {
        add({ type: 'topologyOpening', event: event });
      });

      server.on('topologyClosed', function(event) {
        add({ type: 'topologyClosed', event: event });
      });

      server.on('topologyDescriptionChanged', function(event) {
        add({ type: 'topologyDescriptionChanged', event: event });
      });

      server.on('serverHeartbeatStarted', function(event) {
        add({ type: 'serverHeartbeatStarted', event: event });
      });

      server.on('serverHeartbeatSucceeded', function(event) {
        add({ type: 'serverHeartbeatSucceeded', event: event });
      });

      server.on('serverHeartbeatFailed', function(event) {
        add({ type: 'serverHeartbeatFailed', event: event });
      });

      server.on('error', done);
      server.connect();
    }
  });
});
