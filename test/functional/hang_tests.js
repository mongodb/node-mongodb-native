"use strict";
//
// exports['Should Correctly Do MongoClient with bufferMaxEntries:0 and ordered execution'] = {
//   metadata: {
//     requires: {
//       node: ">0.8.0",
//       topology: ['replicaset']
//       // topology: ['single']
//     }
//   },
//
//   // The actual test we wish to run
//   test: function(configuration, test) {
//     var MongoClient = configuration.require.MongoClient;
//     var col;
//     var db;
//     var url = configuration.url();
//
//     console.log("=============================== 0")
//     MongoClient.connect(url, function(err, client) {
//       db = client;
//       col = db.collection('test');
//     });
//
//     setTimeout(function() {
//       col.findOne(function(e, r) {
//         test.equal(null, e);
//
//         db.close();
//         test.done();
//       });
//     }, 3 * 60000);
//   }
// }


// var mongodb = require("mongodb");
//
// var uri = 'mongodb://user:pass@HOST1:PORT1/DB';
// var interval = 3 * 60000;
//
// let coll;
//
// mongodb.MongoClient.connect(uri)
//     .then(db => db.collection('test'))
//     .then((collection) => {
//         console.log(Date() + ' Mongo connection established');
//         coll = collection;
//     })
//     .catch((err) => {
//         console.log(err);
//         process.exit(1);
//     });
//
// var openThenClose = () => {
//     coll.findOne({"name": "foo"})
//         .then((item) => {
//             console.log(Date() + " _id:" + item._id);
//         })
//         .catch((err) => {
//             console.log(Date() + " " + err);
//         });
//     };
//
// setInterval(openThenClose, interval);
