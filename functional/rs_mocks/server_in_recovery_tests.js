"use strict";

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

// exports['Successful handle a situation where there is a recovering server'] = {
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
//     var secondSecondaryServer = null;
//     var running = true;
//     var electionIds = [new ObjectId(), new ObjectId()];
//     var step = 0;
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
//     var secondSecondary = [extend(defaultFields, {
//       "ismaster":false, "secondary":true, "arbiterOnly": false, "me": "localhost:32002", "primary": "localhost:32000"
//     }), extend(defaultFields, {
//       "ismaster":false, "secondary":false, "arbiterOnly": false, "me": "localhost:32002", "primary": "localhost:32000"
//     })];
//
//     // Boot the mock
//     co(function*() {
//       primaryServer = yield mockupdb.createServer(32000, 'localhost');
//       firstSecondaryServer = yield mockupdb.createServer(32001, 'localhost');
//       secondSecondaryServer = yield mockupdb.createServer(32002, 'localhost');
//
//       // Primary state machine
//       co(function*() {
//         while(running) {
//           var request = yield primaryServer.receive();
//           var doc = request.document;
//
//           if(doc.ismaster) {
//             request.reply(primary[0]);
//           } else if(doc.insert) {
//             request.reply({ "ok" : 1, "n" : 1 });
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
//           var doc = request.document;
//
//           if(doc.ismaster) {
//             request.reply(firstSecondary[0]);
//           }
//         }
//       }).catch(function(err) {
//         console.log(err.stack);
//       });
//
//       // Second secondary state machine
//       co(function*() {
//         while(running) {
//           var request = yield secondSecondaryServer.receive();
//           var doc = request.document;
//
//           if(doc.ismaster && step == 0) {
//             request.reply(secondSecondary[0]);
//           } else if(doc.ismaster && step == 1) {
//             request.reply(secondSecondary[1]);
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
//         connectionTimeout: 3000,
//         socketTimeout: 0,
//         haInterval: 500,
//         size: 500
//     });
//
//     server.on('connect', function(e) {
//       server.__connected = true;
//
//       setTimeout(function() {
//         step = 1;
//       }, 1000);
//
//       // setTimeout(function() {
//       //   step = 0;
//       // }, 3000);
//
//       setInterval(function() {
//         console.log("===== connections :: " + server.connections().length);
//       }, 500);
//
//       for(var i = 0; i < 100000; i++) {
//         // Execute the write
//         server.insert(f("%s.inserts", configuration.db), [{a:1}], {
//           writeConcern: {w:1}, ordered:true
//         }, function(err, results) {
//         });
//       }
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
