exports['Should correctly connect to a replicaset where the primary hangs causing monitoring thread to hang'] = {
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
    var running = true;
    var electionIds = [new ObjectId(), new ObjectId()];
    // Current index for the ismaster
    var currentIsMasterState = 0;
    // Primary stop responding
    var stopRespondingPrimary = false;

    // Extend the object
    var extend = function(template, fields) {
      for(var name in template) fields[name] = template[name];
      return fields;
    }

    // Default message fields
    var defaultFields = {
      "setName": "rs", "setVersion": 1, "electionId": electionIds[currentIsMasterState],
      "maxBsonObjectSize" : 16777216, "maxMessageSizeBytes" : 48000000,
      "maxWriteBatchSize" : 1000, "localTime" : new Date(), "maxWireVersion" : 3,
      "minWireVersion" : 0, "ok" : 1, "hosts": ["localhost:32000", "localhost:32001", "localhost:32002"]
    }

    // Primary server states
    var primary = [extend(defaultFields, {
      "ismaster":true, "secondary":false, "me": "localhost:32000", "primary": "localhost:32000"
    }), extend(defaultFields, {
      "ismaster":false, "secondary":true, "me": "localhost:32000", "primary": "localhost:32001"
    })];

    // Primary server states
    var firstSecondary = [extend(defaultFields, {
      "ismaster":false, "secondary":true, "me": "localhost:32001", "primary": "localhost:32000"
    }), extend(defaultFields, {
      "ismaster":true, "secondary":false, "me": "localhost:32001", "primary": "localhost:32001"
    })];

    // Primary server states
    var secondSecondary = [extend(defaultFields, {
      "ismaster":false, "secondary":true, "me": "localhost:32002", "primary": "localhost:32000"
    }), extend(defaultFields, {
      "ismaster":false, "secondary":true, "me": "localhost:32002", "primary": "localhost:32001"
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

      // Primary state machine
      co(function*() {
        while(running) {
          var request = yield primaryServer.receive();

          // Stop responding to any calls (emulate dropping packets on the floor)
          if(stopRespondingPrimary) {
            yield timeoutPromise(10000);
            continue;
          }

          // Get the document
          var doc = request.document;
          if(doc.ismaster && currentIsMasterState == 0) {
            request.reply(primary[currentIsMasterState]);
          } else if(doc.insert && currentIsMasterState == 0) {
            request.reply({ok:1, n:doc.documents, lastOp: new Date(), electionId: electionIds[currentIsMasterState]});
          } else if(doc.insert && currentIsMasterState == 1) {
            request.reply({ "note" : "from execCommand", "ok" : 0, "errmsg" : "not master" });
          }
        }
      });

      // First secondary state machine
      co(function*() {
        while(running) {
          var request = yield firstSecondaryServer.receive();
          var doc = request.document;

          if(doc.ismaster) {
            request.reply(firstSecondary[currentIsMasterState]);
          } else if(doc.insert && currentIsMasterState == 1) {
            request.reply({ok:1, n:doc.documents, lastOp: new Date(), electionId: electionIds[currentIsMasterState]});
          } else if(doc.insert && currentIsMasterState == 0) {
            request.reply({ "note" : "from execCommand", "ok" : 0, "errmsg" : "not master" });
          }
        }
      });

      // Second secondary state machine
      co(function*() {
        while(running) {
          var request = yield secondSecondaryServer.receive();
          var doc = request.document;

          if(doc.ismaster) {
            request.reply(secondSecondary[currentIsMasterState]);
          } else if(doc.insert && currentIsMasterState == 0) {
            request.reply({ "note" : "from execCommand", "ok" : 0, "errmsg" : "not master" });
          }
        }
      });

      // Start dropping the packets
      setTimeout(function() {
        // console.log("======================== stopRespondingPrimary")
        stopRespondingPrimary = true;
        currentIsMasterState = 1;
      }, 5000);
    });

    Connection.enableConnectionAccounting();
    // Attempt to connect
    var server = new ReplSet([
      { host: 'localhost', port: 32000 },
      { host: 'localhost', port: 32001 },
      { host: 'localhost', port: 32002 }], {
        setName: 'rs',
        connectionTimeout: 5000,
        socketTimeout: 3000,
        haInterval: 2000,
        size: 1
    });
    // console.log("==================================== schedule -2")

    // Add event listeners
    server.on('connect', function(_server) {
      // console.log("==================================== schedule 0")
      // Set up a write
      function schedule() {
        // console.log("==================================== schedule 1")
        setTimeout(function() {
          // console.log("==================================== schedule 2")
          _server.insert('test.test', [{created:new Date()}], function(err, r) {
            // console.log("==================================== insert")
            // if(r) console.log(r.connection.port)
            // Did we switch servers
            if(r && r.connection.port == 32001) {
              test.ok(stopRespondingPrimary);
              test.equal(1, currentIsMasterState);

              // Ensure the state is correct
              test.deepEqual({'localhost:32000':1, 'localhost:32001':1}, joinedPrimaries);
              test.deepEqual({'localhost:32001':1, 'localhost:32002':1}, joinedSecondaries);

              // Destroy mock
              primaryServer.destroy();
              firstSecondaryServer.destroy();
              secondSecondaryServer.destroy();
              server.destroy();
              running = false;

              setTimeout(function() {
                test.equal(0, Object.keys(Connection.connections()).length);
                Connection.disableConnectionAccounting();
                test.done();
              }, 1000);
              return;
            }

            schedule();
          });
        }, 1);
      }

      // Schedule an insert
      schedule();
    });

    server.on('error', function(err){console.dir(err)});

    server.on('joined', function(type, server) {
      // console.log("--- joined :: " + type + " :: " + server.name)
      if(type == 'primary') joinedPrimaries[server.name] = 1;
      if(type == 'secondary') joinedSecondaries[server.name] = 1;
    });

    server.on('left', function(type, server) {
      // console.log("--- left :: " + type + " :: " + server.name)
      if(type == 'primary') leftPrimaries[server.name] = 1;
    })

    // console.log("==================================== schedule -1")
    // Gives proxies a chance to boot up
    setTimeout(function() {
      server.connect();
    }, 100)
  }
}
