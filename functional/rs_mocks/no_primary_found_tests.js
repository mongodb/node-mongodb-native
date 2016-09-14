exports['Should correctly connect to a replicaset where the arbiter hangs no primary found error'] = {
  metadata: {
    requires: {
      generators: true,
      topology: "single"
    }
  },

  test: function(configuration, test) {
    var ReplSet = configuration.require.ReplSet,
      ObjectId = configuration.require.BSON.ObjectId,
      Connection = require('../../../../lib/connection/connection'),
      co = require('co'),
      mockupdb = require('../../../mock');

    // Contain mock server
    var primaryServer = null;
    var firstSecondaryServer = null;
    var secondSecondaryServer = null;
    var arbiterServer = null;
    var running = true;

    // Extend the object
    var extend = function(template, fields) {
      for(var name in template) fields[name] = template[name];
      return fields;
    }

    // Default message fields
    var defaultFields = {
      "setName": "rs", "setVersion": 1, "electionId": new ObjectId(),
      "maxBsonObjectSize" : 16777216, "maxMessageSizeBytes" : 48000000,
      "maxWriteBatchSize" : 1000, "localTime" : new Date(), "maxWireVersion" : 3,
      "minWireVersion" : 0, "ok" : 1, "hosts": ["localhost:32000", "localhost:32001", "localhost:32002"],
      "arbiters": ["localhost:32003"]
    }

    // Primary server states
    var primary = [extend(defaultFields, {
      "ismaster":true, "secondary":false, "me": "localhost:32000", "primary": "localhost:32000"
    })];

    // Primary server states
    var firstSecondary = [extend(defaultFields, {
      "ismaster":false, "secondary":true, "me": "localhost:32001", "primary": "localhost:32000"
    })];

    // Primary server states
    var secondSecondary = [extend(defaultFields, {
      "ismaster":false, "secondary":true, "me": "localhost:32002", "primary": "localhost:32000"
    })];

    // Primary server states
    var arbiter = [extend(defaultFields, {
      "ismaster":false, "secondary":false, "arbiterOnly": true, "me": "localhost:32003", "primary": "localhost:32000"
    })];

    var timeoutPromise = function(timeout) {
      return new Promise(function(resolve, reject) {
        setTimeout(function() {
          resolve();
        }, timeout);
      });
    }

    // Joined servers
    var joinedPrimaries = {};
    var joinedSecondaries = {};
    var leftPrimaries = {};

    // Boot the mock
    co(function*() {
      primaryServer = yield mockupdb.createServer(32000, 'localhost');
      firstSecondaryServer = yield mockupdb.createServer(32001, 'localhost');
      secondSecondaryServer = yield mockupdb.createServer(32002, 'localhost');
      arbiterServer = yield mockupdb.createServer(32003, 'localhost');

      // Primary state machine
      co(function*() {
        while(running) {
          var request = yield primaryServer.receive();
          var doc = request.document;

          if(doc.ismaster) {
            request.reply(primary[0]);
          }
        }
      });

      // First secondary state machine
      co(function*() {
        while(running) {
          yield timeoutPromise(9000000);
          var request = yield firstSecondaryServer.receive();
          var doc = request.document;

          if(doc.ismaster) {
            request.reply(firstSecondary[0]);
          }
        }
      });

      // Second secondary state machine
      co(function*() {
        while(running) {
          var request = yield secondSecondaryServer.receive();
          var doc = request.document;

          if(doc.ismaster) {
            request.reply(secondSecondary[0]);
          }
        }
      });

      // Arbiter state machine
      co(function*() {
        while(running) {
          yield timeoutPromise(9000000);
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

    Connection.enableConnectionAccounting();
    // Attempt to connect
    var server = new ReplSet([
      { host: 'localhost', port: 32000 }
    ], {
        setName: 'rs',
        connectionTimeout: 2000,
        socketTimeout: 4000,
        haInterval: 2000,
        size: 1
    });

    // Add event listeners
    server.on('connect', function(_server) {
      // console.log("=============================== connect")
      // Destroy mock
      primaryServer.destroy();
      firstSecondaryServer.destroy();
      secondSecondaryServer.destroy();
      arbiterServer.destroy();
      server.destroy();
      running = false;

      Connection.disableConnectionAccounting();
      test.done();
    });

    server.on('error', function(err) {
      throw new Error('should not error out');
      // console.log("=============================== error")
      // console.dir(err)
    });

    server.on('joined', function(type, server) {
      // console.log("--- joined :: " + type + " :: " + server.name)
    });

    server.on('left', function(type, server) {
      // console.log("--- left :: " + type + " :: " + server.name)
    })

    // Gives proxies a chance to boot up
    setTimeout(function() {
      server.connect();
    }, 100)
  }
}
