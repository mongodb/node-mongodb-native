exports['Should correctly timeout mongos socket operation and then correctly re-execute'] = {
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
    var timeoutPromise = function(timeout) {
      return new Promise(function(resolve, reject) {
        setTimeout(function() {
          resolve();
        }, timeout);
      });
    }

    // Boot the mock
    co(function*() {
      server = yield mockupdb.createServer(52000, 'localhost');

      // Primary state machine
      co(function*() {
        while(running) {
          var request = yield server.receive();

          // Get the document
          var doc = request.document;
          if(doc.ismaster && currentStep == 0) {
            request.reply(serverIsMaster[0]);
            currentStep += 1;
          } else if(doc.insert && currentStep == 1) {
            // Stop responding to any calls (emulate dropping packets on the floor)
            if(stopRespondingPrimary) {
              currentStep += 1;
              stopRespondingPrimary = false;
              // Timeout after 1500 ms
              yield timeoutPromise(1500);
              request.connection.destroy();
            }
          } else if(doc.ismaster && currentStep == 2) {
            request.reply(serverIsMaster[0]);
          } else if(doc.insert && currentStep == 2) {
            request.reply({ok:1, n:doc.documents, lastOp: new Date()});
          }
        }
      });

      // Start dropping the packets
      setTimeout(function() {
        stopRespondingPrimary = true;
        currentIsMasterState = 1;
      }, 500);
    });

    // Attempt to connect
    var _server = new Mongos([
        { host: 'localhost', port: 52000 },
      ], {
      connectionTimeout: 3000,
      socketTimeout: 1000,
      haInterval: 500,
      size: 1
    });

    // Are we done
    var done = false;

    // Add event listeners
    _server.once('connect', function() {
      // Run an interval
      var intervalId = setInterval(function() {
        _server.insert('test.test', [{created:new Date()}], function(err, r) {
          if(r && !done) {
            done = true;
            clearInterval(intervalId);
            test.equal(52000, r.connection.port);
            running = false;
            server.destroy();
            test.done();
          }
        });
      }, 500);
    });

    _server.on('error', function(){});
    _server.connect();
  }
}
