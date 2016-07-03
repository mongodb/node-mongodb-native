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

exports['Successfully failover to new primary'] = {
  metadata: {
    requires: {
      generators: true,
      topology: "single"
    }
  },

  test: function(configuration, test) {
    var ReplSet = configuration.require.ReplSet,
      Server = configuration.require.Server,
      ObjectId = configuration.require.BSON.ObjectId,
      Connection = require('../../../../lib/connection/connection'),
      ReadPreference = configuration.require.ReadPreference,
      Long = configuration.require.BSON.Long,
      co = require('co'),
      mockupdb = require('../../../mock');

    // Contain mock server
    var primaryServer = null;
    var firstSecondaryServer = null;
    var secondSecondaryServer = null;
    var arbiterServer = null;
    var running = true;
    var currentIsMasterIndex = 0;

    // Election Ids
    var electionIds = [new ObjectId(0), new ObjectId(1)]
    // Default message fields
    var defaultFields = {
      "setName": "rs", "setVersion": 1, "electionId": electionIds[0],
      "maxBsonObjectSize" : 16777216, "maxMessageSizeBytes" : 48000000,
      "maxWriteBatchSize" : 1000, "localTime" : new Date(), "maxWireVersion" : 4,
      "minWireVersion" : 0, "ok" : 1, "hosts": ["localhost:32000", "localhost:32001", "localhost:32002"], "arbiters": ["localhost:32002"]
    }

    // Primary server states
    var primary = [extend(defaultFields, {
      "ismaster":true, "secondary":false, "me": "localhost:32000", "primary": "localhost:32000", "tags" : { "loc" : "ny" }
    }), extend(defaultFields, {
      "ismaster":false, "secondary":true, "me": "localhost:32000", "primary": "localhost:32000", "tags" : { "loc" : "ny" }
    }), extend(defaultFields, {
      "ismaster":false, "secondary":true, "me": "localhost:32000", "primary": "localhost:32001", "tags" : { "loc" : "ny" },
      "electionId": electionIds[1]
    })];

    // Primary server states
    var firstSecondary = [extend(defaultFields, {
      "ismaster":false, "secondary":true, "me": "localhost:32001", "primary": "localhost:32000", "tags" : { "loc" : "sf" }
    }), extend(defaultFields, {
      "ismaster":false, "secondary":true, "me": "localhost:32001", "primary": "localhost:32000", "tags" : { "loc" : "sf" }
    }), extend(defaultFields, {
      "ismaster":true, "secondary":false, "me": "localhost:32001", "primary": "localhost:32001", "tags" : { "loc" : "ny" },
      "electionId": electionIds[1]
    })];

    // Primary server states
    var secondSecondary = [extend(defaultFields, {
      "ismaster":false, "secondary":true, "me": "localhost:32002", "primary": "localhost:32000", "tags" : { "loc" : "sf" }
    }), extend(defaultFields, {
      "ismaster":false, "secondary":true, "me": "localhost:32002", "primary": "localhost:32000", "tags" : { "loc" : "sf" }
    }), extend(defaultFields, {
      "ismaster":false, "secondary":true, "me": "localhost:32002", "primary": "localhost:32001", "tags" : { "loc" : "ny" },
      "electionId": electionIds[1]
    })];

    // Die
    var die = false;

    // Boot the mock
    co(function*() {
      primaryServer = yield mockupdb.createServer(32000, 'localhost');
      firstSecondaryServer = yield mockupdb.createServer(32001, 'localhost');
      secondSecondaryServer = yield mockupdb.createServer(32002, 'localhost');

      // Primary state machine
      co(function*() {
        while(running) {
          var request = yield primaryServer.receive();
          var doc = request.document;

          if(die) {
            request.connection.destroy();
          } else {
            if(doc.ismaster) {
              request.reply(primary[currentIsMasterIndex]);
            }
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

          if(die) {
            request.connection.destroy();
          } else {
            if(doc.ismaster) {
              request.reply(firstSecondary[currentIsMasterIndex]);
            }
          }
        }
      }).catch(function(err) {
        console.log(err.stack);
      });

      // Second secondary state machine
      co(function*() {
        while(running) {
          var request = yield secondSecondaryServer.receive();
          var doc = request.document;

          if(die) {
            request.connection.destroy();
          } else {
            if(doc.ismaster) {
              request.reply(secondSecondary[currentIsMasterIndex]);
            }
          }
        }
      }).catch(function(err) {
        console.log(err.stack);
      });
    });

    Connection.enableConnectionAccounting();
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

    Server.enableServerAccounting();

    server.on('connect', function(e) {
      server.__connected = true;
      // console.log("========================================== 0")

      // Perform the two steps
      setTimeout(function() {
        // console.log("========================================== 1")
        die = true;
        currentIsMasterIndex = currentIsMasterIndex + 1;

        // Keep the count of joined events
        var joinedEvents = 0;

        // Add listener
        server.on('joined', function(_type, _server) {
          // console.log("--------- joined :: " + _type + " :: " + _server.name)
          //   console.log(server.s.replState.primary != null)
          //   console.log(server.s.replState.secondaries.length)
          //   console.log(server.s.replState.arbiters.length)
          //   console.log(server.s.replState.passives.length)

          if(_type == 'secondary' && _server.name == 'localhost:32000') {
            joinedEvents = joinedEvents + 1;
          } else if(_type == 'primary' && _server.name == 'localhost:32001') {
            joinedEvents = joinedEvents + 1;
          } else if(_type == 'secondary' && _server.name == 'localhost:32002') {
            joinedEvents = joinedEvents + 1;
          }

          // Got both events
          if(joinedEvents == 3) {
            // test.equal(true, server.__connected);

            // console.log("--------------------------------- state")
            // console.log(server.s.replicaSetState.primary != null)
            // console.log(server.s.replicaSetState.secondaries.length)
            // console.log(server.s.replicaSetState.arbiters.length)
            // console.log(server.s.replicaSetState.passives.length)

            test.equal(2, server.s.replicaSetState.secondaries.length);
            test.ok(['localhost:32002', 'localhost:32000'].indexOf(server.s.replicaSetState.secondaries[0].name) != -1);
            test.ok(['localhost:32002', 'localhost:32000'].indexOf(server.s.replicaSetState.secondaries[1].name) != -1);

            test.ok(server.s.replicaSetState.primary != null);
            test.equal('localhost:32001', server.s.replicaSetState.primary.name);

            primaryServer.destroy();
            firstSecondaryServer.destroy();
            secondSecondaryServer.destroy();
            server.destroy();
            running = false;

            Server.disableServerAccounting();
            // console.log("======================================")
            // console.log(Object.keys(Server.servers()))

            setTimeout(function() {
              test.equal(0, Object.keys(Connection.connections()).length);
              Connection.disableConnectionAccounting();
              test.done();
            }, 1000);
          }
        });

        setTimeout(function() {
          // console.log("SWITCH VIEW 2")
          // console.log("SWITCH VIEW 2")
          // console.log("SWITCH VIEW 2")
          // global.debug = true;
          die = false;
          currentIsMasterIndex = currentIsMasterIndex + 1;
        }, 2500);
      }, 100);
    });

    server.on('error', function(){});
    // Gives proxies a chance to boot up
    setTimeout(function() {
      server.connect();
    }, 100)
  }
}
