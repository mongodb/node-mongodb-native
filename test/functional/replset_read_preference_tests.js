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

var locateConnection = function(connection, connections) {
  // Locate one
  for(var i = 0; i < connections.length; i++) {
    if(connections[i].id == connection.id) {
      return true;
    }
  }

  return false;
}
