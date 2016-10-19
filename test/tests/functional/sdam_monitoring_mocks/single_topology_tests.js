exports['Should correctly emit sdam monitoring events for single server'] = {
  metadata: {
    requires: {
      generators: true,
      topology: "single"
    }
  },

  test: function(configuration, test) {
    var Server = configuration.require.Server,
      ObjectId = configuration.require.BSON.ObjectId,
      co = require('co'),
      mockupdb = require('../../../mock');

    // Contain mock server
    var server = null;
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
    var timeoutPromise = function(timeout) {
      return new Promise(function(resolve, reject) {
        setTimeout(function() {
          resolve();
        }, timeout);
      });
    }

    // Boot the mock
    co(function*() {
      server = yield mockupdb.createServer(37018, 'localhost');

      // Primary state machine
      co(function*() {
        while(running) {
          var request = yield server.receive();

          // Get the document
          var doc = request.document;
          if(doc.ismaster) {
            request.reply(serverIsMaster[0]);
          }
        }
      });
    });

    // Attempt to connect
    var server = new Server({
      host: 'localhost',
      port: '37018',
      connectionTimeout: 3000,
      socketTimeout: 1000,
      size: 1
    });

    // Results
    var flags = [];
    var id = null;

    // Add event listeners
    server.once('connect', function(_server) {
      // console.log("----------------------------- connect")
      id = _server.id;
      _server.destroy({emitClose:true});
    });

    server.on('serverOpening', function(event) {
      // console.log("----------------------------- serverOpening")
      // console.log(JSON.stringify(event, null, 2))
      flags[0] = event;
    });

    server.on('serverClosed', function(event) {
      // console.log("----------------------------- serverClosed")
      // console.log(JSON.stringify(event, null, 2))
      flags[1] = event;
    });

    server.on('serverDescriptionChanged', function(event) {
      // console.log("----------------------------- serverDescriptionChanged")
      // console.log(JSON.stringify(event, null, 2))
      flags[2] = event;
    });

    server.on('topologyOpening', function(event) {
      // console.log("----------------------------- topologyOpening")
      // console.log(JSON.stringify(event, null, 2))
      flags[3] = event;
    });

    server.on('topologyClosed', function(event) {
      // console.log("----------------------------- topologyClosed")
      // console.log(JSON.stringify(event, null, 2))
      flags[4] = event;
    });

    server.on('topologyDescriptionChanged', function(event) {
      // console.log("----------------------------- topologyDescriptionChanged")
      // console.log(JSON.stringify(event, null, 2))
      flags[5] = event;
    });

    server.on('error', function(){});
    server.on('close', function(){
      setTimeout(function() {
        // console.log("----------------------------------------- 0")
        test.deepEqual({ topologyId: id, address: 'localhost:37018' }, flags[0]);
        // console.log("----------------------------------------- 1")
        test.deepEqual({ topologyId: id, address: 'localhost:37018' }, flags[1]);
        // console.log("----------------------------------------- 2")
        test.deepEqual({ "topologyId": id, "address": "localhost:37018",
          "previousDescription": {
            "address": "localhost:37018",
            "arbiters": [],
            "hosts": [],
            "passives": [],
            "type": "Unknown"
          },
          "newDescription": {
            "address": "localhost:37018",
            "arbiters": [],
            "hosts": [],
            "passives": [],
            "type": "Standalone"
          }
        }, flags[2]);
        // console.log("----------------------------------------- 3")
        // console.dir(flags[0])
        test.deepEqual({ topologyId: id }, flags[3]);
        // console.log("----------------------------------------- 4")
        test.deepEqual({ topologyId: id }, flags[4]);
        // console.log("----------------------------------------- 5")
        test.deepEqual({ "topologyId": id, "address": "localhost:37018",
          "previousDescription": {
            "topologyType": "Unknown",
            "servers": [
              {
                "address": "localhost:37018",
                "arbiters": [],
                "hosts": [],
                "passives": [],
                "type": "Unknown"
              }
            ]
          },
          "newDescription": {
            "topologyType": "Single",
            "servers": [
              {
                "address": "localhost:37018",
                "arbiters": [],
                "hosts": [],
                "passives": [],
                "type": "Standalone"
              }
            ]
          }
        }, flags[5]);
        // console.log("----------------------------------------- 6")
        test.done();
      }, 100);
    });
    server.connect();
  }
}
