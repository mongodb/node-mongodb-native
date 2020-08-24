'use strict';

// SCENARIO
// ------------------------------------------------------------------
// 1. Replicaset (Primary/Secondary/Arbiter)
// 2. Continuously streaming Query using find
// 3. Step down primary and re-elect new primary before query finishes.
// 4. No disconnected servers detected (new primary never detected).

// exports['Successfully finish query executing against secondary during primary stepDown'] = {
//   metadata: {
//     requires: {
//       generators: true,
//       topology: "single"
//     }
//   },

//   test: function(configuration, test) {
//     var ReplSet = configuration.require.ReplSet,
//       Logger = configuration.require.Logger,
//       ObjectId = configuration.require.BSON.ObjectId,
//       ReadPreference = configuration.require.ReadPreference,
//       Long = configuration.require.BSON.Long,
//       co = require('co'),
//       f = require('util').format,
//       mockupdb = require('mongodb-mock-server');

//     // Set info level for debugging
//     Logger.setLevel('info')

//     // Contain mock server
//     var primaryServer = null;
//     var firstSecondaryServer = null;
//     var arbiterServer = null;
//     var running = true;
//     var electionIds = [new ObjectId(), new ObjectId()];

//     // Cursor id
//     var cursorId = Long.fromNumber(3333);
//     // Increasing index for the documents
//     var index = 0;
//     // Current ismaster state
//     var currentState = 0;

//     // Default message fields
//     var defaultFields = {
//       "setName": "rs", "setVersion": 1, "electionId": electionIds[0],
//       "maxBsonObjectSize" : 16777216, "maxMessageSizeBytes" : 48000000,
//       "maxWriteBatchSize" : 1000, "localTime" : new Date(), "maxWireVersion" : 4,
//       "minWireVersion" : 0, "ok" : 1, "hosts": ["localhost:32000", "localhost:32001", "localhost:32002"], "arbiters": ["localhost:32002"]
//     }

//     // Primary server states
//     var primary = [assign({}, defaultFields, {
//       "ismaster":true, "secondary":false, "me": "localhost:32000", "primary": "localhost:32000", "tags" : { "loc" : "ny" }
//     }), assign({}, defaultFields, {
//       "ismaster":false, "secondary":true, "me": "localhost:32000", "primary": "localhost:32000", "tags" : { "loc" : "ny" }
//     }), assign({}, defaultFields, {
//       "ismaster":false, "secondary":true, "me": "localhost:32000", "primary": "localhost:32000", "tags" : { "loc" : "ny" }
//     })];

//     // Primary server states
//     var firstSecondary = [assign({}, defaultFields, {
//       "ismaster":false, "secondary":true, "me": "localhost:32001", "primary": "localhost:32000", "tags" : { "loc" : "sf" }
//     }), assign({}, defaultFields, {
//       "ismaster":false, "secondary":true, "me": "localhost:32001", "primary": "localhost:32000", "tags" : { "loc" : "sf" }
//     }), assign({}, defaultFields, {
//       "ismaster":true, "secondary":false, "me": "localhost:32001", "primary": "localhost:32000", "tags" : { "loc" : "sf" }
//     })];

//     // Primary server states
//     var arbiter = [assign({}, defaultFields, {
//       "ismaster":false, "secondary":false, "arbiterOnly": true, "me": "localhost:32002", "primary": "localhost:32000"
//     })];

//     // Boot the mock
//     co(function*() {
//       primaryServer = yield mockupdb.createServer(32000, 'localhost');
//       firstSecondaryServer = yield mockupdb.createServer(32001, 'localhost');
//       arbiterServer = yield mockupdb.createServer(32002, 'localhost');

//       // Primary state machine
//       co(function*() {
//         while(running) {
//           var request = yield primaryServer.receive();
//           var doc = request.document;

//           if(doc.ismaster) {
//             request.reply(primary[currentState]);
//           } else if(doc.find) {
//             request.reply({
//               "cursor" : {
//                 "id" : cursorId,
//                 "ns" : f("%s.cursor1", configuration.db),
//                 "firstBatch" : [
//                   { _id: new ObjectId(), a:index++}
//                 ]
//               },
//               "ok" : 1
//             });
//           } else if(doc.getMore) {
//             request.reply({
//               "cursor" : {
//                 "id" : cursorId,
//                 "ns" : f("%s.cursor1", configuration.db),
//                 "nextBatch" : [
//                   { _id: new ObjectId(), a:index++},
//                   { _id: new ObjectId(), a:index++},
//                   { _id: new ObjectId(), a:index++},
//                   { _id: new ObjectId(), a:index++},
//                   { _id: new ObjectId(), a:index++},
//                   { _id: new ObjectId(), a:index++}
//                 ]
//               },
//               "ok" : 1
//             });
//           }
//         }
//       }).catch(function(err) {
//         // console.log(err.stack);
//       });

//       // First secondary state machine
//       co(function*() {
//         while(running) {
//           var request = yield firstSecondaryServer.receive();
//           var doc = request.document;

//           if(doc.ismaster) {
//             request.reply(firstSecondary[currentState]);
//           } else if(doc.find) {
//             request.reply({
//               "cursor" : {
//                 "id" : cursorId,
//                 "ns" : f("%s.cursor1", configuration.db),
//                 "firstBatch" : [
//                   { _id: new ObjectId(), a:index++}
//                 ]
//               },
//               "ok" : 1
//             });
//           } else if(doc.getMore) {
//             request.reply({
//               "cursor" : {
//                 "id" : cursorId,
//                 "ns" : f("%s.cursor1", configuration.db),
//                 "nextBatch" : [
//                   { _id: new ObjectId(), a:index++},
//                   { _id: new ObjectId(), a:index++},
//                   { _id: new ObjectId(), a:index++},
//                   { _id: new ObjectId(), a:index++},
//                   { _id: new ObjectId(), a:index++},
//                   { _id: new ObjectId(), a:index++}
//                 ]
//               },
//               "ok" : 1
//             });
//           }
//         }
//       }).catch(function(err) {
//         // console.log(err.stack);
//       });

//       // Second secondary state machine
//       co(function*() {
//         while(running) {
//           var request = yield arbiterServer.receive();
//           var doc = request.document;

//           if(doc.ismaster) {
//             request.reply(arbiter[0]);
//           }
//         }
//       }).catch(function(err) {
//         // console.log(err.stack);
//       });
//     });

//     // Attempt to connect
//     var server = new ReplSet([
//       { host: 'localhost', port: 32000 },
//       { host: 'localhost', port: 32001 },
//       { host: 'localhost', port: 32002 }], {
//         setName: 'rs',
//         connectionTimeout: 3000,
//         socketTimeout: 0,
//         haInterval: 2000,
//         size: 1
//     });

//     server.on('connect', function(e) {
//       server.__connected = true;
//     });

//     // Add event listeners
//     server.on('fullsetup', function(_server) {
//       var ns = f("%s.cursor1", configuration.db);

//       // Execute find
//       var cursor = _server.cursor(ns, {
//           find: ns
//         , query: {}
//         , batchSize: 10
//       }, {
//         readPreference: ReadPreference.secondary
//       });

//       var nextObject = function() {
//         cursor._next(function(err, doc) {
//           if(err) {
//             console.dir(err)
//             process.exit(0)
//           }
//           // console.log("------------------------------------------ next end");
//           // console.dir(doc);
//           nextObject();
//         })
//       }

//       nextObject();

//       // var intervalId = setInterval(function() {
//       //   console.log("------------------------------------------ next start");

//       //   cursor._next(function(err, doc) {
//       //     console.log("------------------------------------------ next end");
//       //     console.dir(doc);
//       //   });
//       // }, 0);

//       setTimeout(function() {
//         currentState = currentState + 1;

//         setTimeout(function() {
//           currentState = currentState + 1;
//         }, 500);
//       }, 1000);

//       // // Execute next
//       // cursor._next(function(err, d) {
//       //   test.equal(null, err);
//       //   test.equal(1, d.a);
//       //   test.equal(1, cursor.bufferedCount());

//       //   // Kill the cursor
//       //   cursor._next(function(err, d) {
//       //     test.equal(null, err);
//       //     test.equal(2, d.a);
//       //     test.equal(0, cursor.bufferedCount());
//       //     // Destroy the server connection
//       //     _server.destroy();
//       //     // Finish the test
//       //     test.done();
//       //   });
//       // });

//       // primaryServer.destroy();
//       // firstSecondaryServer.destroy();
//       // arbiterServer.destroy();
//       // server.destroy();
//       // running = false;

//       // test.done();
//     });

// // Gives proxies a chance to boot up
// setTimeout(function() {
//   server.connect();
// }, 100)
//   }
// }
