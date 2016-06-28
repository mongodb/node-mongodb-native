"use strict";

// Extend the object
var extend = function(template, fields) {
  var object = {};
  for(var name in template) {
    object[name] = template[name];
  }

  for(var name in fields) {
   object[name] = fields[name];
  }

  return object;
}

exports['Successful emit SDAM monitoring events for replicaset'] = {
  metadata: {
    requires: {
      generators: true,
      topology: "single"
    }
  },

  test: function(configuration, test) {
    var ReplSet = configuration.require.ReplSet,
      ObjectId = configuration.require.BSON.ObjectId,
      ReadPreference = configuration.require.ReadPreference,
      Long = configuration.require.BSON.Long,
      co = require('co'),
      mockupdb = require('../../../mock');

    // Contain mock server
    var primaryServer = null;
    var firstSecondaryServer = null;
    var arbiterServer = null;
    var running = true;
    var electionIds = [new ObjectId(), new ObjectId()];

    // Default message fields
    var defaultFields = {
      "setName": "rs", "setVersion": 1, "electionId": electionIds[0],
      "maxBsonObjectSize" : 16777216, "maxMessageSizeBytes" : 48000000,
      "maxWriteBatchSize" : 1000, "localTime" : new Date(), "maxWireVersion" : 4,
      "minWireVersion" : 0, "ok" : 1, "hosts": ["localhost:32000", "localhost:32001"], "arbiters": ["localhost:32002"]
    }

    // Primary server states
    var primary = [extend(defaultFields, {
      "ismaster":true, "secondary":false, "me": "localhost:32000", "primary": "localhost:32000", "tags" : { "loc" : "ny" }
    }), extend(defaultFields, {
      "ismaster":false, "secondary":true, "me": "localhost:32000", "primary": "localhost:32000", "tags" : { "loc" : "ny" }
    }), extend(defaultFields, {
      "ismaster":false, "secondary":true, "me": "localhost:32000", "primary": "localhost:32001", "tags" : { "loc" : "ny" }
    })];

    // Primary server states
    var firstSecondary = [extend(defaultFields, {
      "ismaster":false, "secondary":true, "me": "localhost:32001", "primary": "localhost:32000", "tags" : { "loc" : "sf" }
    }), extend(defaultFields, {
      "ismaster":false, "secondary":true, "me": "localhost:32001", "primary": "localhost:32000", "tags" : { "loc" : "sf" }
    }), extend(defaultFields, {
      "ismaster":true, "secondary":false, "me": "localhost:32001", "primary": "localhost:32001", "tags" : { "loc" : "sf" }
    })];

    // Primary server states
    var arbiter = [extend(defaultFields, {
      "ismaster":false, "secondary":false, "arbiterOnly": true, "me": "localhost:32002", "primary": "localhost:32000"
    }), extend(defaultFields, {
      "ismaster":false, "secondary":false, "arbiterOnly": true, "me": "localhost:32002", "primary": "localhost:32000"
    }), extend(defaultFields, {
      "ismaster":false, "secondary":false, "arbiterOnly": true, "me": "localhost:32002", "primary": "localhost:32001"
    })];

    // Boot the mock
    co(function*() {
      primaryServer = yield mockupdb.createServer(32000, 'localhost');
      firstSecondaryServer = yield mockupdb.createServer(32001, 'localhost');
      arbiterServer = yield mockupdb.createServer(32002, 'localhost');

      // Primary state machine
      co(function*() {
        while(running) {
          var request = yield primaryServer.receive();
          var doc = request.document;

          if(doc.ismaster) {
            request.reply(primary[step]);
          }
        }
      }).catch(function(err) {
        console.log(err.stack);
      });

      // First secondary state machine
      co(function*() {
        while(running) {
          var request = yield firstSecondaryServer.receive();
          var doc = request.document;

          if(doc.ismaster) {
            request.reply(firstSecondary[step]);
          }
        }
      }).catch(function(err) {
        console.log(err.stack);
      });

      // Second secondary state machine
      co(function*() {
        while(running) {
          var request = yield arbiterServer.receive();
          var doc = request.document;

          if(doc.ismaster) {
            request.reply(arbiter[step]);
          }
        }
      }).catch(function(err) {
        console.log(err.stack);
      });
    });

    // Attempt to connect
    var server = new ReplSet([
      { host: 'localhost', port: 32000 },
      { host: 'localhost', port: 32001 },
      { host: 'localhost', port: 32002 }], {
        setName: 'rs',
        connectionTimeout: 3000,
        socketTimeout: 0,
        haInterval: 2000,
        size: 1
    });

    var responses = {};
    var step = 0;
    var add = function(a) {
      if(!responses[a.type]) responses[a.type] = [];
      responses[a.type].push(a.event);
    }

    server.on('serverOpening', function(event) {
      add({type: 'serverOpening', event: event});
      // console.log("----------------------------- serverOpening")
      // console.log(JSON.stringify(event, null, 2))
      // flags[0] = event;
    });

    server.on('serverClosed', function(event) {
      add({type: 'serverClosed', event: event});
      // console.log("----------------------------- serverClosed")
      // console.log(JSON.stringify(event, null, 2))
      // flags[1] = event;
    });

    server.on('serverDescriptionChanged', function(event) {
      add({type: 'serverDescriptionChanged', event: event});
      // console.log("----------------------------- serverDescriptionChanged")
      // console.log(JSON.stringify(event, null, 2))
      // flags[2] = event;
    });

    server.on('topologyOpening', function(event) {
      add({type: 'topologyOpening', event: event});
      // console.log("----------------------------- topologyOpening")
      // console.log(JSON.stringify(event, null, 2))
      // flags[3] = event;
    });

    server.on('topologyClosed', function(event) {
      add({type: 'topologyClosed', event: event});
      // console.log("----------------------------- topologyClosed")
      // console.log(JSON.stringify(event, null, 2))
      // flags[4] = event;
    });

    server.on('topologyDescriptionChanged', function(event) {
      add({type: 'topologyDescriptionChanged', event: event});
      // console.log("----------------------------- topologyDescriptionChanged")
      // console.log(JSON.stringify(event, null, 2))
      // flags[5] = event;
    });

    server.on('serverHeartbeatStarted', function(event) {
      add({type: 'serverHeartbeatStarted', event: event});
      // console.log("----------------------------- serverHeartbeatStarted")
      // console.log(JSON.stringify(event, null, 2))
    });

    server.on('serverHeartbeatSucceeded', function(event) {
      add({type: 'serverHeartbeatSucceeded', event: event});
      // console.log("----------------------------- serverHeartbeatSucceeded")
      // console.log(JSON.stringify(event, null, 2))
    });

    server.on('serverHearbeatFailed', function(event) {
      add({type: 'serverHeartbeatFailed', event: event});
      // console.log("----------------------------- serverHearbeatFailed")
      // console.log(JSON.stringify(event, null, 2))
    });

    // Add event listeners
    server.on('fullsetup', function(_server) {
      setTimeout(function() {
        step = step + 1;

        setTimeout(function() {
          step = step + 1;

          setTimeout(function() {
            test.ok(responses['serverOpening'].length >= 3);
            _server.destroy();

            // Wait to ensure all events fired
            setTimeout(function() {
              test.ok(responses['serverOpening'].length >= 3);
              test.ok(responses['serverClosed'].length >= 3);
              test.ok(responses['topologyOpening'].length == 1);
              test.ok(responses['topologyClosed'].length == 1);
              test.ok(responses['serverHeartbeatStarted'].length > 0);
              test.ok(responses['serverHeartbeatSucceeded'].length > 0);
              test.ok(responses['serverDescriptionChanged'].length > 0);

              // console.log("---------------------------------------------------")
              // console.log(JSON.stringify(responses['topologyDescriptionChanged'], null, 2))

              for(var i = 0; i < expectedResults.length; i++) {
                // console.log("================= expectedResults :: " + i)
                try {
                  test.deepEqual(expectedResults[i], responses['topologyDescriptionChanged'][i]);
                } catch(e) {
                  console.log("----------------------------- expected ")
                  console.log(JSON.stringify(expectedResults[i], null, 2))
                  console.log("----------------------------- got ")
                  console.log(JSON.stringify(responses['topologyDescriptionChanged'][i], null, 2))
                  process.exit(0)
                }
              }

              test.done();
            }, 1000);
          }, 2000);
        });
      }, 1000)
    });

    // Gives proxies a chance to boot up
    setTimeout(function() {
      server.connect();
    }, 100)

    var document1 = {
      "topologyId": server.id,
      "previousDescription": {
        "topologyType": "Unknown",
        "servers": []
      },
      "newDescription": {
        "topologyType": "Unknown",
        "setName": "rs",
        "servers": [
          {
            "type": "RSPrimary",
            "address": "localhost:32000",
            "hosts": [
              "localhost:32000",
              "localhost:32001"
            ],
            "arbiters": [
              "localhost:32002"
            ],
            "setName": "rs"
          }
        ]
      },
      "diff": {
        "servers": []
      }
    };

    var document2 = {
      "topologyId": server.id,
      "previousDescription": {
        "topologyType": "Unknown",
        "setName": "rs",
        "servers": [
          {
            "type": "RSPrimary",
            "address": "localhost:32000",
            "hosts": [
              "localhost:32000",
              "localhost:32001"
            ],
            "arbiters": [
              "localhost:32002"
            ],
            "setName": "rs"
          }
        ]
      },
      "newDescription": {
        "topologyType": "ReplicaSetWithPrimary",
        "setName": "rs",
        "servers": [
          {
            "type": "RSPrimary",
            "address": "localhost:32000",
            "hosts": [
              "localhost:32000",
              "localhost:32001"
            ],
            "arbiters": [
              "localhost:32002"
            ],
            "setName": "rs"
          },
          {
            "type": "RSSecondary",
            "address": "localhost:32001",
            "hosts": [
              "localhost:32000",
              "localhost:32001"
            ],
            "arbiters": [
              "localhost:32002"
            ],
            "setName": "rs"
          }
        ]
      },
      "diff": {
        "servers": []
      }
    };

    var document3 = {
      "topologyId": server.id,
      "previousDescription": {
        "topologyType": "ReplicaSetWithPrimary",
        "setName": "rs",
        "servers": [
          {
            "type": "RSPrimary",
            "address": "localhost:32000",
            "hosts": [
              "localhost:32000",
              "localhost:32001"
            ],
            "arbiters": [
              "localhost:32002"
            ],
            "setName": "rs"
          },
          {
            "type": "RSSecondary",
            "address": "localhost:32001",
            "hosts": [
              "localhost:32000",
              "localhost:32001"
            ],
            "arbiters": [
              "localhost:32002"
            ],
            "setName": "rs"
          }
        ]
      },
      "newDescription": {
        "topologyType": "ReplicaSetWithPrimary",
        "setName": "rs",
        "servers": [
          {
            "type": "RSPrimary",
            "address": "localhost:32000",
            "hosts": [
              "localhost:32000",
              "localhost:32001"
            ],
            "arbiters": [
              "localhost:32002"
            ],
            "setName": "rs"
          },
          {
            "type": "RSSecondary",
            "address": "localhost:32001",
            "hosts": [
              "localhost:32000",
              "localhost:32001"
            ],
            "arbiters": [
              "localhost:32002"
            ],
            "setName": "rs"
          },
          {
            "type": "RSArbiter",
            "address": "localhost:32002",
            "hosts": [
              "localhost:32000",
              "localhost:32001"
            ],
            "arbiters": [
              "localhost:32002"
            ],
            "setName": "rs"
          }
        ]
      },
      "diff": {
        "servers": []
      }
    };

    var document4 = {
      "topologyId": server.id,
      "previousDescription": {
        "topologyType": "ReplicaSetWithPrimary",
        "setName": "rs",
        "servers": [
          {
            "type": "RSPrimary",
            "address": "localhost:32000",
            "hosts": [
              "localhost:32000",
              "localhost:32001"
            ],
            "arbiters": [
              "localhost:32002"
            ],
            "setName": "rs"
          },
          {
            "type": "RSSecondary",
            "address": "localhost:32001",
            "hosts": [
              "localhost:32000",
              "localhost:32001"
            ],
            "arbiters": [
              "localhost:32002"
            ],
            "setName": "rs"
          },
          {
            "type": "RSArbiter",
            "address": "localhost:32002",
            "hosts": [
              "localhost:32000",
              "localhost:32001"
            ],
            "arbiters": [
              "localhost:32002"
            ],
            "setName": "rs"
          }
        ]
      },
      "newDescription": {
        "topologyType": "ReplicaSetNoPrimary",
        "setName": "rs",
        "servers": [
          {
            "type": "RSSecondary",
            "address": "localhost:32001",
            "hosts": [
              "localhost:32000",
              "localhost:32001"
            ],
            "arbiters": [
              "localhost:32002"
            ],
            "setName": "rs"
          },
          {
            "type": "RSSecondary",
            "address": "localhost:32000",
            "hosts": [
              "localhost:32000",
              "localhost:32001"
            ],
            "arbiters": [
              "localhost:32002"
            ],
            "setName": "rs"
          },
          {
            "type": "RSArbiter",
            "address": "localhost:32002",
            "hosts": [
              "localhost:32000",
              "localhost:32001"
            ],
            "arbiters": [
              "localhost:32002"
            ],
            "setName": "rs"
          }
        ]
      },
      "diff": {
        "servers": [
          {
            "address": "localhost:32000",
            "from": "RSPrimary",
            "to": "RSSecondary"
          }
        ]
      }
    };

    var document5 = {
      "topologyId": server.id,
      "previousDescription": {
        "topologyType": "ReplicaSetNoPrimary",
        "setName": "rs",
        "servers": [
          {
            "type": "RSSecondary",
            "address": "localhost:32001",
            "hosts": [
              "localhost:32000",
              "localhost:32001"
            ],
            "arbiters": [
              "localhost:32002"
            ],
            "setName": "rs"
          },
          {
            "type": "RSSecondary",
            "address": "localhost:32000",
            "hosts": [
              "localhost:32000",
              "localhost:32001"
            ],
            "arbiters": [
              "localhost:32002"
            ],
            "setName": "rs"
          },
          {
            "type": "RSArbiter",
            "address": "localhost:32002",
            "hosts": [
              "localhost:32000",
              "localhost:32001"
            ],
            "arbiters": [
              "localhost:32002"
            ],
            "setName": "rs"
          }
        ]
      },
      "newDescription": {
        "topologyType": "ReplicaSetWithPrimary",
        "setName": "rs",
        "servers": [
          {
            "type": "RSPrimary",
            "address": "localhost:32001",
            "hosts": [
              "localhost:32000",
              "localhost:32001"
            ],
            "arbiters": [
              "localhost:32002"
            ],
            "setName": "rs"
          },
          {
            "type": "RSSecondary",
            "address": "localhost:32000",
            "hosts": [
              "localhost:32000",
              "localhost:32001"
            ],
            "arbiters": [
              "localhost:32002"
            ],
            "setName": "rs"
          },
          {
            "type": "RSArbiter",
            "address": "localhost:32002",
            "hosts": [
              "localhost:32000",
              "localhost:32001"
            ],
            "arbiters": [
              "localhost:32002"
            ],
            "setName": "rs"
          }
        ]
      },
      "diff": {
        "servers": [
          {
            "address": "localhost:32001",
            "from": "RSSecondary",
            "to": "RSPrimary"
          }
        ]
      }
    };

    var expectedResults = [document1, document2, document3, document4, document5];
  }
}
