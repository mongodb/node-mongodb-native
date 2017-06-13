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
      __server = yield mockupdb.createServer(37018, 'localhost');

      // Primary state machine
      co(function*() {
        while(running) {
          var request = yield __server.receive();

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
      // console.log("!!!!!!!!!!!!!!!!!!!!!!!!!! connect")
      id = _server.id;
      _server.destroy({emitClose:true});
    });

    server.on('serverOpening', function(event) {
      // console.log("------------- serverOpening")
      flags[0] = event;
    });

    server.on('serverClosed', function(event) {
      // console.log("------------- serverClosed")
      flags[1] = event;
    });

    server.on('serverDescriptionChanged', function(event) {
      // console.log("------------- serverDescriptionChanged")
      flags[2] = event;
    });

    server.on('topologyOpening', function(event) {
      // console.log("------------- topologyOpening")
      flags[3] = event;
    });

    server.on('topologyClosed', function(event) {
      // console.log("------------- topologyClosed")
      flags[4] = event;
    });

    server.on('topologyDescriptionChanged', function(event) {
      // console.log("------------- topologyDescriptionChanged")
      flags[5] = event;
    });

    server.on('error', function(){});
    server.on('close', function(){
      setTimeout(function() {
        test.deepEqual({ topologyId: id, address: 'localhost:37018' }, flags[0]);
        test.deepEqual({ topologyId: id, address: 'localhost:37018' }, flags[1]);
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

        test.deepEqual({ topologyId: id }, flags[3]);
        test.deepEqual({ topologyId: id }, flags[4]);
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
        running = false;
        __server.destroy();
        test.done();
      }, 100);
    });

    setTimeout(function() { server.connect(); }, 100);
  }
}

exports['Should correctly emit sdam monitoring events for single server, with correct server type'] = {
  metadata: { requires: { generators: true, topology: "single" } },

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
      "ok" : 1,
      "hosts": [ "localhost:37008" ] // <-- this makes it an RSPrimary
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
      __server = yield mockupdb.createServer(37008, 'localhost');

      // Primary state machine
      co(function*() {
        while(running) {
          var request = yield __server.receive();

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
      port: '37008',
      connectionTimeout: 3000,
      socketTimeout: 1000,
      size: 1
    });

    // Results
    var flags = [];
    var id = null;

    // Add event listeners
    server.once('connect', function(_server) {
      // console.log("!!!!!!!!!!!!!!!!!!!!!!!!!! connect 1")
      id = _server.id;
      _server.destroy({emitClose:true});
    });

    server.on('serverOpening', function(event) {
      // console.log("------------- serverOpening")
      flags[0] = event;
    });

    server.on('serverClosed', function(event) {
      // console.log("------------- serverClosed")
      flags[1] = event;
    });

    server.on('serverDescriptionChanged', function(event) {
      // console.log("------------- serverDescriptionChanged")
      flags[2] = event;
    });

    server.on('topologyOpening', function(event) {
      // console.log("------------- topologyOpening")
      flags[3] = event;
    });

    server.on('topologyClosed', function(event) {
      // console.log("------------- topologyClosed")
      flags[4] = event;
    });

    server.on('topologyDescriptionChanged', function(event) {
      // console.log("------------- topologyDescriptionChanged")
      flags[5] = event;
    });

    server.on('error', function(){});
    server.on('close', function(){
      setTimeout(function() {
        test.deepEqual({ topologyId: id, address: 'localhost:37008' }, flags[0]);
        test.deepEqual({ topologyId: id, address: 'localhost:37008' }, flags[1]);
        test.deepEqual({ "topologyId": id, "address": "localhost:37008",
          "previousDescription": {
            "address": "localhost:37008",
            "arbiters": [],
            "hosts": [],
            "passives": [],
            "type": "Unknown"
          },
          "newDescription": {
            "address": "localhost:37008",
            "arbiters": [],
            "hosts": [],
            "passives": [],
            "type": "RSPrimary"
          }
        }, flags[2]);
        test.deepEqual({ topologyId: id }, flags[3]);
        test.deepEqual({ topologyId: id }, flags[4]);
        test.deepEqual({ "topologyId": id, "address": "localhost:37008",
          "previousDescription": {
            "topologyType": "Unknown",
            "servers": [
              {
                "address": "localhost:37008",
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
                "address": "localhost:37008",
                "arbiters": [],
                "hosts": [],
                "passives": [],
                "type": "RSPrimary"
              }
            ]
          }
        }, flags[5]);
        running = false;
        __server.destroy();

        test.done();
      }, 100);
    });

    setTimeout(function() { server.connect(); }, 100);
  }
}
