var f = require('util').format;

exports['Should correctly timeout mongos socket operation and then correctly re-execute'] = {
  metadata: {
    requires: {
      generators: true,
      topology: "single"
    }
  },

  test: function(configuration, test) {
    // console.log("--------------------------------------- -1")
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
          } else if(doc.ismaster) {
            request.reply(serverIsMaster[0]);
          } else if(doc.insert && currentStep == 2) {
            request.reply({ok:1, n:doc.documents, lastOp: new Date()});
          }
        }
      }).catch(function(err) {
      });

      // Start dropping the packets
      setTimeout(function() {
        stopRespondingPrimary = true;
        currentIsMasterState = 1;
      }, 500);
    }).catch(function(err) {
    });

    // console.log("--------------------------------------- 0")
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

    // console.log("--------------------------------------- 1")
    // Add event listeners
    _server.once('connect', function() {
      // console.log("--------------------------------------- 3")
      // Run an interval
      var intervalId = setInterval(function() {
        // console.log("--------------------------------------- 4")
        _server.insert('test.test', [{created:new Date()}], function(err, r) {
          // console.log("--------------------------------------- 5")
          // console.dir(err)
          // if(r) console.dir(r.connection)
          // console.log("-------------------------------- insert attempt")
          // console.dir(err)
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

    // console.log("--------------------------------------- 2")
    _server.on('error', function(){});
    _server.connect();
  }
}

exports['Should not fail due to available connections equal to 0 during ha process'] = {
  metadata: {
    requires: {
      generators: true,
      topology: "single"
    }
  },

  test: function(configuration, test) {
    var Mongos = configuration.require.Mongos,
      Long = configuration.require.BSON.Long,
      ObjectId = configuration.require.BSON.ObjectId,
      co = require('co'),
      mockupdb = require('../../../mock');

    // Contain mock server
    var server = null;
    var running = true;
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
      "maxWireVersion" : 4,
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

          if(doc.ismaster) {
            request.reply(serverIsMaster[0]);
          } else if(doc.find) {
            yield timeoutPromise(600);
            // Reply with first batch
            request.reply({
              "cursor" : {
                "id" : Long.fromNumber(1),
                "ns" : f("%s.cursor1", 'test'),
                "firstBatch" : [
                  { _id: new ObjectId(), a:1}
                ]
              },
              "ok" : 1
            });
          } else if(doc.getMore) {
            // Reply with first batch
            request.reply({
              "cursor" : {
                "id" : Long.fromNumber(1),
                "ns" : f("%s.cursor1", 'test'),
                "nextBatch" : [
                  { _id: new ObjectId(), a:1}
                ]
              },
              "ok" : 1
            });
          }
        }
      }).catch(function(err) {
      });
    }).catch(function(err) {
    });

    // Attempt to connect
    var _server = new Mongos([
        { host: 'localhost', port: 52000 },
      ], {
      connectionTimeout: 30000,
      socketTimeout: 30000,
      haInterval: 500,
      size: 1
    });

    // Are we done
    var done = false;

    // Add event listeners
    _server.once('connect', function() {
      // Execute find
      var cursor = _server.cursor('test.test', {
          find: 'test'
        , query: {}
        , batchSize: 2
      });

      // Execute next
      cursor.next(function(err, d) {
        test.equal(null, err);

        cursor.next(function(err, d) {
          test.equal(null, err);

          running = false;
          server.destroy();
          test.done();
        });
      });
    });

    _server.on('error', function(){});
    _server.connect();
  }
}
