exports['Should correctly timeout socket operation and then correctly re-execute'] = {
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
      server = yield mockupdb.createServer(37017, 'localhost');

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
              yield timeoutPromise(1500);
              continue;
            }

            currentStep += 1;
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
      }, 5000);
    });

    // Attempt to connect
    var server = new Server({
      host: 'localhost',
      port: '37017',
      connectionTimeout: 3000,
      socketTimeout: 1000,
      size: 1
    });

    // Add event listeners
    server.once('connect', function(_server) {
      _server.insert('test.test', [{created:new Date()}], function(err, r) {
        test.ok(err != null);

        // Let auto-reconnect run and restablish connection
        setTimeout(function() {
          _server.insert('test.test', [{created:new Date()}], function(err, r) {
            test.equal(null, err);

            server.destroy();
            test.done();
          });
        }, 1200)
      });
    });

    server.on('error', function(){});

    server.on('joined', function(type, server) {
      if(type == 'primary') joinedPrimaries[server.name] = 1;
      if(type == 'secondary') joinedSecondaries[server.name] = 1;
    });

    server.on('left', function(type, server) {
      if(type == 'primary') leftPrimaries[server.name] = 1;
    })

    server.connect();
  }
}
