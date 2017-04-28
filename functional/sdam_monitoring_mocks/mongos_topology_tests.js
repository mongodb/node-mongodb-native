var timeoutPromise = function(timeout) {
  return new Promise(function(resolve, reject) {
    setTimeout(function() {
      resolve();
    }, timeout);
  });
}

exports['SDAM Monitoring Should correctly connect to two proxies'] = {
  metadata: {
    requires: {
      generators: true,
      topology: "single"
    }
  },

  test: function(configuration, test) {
    var Mongos = configuration.require.Mongos,
      ObjectId = configuration.require.BSON.ObjectId,
      co = require('co'),
      mockupdb = require('../../../mock');

    // Contain mock server
    var mongos1 = null;
    var mongos2 = null;
    var running = true;
    // Current index for the ismaster
    var currentStep = 0;

    // Extend the object
    var extend = function(template, fields) {
      for(var name in template) fields[name] = template[name];
      return fields;
    }

    // Default message fields
    var defaultFields = {
      "ismaster" : true,
      "msg" : "isdbgrid",
      "maxBsonObjectSize" : 16777216,
      "maxMessageSizeBytes" : 48000000,
      "maxWriteBatchSize" : 1000,
      "localTime" : new Date(),
      "maxWireVersion" : 3,
      "minWireVersion" : 0,
      "ok" : 1
    }

    // Primary server states
    var serverIsMaster = [extend(defaultFields, {})];
    // Boot the mock
    co(function*() {
      mongos1 = yield mockupdb.createServer(62000, 'localhost');
      mongos2 = yield mockupdb.createServer(62001, 'localhost');

      // Mongos
      co(function*() {
        while(running) {
          var request = yield mongos1.receive();

          // Get the document
          var doc = request.document;
          if(doc.ismaster) {
            request.reply(serverIsMaster[0]);
          } else if(doc.insert && currentStep == 1) {
            request.reply({ok:1, n:doc.documents, lastOp: new Date()});
          }
        }
      });

      // Mongos
      co(function*() {
        while(running) {
          var request = yield mongos2.receive();

          // Get the document
          var doc = request.document;
          if(doc.ismaster) {
            request.reply(serverIsMaster[0]);
          } else if(doc.insert) {
            request.reply({ok:1, n:doc.documents, lastOp: new Date()});
          }
        }
      });
    });

    // Attempt to connect
    var server = new Mongos([
        { host: 'localhost', port: 62000 },
        { host: 'localhost', port: 62001 },
      ], {
      connectionTimeout: 3000,
      socketTimeout: 1500,
      haInterval: 1000,
      size: 1
    });

    // Add event listeners
    server.once('fullsetup', function(_server) {
      var intervalId = setInterval(function() {
        server.insert('test.test', [{created:new Date()}], function(err, r) {
          // If we have a successful insert
          // validate that it's the expected proxy
          if(r) {
            clearInterval(intervalId);
            test.equal(62001, r.connection.port);

            // Proxies seen
            var proxies = {};

            // Perform interval inserts waiting for both proxies to come back
            var intervalId2 = setInterval(function() {
              // Bring back the missing proxy
              if(currentStep == 0) currentStep = currentStep + 1;
              // Perform inserts
              server.insert('test.test', [{created:new Date()}], function(err, r) {
                if(r) {
                  proxies[r.connection.port] = true
                }

                // Do we have both proxies answering
                if(Object.keys(proxies).length == 2) {
                  clearInterval(intervalId2);
                  server.destroy();
                  mongos1.destroy();
                  mongos2.destroy();

                  setTimeout(function() {
                    var results = [{
                      "topologyId": _server.s.id,
                      "previousDescription": {
                        "topologyType": "Sharded",
                        "servers": []
                      },
                      "newDescription": {
                        "topologyType": "Sharded",
                        "servers": [
                          {
                            "type": "Mongos",
                            "address": "localhost:62000"
                          },
                          {
                            "type": "Unknown",
                            "address": "localhost:62001"
                          }
                        ]
                      }
                    },
                    {
                      "topologyId": _server.s.id,
                      "previousDescription": {
                        "topologyType": "Sharded",
                        "servers": [
                          {
                            "type": "Mongos",
                            "address": "localhost:62000"
                          },
                          {
                            "type": "Unknown",
                            "address": "localhost:62001"
                          }
                        ]
                      },
                      "newDescription": {
                        "topologyType": "Sharded",
                        "servers": [
                          {
                            "type": "Mongos",
                            "address": "localhost:62000"
                          },
                          {
                            "type": "Mongos",
                            "address": "localhost:62001"
                          }
                        ]
                      }
                    }]

                    for(var i = 0; i < responses['topologyDescriptionChanged'].length; i++) {
                      test.deepEqual(results[i], responses['topologyDescriptionChanged'][i]);
                    }

                    running = false;
                    test.done();
                  }, 1000);
                }
              });
            }, 500);
          }
        })
      }, 500);
    });

    var responses = {};
    var add = function(a) {
      if(!responses[a.type]) responses[a.type] = [];
      responses[a.type].push(a.event);
    }

    server.on('serverOpening', function(event) {
      add({type: 'serverOpening', event: event});
    });

    server.on('serverClosed', function(event) {
      add({type: 'serverClosed', event: event});
    });

    server.on('serverDescriptionChanged', function(event) {
      add({type: 'serverDescriptionChanged', event: event});
    });

    server.on('topologyOpening', function(event) {
      add({type: 'topologyOpening', event: event});
    });

    server.on('topologyClosed', function(event) {
      add({type: 'topologyClosed', event: event});
    });

    server.on('topologyDescriptionChanged', function(event) {
      add({type: 'topologyDescriptionChanged', event: event});
    });

    server.on('serverHeartbeatStarted', function(event) {
      add({type: 'serverHeartbeatStarted', event: event});
    });

    server.on('serverHeartbeatSucceeded', function(event) {
      add({type: 'serverHeartbeatSucceeded', event: event});
    });

    server.on('serverHeartbeatFailed', function(event) {
      add({type: 'serverHeartbeatFailed', event: event});
    });

    server.on('error', function(){});
    server.connect();
  }
}

exports['SDAM Monitoring Should correctly failover due to proxy going away causing timeout'] = {
  metadata: {
    requires: {
      generators: true,
      topology: "single"
    }
  },

  test: function(configuration, test) {
    var Mongos = configuration.require.Mongos,
      ObjectId = configuration.require.BSON.ObjectId,
      co = require('co'),
      mockupdb = require('../../../mock');

    // Contain mock server
    var mongos1 = null;
    var mongos2 = null;
    var running = true;
    // Current index for the ismaster
    var currentStep = 0;
    // Primary stop responding
    var stopRespondingPrimary = false;

    // Extend the object
    var extend = function(template, fields) {
      for(var name in template) fields[name] = template[name];
      return fields;
    }

    // Default message fields
    var defaultFields = {
      "ismaster" : true,
      "msg" : "isdbgrid",
      "maxBsonObjectSize" : 16777216,
      "maxMessageSizeBytes" : 48000000,
      "maxWriteBatchSize" : 1000,
      "localTime" : new Date(),
      "maxWireVersion" : 3,
      "minWireVersion" : 0,
      "ok" : 1
    }

    // Primary server states
    var serverIsMaster = [extend(defaultFields, {})];
    // Boot the mock
    co(function*() {
      mongos1 = yield mockupdb.createServer(62002, 'localhost');
      mongos2 = yield mockupdb.createServer(62003, 'localhost');

      // Mongos
      co(function*() {
        while(running) {
          var request = yield mongos1.receive();

          // Get the document
          var doc = request.document;
          if(doc.ismaster) {
            request.reply(serverIsMaster[0]);
          } else if(doc.insert) {
            return mongos1.destroy();
            request.reply({ok:1, n:doc.documents, lastOp: new Date()});
          }
        }
      });

      // Mongos
      co(function*() {
        while(running) {
          var request = yield mongos2.receive();

          // Get the document
          var doc = request.document;
          if(doc.ismaster) {
            request.reply(serverIsMaster[0]);
          } else if(doc.insert) {
            request.reply({ok:1, n:doc.documents, lastOp: new Date()});
          }
        }
      });

      // Start dropping the packets
      setTimeout(function() {
        stopRespondingPrimary = true;
        currentIsMasterState = 1;
      }, 5000);
    });

    // Attempt to connect
    var server = new Mongos([
        { host: 'localhost', port: 62002 },
        { host: 'localhost', port: 62003 },
      ], {
      connectionTimeout: 3000,
      socketTimeout: 5000,
      haInterval: 1000,
      size: 1
    });

    // Add event listeners
    server.once('fullsetup', function(_server) {
      var intervalId = setInterval(function() {
        server.insert('test.test', [{created:new Date()}], function(err, r) {
          // If we have a successful insert
          // validate that it's the expected proxy
          if(r) {
            clearInterval(intervalId);
            // Wait to allow at least one heartbeat to pass
            setTimeout(function() {
              test.equal(62003, r.connection.port);
              server.destroy();
              mongos1.destroy();
              mongos2.destroy();

              // Wait for a little bit to let all events fire
              setTimeout(function() {
                test.ok(responses['serverOpening'].length >= 2);
                test.ok(responses['serverClosed'].length >= 2);
                test.equal(1, responses['topologyOpening'].length);
                test.equal(1, responses['topologyClosed'].length);
                test.ok(responses['serverHeartbeatStarted'].length > 0);
                test.ok(responses['serverHeartbeatSucceeded'].length > 0);
                test.ok(responses['serverDescriptionChanged'].length > 0);
                test.equal(2, responses['topologyDescriptionChanged'].length);

                var results = [{
                  "topologyId": _server.s.id,
                  "previousDescription": {
                    "topologyType": "Sharded",
                    "servers": []
                  },
                  "newDescription": {
                    "topologyType": "Sharded",
                    "servers": [
                      {
                        "type": "Mongos",
                        "address": "localhost:62002"
                      },
                      {
                        "type": "Unknown",
                        "address": "localhost:62003"
                      }
                    ]
                  }
                },
                {
                  "topologyId": _server.s.id,
                  "previousDescription": {
                    "topologyType": "Sharded",
                    "servers": [
                      {
                        "type": "Mongos",
                        "address": "localhost:62002"
                      },
                      {
                        "type": "Unknown",
                        "address": "localhost:62003"
                      }
                    ]
                  },
                  "newDescription": {
                    "topologyType": "Sharded",
                    "servers": [
                      {
                        "type": "Mongos",
                        "address": "localhost:62002"
                      },
                      {
                        "type": "Mongos",
                        "address": "localhost:62003"
                      }
                    ]
                  }
                }];

                test.deepEqual(results, responses['topologyDescriptionChanged']);
                running = false;
                test.done();
              }, 100)
            }, 1100)
          }
        })
      }, 500);
    });

    var responses = {};
    var add = function(a) {
      if(!responses[a.type]) responses[a.type] = [];
      responses[a.type].push(a.event);
    }

    server.on('serverOpening', function(event) {
      add({type: 'serverOpening', event: event});
    });

    server.on('serverClosed', function(event) {
      add({type: 'serverClosed', event: event});
    });

    server.on('serverDescriptionChanged', function(event) {
      add({type: 'serverDescriptionChanged', event: event});
    });

    server.on('topologyOpening', function(event) {
      add({type: 'topologyOpening', event: event});
    });

    server.on('topologyClosed', function(event) {
      add({type: 'topologyClosed', event: event});
    });

    server.on('topologyDescriptionChanged', function(event) {
      add({type: 'topologyDescriptionChanged', event: event});
    });

    server.on('serverHeartbeatStarted', function(event) {
      add({type: 'serverHeartbeatStarted', event: event});
    });

    server.on('serverHeartbeatSucceeded', function(event) {
      add({type: 'serverHeartbeatSucceeded', event: event});
    });

    server.on('serverHeartbeatFailed', function(event) {
      add({type: 'serverHeartbeatFailed', event: event});
    });

    server.on('error', function(){});
    server.connect();
  }
}

exports['SDAM Monitoring Should correctly bring back proxy and use it'] = {
  metadata: {
    requires: {
      generators: true,
      topology: "single"
    }
  },

  test: function(configuration, test) {
    var Mongos = configuration.require.Mongos,
      ObjectId = configuration.require.BSON.ObjectId,
      co = require('co'),
      mockupdb = require('../../../mock');

    // Contain mock server
    var mongos1 = null;
    var mongos2 = null;
    var running = true;
    // Current index for the ismaster
    var currentStep = 0;
    // Primary stop responding
    var stopRespondingPrimary = false;

    // Extend the object
    var extend = function(template, fields) {
      for(var name in template) fields[name] = template[name];
      return fields;
    }

    // Default message fields
    var defaultFields = {
      "ismaster" : true,
      "msg" : "isdbgrid",
      "maxBsonObjectSize" : 16777216,
      "maxMessageSizeBytes" : 48000000,
      "maxWriteBatchSize" : 1000,
      "localTime" : new Date(),
      "maxWireVersion" : 3,
      "minWireVersion" : 0,
      "ok" : 1
    }

    // Primary server states
    var serverIsMaster = [extend(defaultFields, {})];
    // Boot the mock
    co(function*() {
      mongos1 = yield mockupdb.createServer(62004, 'localhost');
      mongos2 = yield mockupdb.createServer(62005, 'localhost');

      // Mongos
      co(function*() {
        while(running) {
          var request = yield mongos1.receive();

          // Get the document
          var doc = request.document;
          if(doc.ismaster && currentStep == 0) {
            request.reply(serverIsMaster[0]);
          } else if(doc.ismaster && currentStep == 1) {
            yield timeoutPromise(1600);
            request.connection.destroy();
          }
        }
      });

      // Mongos
      co(function*() {
        while(running) {
          var request = yield mongos2.receive();

          // Get the document
          var doc = request.document;
          if(doc.ismaster) {
            request.reply(serverIsMaster[0]);
          }
        }
      });

      // Start dropping the packets
      setTimeout(function() {
        currentStep = 1

        setTimeout(function() {
          currentStep = 0

          setTimeout(function() {
            test.ok(responses['topologyDescriptionChanged'].length > 0)
            server.destroy();
            mongos1.destroy();
            mongos2.destroy();
            test.done();
          }, 2000);
        }, 2000);
      }, 2000);
    });

    // Attempt to connect
    var server = new Mongos([
        { host: 'localhost', port: 62004 },
        { host: 'localhost', port: 62005 },
      ], {
      connectionTimeout: 3000,
      socketTimeout: 1500,
      haInterval: 1000,
      size: 1
    });

    // Add event listeners
    server.once('fullsetup', function(_server) {});

    var responses = {};
    var add = function(a) {
      if(!responses[a.type]) responses[a.type] = [];
      responses[a.type].push(a.event);
    }

    server.on('serverOpening', function(event) {
      add({type: 'serverOpening', event: event});
    });

    server.on('serverClosed', function(event) {
      add({type: 'serverClosed', event: event});
    });

    server.on('serverDescriptionChanged', function(event) {
      add({type: 'serverDescriptionChanged', event: event});
    });

    server.on('topologyOpening', function(event) {
      add({type: 'topologyOpening', event: event});
    });

    server.on('topologyClosed', function(event) {
      add({type: 'topologyClosed', event: event});
    });

    server.on('topologyDescriptionChanged', function(event) {
      add({type: 'topologyDescriptionChanged', event: event});
    });

    server.on('serverHeartbeatStarted', function(event) {
      add({type: 'serverHeartbeatStarted', event: event});
    });

    server.on('serverHeartbeatSucceeded', function(event) {
      add({type: 'serverHeartbeatSucceeded', event: event});
    });

    server.on('serverHeartbeatFailed', function(event) {
      add({type: 'serverHeartbeatFailed', event: event});
    });

    server.on('error', function(){});
    server.connect();
  }
}
