var Step = require('step')
  , format = require('util').format;

/**
 * @ignore
 */
exports['Should retrieve correct count after primary killed'] = function(configuration, test) {
  var mongo = configuration.getMongoPackage()
    , MongoClient = mongo.MongoClient
    , ReadPreference = mongo.ReadPreference
    , ReplSetServers = mongo.ReplSetServers
    , Server = mongo.Server
    , Db = mongo.Db;

  // var db = configuration.db();
  var replicasetManager = configuration.getReplicasetManager();

  // Replica configuration
  var replSet = new ReplSetServers( [
      new Server(replicasetManager.host, replicasetManager.ports[0]),
      new Server(replicasetManager.host, replicasetManager.ports[1]),
      new Server(replicasetManager.host, replicasetManager.ports[2])
    ],
    {rs_name:replicasetManager.name, readPreference:ReadPreference.SECONDARY_PREFERRED}
  );

  var db = new Db('integration_test_', replSet, {w:0});  
  db.open(function(err, db) {    
    // Drop collection on replicaset
    db.dropCollection('testsets', function(err, r) {

      var collection = db.collection('testsets');
      // Insert a dummy document
      collection.insert({a:20}, {safe: {w:2, wtimeout: 10000}}, function(err, r) {
        test.equal(null, err);

        // Execute a count
        collection.count(function(err, c) {
          test.equal(null, err);
          test.equal(1, c);
           
          // Close starting connection
          db.close();

          // Ensure replication happened in time
          setTimeout(function() {
            // Kill the primary
            configuration.killPrimary(function(node) {
              test.equal(null, err);

              collection.insert({a:30}, {w:1}, function(err, r) {
                test.ok(err != null);
                test.done();
              });
            });
          }, 2000);
        });
      });
    });
  });
}

/**
 * @ignore
 */
exports['Should correctly throw timeout for replication to servers on inserts'] = function(configuration, test) {
  var db = configuration.db();

  // Drop collection on replicaset
  db.dropCollection('shouldCorrectlyThrowTimeoutForReplicationToServersOnInserts', function(err, r) {

    var collection = db.collection('shouldCorrectlyThrowTimeoutForReplicationToServersOnInserts');
    // Insert a dummy document
    collection.insert({a:20}, {w:7, wtimeout: 2000}, function(err, r) {
      // console.log("=========================================")
      // console.dir(err)
      // console.dir(r)
      test.ok(err != null);
      // test.ok(err.err.indexOf("time") != -1);
      // test.equal(true, err.wtimeout);
      test.done();
    });
  });
}

/**
 * @ignore
 */
exports['Should correctly execute safe findAndModify'] = function(configuration, test) {
  var db = configuration.db();

  // Drop collection on replicaset
  db.dropCollection('shouldCorrectlyExecuteSafeFindAndModify', function(err, r) {

    var collection = db.collection('shouldCorrectlyExecuteSafeFindAndModify');
    // Insert a dummy document
    collection.insert({a:20}, {safe: {w:2, wtimeout: 10000}}, function(err, r) {
      test.equal(null, err);

      // Execute a safe insert with replication to two servers
      collection.findAndModify({'a':20}, [['a', 1]], {'$set':{'b':3}}, {new:true, safe: {w:2, wtimeout: 10000}}, function(err, result) {
        test.equal(20, result.a);
        test.equal(3, result.b);
        test.done();
      });
    });
  });
}

/**
 * @ignore
 */
exports['Should correctly insert after primary comes back up'] = function(configuration, test) {
  var db = configuration.db();
  
  // Drop collection on replicaset
  db.dropCollection('shouldCorrectlyInsertAfterPrimaryComesBackUp', function(err, r) {

    var collection = db.collection('shouldCorrectlyInsertAfterPrimaryComesBackUp');
    // Insert a dummy document
    collection.insert({a:20}, {safe: {w:3, wtimeout: 10000}}, function(err, r) {
      test.equal(null, err);

      // Kill the primary
      configuration.killPrimary(9, {killNodeWaitTime:0}, function(node) {
        
        // Attempt insert (should fail)
        collection.insert({a:30}, {safe: {w:2, wtimeout: 10000}}, function(err, r) {
          test.ok(err != null);

          collection.insert({a:40}, {safe: {w:2, wtimeout: 10000}}, function(err, r) {
            
            // Peform a count
            collection.count(function(err, count) {
              test.equal(2, count);
              test.done();
            });
          });
        });
      });
    });
  });
}

/**
 * @ignore
 */
exports['Should correctly query after primary comes back up'] = function(configuration, test) {
  var db = configuration.db();

  // Drop collection on replicaset
  db.dropCollection('shouldCorrectlyQueryAfterPrimaryComesBackUp', function(err, r) {

    var collection = db.collection('shouldCorrectlyQueryAfterPrimaryComesBackUp');
    // Insert a dummy document
    collection.insert({a:20}, {safe: {w:2, wtimeout: 10000}}, function(err, r) {
      test.equal(null, err);

      // Kill the primary
      configuration.killPrimary(9, {killNodeWaitTime:0}, function(node) {

        // Ok let's execute same query a couple of times
        collection.find({}).toArray(function(err, items) {
          test.ok(err != null);

          collection.find({}).toArray(function(err, items) {
            test.equal(null, err);
            test.equal(1, items.length);

            collection.find({}).toArray(function(err, items) {
              test.ok(err == null);
              test.equal(1, items.length);
              test.done();
            });
          });
        });
      });
    });
  });
}

/**
 * @ignore
 */
exports['Should work correctly with inserts after bringing master back'] = function(configuration, test) {
  var db = configuration.db();

  // Drop collection on replicaset
  db.dropCollection('shouldWorkCorrectlyWithInserts', function(err, r) {

    var collection = db.collection('shouldWorkCorrectlyWithInserts');
    // Insert a dummy document
    collection.insert({a:20}, {safe: {w:'majority', wtimeout: 30000}}, function(err, r) {
      test.equal(null, err);

      // Execute a count
      collection.count(function(err, c) {
        test.equal(null, err);
        test.equal(1, c);

        // Kill the primary
        configuration.killPrimary(function(node) {

          // Execute a set of inserts
          Step(
            function inserts() {
              var group = this.group();
              collection.save({a:30}, {safe:{w:2, wtimeout: 10000}}, group());
              collection.save({a:40}, {safe:{w:2, wtimeout: 10000}}, group());
              collection.save({a:50}, {safe:{w:2, wtimeout: 10000}}, group());
              collection.save({a:60}, {safe:{w:2, wtimeout: 10000}}, group());
              collection.save({a:70}, {safe:{w:2, wtimeout: 10000}}, group());
            },

            function finishUp(err, values) {
              if(err != null) console.log(err.stack)
              // Restart the old master and wait for the sync to happen
              configuration.restartKilledNodes(function(err, result) {
                // Contains the results
                var results = [];

                collection.find().each(function(err, item) {
                  if(item == null) {
                    // Ensure we have the correct values
                    test.equal(6, results.length);
                    [20, 30, 40, 50, 60, 70].forEach(function(a) {
                      test.equal(1, results.filter(function(element) {
                        return element.a == a;
                      }).length);
                    });

                    // Run second check
                    collection.save({a:80}, {w:1}, function(err, r) {
                      if(err != null) debug("shouldWorkCorrectlyWithInserts :: " + inspect(err));

                      collection.find().toArray(function(err, items) {
                        if(err != null) debug("shouldWorkCorrectlyWithInserts :: " + inspect(err));

                        // Ensure we have the correct values
                        test.equal(7, items.length);

                        // Sort items by a
                        items = items.sort(function(a,b) { return a.a > b.a});
                        // Test all items
                        test.equal(20, items[0].a);
                        test.equal(30, items[1].a);
                        test.equal(40, items[2].a);
                        test.equal(50, items[3].a);
                        test.equal(60, items[4].a);
                        test.equal(70, items[5].a);
                        test.equal(80, items[6].a);
                        test.done();
                      });
                    });
                  } else {
                    results.push(item);
                  }
                });
              })
            }
            );
          });
        });
      });
  });
}

/**
 * @ignore
 */
exports['Should not timeout'] = function(configuration, test) {
  var db = configuration.db();
  var collection = db.collection('shouldnottimeout');

  configuration.killPrimary(2, function(node) {
    var pending = 2;

    collection.update({name: 'a'}, {'$inc': {v: 1}}, {upsert: true, w:1}, done);
    collection.findOne({name: 'a'}, done);

    function done (err, result) {
      if (--pending) return;
      test.done();
    }
  });
}

// /**
//  * @ignore
//  */
// exports['Should Correctly kill and restart prioritized primary'] = function(configuration, test) {
//   var Db = configuration.getMongoPackage().Db
//     , Server = configuration.getMongoPackage().Server
//     , MongoClient = configuration.getMongoPackage().MongoClient
//     , ReplSetServers = configuration.getMongoPackage().ReplSetServers
//     , ReadPreference = configuration.getMongoPackage().ReadPreference;

//   var replicaset = configuration.getReplicasetManager();

//   var replSet = new ReplSetServers( [
//       new Server( replicaset.host, replicaset.ports[1]),
//       new Server( replicaset.host, replicaset.ports[0]),
//     ],
//     {rs_name:replicaset.name, poolSize:1, readPreference: ReadPreference.PRIMARY}
//   );

//   var dbName = 'foo';
//   var connectTimeoutMS = 100;

//   // Set up config
//   var reconfigs = {}
//   reconfigs[replicaset.host + ":" + replicaset.ports[0]] = {
//     priority: 100
//   }

//   // Restart the replicaset with a new config
//   replicaset.reStartAndConfigure(reconfigs, function(err, result) {
//     // Kill server and restart
//     var db = new Db('users', replSet, {w:3});
//     db.open(function(err, db) {
//     //
//     // Authenticate using MongoClient
//     MongoClient.connect(format("mongodb://%s:%s/%s?rs_name=%s&readPreference=primary&w=3&connectTimeoutMS=%s"
//       , replicaset.host, replicaset.ports[0], dbName, replicaset.name, connectTimeoutMS), function(err, db) {
//         test.equal(null, err);

//         // Should fail as we are not authenticated to write to t collection
//         db.collection('t').insert({a:1}, function(err, result) {
//           test.equal(null, err);

//           console.log("============================== kill primary")
//           // Kill the primary
//           configuration.killPrimary(9, function(err, deadNode) {

//             console.log("============================== query 0")
//             db.collection('t').find().toArray(function(err, docs) {

//               console.log("============================== restart primary")
//               configuration.reStart(deadNode, {timeout:1000}, function(err, result) {
//                 var timeoutfunction = function() {
//                   db.collection('t').find().toArray(function(err, docs) {
//                     console.log("=================== found docs")
//                     console.dir(err)
//                     console.dir(docs)
                    
//                     setTimeout(timeoutfunction, 0);
//                   });
//                 }

//                 var interval = setTimeout(timeoutfunction, 0);

//                 // console.log("============================== finish up")
//                 // db.close();
//                 // test.done();
//                 // // Execute reconnect command
//                 // db.command({ismaster:true}, function(err, doc) {
//                 //   var connections = db.serverConfig.allRawConnections();
//                 //   var totalLength = connections.length;
//                 //   var totalErrors = 0;

//                 //   for(var i = 0; i < connections.length; i++) {
//                 //     var cursor = db.collection('t').find({});
//                 //     // Force the connection
//                 //     cursor.connection = connections[i];
//                 //     // Execute toArray
//                 //     cursor.toArray(function(err, docs) {
//                 //       totalLength = totalLength - 1;

//                 //       if(totalLength == 0) {
//                 //         test.equal(0, totalErrors);
//                 //         db.close();
//                 //         test.done();
//                 //       }
//                 //     });
//                 //   }
//                 // });
//               });
//             });
//           });
//         });
//       });
//     });
//   });
// }






