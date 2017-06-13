"use strict"

var timeoutPromise = function(timeout) {
  return new Promise(function(resolve, reject) {
    setTimeout(function() {
      resolve();
    }, timeout);
  });
}

exports['Should correctly load-balance the operations'] = {
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
    var mongos1 = null;
    var mongos2 = null;
    var running = true;
    // Current index for the ismaster
    var currentStep = 0;
    // Primary stop responding
    var stopRespondingPrimary = false;
    var port = null;

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
    // Boot the mock
    co(function*() {
      mongos1 = yield mockupdb.createServer(11000, 'localhost');
      mongos2 = yield mockupdb.createServer(11001, 'localhost');

      // Mongos
      co(function*() {
        while(running) {
          var request = yield mongos1.receive();

          // Get the document
          var doc = request.document;
          if(doc.ismaster) {
            request.reply(serverIsMaster[0]);
          } else if(doc.insert) {
            request.reply({ok:1, n:doc.documents, lastOp: new Date()});
          }
        }
      }).catch(function(err) {
      });

      // Mongos
      co(function*() {
        while(running) {
          var request = yield mongos2.receive();

          // Get the document
          var doc = request.document;
          if(doc.ismaster) {
            request.reply(serverIsMaster[0]);
          } else if(doc.insert) {
            request.reply({ok:1, n:doc.documents, lastOp: new Date()});
          }
        }
      }).catch(function(err) {
      });

      // Start dropping the packets
      setTimeout(function() {
        stopRespondingPrimary = true;
        currentIsMasterState = 1;
      }, 5000);

      // Attempt to connect
      var server = new Mongos([
          { host: 'localhost', port: 11000 },
          { host: 'localhost', port: 11001 },
        ], {
        connectionTimeout: 3000,
        socketTimeout: 1000,
        haInterval: 1000,
        localThresholdMS: 500,
        size: 1
      });

      // Add event listeners
      server.once('connect', function(_server) {
        // console.log("=================================== 0")
        _server.insert('test.test', [{created:new Date()}], function(err, r) {
          // console.log("=================================== 1")
          // if(r) console.log(r.connection.port)
          test.equal(null, err);
          test.ok(r.connection.port == 11000 || r.connection.port == 11001);
          global.port = r.connection.port == 11000 ? 11001 : 11000;
          // console.log("=================================== 1 :: " + global.port)

          _server.insert('test.test', [{created:new Date()}], function(err, r) {
            // console.log("=================================== 2 :: " + global.port)
            // if(r) console.log(r.connection.port)
            // console.dir(r)

            test.equal(null, err);
            test.equal(global.port, r.connection.port);
            global.port = r.connection.port == 11000 ? 11001 : 11000;

            _server.insert('test.test', [{created:new Date()}], function(err, r) {
              // console.log("=================================== 3 :: " + global.port)
              // if(r) console.log(r.connection.port)
              test.equal(null, err);
              test.equal(global.port, r.connection.port);

              running = false;
              server.destroy();
              mongos1.destroy();
              mongos2.destroy();
              test.done();
            });
          });
        });
      });

      server.on('error', function(){});
      server.connect();
    }).catch(function(err) {
    });
  }
}

exports['Should ignore one of the mongos instances due to being outside the latency window'] = {
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
    var mongos1 = null;
    var mongos2 = null;
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
      "maxWireVersion" : 3,
      "minWireVersion" : 0,
      "ok" : 1
    }

    // Primary server states
    var serverIsMaster = [extend(defaultFields, {})];
    // Boot the mock
    co(function*() {
      mongos1 = yield mockupdb.createServer(11002, 'localhost');
      mongos2 = yield mockupdb.createServer(11003, 'localhost');

      // Mongos
      co(function*() {
        while(running) {
          var request = yield mongos1.receive();

          // Get the document
          var doc = request.document;
          if(doc.ismaster) {
            request.reply(serverIsMaster[0]);
          } else if(doc.insert) {
            request.reply({ok:1, n:doc.documents, lastOp: new Date()});
          }
        }
      });

      // Mongos
      co(function*() {
        while(running) {
          var request = yield mongos2.receive();
          // console.log(" do something 0")
          var s = new Date().getTime();
          // Delay all the operations by 500 ms
          yield timeoutPromise(500);
          // console.log(" do something 1 :: " + (new Date().getTime() - s))
          // Get the document
          var doc = request.document;
          if(doc.ismaster) {
            request.reply(serverIsMaster[0]);
          } else if(doc.insert) {
            request.reply({ok:1, n:doc.documents, lastOp: new Date()});
          }
        }
      });

      // Start dropping the packets
      setTimeout(function() {
        stopRespondingPrimary = true;
      }, 5000);
    });

    // Attempt to connect
    var server = new Mongos([
        { host: 'localhost', port: 11002 },
        { host: 'localhost', port: 11003 },
      ], {
      connectionTimeout: 3000,
      localThresholdMS: 50,
      socketTimeout: 1000,
      haInterval: 1000,
      size: 1
    });

    console.log("---------------------------------------------- 0")
    // Add event listeners
    server.once('fullsetup', function(_server) {
      console.log("---------------------------------------------- 1")
      server.insert('test.test', [{created:new Date()}], function(err, r) {
        console.log("---------------------------------------------- 2")
        test.equal(null, err);
        test.equal(11002, r.connection.port);

        server.insert('test.test', [{created:new Date()}], function(err, r) {
          console.log("---------------------------------------------- 3")
          if(r) console.log(r.connection.port)
          test.equal(null, err);
          test.equal(11002, r.connection.port);

          server.destroy();

          // Attempt to connect
          var server2 = new Mongos([
              { host: 'localhost', port: 11002 },
              { host: 'localhost', port: 11003 },
            ], {
            connectionTimeout: 3000,
            localThresholdMS: 1000,
            socketTimeout: 1000,
            haInterval: 1000,
            size: 1
          });

          // Add event listeners
          server2.once('fullsetup', function(_server) {
            console.log("---------------------------------------------- 4")
            server2.insert('test.test', [{created:new Date()}], function(err, r) {
              console.log("---------------------------------------------- 5")
              if(r)console.dir(r.connection.port)
              test.equal(null, err);
              test.equal(11002, r.connection.port);

              server2.insert('test.test', [{created:new Date()}], function(err, r) {
                console.log("---------------------------------------------- 6")
                if(r)console.dir(r.connection.port)
                test.equal(null, err);
                test.equal(11003, r.connection.port);

                server2.destroy();
                mongos1.destroy();
                mongos2.destroy();
                running = false;
                test.done();
              });
            });
          });

          setTimeout(function() { server2.connect(); }, 100);
        });
      });
    });

    server.on('error', function(){});
    setTimeout(function() { server.connect(); }, 100);
  }
}
