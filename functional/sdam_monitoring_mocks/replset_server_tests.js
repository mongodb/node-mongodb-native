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
      "minWireVersion" : 0, "ok" : 1, "hosts": ["localhost:32000", "localhost:32001", "localhost:32002"], "arbiters": ["localhost:32002"]
    }

    // Primary server states
    var primary = [extend(defaultFields, {
      "ismaster":true, "secondary":false, "me": "localhost:32000", "primary": "localhost:32000", "tags" : { "loc" : "ny" }
    })];

    // Primary server states
    var firstSecondary = [extend(defaultFields, {
      "ismaster":false, "secondary":true, "me": "localhost:32001", "primary": "localhost:32000", "tags" : { "loc" : "sf" }
    })];

    // Primary server states
    var arbiter = [extend(defaultFields, {
      "ismaster":false, "secondary":false, "arbiterOnly": true, "me": "localhost:32002", "primary": "localhost:32000"
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
            request.reply(primary[0]);
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
            request.reply(firstSecondary[0]);
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
            request.reply(arbiter[0]);
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

    server.on('connect', function(e) {
      server.__connected = true;
    });

    server.on('serverOpening', function(event) {
      // console.log("----------------------------- serverOpening")
      // console.log(JSON.stringify(event, null, 2))
      // flags[0] = event;
    });

    server.on('serverClosed', function(event) {
      // console.log("----------------------------- serverClosed")
      // console.log(JSON.stringify(event, null, 2))
      // flags[1] = event;
    });

    server.on('serverDescriptionChanged', function(event) {
      // console.log("----------------------------- serverDescriptionChanged")
      // console.log(JSON.stringify(event, null, 2))
      // flags[2] = event;
    });

    server.on('topologyOpening', function(event) {
      // console.log("----------------------------- topologyOpening")
      // console.log(JSON.stringify(event, null, 2))
      // flags[3] = event;
    });

    server.on('topologyClosed', function(event) {
      // console.log("----------------------------- topologyClosed")
      // console.log(JSON.stringify(event, null, 2))
      // flags[4] = event;
    });

    server.on('topologyDescriptionChanged', function(event) {
      console.log("----------------------------- topologyDescriptionChanged")
      console.log(JSON.stringify(event, null, 2))
      // flags[5] = event;
    });

    server.on('serverHeartbeatStarted', function(event) {
      // console.log("----------------------------- serverHeartbeatStarted")
      // console.log(JSON.stringify(event, null, 2))
    });

    server.on('serverHeartbeatSucceeded', function(event) {
      // console.log("----------------------------- serverHeartbeatSucceeded")
      // console.log(JSON.stringify(event, null, 2))
    });

    server.on('serverHearbeatFailed', function(event) {
      // console.log("----------------------------- serverHearbeatFailed")
      // console.log(JSON.stringify(event, null, 2))
    });

    // Add event listeners
    server.on('fullsetup', function(_server) {});
    // Gives proxies a chance to boot up
    setTimeout(function() {
      server.connect();
    }, 100)
  }
}
