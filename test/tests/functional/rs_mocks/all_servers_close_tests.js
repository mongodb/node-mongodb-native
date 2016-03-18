"use strict"

var f = require('util').format;

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

exports['Successful reconnect when driver looses touch with entire replicaset'] = {
  metadata: {
    requires: {
      generators: true,
      topology: "single"
    },
    ignore: { travis:true }
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
    var die = false;

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
          if(die) {
            request.connection.destroy();
          } else {
            var doc = request.document;

            if(doc.ismaster) {
              request.reply(primary[0]);
            } else if(doc.insert) {
              request.reply({ "ok" : 1, "n" : 1 });
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
          if(die) {
            request.connection.destroy();
          } else {
            var doc = request.document;

            if(doc.ismaster) {
              request.reply(firstSecondary[0]);
            }
          }
        }
      }).catch(function(err) {
        console.log(err.stack);
      });

      // Second secondary state machine
      co(function*() {
        while(running) {
          var request = yield arbiterServer.receive();
          if(die) {
            request.connection.destroy();
          } else {
            var doc = request.document;

            if(doc.ismaster) {
              request.reply(arbiter[0]);
            }
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
        connectionTimeout: 2000,
        socketTimeout: 5000,
        haInterval: 500,
        size: 500
    });

    server.on('connect', function(e) {
      server.__connected = true;
      // console.log("------------------------------- step 0 ")

      for(var i = 0; i < 100000; i++) {
        // Execute the write
        server.insert(f("%s.inserts", configuration.db), [{a:1}], {
          writeConcern: {w:1}, ordered:true
        }, function(err, results) {
        });
      }

      setTimeout(function() {
        // console.log("------------------------------- step 1 ")
        die = true;

        setTimeout(function() {
          // console.log("------------------------------- step 2 ")
          die = false;

          setTimeout(function() {
            // console.log("------------------------------- step 3 ")
            server.command('admin.$cmd', {ismaster:true}, function(err, r) {
              // console.log("------------------------------- step 4 ")
              // console.dir(err)
              test.equal(null, err);
              test.ok(server.s.replState.primary != null);
              // test.equal(1, server.s.replState.secondaries.length);
              // test.equal(1, server.s.replState.arbiters.length);

              primaryServer.destroy();
              firstSecondaryServer.destroy();
              arbiterServer.destroy();
              server.destroy();
              running = false;

              test.done();
            });
          }, 6000);
        }, 2500);
      }, 2500);
    });

    // Add event listeners
    server.on('fullsetup', function(_server) {});
    // Gives proxies a chance to boot up
    setTimeout(function() {
      server.connect();
    }, 100)
  }
}

// exports['Successfully come back from a dead replicaset that has been unavailable for a long time'] = {
//   metadata: {
//     requires: {
//       generators: true,
//       topology: "single"
//     }
//   },
//
//   test: function(configuration, test) {
//     var ReplSet = configuration.require.ReplSet,
//       ObjectId = configuration.require.BSON.ObjectId,
//       ReadPreference = configuration.require.ReadPreference,
//       Long = configuration.require.BSON.Long,
//       co = require('co'),
//       mockupdb = require('../../../mock');
//
//     // Contain mock server
//     var primaryServer = null;
//     var firstSecondaryServer = null;
//     var arbiterServer = null;
//     var running = true;
//     var electionIds = [new ObjectId(), new ObjectId()];
//     var die = false;
//
//     // Default message fields
//     var defaultFields = {
//       "setName": "rs", "setVersion": 1, "electionId": electionIds[0],
//       "maxBsonObjectSize" : 16777216, "maxMessageSizeBytes" : 48000000,
//       "maxWriteBatchSize" : 1000, "localTime" : new Date(), "maxWireVersion" : 4,
//       "minWireVersion" : 0, "ok" : 1, "hosts": ["localhost:32000", "localhost:32001", "localhost:32002"], "arbiters": ["localhost:32002"]
//     }
//
//     // Primary server states
//     var primary = [extend(defaultFields, {
//       "ismaster":true, "secondary":false, "me": "localhost:32000", "primary": "localhost:32000", "tags" : { "loc" : "ny" }
//     })];
//
//     // Primary server states
//     var firstSecondary = [extend(defaultFields, {
//       "ismaster":false, "secondary":true, "me": "localhost:32001", "primary": "localhost:32000", "tags" : { "loc" : "sf" }
//     })];
//
//     // Primary server states
//     var arbiter = [extend(defaultFields, {
//       "ismaster":false, "secondary":false, "arbiterOnly": true, "me": "localhost:32002", "primary": "localhost:32000"
//     })];
//
//     // Boot the mock
//     co(function*() {
//       primaryServer = yield mockupdb.createServer(32000, 'localhost');
//       firstSecondaryServer = yield mockupdb.createServer(32001, 'localhost');
//       arbiterServer = yield mockupdb.createServer(32002, 'localhost');
//
//       // Primary state machine
//       co(function*() {
//         while(running) {
//           var request = yield primaryServer.receive();
//           if(die) {
//             console.log("------------------ die 1")
//             // request.connection.destroy();
//           } else {
//             var doc = request.document;
//
//             if(doc.ismaster) {
//               request.reply(primary[0]);
//             }
//           }
//         }
//       }).catch(function(err) {
//         console.log(err.stack);
//       });
//
//       // First secondary state machine
//       co(function*() {
//         while(running) {
//           var request = yield firstSecondaryServer.receive();
//           if(die) {
//             console.log("------------------ die 2")
//             // request.connection.destroy();
//           } else {
//             var doc = request.document;
//
//             if(doc.ismaster) {
//               request.reply(firstSecondary[0]);
//             }
//           }
//         }
//       }).catch(function(err) {
//         console.log(err.stack);
//       });
//
//       // Second secondary state machine
//       co(function*() {
//         while(running) {
//           var request = yield arbiterServer.receive();
//           if(die) {
//             console.log("------------------ die 3")
//             // request.connection.destroy();
//           } else {
//             var doc = request.document;
//
//             if(doc.ismaster) {
//               request.reply(arbiter[0]);
//             }
//           }
//         }
//       }).catch(function(err) {
//         console.log(err.stack);
//       });
//     });
//
//     // Attempt to connect
//     var server = new ReplSet([
//       { host: 'localhost', port: 32000 },
//       { host: 'localhost', port: 32001 },
//       { host: 'localhost', port: 32002 }], {
//         setName: 'rs',
//         connectionTimeout: 5000,
//         socketTimeout: 5000,
//         haInterval: 1000,
//         size: 1
//     });
//
//     server.on('connect', function(e) {
//       server.__connected = true;
//
//       setTimeout(function() {
//         die = true;
//
//         server.command('admin.$cmd', {ismaster:true}, function(err, r) {
//           test.ok(err != null);
//         });
//
//         setTimeout(function() {
//           die = false;
//           // console.log("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! ALIVE")
//
//           setTimeout(function() {
//             server.command('admin.$cmd', {ismaster:true}, function(err, r) {
//               // console.log("---------------------------------------------------------------")
//               // console.dir(err)
//               // console.log("server.s.replState.secondaries = " + server.s.replState.secondaries.length)
//               // console.log("server.s.replState.arbiters = " + server.s.replState.arbiters.length)
//               // console.log("server.s.replState.primary = " + (server.s.replState.primary != null))
//               // console.dir(err)
//               // console.dir(r.result)
//
//               test.equal(null, err);
//               test.ok(server.s.replState.primary != null);
//               test.equal(1, server.s.replState.secondaries.length);
//               test.equal(1, server.s.replState.arbiters.length);
//
//               primaryServer.destroy();
//               firstSecondaryServer.destroy();
//               arbiterServer.destroy();
//               server.destroy();
//               running = false;
//
//               test.done();
//             });
//           }, 5000);
//         }, 60000 * 3);
//       }, 2500);
//     });
//
//     // Add event listeners
//     server.on('fullsetup', function(_server) {});
//     // Gives proxies a chance to boot up
//     setTimeout(function() {
//       server.connect();
//     }, 100)
//   }
// }
