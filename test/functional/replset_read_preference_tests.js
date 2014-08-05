var format = require('util').format
  , fs = require('fs');

exports['Should Correctly Use Secondary Server with Query when using NEAREST'] = {
  metadata: { requires: { topology: 'replicaset' } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var mongo = configuration.require
      , MongoClient = mongo.MongoClient
      , ReadPreference = mongo.ReadPreference
      , ReplSet = mongo.ReplSet
      , Server = mongo.Server
      , Db = mongo.Db;

    // Replica configuration
    var replSet = new ReplSet([
        new Server(configuration.host, configuration.port),
        new Server(configuration.host, configuration.port + 1),
        new Server(configuration.host, configuration.port + 2)
      ],
      {rs_name:configuration.replicasetName, debug:true}
    );

    // Get the manager
    var manager = configuration.manager;

    // Open the database
    var db = new Db('integration_test_', replSet, {w:1, readPreference: ReadPreference.NEAREST});
    db.open(function(err, db) {
      test.equal(null, err);

      db.command({ismaster:true}, function(err, result) {
        test.equal(null, err);

        // Nearest strategy
        var nearest = db.serverConfig.replset.readPreferenceStrategies['nearest'];

        setTimeout(function() {
          // Set the primary to high ping rate
          nearest.data[result.primary] = 5000;

          // Execute a query
          db.collection('nearest_collection_test').insert({a:1}, {w:3, wtimeout:10000}, function(err, doc) {
            test.equal(null, err);    

            db.serverConfig.replset.on('pickedServer', function(readPreference, server) {
              test.ok(server.name != result.primary);
            });

            db.collection('nearest_collection_test').findOne({a:1}, function(err, doc) {
              test.equal(null, err);
              test.equal(1, doc.a);

              db.close();
              test.done();
            });
          });
        }, 6000);
      });
    });
  }
}

exports['Should Correctly Pick lowest ping time'] = {
  metadata: { requires: { topology: 'replicaset' } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var mongo = configuration.require
      , MongoClient = mongo.MongoClient
      , ReadPreference = mongo.ReadPreference
      , ReplSet = mongo.ReplSet
      , Server = mongo.Server
      , Db = mongo.Db;

    var manager = configuration.manager;

    // Replica configuration
    var replSet = new ReplSet([
        new Server(configuration.host, configuration.port),
        new Server(configuration.host, configuration.port + 1),
        new Server(configuration.host, configuration.port + 2)
      ],
      {strategy:'ping', secondaryAcceptableLatencyMS: 5, rs_name:configuration.replicasetName, debug:true}
    );

    // Open the database
    var db = new Db('integration_test_', replSet, {w:1});
    // Trigger test once whole set is up
    db.on("fullsetup", function() {

      db.command({ismaster:true}, function(err, result) {
        test.equal(null, err);

        var time = 10;

        // Nearest strategy
        var nearest = db.serverConfig.replset.readPreferenceStrategies['nearest'];

        // Set the ping times
        var keys = Object.keys(nearest.data);
        for(var i = 0; i < keys.length; i++) {
          nearest.data[keys[i]] = time;
          time += 10;
        }

        // Set primary to the highest ping time
        nearest.data[result.primary] = time;

        // Pick the server
        db.serverConfig.replset.once('pickedServer', function(readPreference, server) {
          test.equal('localhost:31000', server.name);
        });

        // Attempt to perform a read
        db.collection('somecollection').findOne({}, {readPreference: new ReadPreference(ReadPreference.NEAREST)}, function(err, doc) {
          test.equal(null, err);          

          // Pick the server
          db.serverConfig.replset.once('pickedServer', function(readPreference, server) {
            test.equal('localhost:31002', server.name);
          });

          // Attempt to perform a read
          db.collection('somecollection').findOne({}, {readPreference: new ReadPreference(ReadPreference.SECONDARY)}, function(err, doc) {
            test.equal(null, err);          

            // Pick the server
            db.serverConfig.replset.once('pickedServer', function(readPreference, server) {
              test.equal('localhost:31001', server.name);
            });

            // Attempt to perform a read
            db.collection('somecollection').findOne({}, {readPreference: new ReadPreference(ReadPreference.SECONDARY_PREFERRED)}, function(err, doc) {
              test.equal(null, err);          

              // Pick the server
              db.serverConfig.replset.once('pickedServer', function(readPreference, server) {
                test.equal('localhost:31000', server.name);
              });

              // Attempt to perform a read
              db.collection('somecollection').findOne({}, {readPreference: new ReadPreference(ReadPreference.PRIMARY)}, function(err, doc) {
                test.equal(null, err);          

                // Close db
                db.close();
                test.done();           
              });                
            });
          });
        });
      });
    });

    db.open(function(err, p_db) {
      db = p_db;
    });
  }
}

exports['Should Correctly Vary read server when using readpreference NEAREST'] = {
  metadata: { requires: { topology: 'replicaset' } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var mongo = configuration.require
      , MongoClient = mongo.MongoClient
      , ReadPreference = mongo.ReadPreference
      , ReplSet = mongo.ReplSet
      , Server = mongo.Server
      , Db = mongo.Db;

    var replicasetManager = configuration.manager;

    // Replica configuration
    var replSet = new ReplSet([
        new Server(configuration.host, configuration.port),
        new Server(configuration.host, configuration.port + 1),
        new Server(configuration.host, configuration.port + 2)
      ],
      {readPreference: ReadPreference.NEAREST, rs_name:configuration.replicasetName, debug:true}
    );

    // Open the database
    var db = new Db('integration_test_', replSet, {w:1, readPreference: ReadPreference.NEAREST});
    db.on("fullsetup", function() {
      // Nearest strategy
      var nearest = db.serverConfig.replset.readPreferenceStrategies['nearest'];
      // Servers viewed
      var viewedServers = {};

      // Pick the server
      db.serverConfig.replset.once('pickedServer', function(readPreference, server) {
        viewedServers[server.name] = server.name;
      });

      db.collection('nearest_collection_test').findOne({a:1}, function(err, doc) {
        test.equal(null, err);

        // Pick the server
        db.serverConfig.replset.once('pickedServer', function(readPreference, server) {
          viewedServers[server.name] = server.name;
        });

        db.collection('nearest_collection_test').findOne({a:1}, function(err, doc) {
          test.equal(null, err);

          // Pick the server
          db.serverConfig.replset.once('pickedServer', function(readPreference, server) {
            viewedServers[server.name] = server.name;
          });

          db.collection('nearest_collection_test').findOne({a:1}, function(err, doc) {
            test.equal(null, err);
            test.ok(Object.keys(viewedServers).length > 1);

            db.close();
            test.done();
          });
        });
      });
    });

    db.open(function(err, p_db) {
      db = p_db;
    });
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyReadFromGridstoreWithSecondaryReadPreference = {
  metadata: { requires: { topology: 'replicaset' } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID
      , ReadPreference = configuration.require.ReadPreference
      , ReplSet = configuration.require.ReplSet
      , Server = configuration.require.Server
      , Db = configuration.require.Db;

    // Replica configuration
    var replSet = new ReplSet([
        new Server(configuration.host, configuration.port),
        new Server(configuration.host, configuration.port + 1),
        new Server(configuration.host, configuration.port + 2)
      ],
      {readPreference: ReadPreference.NEAREST, rs_name:configuration.replicasetName, debug:true}
    );

    // Create an id
    var id = new ObjectID();
    // Open the database
    var db = new Db('integration_test_', replSet, {w:1});
    db.on("fullsetup", function() {
      db.command({ismaster:true}, function(err, result) {
        test.equal(null, err);

        var secondaries = {};
        var gridStore = new GridStore(db, id, 'w', {w:3});

        result.hosts.forEach(function(s) {
          if(result.primary != s && result.arbiters.indexOf(s) == -1)
            secondaries[s] = s;
        });

        // Force multiple chunks to be stored
        gridStore.chunkSize = 5000;
        var fileSize = fs.statSync('./test/functional/data/test_gs_weird_bug.png').size;
        var data = fs.readFileSync('./test/functional/data/test_gs_weird_bug.png');

        gridStore.open(function(err, gridStore) {
          test.equal(null, err);

          // Write the file using write
          gridStore.write(data, function(err, doc) {
            test.equal(null, err);
        
            gridStore.close(function(err, doc) {
              test.equal(null, err);

              // Pick the server
              db.serverConfig.replset.once('pickedServer', function(readPreference, server) {
                test.ok(secondaries[server.name] != null);
              });

              // Read the file using readBuffer
              new GridStore(db, doc._id, 'r', {readPreference:ReadPreference.SECONDARY}).open(function(err, gridStore) {
                gridStore.read(function(err, data2) {
                  test.equal(null, err);
                  test.equal(data.toString('base64'), data2.toString('base64'));
                  test.done();
                })
              });
            });
          })
        });
      });
    });

    db.open(function(err, p_db) {
      db = p_db;
    });
  }
}

/**
 * @ignore
 */
exports['shouldStillQuerySecondaryWhenNoPrimaryAvailable'] = function(configuration, test) {
  var mongo = configuration.require
    , MongoClient = mongo.MongoClient
    , ReadPreference = mongo.ReadPreference;

  var manager = configuration.manager;
  var url = format("mongodb://localhost:%s,localhost:%s,localhost:%s/integration_test_?rs_name=%s"
    , configuration.port, configuration.port + 1, configuration.port + 1, configuration.replicasetName);

  // Connect using the MongoClient
  MongoClient.connect(url, { 
      replSet: {
        //set replset check interval to be much smaller than our querying interval
        haInterval: 50,
        socketOptions: {
          connectTimeoutMS: 500
        }
      }
    }, function(err,db){
      test.equal(null, err);
      test.ok(db != null);

      db.collection("replicaset_readpref_test").insert({testfield:123}, function(err, result) {
        test.equal(null, err);
        
        db.collection("replicaset_readpref_test").findOne({}, function(err, result){
          test.equal(null, err);
          test.equal(result.testfield, 123);

          // wait five seconds, then kill 2 of the 3 nodes that are up.
          setTimeout(function(){
            manager.shutdown('secondary', {signal: -15}, function() {
              manager.shutdown('primary', {signal: -15}, function() {});
            });
          }, 5000);

          // we should be able to continue querying for a full minute
          var counter = 0;
          var callbacksWaiting = 0;
          var intervalid = setInterval(function() {
            if(counter++ >= 30){
              clearInterval(intervalid);
              db.close();
              test.done();
              return;
            }

            callbacksWaiting++;

            db.collection("replicaset_readpref_test").findOne({},
              {readPreference: ReadPreference.SECONDARY_PREFERRED},
              function(err, result){
                callbacksWaiting--;
            });
          }, 1000);
        });
      });
    });
};

/**
 * @ignore
 */
exports['Connection to replicaset with primary read preference'] = function(configuration, test) {
  var mongo = configuration.require
    , MongoClient = mongo.MongoClient
    , ReadPreference = mongo.ReadPreference
    , ReplSet = mongo.ReplSet
    , Server = mongo.Server
    , Db = mongo.Db;

  // Replica configuration
  var replSet = new ReplSet( [
      new Server(configuration.host, configuration.port),
      new Server(configuration.host, configuration.port + 1),
      new Server(configuration.host, configuration.port + 2)
    ],
    {rs_name:configuration.replicasetName, debug:true}
  );

  // Create db instance
  var db = new Db('integration_test_', replSet, {w:0, readPreference:ReadPreference.PRIMARY});
  // Trigger test once whole set is up
  db.on("fullsetup", function() {
    // Pick the server
    db.serverConfig.replset.once('pickedServer', function(readPreference, server) {
      test.equal('localhost:31000', server.name);
    });

    // Grab the collection
    var collection = db.collection("read_preference_replicaset_test_0");
    // Attempt to read (should fail due to the server not being a primary);
    collection.find().toArray(function(err, items) {
      db.close();
      test.done();
    });
  });

  // Connect to the db
  db.open(function(err, p_db) {
    db = p_db;
  });
}

/**
 * @ignore
 */
exports['Should Set read preference at collection level using collection method'] = function(configuration, test) {
  var mongo = configuration.require
    , MongoClient = mongo.MongoClient
    , ReadPreference = mongo.ReadPreference
    , ReplSet = mongo.ReplSet
    , Server = mongo.Server
    , Db = mongo.Db;

  // Replica configuration
  var replSet = new ReplSet( [
      new Server(configuration.host, configuration.port),
      new Server(configuration.host, configuration.port + 1),
      new Server(configuration.host, configuration.port + 2)
    ],
    {rs_name:configuration.replicasetName, debug:true}
  );

  // Create db instance
  var db = new Db('integration_test_', replSet, {w:0});
  // Connect to the db
  db.on("fullsetup", function() {
    db.command({ismaster:true}, function(err, result) {
      test.equal(null, err);

      // Filter out the secondaries
      var secondaries = {};
      result.hosts.forEach(function(s) {
        if(result.primary != s && result.arbiters.indexOf(s) == -1)
          secondaries[s] = s;
      });

      // Pick the server
      db.serverConfig.replset.once('pickedServer', function(readPreference, server) {
        test.ok(secondaries[server.name] != null);
      });

      // Grab the collection
      var collection = db.collection("read_preferences_all_levels_0", {readPreference:ReadPreference.SECONDARY});
      // Attempt to read (should fail due to the server not being a primary);
      var cursor = collection.find()
      cursor.toArray(function(err, items) {
        test.equal(ReadPreference.SECONDARY, cursor.readPreference.preference)
        db.close();
        test.done();
      });
    });
  });

  // Connect to the db
  db.open(function(err, p_db) {
    db = p_db;
  });
}

/**
 * @ignore
 */
exports['Should Set read preference at collection level using createCollection method'] = function(configuration, test) {
  var mongo = configuration.require
    , MongoClient = mongo.MongoClient
    , ReadPreference = mongo.ReadPreference
    , ReplSet = mongo.ReplSet
    , Server = mongo.Server
    , Db = mongo.Db;

  // Replica configuration
  var replSet = new ReplSet( [
      new Server(configuration.host, configuration.port),
      new Server(configuration.host, configuration.port + 1),
      new Server(configuration.host, configuration.port + 2)
    ],
    {rs_name:configuration.replicasetName, debug:true}
  );

  // Create db instance
  var db = new Db('integration_test_', replSet, {w:0});
  // Connect to the db
  db.on("fullsetup", function() {
    db.command({ismaster:true}, function(err, result) {
      // Filter out the secondaries
      var secondaries = {};
      result.hosts.forEach(function(s) {
        if(result.primary != s && result.arbiters.indexOf(s) == -1)
          secondaries[s] = s;
      });

      // Grab the collection
      db.createCollection("read_preferences_all_levels_0", {readPreference:ReadPreference.SECONDARY}, function(err, collection) {
        test.equal(null, err);    

        // Pick the server
        db.serverConfig.replset.once('pickedServer', function(readPreference, server) {
          test.ok(secondaries[server.name] != null);
        });
        
        var cursor = collection.find();
        // Attempt to read (should fail due to the server not being a primary);
        cursor.toArray(function(err, items) {
          // Does not get called or we don't care
          test.equal(ReadPreference.SECONDARY, cursor.readPreference.preference)
          db.close();
          test.done();
        });
      });
    });
  });

  // Connect to the db
  db.open(function(err, p_db) {
    db = p_db;
  });
}

/**
 * @ignore
 */
exports['Should Set read preference at cursor level'] = function(configuration, test) {
  var mongo = configuration.require
    , MongoClient = mongo.MongoClient
    , ReadPreference = mongo.ReadPreference
    , ReplSet = mongo.ReplSet
    , Server = mongo.Server
    , Db = mongo.Db;

  // Replica configuration
  var replSet = new ReplSet( [
      new Server(configuration.host, configuration.port),
      new Server(configuration.host, configuration.port + 1),
      new Server(configuration.host, configuration.port + 2)
    ],
    {rs_name:configuration.replicasetName, debug:true}
  );

  // Create db instance
  var db = new Db('integration_test_', replSet, {w:0});
  // Connect to the db
  db.on("fullsetup", function() {
    db.command({ismaster:true}, function(err, result) {
      // Filter out the secondaries
      var secondaries = {};
      result.hosts.forEach(function(s) {
        if(result.primary != s && result.arbiters.indexOf(s) == -1)
          secondaries[s] = s;
      });

      // // Let's get the primary server and wrap the checkout Method to ensure it's the one called for read
      // var checkoutReaderMethod = p_db.serverConfig.checkoutReader;

      // // Set up checkoutReader to catch correct write request
      // p_db.serverConfig.checkoutReader = function(readPreference) {
      //   executedCorrectlyRead = true;
      //   return checkoutReaderMethod.apply(this, [readPreference]);
      // }

      // Grab the collection
      var collection = db.collection("read_preferences_all_levels_1");

      // Pick the server
      db.serverConfig.replset.once('pickedServer', function(readPreference, server) {
        // console.log("-------------------------------------------- pickedServer")
        // console.dir(readPreference)
        // console.log(server.name)

        db.serverConfig.replset.once('pickedServer', function(readPreference, server) {
          // console.log("-------------------------------------------- pickedServer")
          // console.dir(readPreference)
          // console.log(server.name)
          test.ok(secondaries[server.name] != null);
        });
        // test.ok(secondaries[server.name] != null);
      });

      // Attempt to read (should fail due to the server not being a primary);
      collection.find().setReadPreference(ReadPreference.SECONDARY).toArray(function(err, items) {
        db.close();
        test.done();
      });
    });
  });

  // Connect to the db
  db.open(function(err, p_db) {
    db = p_db;
  });
}

// /**
//  * @ignore
//  */
// exports['Attempt to change read preference at cursor level after object read legacy'] = function(configuration, test) {
//   var mongo = configuration.require
//     , MongoClient = mongo.MongoClient
//     , ReadPreference = mongo.ReadPreference
//     , ReplSet = mongo.ReplSet
//     , Server = mongo.Server
//     , Db = mongo.Db;

//   var replicasetManager = configuration.getReplicasetManager();

//   // Replica configuration
//   var replSet = new ReplSet( [
//       new Server(configuration.host, configuration.port),
//       new Server(configuration.host, configuration.port + 1),
//       new Server(configuration.host, configuration.port + 2)
//     ],
//     {rs_name:configuration.replicasetName}
//   );

//   // Execute flag
//   var executedCorrectlyWrite = false;
//   var executedCorrectlyRead = false;

//   // Create db instance
//   var db = new Db('integration_test_', replSet, {w:0});
//   // Connect to the db
//   db.open(function(err, p_db) {
//     // Let's get the primary server and wrap the checkout Method to ensure it's the one called for read
//     var checkoutReaderMethod = p_db.serverConfig.checkoutReader;
//     // Set up checkoutReader to catch correct write request
//     p_db.serverConfig.checkoutReader = function(readPreference) {
//       executedCorrectlyRead = true;
//       return checkoutReaderMethod.apply(this, [readPreference]);
//     }

//     // Grab the collection
//     var collection = db.collection("read_preferences_all_levels_2");
//     // Insert a bunch of documents
//     collection.insert([{a:1}, {b:1}, {c:1}], {w:1}, function(err) {
//       test.equal(null, err);

//       // Set up cursor
//       var cursor = collection.find().setReadPreference(Server.READ_SECONDARY_ONLY);
//       cursor.each(function(err, result) {
//         if(result == null) {
//           test.equal(executedCorrectlyRead, true);

//           p_db.close();
//           test.done();
//         } else {
//           try {
//             // Try to change the read preference it should not work as the query was executed
//             cursor.setReadPreference(Server.READ_PRIMARY);
//             test.ok(false);
//           } catch(err) {}
//           // With callback
//           cursor.setReadPreference(Server.READ_PRIMARY, function(err) {
//             test.ok(err != null)
//           })

//           // Assert it's the same
//           test.equal(Server.READ_SECONDARY_ONLY, cursor.readPreference);
//         }
//       });
//     });
//   });
// }

// /**
//  * @ignore
//  */
// exports['Set read preference at db level'] = function(configuration, test) {
//   var mongo = configuration.require
//     , MongoClient = mongo.MongoClient
//     , ReadPreference = mongo.ReadPreference
//     , ReplSet = mongo.ReplSet
//     , Server = mongo.Server
//     , Db = mongo.Db;

//   var replicasetManager = configuration.getReplicasetManager();

//   // Replica configuration
//   var replSet = new ReplSet( [
//       new Server(configuration.host, configuration.port),
//       new Server(configuration.host, configuration.port + 1),
//       new Server(configuration.host, configuration.port + 2)
//     ],
//     {rs_name:configuration.replicasetName}
//   );

//   // Execute flag
//   var executedCorrectlyWrite = false;
//   var executedCorrectlyRead = false;

//   // Create db instance
//   var db = new Db('integration_test_', replSet, {w:0, readPreference:new ReadPreference(ReadPreference.SECONDARY)});
//   // Connect to the db
//   db.open(function(err, p_db) {
//     // Let's get the primary server and wrap the checkout Method to ensure it's the one called for read
//     var checkoutReaderMethod = p_db.serverConfig.checkoutReader;

//     p_db.serverConfig.checkoutReader = function(readPreference) {
//       executedCorrectlyRead = true;
//       return checkoutReaderMethod.apply(this, [readPreference]);
//     }

//     // Grab the collection
//     var collection = db.collection("read_preferences_all_levels_0");
//     // Attempt to read (should fail due to the server not being a primary);
//     var cursor = collection.find()
//     cursor.toArray(function(err, items) {
//       // Does not get called or we don't care
//       test.ok(executedCorrectlyRead);
//       test.equal(ReadPreference.SECONDARY, cursor.readPreference.mode)
//       p_db.close();
//       test.done();
//     });
//   });
// }

// /**
//  * @ignore
//  */
// exports['Set read preference at collection level using collection method'] = function(configuration, test) {
//   var mongo = configuration.require
//     , MongoClient = mongo.MongoClient
//     , ReadPreference = mongo.ReadPreference
//     , ReplSet = mongo.ReplSet
//     , Server = mongo.Server
//     , Db = mongo.Db;

//   var replicasetManager = configuration.getReplicasetManager();

//   // Replica configuration
//   var replSet = new ReplSet( [
//       new Server(configuration.host, configuration.port),
//       new Server(configuration.host, configuration.port + 1),
//       new Server(configuration.host, configuration.port + 2)
//     ],
//     {rs_name:configuration.replicasetName}
//   );

//   // Execute flag
//   var executedCorrectlyWrite = false;
//   var executedCorrectlyRead = false;

//   // Create db instance
//   var db = new Db('integration_test_', replSet, {w:0});
//   // Connect to the db
//   db.open(function(err, p_db) {
//     // Let's get the primary server and wrap the checkout Method to ensure it's the one called for read
//     var checkoutReaderMethod = p_db.serverConfig.checkoutReader;

//     p_db.serverConfig.checkoutReader = function(readPreference) {
//       executedCorrectlyRead = true;
//       return checkoutReaderMethod.apply(this, [readPreference]);
//     }

//     // Grab the collection
//     var collection = db.collection("read_preferences_all_levels_0", {readPreference:new ReadPreference(ReadPreference.SECONDARY)});
//     // Attempt to read (should fail due to the server not being a primary);
//     var cursor = collection.find()
//     cursor.toArray(function(err, items) {
//       // Does not get called or we don't care
//       test.ok(executedCorrectlyRead);
//       test.equal(ReadPreference.SECONDARY, cursor.readPreference.mode)
//       p_db.close();
//       test.done();
//     });
//   });
// }

// /**
//  * @ignore
//  */
// exports['Set read preference at collection level using createCollection method'] = function(configuration, test) {
//   var mongo = configuration.require
//     , MongoClient = mongo.MongoClient
//     , ReadPreference = mongo.ReadPreference
//     , ReplSet = mongo.ReplSet
//     , Server = mongo.Server
//     , Db = mongo.Db;

//   var replicasetManager = configuration.getReplicasetManager();

//   // Replica configuration
//   var replSet = new ReplSet( [
//       new Server(configuration.host, configuration.port),
//       new Server(configuration.host, configuration.port + 1),
//       new Server(configuration.host, configuration.port + 2)
//     ],
//     {rs_name:configuration.replicasetName}
//   );

//   // Execute flag
//   var executedCorrectlyWrite = false;
//   var executedCorrectlyRead = false;

//   // Create db instance
//   var db = new Db('integration_test_', replSet, {w:0});
//   // Connect to the db
//   db.open(function(err, p_db) {
//     // Let's get the primary server and wrap the checkout Method to ensure it's the one called for read
//     var checkoutReaderMethod = p_db.serverConfig.checkoutReader;

//     p_db.serverConfig.checkoutReader = function(readPreference) {
//       executedCorrectlyRead = true;
//       return checkoutReaderMethod.apply(this, [readPreference]);
//     }

//     // Grab the collection
//     db.createCollection("read_preferences_all_levels_0", {readPreference:new ReadPreference(ReadPreference.SECONDARY)}, function(err, collection) {
//       var cursor = collection.find();
//       // Attempt to read (should fail due to the server not being a primary);
//       cursor.toArray(function(err, items) {
//         // Does not get called or we don't care
//         test.ok(executedCorrectlyRead);
//         // test.equal(ReadPreference.SECONDARY, cursor.readPreference.mode)
//         p_db.close();
//         test.done();
//       });
//     });
//   });
// }

// /**
//  * @ignore
//  */
// exports['Set read preference at cursor level'] = function(configuration, test) {
//   var mongo = configuration.require
//     , MongoClient = mongo.MongoClient
//     , ReadPreference = mongo.ReadPreference
//     , ReplSet = mongo.ReplSet
//     , Server = mongo.Server
//     , Db = mongo.Db;

//   var replicasetManager = configuration.getReplicasetManager();

//   // Replica configuration
//   var replSet = new ReplSet( [
//       new Server(configuration.host, configuration.port),
//       new Server(configuration.host, configuration.port + 1),
//       new Server(configuration.host, configuration.port + 2)
//     ],
//     {rs_name:configuration.replicasetName}
//   );

//   // Execute flag
//   var executedCorrectlyWrite = false;
//   var executedCorrectlyRead = false;

//   // Create db instance
//   var db = new Db('integration_test_', replSet, {w:0});
//   // Connect to the db
//   db.open(function(err, p_db) {
//     // Let's get the primary server and wrap the checkout Method to ensure it's the one called for read
//     var checkoutReaderMethod = p_db.serverConfig.checkoutReader;

//     // Set up checkoutReader to catch correct write request
//     p_db.serverConfig.checkoutReader = function(readPreference) {
//       executedCorrectlyRead = true;
//       return checkoutReaderMethod.apply(this, [readPreference]);
//     }

//     // Grab the collection
//     var collection = p_db.collection("read_preferences_all_levels_1");
//     // Attempt to read (should fail due to the server not being a primary);
//     collection.find().setReadPreference(new ReadPreference(ReadPreference.SECONDARY)).toArray(function(err, items) {
//       // Does not get called or we don't care
//       test.ok(executedCorrectlyRead);
//       p_db.close();
//       test.done();
//     });
//   });
// }

// /**
//  * @ignore
//  */
// exports['Attempt to change read preference at cursor level after object read'] = function(configuration, test) {
//   var mongo = configuration.require
//     , MongoClient = mongo.MongoClient
//     , ReadPreference = mongo.ReadPreference
//     , ReplSet = mongo.ReplSet
//     , Server = mongo.Server
//     , Db = mongo.Db;

//   var replicasetManager = configuration.getReplicasetManager();

//   // Replica configuration
//   var replSet = new ReplSet( [
//       new Server(configuration.host, configuration.port),
//       new Server(configuration.host, configuration.port + 1),
//       new Server(configuration.host, configuration.port + 2)
//     ],
//     {rs_name:configuration.replicasetName}
//   );

//   // Execute flag
//   var executedCorrectlyWrite = false;
//   var executedCorrectlyRead = false;

//   // Create db instance
//   var db = new Db('integration_test_', replSet, {w:0});
//   // Connect to the db
//   db.open(function(err, p_db) {
//     // Let's get the primary server and wrap the checkout Method to ensure it's the one called for read
//     var checkoutReaderMethod = p_db.serverConfig.checkoutReader;
//     // Set up checkoutReader to catch correct write request
//     p_db.serverConfig.checkoutReader = function(readPreference) {
//       executedCorrectlyRead = true;
//       return checkoutReaderMethod.apply(this, [readPreference]);
//     }

//     // Grab the collection
//     var collection = db.collection("read_preferences_all_levels_2");
//     // Insert a bunch of documents
//     collection.insert([{a:1}, {b:1}, {c:1}], {w:1}, function(err) {
//       test.equal(null, err);

//       // Set up cursor
//       var cursor = collection.find().setReadPreference(new ReadPreference(ReadPreference.SECONDARY));
//       cursor.each(function(err, result) {
//         if(result == null) {
//           test.equal(executedCorrectlyRead, true);

//           p_db.close();
//           test.done();
//         } else {
//           try {
//             // Try to change the read preference it should not work as the query was executed
//             cursor.setReadPreference(new ReadPreference(ReadPreference.PRIMARY));
//             test.ok(false);
//           } catch(err) {}
          
//           // With callback
//           cursor.setReadPreference(new ReadPreference(ReadPreference.PRIMARY), function(err) {
//             test.ok(err != null)
//           })

//           // Assert it's the same
//           test.equal(ReadPreference.SECONDARY, cursor.readPreference.mode);
//         }
//       });
//     });
//   });
// }

// /**
//  * @ignore
//  */
// exports['Connection to a arbiter host with primary preference should give error'] = function(configuration, test) {
//   var mongo = configuration.require
//     , MongoClient = mongo.MongoClient
//     , ReadPreference = mongo.ReadPreference
//     , ReplSet = mongo.ReplSet
//     , Server = mongo.Server
//     , Db = mongo.Db;

//   var replicasetManager = configuration.getReplicasetManager();
//   // Fetch all the identity servers
//   identifyServers(mongo, replicasetManager, 'integration_test_', function(err, servers) {
//     // Let's grab an arbiter, connect and attempt a query
//     var host = servers.arbiters[0].host;
//     var port = servers.arbiters[0].port;

//     // Connect to the db
//     var server = new Server(host, port,{auto_reconnect: true});
//     // Create db instance
//     var db = new Db('integration_test_', server, {w:0});
//     db.open(function(err, p_db) {
//       // Grab a collection
//       p_db.createCollection('read_preference_single_test_0', function(err, collection) {
//         test.ok(err instanceof Error);
//         test.equal('string', typeof err.message);
//         p_db.close();
//         test.done();
//       });
//     });
//   });
// }

// /**
//  * @ignore
//  */
// exports['Connection to a single primary host with different read preferences'] = function(configuration, test) {
//   var mongo = configuration.require
//     , MongoClient = mongo.MongoClient
//     , ReadPreference = mongo.ReadPreference
//     , ReplSet = mongo.ReplSet
//     , Server = mongo.Server
//     , Db = mongo.Db;

//   var replicasetManager = configuration.getReplicasetManager();
//   // Fetch all the identity servers
//   identifyServers(mongo, replicasetManager, 'integration_test_', function(err, servers) {
//     // Select a secondary server, but specify read_primary (should fail)
//     // Let's grab a secondary server
//     var host = servers.primary.host;
//     var port = servers.primary.port;

//     // Connect to the db
//     var server = new Server(host, port,{auto_reconnect: true});
//     // Create db instance
//     var db = new Db('integration_test_', server, {w:1});
//     db.open(function(err, p_db) {
//       // Grab the collection
//       var collection = p_db.collection("read_preference_single_test_0");
//       // Attempt to read (should fail due to the server not being a primary);
//       collection.find().toArray(function(err, items) {
//         test.equal(null, err);
//         p_db.close();

//         // Connect to the db
//         var server = new Server(host, port,{auto_reconnect: true, readPreference:ReadPreference.SECONDARY_PREFERRED});
//         // Create db instance
//         var db = new Db('integration_test_', server, {w:1});
//         db.open(function(err, p_db) {
//           // Grab the collection
//           var collection = db.collection("read_preference_single_test_0");
//           // Attempt to read (should fail due to the server not being a primary);
//           collection.find().toArray(function(err, items) {
//             test.equal(null, err);
//             test.equal(0, items.length);
//             p_db.close();

//             // Connect to the db
//             var server = new Server(host, port,{auto_reconnect: true, readPreference:ReadPreference.SECONDARY});
//             // Create db instance
//             var db = new Db('integration_test_', server, {w:1});
//             db.open(function(err, p_db) {
//               // Grab the collection
//               var collection = db.collection("read_preference_single_test_0");

//               // Attempt to read (should fail due to the server not being a primary);
//               collection.find().toArray(function(err, items) {
//                 test.ok(err instanceof Error);
//                 test.equal("Cannot read from primary when secondary only specified", err.message);

//                 p_db.close();
//                 test.done();
//               });
//             });
//           });
//         });
//       });
//     });
//   });
// }

// /**
//  * @ignore
//  */
// exports['Connection to a single secondary host with different read preferences'] = function(configuration, test) {
//   var mongo = configuration.require
//     , MongoClient = mongo.MongoClient
//     , ReadPreference = mongo.ReadPreference
//     , ReplSet = mongo.ReplSet
//     , Server = mongo.Server
//     , Db = mongo.Db;

//   var replicasetManager = configuration.getReplicasetManager();
//   // Fetch all the identity servers
//   identifyServers(mongo, replicasetManager, 'integration_test_', function(err, servers) {
//     // Select a secondary server, but specify read_primary (should fail)
//     // Let's grab a secondary server
//     var host = servers.secondaries[0].host;
//     var port = servers.secondaries[0].port;

//     // Connect to the db
//     var server = new Server(host, port,{auto_reconnect: true});
//     // Create db instance
//     var db = new Db('integration_test_', server, {w:0, readPreference:ReadPreference.PRIMARY});
//     db.open(function(err, p_db) {
//       // Grab the collection
//       var collection = p_db.collection("read_preference_single_test_1");
//       // Attempt to read (should fail due to the server not being a primary);
//       collection.find().toArray(function(err, items) {
//         test.ok(err instanceof Error);
//         test.equal("Read preference is Server.PRIMARY and server is not master", err.message);
//         p_db.close();

//         // Connect to the db
//         var server = new Server(host, port,{auto_reconnect: true});
//         // Create db instance
//         var db = new Db('integration_test_', server, {w:0});
//         db.open(function(err, p_db) {
//           // Grab the collection
//           var collection = db.collection("read_preference_single_test_1");
//           // Attempt to read (should fail due to the server not being a primary);
//           collection.find().toArray(function(err, items) {
//             test.ok(err != null);
//             p_db.close();

//             // Connect to the db
//             var server = new Server(host, port,{auto_reconnect: true});
//             // Create db instance
//             var db = new Db('integration_test_', server, {w:0, readPreference:ReadPreference.SECONDARY});
//             db.open(function(err, p_db) {
//               // Grab the collection
//               var collection = db.collection("read_preference_single_test_1");
//               // Attempt to read (should fail due to the server not being a primary);
//               collection.find().toArray(function(err, items) {
//                 test.equal(null, err);
//                 test.equal(0, items.length);

//                 p_db.close();
//                 test.done();
//               });
//             });
//           });
//         });
//       });
//     });
//   });
// }

// /**
//  * @ignore
//  */
// exports['Ensure tag read goes only to the correct server'] = function(configuration, test) {
//   var mongo = configuration.require
//     , MongoClient = mongo.MongoClient
//     , ReadPreference = mongo.ReadPreference
//     , ReplSet = mongo.ReplSet
//     , Server = mongo.Server
//     , Db = mongo.Db;

//   var replicasetManager = configuration.getReplicasetManager();

//   // Replica configuration
//   var replSet = new ReplSet( [
//       new Server(configuration.host, configuration.port),
//       new Server(configuration.host, configuration.port + 1),
//       new Server(configuration.host, configuration.port + 2)
//     ],
//     {}
//   );

//   // Set read preference
//   replSet.setReadPreference(new ReadPreference(ReadPreference.SECONDARY, {"dc2":"sf"}));
//   // Open the database
//   var db = new Db('local', replSet, {w:0});
//   // Trigger test once whole set is up
//   db.on("fullsetup", function() {
//     // Checkout a reader and make sure it's the primary
//     var _readPreference;
//     var _tags;
//     var _connections = [];
//     var backup = replSet.checkoutReader;
//     var _member;
    
//     replSet.checkoutReader = function(readPreference, tags) {
//       _readPreference = readPreference;
//       _tags = tags;

//       var _connection = backup.apply(replSet, [readPreference, tags]);
//       _connections.push(_connection);
//       return _connection;
//     }

//     db.db('local').collection('system.replset').find().toArray(function(err, doc) {
//       var members = doc[0].members;
//       for(var i = 0; i < members.length; i++) {
//         if(members[i].tags && members[i].tags['dc2']) {
//           _member = members[i];
//           break;
//         }
//       }

//       // Check that the connections all went to the correct read
//       for(var i = 0; i < _connections.length; i++) {
//         var port = _connections[i].socketOptions.port.toString();
//         test.ok(_member.host.match(port) != null);
//       }

//       // Restore the method
//       replSet.checkoutReader = backup;
//       db.close();
//       test.done();
//     });
//   });

//   db.open(function(err, p_db) {
//     db = p_db;
//   })
// }

// /**
//  * @ignore
//  */
// exports['should select correct connection using statistics strategy'] = function(configuration, test) {
//   var mongo = configuration.require
//     , MongoClient = mongo.MongoClient
//     , ReadPreference = mongo.ReadPreference
//     , ReplSet = mongo.ReplSet
//     , Server = mongo.Server
//     , Db = mongo.Db;

//   var replicasetManager = configuration.getReplicasetManager();

//   // Replica configuration
//   var replSet = new ReplSet([
//       new Server(configuration.host, configuration.port),
//       new Server(configuration.host, configuration.port + 1),
//       new Server(configuration.host, configuration.port + 2)
//     ],
//     { strategy:'statistical' }
//   );

//   var db = new Db('statistics_strategy', replSet, { w:0 });
//   db.open(function(error, db) {
//     var checkoutReaderMethod = db.serverConfig.checkoutReader;
//     var readerReturnValues = [];

//     db.serverConfig.checkoutReader = function(readPreference) {
//       var ret = checkoutReaderMethod.apply(this, [readPreference]);
//       readerReturnValues.push({ connection : ret });
//       return ret;
//     };

//     var collection = db.collection("statistics_strategy");
//     var keys = Object.keys(replSet._state.secondaries);
//     test.equal(2, keys.length);
//     test.equal(replSet._state.secondaries[keys[0]].runtimeStats.queryStats.sScore, 0);
//     test.equal(replSet._state.secondaries[keys[1]].runtimeStats.queryStats.sScore, 0);

//     collection.insert({ a : 1 }, function(error) {
//       collection.find({ $where : "sleep(1000)" }).setReadPreference(ReadPreference.SECONDARY).toArray(function(error, items) {
//         test.equal(1, readerReturnValues.length);
//         test.ok(replSet._state.secondaries[keys[0]].allRawConnections().indexOf(readerReturnValues[0].connection) != -1 ||
//             replSet._state.secondaries[keys[1]].allRawConnections().indexOf(readerReturnValues[0].connection) != -1);

//         var expectedServer;

//         if (replSet._state.secondaries[keys[0]].allRawConnections().indexOf(readerReturnValues[0].connection) != -1) {
//           expectedServer = replSet._state.secondaries[keys[1]];
//           test.ok(replSet._state.secondaries[keys[0]].runtimeStats.queryStats.sScore >= 0);
//         } else if (replSet._state.secondaries[keys[1]].allRawConnections().indexOf(readerReturnValues[0].connection) != -1) {
//           expectedServer = replSet._state.secondaries[keys[0]];
//           test.ok(replSet._state.secondaries[keys[1]].runtimeStats.queryStats.sScore >= 0);
//         }

//         collection.find({ $where : "sleep(10)" }).setReadPreference(ReadPreference.SECONDARY).toArray(function(error, items) {
//           test.equal(2, readerReturnValues.length);
//           test.ok(readerReturnValues[0].connection !== readerReturnValues[1].connection);

//           keys = Object.keys(replSet._state.secondaries);
//           test.equal(2, keys.length);

//           test.ok(replSet._state.secondaries[keys[0]].runtimeStats.queryStats.sScore >= 0);
//           test.ok(replSet._state.secondaries[keys[1]].runtimeStats.queryStats.sScore >= 0);

//           db.close();
//           test.done();
//         });
//       });
//     });
//   });
// };
