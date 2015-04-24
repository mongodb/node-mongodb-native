"use strict";

var format = require('util').format
  , fs = require('fs');

var restartAndDone = function(configuration, test) {
  configuration.manager.restart(function() {
    test.done();
  });
}

exports.beforeTests = function(configuration, callback) {
  configuration.restart({purge:false, kill:true}, function() {
    callback();
  });
}

// exports.afterTests = function(configuration, callback) {
//   callback();
// }

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

        // Sorted by time
        var byTime = [];

        // Set the ping times
        var keys = Object.keys(nearest.data);
        for(var i = 0; i < keys.length; i++) {
          nearest.data[keys[i]] = time;
          if(keys[i] != result.primary)
            byTime.push(keys[i]);
          time += 10;
        }

        // Set primary to the highest ping time
        nearest.data[result.primary] = time;
        byTime.push(result.primary);

        var secondaries = [];
        result.hosts.forEach(function(s) {
          if(result.primary != s && result.arbiters.indexOf(s) == -1)
            secondaries.push(s);
        });

        // Last server picked
        var lastServer = null;

        // Pick the server
        db.serverConfig.replset.once('pickedServer', function(readPreference, server) {
          test.equal(byTime[0], server.name);
        });

        // Attempt to perform a read
        db.collection('somecollection').findOne({}, {readPreference: new ReadPreference(ReadPreference.NEAREST)}, function(err, doc) {
          test.equal(null, err);          

          // Pick the server
          db.serverConfig.replset.once('pickedServer', function(readPreference, server) {
            test.ok(secondaries.indexOf(server.name) != -1);
          });

          // Attempt to perform a read
          db.collection('somecollection').findOne({}, {readPreference: new ReadPreference(ReadPreference.SECONDARY)}, function(err, doc) {
            test.equal(null, err);          

            // Pick the server
            db.serverConfig.replset.once('pickedServer', function(readPreference, server) {
              // test.equal('localhost:31001', server.name);
              test.ok(secondaries.indexOf(server.name) != -1);
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
                restartAndDone(configuration, test);           
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

exports['Should Correctly vary read server when using readpreference NEAREST'] = {
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
            restartAndDone(configuration, test);
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
        var gridStore = new GridStore(db, id, 'w', {w:4});

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

              // setTimeout(function() {
              // Read the file using readBuffer
              new GridStore(db, doc._id, 'r', {readPreference:ReadPreference.SECONDARY}).open(function(err, gridStore) {
                test.equal(null, err);

                gridStore.read(function(err, data2) {
                  test.equal(null, err);
                  test.equal(data.toString('base64'), data2.toString('base64'));
                  db.close();
                  restartAndDone(configuration, test);
                })
              });

            // }, 10000)
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
exports['shouldStillQuerySecondaryWhenNoPrimaryAvailable'] = {
  metadata: { requires: { topology: 'replicaset' } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
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
                manager.shutdown('primary', {signal: -15}, function() {
                });
              });
            }, 5000);

            // we should be able to continue querying for a full minute
            var counter = 0;
            var callbacksWaiting = 0;
            var intervalid = setInterval(function() {
              if(counter++ >= 30){
                clearInterval(intervalid);
                db.close();
                return restartAndDone(configuration, test);
              }

              callbacksWaiting++;

              db.collection("replicaset_readpref_test").findOne({},
                {readPreference: ReadPreference.SECONDARY_PREFERRED},
                function(err, result) {
                  callbacksWaiting--;
              });
            }, 1000);
          });
        });
      });
  }
}

/**
 * @ignore
 */
exports['Connection to replicaset with primary read preference'] = {
  metadata: { requires: { topology: 'replicaset' } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var mongo = configuration.require
      , MongoClient = mongo.MongoClient
      , ReadPreference = mongo.ReadPreference
      , Logger = mongo.Logger
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
    // Logger.setLevel('info');
    // Trigger test once whole set is up
    db.serverConfig.on("fullsetup", function() {
      db.command({ismaster:true}, function(err, result) {
        test.equal(null, err);

        // Pick the server
        db.serverConfig.replset.once('pickedServer', function(readPreference, server) {
          test.equal(result.primary, server.name);
        });

        // Grab the collection
        var collection = db.collection("read_preference_replicaset_test_0");
        // Attempt to read (should fail due to the server not being a primary);
        collection.find().toArray(function(err, items) {
          db.close();
          restartAndDone(configuration, test);
        });
      });
    });

    // Connect to the db
    db.open(function(err, p_db) {
      test.equal(null, err);
      db = p_db;
    });
  }
}

/**
 * @ignore
 */
exports['Should Set read preference at collection level using collection method'] = {
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
          restartAndDone(configuration, test);
        });
      });
    });

    // Connect to the db
    db.open(function(err, p_db) {
      db = p_db;
    });
  }
}

/**
 * @ignore
 */
exports['Should Set read preference at collection level using createCollection method'] = {
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
            restartAndDone(configuration, test);
          });
        });
      });
    });

    // Connect to the db
    db.open(function(err, p_db) {
      db = p_db;
    });
  }
}

/**
 * @ignore
 */
exports['Should Set read preference at cursor level'] = {
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
        var collection = db.collection("read_preferences_all_levels_1");

        // Pick the server
        db.serverConfig.replset.once('pickedServer', function(readPreference, server) {
          db.serverConfig.replset.once('pickedServer', function(readPreference, server) {
            test.ok(secondaries[server.name] != null);
          });
        });

        // Attempt to read (should fail due to the server not being a primary);
        collection.find().setReadPreference(ReadPreference.SECONDARY).toArray(function(err, items) {
          db.close();
          restartAndDone(configuration, test);
        });
      });
    });

    // Connect to the db
    db.open(function(err, p_db) {
      db = p_db;
    });
  }
}

/**
 * @ignore
 */
exports['Attempt to change read preference at cursor level after object read legacy'] = {
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
    db.open(function(err, p_db) {
      // Grab the collection
      var collection = db.collection("read_preferences_all_levels_2");
      // Insert a bunch of documents
      collection.insert([{a:1}, {b:1}, {c:1}], {w:1}, function(err) {
        test.equal(null, err);

        // Set up cursor
        var cursor = collection.find().setReadPreference(ReadPreference.SECONDARY);
        cursor.each(function(err, result) {
          if(result == null) {
            p_db.close();
            restartAndDone(configuration, test);
          } else {
            try {
              // Try to change the read preference it should not work as the query was executed
              cursor.setReadPreference(ReadPreference.PRIMARY);
              test.ok(false);
            } catch(err) {}

            test.equal(ReadPreference.SECONDARY, cursor.readPreference.preference);
          }
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports['Set read preference at db level'] = {
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
    var replSet = new ReplSet( [
        new Server(configuration.host, configuration.port),
        new Server(configuration.host, configuration.port + 1),
        new Server(configuration.host, configuration.port + 2)
      ],
      {rs_name:configuration.replicasetName, debug:true}
    );

    // Execute flag
    var executedCorrectlyWrite = false;
    var executedCorrectlyRead = false;

    // Create db instance
    var db = new Db('integration_test_', replSet, {w:0, readPreference:new ReadPreference(ReadPreference.SECONDARY)});
    // Connect to the db
    db.on("fullsetup", function() {
      db.command({ismaster:true}, function(err, result) {
        // Filter out the secondaries
        var secondaries = {};
        result.hosts.forEach(function(s) {
          if(result.primary != s && result.arbiters.indexOf(s) == -1)
            secondaries[s] = s;
        });

        db.serverConfig.replset.once('pickedServer', function(readPreference, server) {
          test.ok(secondaries[server.name] != null);
        });

        // Grab the collection
        var collection = db.collection("read_preferences_all_levels_0");
        // Attempt to read (should fail due to the server not being a primary);
        var cursor = collection.find()
        cursor.toArray(function(err, items) {
          // Does not get called or we don't care
          test.equal(ReadPreference.SECONDARY, cursor.readPreference.preference)
          db.close();
          restartAndDone(configuration, test);
        });
      });
    });

    // Connect to the db
    db.open(function(err, p_db) {
      db = p_db;
    });
  }
}

/**
 * @ignore
 */
exports['Set read preference at collection level using collection method'] = {
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

        db.serverConfig.replset.once('pickedServer', function(readPreference, server) {
          test.ok(secondaries[server.name] != null);
        });

        // Grab the collection
        var collection = db.collection("read_preferences_all_levels_0", {readPreference:new ReadPreference(ReadPreference.SECONDARY)});
        // Attempt to read (should fail due to the server not being a primary);
        var cursor = collection.find()
        cursor.toArray(function(err, items) {
          // Does not get called or we don't care
          test.equal(ReadPreference.SECONDARY, cursor.readPreference.preference)
          db.close();
          restartAndDone(configuration, test);
        });
      });
    });

    // Connect to the db
    db.open(function(err, p_db) {
      db = p_db;
    });
  }
}

/**
 * @ignore
 */
exports['Ensure tag read goes only to the correct server'] = {
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
    var replSet = new ReplSet( [
        new Server(configuration.host, configuration.port),
        new Server(configuration.host, configuration.port + 1),
        new Server(configuration.host, configuration.port + 2)
      ],
      {rs_name:configuration.replicasetName, debug:true}
    );

    // Open the database
    var db = new Db('local', replSet, {w:0, readPreference: new ReadPreference(ReadPreference.SECONDARY, {"loc":"ny"})});
    // Trigger test once whole set is up
    db.on("fullsetup", function() {
      db.serverConfig.replset.once('pickedServer', function(readPreference, server) {
        test.equal('secondary', readPreference.preference);
        test.equal('ny', readPreference.tags['loc']);
      });

      db.db('local').collection('system.replset').find().toArray(function(err, doc) {
        db.close();
        restartAndDone(configuration, test);
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
exports['Ensure tag read goes only to the correct servers using nearest'] = {
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
    var replSet = new ReplSet( [
        new Server(configuration.host, configuration.port),
        new Server(configuration.host, configuration.port + 1),
        new Server(configuration.host, configuration.port + 2)
      ],
      {rs_name:configuration.replicasetName, debug:true}
    );

    // Open the database
    var db = new Db('local', replSet, {w:0, readPreference: new ReadPreference(ReadPreference.NEAREST, {"loc":"ny"})});
    var success = false;
    // Trigger test once whole set is up
    db.on("fullsetup", function() {
      db.serverConfig.replset.once('pickedServer', function(readPreference, server) {
        test.equal('ny', server.lastIsMaster().tags.loc);
        // Mark success
        success = true;
      });

      db.db('local').collection('system.replset').find().toArray(function(err, doc) {
        test.ok(success);
        db.close();
        restartAndDone(configuration, test);
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
exports['Always uses primary readPreference for findAndModify'] = {
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
    var replSet = new ReplSet( [
        new Server(configuration.host, configuration.port),
        new Server(configuration.host, configuration.port + 1),
        new Server(configuration.host, configuration.port + 2)
      ],
      {rs_name:configuration.replicasetName, debug:true}
    );

    // Open the database
    var db = new Db('test', replSet, {w:0, readPreference: new ReadPreference(ReadPreference.SECONDARY_PREFERRED)});
    var success = false;
    // Trigger test once whole set is up
    db.on("fullsetup", function() {
      db.collection('test').findAndModify({}, {}, { upsert: false }, function(err) {
        test.equal(null, err);
        db.close();
        restartAndDone(configuration, test);
      });
    });

    db.open(function(err, p_db) {
      db = p_db;
    });
  }
}