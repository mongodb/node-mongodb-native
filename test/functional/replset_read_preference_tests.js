'use strict';

var format = require('util').format,
  fs = require('fs');

var restartAndDone = function(configuration, test) {
  test.done();
};

exports.beforeTests = function(configuration, callback) {
  configuration.manager.restart().then(function() {
    callback();
  });
};

exports['Should Correctly Pick lowest ping time'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var mongo = configuration.require,
      MongoClient = mongo.MongoClient,
      ReadPreference = mongo.ReadPreference,
      ReplSet = mongo.ReplSet,
      Server = mongo.Server,
      Db = mongo.Db;

    var manager = configuration.manager;

    // Replica configuration
    var replSet = new ReplSet(
      [
        new Server(configuration.host, configuration.port),
        new Server(configuration.host, configuration.port + 1),
        new Server(configuration.host, configuration.port + 2)
      ],
      { secondaryAcceptableLatencyMS: 5, rs_name: configuration.replicasetName, debug: true }
    );

    // Open the database
    var client = new MongoClient(replSet, { w: 1 });
    // Trigger test once whole set is up
    client.on('fullsetup', function(client) {
      var db = client.db(configuration.database);

      db.command({ ismaster: true }, function(err, result) {
        test.equal(null, err);

        var time = 10;

        // // Nearest strategy
        // var nearest = client.topology.replset.readPreferenceStrategies['nearest'];

        // Sorted by time
        var byTime = [];
        // console.log("============== server servers")
        var byTime = client.topology.replset.getServers({ ignoreArbiters: true });
        byTime.forEach(function(s) {
          s.lastIsMasterMS = time;
          time = time + 10;
        });

        // console.dir(result)

        // // Set the ping times
        // var keys = Object.keys(nearest.data);
        // for(var i = 0; i < keys.length; i++) {
        //   nearest.data[keys[i]] = time;
        //   if(keys[i] != result.primary)
        //     byTime.push(keys[i]);
        //   time += 10;
        // }

        // // Set primary to the highest ping time
        // nearest.data[result.primary] = time;
        // byTime.push(result.primary);
        //

        var secondaries = [];
        var hosts = result.hosts.concat(result.passives || []);
        hosts.forEach(function(s) {
          if (result.primary != s && result.arbiters.indexOf(s) == -1) secondaries.push(s);
        });

        // // Last server picked
        // var lastServer = null;

        // Pick the server
        client.topology.replset.once('pickedServer', function(readPreference, server) {
          // console.log("======================== 1")
          // console.log(" byTime[0].name = " + byTime[0].name)
          // console.log(" server.name = " + server.name)
          test.equal(byTime[0].name, server.name);
        });

        // console.log("======================== 0")
        // Attempt to perform a read
        db
          .collection('somecollection')
          .findOne({}, { readPreference: new ReadPreference(ReadPreference.NEAREST) }, function(
            err,
            doc
          ) {
            // console.log("======================== 2")
            test.equal(null, err);

            // Pick the server
            client.topology.replset.once('pickedServer', function(readPreference, server) {
              // console.log("======================== 3")
              test.ok(secondaries.indexOf(server.name) != -1);
            });

            // Attempt to perform a read
            db
              .collection('somecollection')
              .findOne(
                {},
                { readPreference: new ReadPreference(ReadPreference.SECONDARY) },
                function(err, doc) {
                  // console.log("======================== 4")
                  test.equal(null, err);

                  // Pick the server
                  client.topology.replset.once('pickedServer', function(readPreference, server) {
                    // console.log("======================== 5")
                    // console.dir(secondaries)
                    // console.dir(server.name)
                    // process.exit(0)
                    // test.equal('localhost:31001', server.name);
                    test.ok(secondaries.indexOf(server.name) != -1);
                  });

                  // Attempt to perform a read
                  db
                    .collection('somecollection')
                    .findOne(
                      {},
                      { readPreference: new ReadPreference(ReadPreference.SECONDARY_PREFERRED) },
                      function(err, doc) {
                        // console.log("======================== 6")
                        test.equal(null, err);

                        // Pick the server
                        client.topology.replset.once('pickedServer', function(
                          readPreference,
                          server
                        ) {
                          // console.log("======================== 6")
                          test.equal('localhost:31000', server.name);
                        });

                        // Attempt to perform a read
                        db
                          .collection('somecollection')
                          .findOne(
                            {},
                            { readPreference: new ReadPreference(ReadPreference.PRIMARY) },
                            function(err, doc) {
                              // console.log("======================== 8")
                              test.equal(null, err);

                              // Close db
                              client.close();
                              restartAndDone(configuration, test);
                            }
                          );
                      }
                    );
                }
              );
          });
      });
    });

    client.connect(function(err, p_db) {});
  }
};

exports['Should Correctly vary read server when using readpreference NEAREST'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var mongo = configuration.require,
      MongoClient = mongo.MongoClient,
      ReadPreference = mongo.ReadPreference,
      ReplSet = mongo.ReplSet,
      Server = mongo.Server,
      Db = mongo.Db;

    var replicasetManager = configuration.manager;

    // Replica configuration
    var replSet = new ReplSet(
      [
        new Server(configuration.host, configuration.port),
        new Server(configuration.host, configuration.port + 1),
        new Server(configuration.host, configuration.port + 2)
      ],
      { readPreference: ReadPreference.NEAREST, rs_name: configuration.replicasetName, debug: true }
    );

    // Open the database
    var client = new MongoClient(replSet, { w: 1, readPreference: ReadPreference.NEAREST });
    client.on('fullsetup', function() {
      var db = client.db(configuration.database);
      // Servers viewed
      var viewedServers = {};

      // Pick the server
      client.topology.replset.once('pickedServer', function(readPreference, server) {
        viewedServers[server.name] = server.name;
      });

      db.collection('nearest_collection_test').findOne({ a: 1 }, function(err, doc) {
        test.equal(null, err);

        // Pick the server
        client.topology.replset.once('pickedServer', function(readPreference, server) {
          viewedServers[server.name] = server.name;
        });

        db.collection('nearest_collection_test').findOne({ a: 1 }, function(err, doc) {
          test.equal(null, err);

          // Pick the server
          client.topology.replset.once('pickedServer', function(readPreference, server) {
            viewedServers[server.name] = server.name;
          });

          db.collection('nearest_collection_test').findOne({ a: 1 }, function(err, doc) {
            test.equal(null, err);
            test.ok(Object.keys(viewedServers).length > 1);

            client.close();
            restartAndDone(configuration, test);
          });
        });
      });
    });

    client.connect(function(err, p_db) {});
  }
};

exports[
  'Should Correctly vary read server when using readpreference NEAREST passed at collection level'
] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var mongo = configuration.require,
      MongoClient = mongo.MongoClient,
      ReadPreference = mongo.ReadPreference,
      ReplSet = mongo.ReplSet,
      Server = mongo.Server,
      Db = mongo.Db;

    var replicasetManager = configuration.manager;

    // Replica configuration
    var replSet = new ReplSet(
      [
        new Server(configuration.host, configuration.port),
        new Server(configuration.host, configuration.port + 1),
        new Server(configuration.host, configuration.port + 2)
      ],
      { rs_name: configuration.replicasetName, debug: true }
    );

    // Open the database
    var client = new MongoClient(replSet, { w: 1, readPreference: ReadPreference.NEAREST });
    client.on('fullsetup', function() {
      var db = client.db(configuration.database);
      // Servers viewed
      var viewedServers = {};

      // Pick the server
      client.topology.replset.once('pickedServer', function(readPreference, server) {
        viewedServers[server.name] = server.name;
      });

      db
        .collection('nearest_collection_test', {
          readPreference: 'nearest'
        })
        .findOne({ a: 1 }, function(err, doc) {
          test.equal(null, err);

          // Pick the server
          client.topology.replset.once('pickedServer', function(readPreference, server) {
            viewedServers[server.name] = server.name;
          });

          db
            .collection('nearest_collection_test', {
              readPreference: 'nearest'
            })
            .findOne({ a: 1 }, function(err, doc) {
              test.equal(null, err);

              // Pick the server
              client.topology.replset.once('pickedServer', function(readPreference, server) {
                viewedServers[server.name] = server.name;
              });

              db
                .collection('nearest_collection_test', {
                  readPreference: 'nearest'
                })
                .findOne({ a: 1 }, function(err, doc) {
                  test.equal(null, err);
                  test.ok(Object.keys(viewedServers).length > 1);

                  client.close();
                  restartAndDone(configuration, test);
                });
            });
        });
    });

    client.connect(function(err, p_db) {});
  }
};

/**
 * @ignore
 */
exports.shouldCorrectlyReadFromGridstoreWithSecondaryReadPreference = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore,
      ObjectID = configuration.require.ObjectID,
      MongoClient = configuration.require.MongoClient,
      ReadPreference = configuration.require.ReadPreference,
      ReplSet = configuration.require.ReplSet,
      Server = configuration.require.Server,
      Db = configuration.require.Db;

    // Replica configuration
    var replSet = new ReplSet(
      [
        new Server(configuration.host, configuration.port),
        new Server(configuration.host, configuration.port + 1),
        new Server(configuration.host, configuration.port + 2)
      ],
      { readPreference: ReadPreference.NEAREST, rs_name: configuration.replicasetName, debug: true }
    );

    // Create an id
    var id = new ObjectID();
    // Open the database
    var client = new MongoClient(replSet, { w: 1 });
    client.on('fullsetup', function() {
      var db = client.db(configuration.database);

      db.command({ ismaster: true }, function(err, result) {
        test.equal(null, err);

        var secondaries = {};
        var gridStore = new GridStore(db, id, 'w', { w: 4 });

        result.hosts.forEach(function(s) {
          if (result.primary != s && result.arbiters.indexOf(s) == -1) secondaries[s] = s;
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
              client.topology.replset.once('pickedServer', function(readPreference, server) {
                test.ok(secondaries[server.name] != null);
              });

              // Read the file using readBuffer
              new GridStore(db, doc._id, 'r', {
                readPreference: ReadPreference.SECONDARY
              }).open(function(err, gridStore) {
                test.equal(null, err);

                gridStore.read(function(err, data2) {
                  test.equal(null, err);
                  test.equal(data.toString('base64'), data2.toString('base64'));
                  client.close();
                  restartAndDone(configuration, test);
                });
              });
            });
          });
        });
      });
    });

    client.connect(function(err, p_db) {});
  }
};

/**
 * @ignore
 */
exports['Connection to replicaset with primary read preference'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var mongo = configuration.require,
      MongoClient = mongo.MongoClient,
      ReadPreference = mongo.ReadPreference,
      Logger = mongo.Logger,
      ReplSet = mongo.ReplSet,
      Server = mongo.Server,
      Db = mongo.Db;

    // Replica configuration
    var replSet = new ReplSet(
      [
        new Server(configuration.host, configuration.port),
        new Server(configuration.host, configuration.port + 1),
        new Server(configuration.host, configuration.port + 2)
      ],
      { rs_name: configuration.replicasetName, debug: true }
    );

    // Create db instance
    var client = new MongoClient(replSet, { w: 0, readPreference: ReadPreference.PRIMARY });
    // Logger.setLevel('info');
    // Trigger test once whole set is up
    client.on('fullsetup', function(client) {
      var db = client.db(configuration.database);

      db.command({ ismaster: true }, function(err, result) {
        test.equal(null, err);

        // Pick the server
        client.topology.replset.once('pickedServer', function(readPreference, server) {
          test.equal(result.primary, server.name);
        });

        // Grab the collection
        var collection = db.collection('read_preference_replicaset_test_0');
        // Attempt to read (should fail due to the server not being a primary);
        collection.find().toArray(function(err, items) {
          client.close();
          restartAndDone(configuration, test);
        });
      });
    });

    // Connect to the db
    client.connect(function(err, p_db) {
      test.equal(null, err);
    });
  }
};

/**
 * @ignore
 */
exports['Should Set read preference at collection level using collection method'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var mongo = configuration.require,
      MongoClient = mongo.MongoClient,
      ReadPreference = mongo.ReadPreference,
      ReplSet = mongo.ReplSet,
      Server = mongo.Server,
      Db = mongo.Db;

    // Replica configuration
    var replSet = new ReplSet(
      [
        new Server(configuration.host, configuration.port),
        new Server(configuration.host, configuration.port + 1),
        new Server(configuration.host, configuration.port + 2)
      ],
      { rs_name: configuration.replicasetName, debug: true }
    );

    // Create db instance
    var client = new MongoClient(replSet, { w: 0 });
    // Connect to the db
    client.on('fullsetup', function(client) {
      var db = client.db(configuration.database);
      db.command({ ismaster: true }, function(err, result) {
        test.equal(null, err);

        // Filter out the secondaries
        var secondaries = {};
        result.hosts.forEach(function(s) {
          if (result.primary != s && result.arbiters.indexOf(s) == -1) secondaries[s] = s;
        });

        // Pick the server
        client.topology.replset.once('pickedServer', function(readPreference, server) {
          test.ok(secondaries[server.name] != null);
        });

        // Grab the collection
        var collection = db.collection('read_preferences_all_levels_0', {
          readPreference: ReadPreference.SECONDARY
        });
        // Attempt to read (should fail due to the server not being a primary);
        var cursor = collection.find();
        cursor.toArray(function(err, items) {
          test.equal(ReadPreference.SECONDARY, cursor.readPreference.preference);
          client.close();
          restartAndDone(configuration, test);
        });
      });
    });

    // Connect to the db
    client.connect(function(err, p_db) {});
  }
};

/**
 * @ignore
 */
exports['Should Set read preference at collection level using createCollection method'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var mongo = configuration.require,
      MongoClient = mongo.MongoClient,
      ReadPreference = mongo.ReadPreference,
      ReplSet = mongo.ReplSet,
      Server = mongo.Server,
      Db = mongo.Db;

    // Replica configuration
    var replSet = new ReplSet(
      [
        new Server(configuration.host, configuration.port),
        new Server(configuration.host, configuration.port + 1),
        new Server(configuration.host, configuration.port + 2)
      ],
      { rs_name: configuration.replicasetName, debug: true }
    );

    // Create db instance
    var client = new MongoClient(replSet, { w: 0 });
    // Connect to the db
    client.on('fullsetup', function() {
      var db = client.db(configuration.database);
      db.command({ ismaster: true }, function(err, result) {
        // Filter out the secondaries
        var secondaries = {};
        result.hosts.forEach(function(s) {
          if (result.primary != s && result.arbiters.indexOf(s) == -1) secondaries[s] = s;
        });

        // Grab the collection
        db.createCollection(
          'read_preferences_all_levels_1',
          { readPreference: ReadPreference.SECONDARY },
          function(err, collection) {
            test.equal(null, err);

            // Pick the server
            client.topology.replset.once('pickedServer', function(readPreference, server) {
              test.ok(secondaries[server.name] != null);
            });

            var cursor = collection.find();
            // Attempt to read (should fail due to the server not being a primary);
            cursor.toArray(function(err, items) {
              // Does not get called or we don't care
              test.equal(ReadPreference.SECONDARY, cursor.readPreference.preference);
              client.close();
              restartAndDone(configuration, test);
            });
          }
        );
      });
    });

    // Connect to the db
    client.connect(function(err, p_db) {});
  }
};

/**
 * @ignore
 */
exports['Should Set read preference at cursor level'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var mongo = configuration.require,
      MongoClient = mongo.MongoClient,
      ReadPreference = mongo.ReadPreference,
      ReplSet = mongo.ReplSet,
      Server = mongo.Server,
      Db = mongo.Db;

    // Replica configuration
    var replSet = new ReplSet(
      [
        new Server(configuration.host, configuration.port),
        new Server(configuration.host, configuration.port + 1),
        new Server(configuration.host, configuration.port + 2)
      ],
      { rs_name: configuration.replicasetName, debug: true }
    );

    // Create db instance
    var client = new MongoClient(replSet, { w: 0 });
    // Connect to the db
    client.on('fullsetup', function() {
      var db = client.db(configuration.database);
      db.command({ ismaster: true }, function(err, result) {
        // Filter out the secondaries
        var secondaries = {};
        result.hosts.forEach(function(s) {
          if (result.primary != s && result.arbiters.indexOf(s) == -1) secondaries[s] = s;
        });

        // Grab the collection
        var collection = db.collection('read_preferences_all_levels_1');

        // Pick the server
        client.topology.replset.once('pickedServer', function(readPreference, server) {
          client.topology.replset.once('pickedServer', function(readPreference, server) {
            test.ok(secondaries[server.name] != null);
          });
        });

        // Attempt to read (should fail due to the server not being a primary);
        collection.find().setReadPreference(ReadPreference.SECONDARY).toArray(function(err, items) {
          client.close();
          restartAndDone(configuration, test);
        });
      });
    });

    // Connect to the db
    client.connect(function(err, p_db) {});
  }
};

/**
 * @ignore
 */
exports['Attempt to change read preference at cursor level after object read legacy'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var mongo = configuration.require,
      MongoClient = mongo.MongoClient,
      ReadPreference = mongo.ReadPreference,
      ReplSet = mongo.ReplSet,
      Server = mongo.Server,
      Db = mongo.Db;

    // Replica configuration
    var replSet = new ReplSet(
      [
        new Server(configuration.host, configuration.port),
        new Server(configuration.host, configuration.port + 1),
        new Server(configuration.host, configuration.port + 2)
      ],
      { rs_name: configuration.replicasetName, debug: true }
    );

    // Create db instance
    var client = new MongoClient(replSet, { w: 0 });
    // Connect to the db
    client.connect(function(err, client) {
      var db = client.db(configuration.database);
      // Grab the collection
      var collection = db.collection('read_preferences_all_levels_2');
      // Insert a bunch of documents
      collection.insert([{ a: 1 }, { b: 1 }, { c: 1 }], { w: 1 }, function(err) {
        test.equal(null, err);

        // Set up cursor
        var cursor = collection.find().setReadPreference(ReadPreference.SECONDARY);
        cursor.each(function(err, result) {
          if (result == null) {
            client.close();
            restartAndDone(configuration, test);
          } else {
            try {
              // Try to change the read preference it should not work as the query was executed
              cursor.setReadPreference(ReadPreference.PRIMARY);
              test.ok(false);
            } catch (err) {
              // console.log(err.stack)
            }

            test.equal(ReadPreference.SECONDARY, cursor.readPreference.preference);
          }
        });
      });
    });
  }
};

/**
 * @ignore
 */
exports['Set read preference at db level'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var mongo = configuration.require,
      MongoClient = mongo.MongoClient,
      ReadPreference = mongo.ReadPreference,
      ReplSet = mongo.ReplSet,
      Server = mongo.Server,
      Db = mongo.Db;

    // Replica configuration
    var replSet = new ReplSet(
      [
        new Server(configuration.host, configuration.port),
        new Server(configuration.host, configuration.port + 1),
        new Server(configuration.host, configuration.port + 2)
      ],
      { rs_name: configuration.replicasetName, debug: true }
    );

    // Execute flag
    var executedCorrectlyWrite = false;
    var executedCorrectlyRead = false;

    // Create db instance
    var client = new MongoClient(replSet, {
      w: 0,
      readPreference: new ReadPreference(ReadPreference.SECONDARY)
    });
    // Connect to the db
    client.on('fullsetup', function() {
      var db = client.db(configuration.database);
      db.command({ ismaster: true }, function(err, result) {
        // console.log("--------------- 0")
        // Filter out the secondaries
        var secondaries = {};
        var hosts = result.hosts.concat(result.passives || []);
        hosts.forEach(function(s) {
          if (result.primary != s && result.arbiters.indexOf(s) == -1) secondaries[s] = s;
        });
        // console.log("--------------- 1")

        client.topology.replset.once('pickedServer', function(readPreference, server) {
          // console.log("--------------- 4")
          test.ok(secondaries[server.name] != null);
        });
        // console.log("--------------- 2")

        // Grab the collection
        var collection = db.collection('read_preferences_all_levels_2');
        // Attempt to read (should fail due to the server not being a primary);
        var cursor = collection.find();
        // console.log("--------------- 3")
        cursor.toArray(function(err, items) {
          // console.log("--------------- 5")
          // Does not get called or we don't care
          test.equal(ReadPreference.SECONDARY, cursor.readPreference.preference);
          client.close();
          restartAndDone(configuration, test);
        });
      });
    });

    // Connect to the db
    client.connect(function(err, p_db) {});
  }
};

/**
 * @ignore
 */
exports['Set read preference at collection level using collection method'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var mongo = configuration.require,
      MongoClient = mongo.MongoClient,
      ReadPreference = mongo.ReadPreference,
      ReplSet = mongo.ReplSet,
      Server = mongo.Server,
      Db = mongo.Db;

    // Replica configuration
    var replSet = new ReplSet(
      [
        new Server(configuration.host, configuration.port),
        new Server(configuration.host, configuration.port + 1),
        new Server(configuration.host, configuration.port + 2)
      ],
      { rs_name: configuration.replicasetName, debug: true }
    );

    // Create db instance
    var client = new MongoClient(replSet, { w: 0 });
    // Connect to the db
    client.on('fullsetup', function(client) {
      var db = client.db(configuration.database);
      db.command({ ismaster: true }, function(err, result) {
        // Filter out the secondaries
        var secondaries = {};
        result.hosts.forEach(function(s) {
          if (result.primary != s && result.arbiters.indexOf(s) == -1) secondaries[s] = s;
        });

        client.topology.replset.once('pickedServer', function(readPreference, server) {
          test.ok(secondaries[server.name] != null);
        });

        // Grab the collection
        var collection = db.collection('read_preferences_all_levels_3', {
          readPreference: new ReadPreference(ReadPreference.SECONDARY)
        });
        // Attempt to read (should fail due to the server not being a primary);
        var cursor = collection.find();
        cursor.toArray(function(err, items) {
          // Does not get called or we don't care
          test.equal(ReadPreference.SECONDARY, cursor.readPreference.preference);
          client.close();
          restartAndDone(configuration, test);
        });
      });
    });

    // Connect to the db
    client.connect(function(err, p_db) {});
  }
};

/**
 * @ignore
 */
exports['Ensure tag read goes only to the correct server'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var mongo = configuration.require,
      MongoClient = mongo.MongoClient,
      ReadPreference = mongo.ReadPreference,
      ReplSet = mongo.ReplSet,
      Server = mongo.Server,
      Db = mongo.Db;

    // Replica configuration
    var replSet = new ReplSet(
      [
        new Server(configuration.host, configuration.port),
        new Server(configuration.host, configuration.port + 1),
        new Server(configuration.host, configuration.port + 2)
      ],
      { rs_name: configuration.replicasetName, debug: true }
    );

    // Open the database
    var client = new MongoClient(replSet, {
      w: 0,
      readPreference: new ReadPreference(ReadPreference.SECONDARY, { loc: 'ny' })
    });
    // Trigger test once whole set is up
    client.on('fullsetup', function() {
      var db = client.db(configuration.database);

      client.topology.replset.once('pickedServer', function(readPreference, server) {
        test.equal('secondary', readPreference.preference);
        test.equal('ny', readPreference.tags['loc']);
      });

      client.db('local').collection('system.replset').find().toArray(function(err, doc) {
        client.close();
        restartAndDone(configuration, test);
      });
    });

    client.connect(function(err, p_db) {});
  }
};

/**
 * @ignore
 */
exports['Ensure tag read goes only to the correct servers using nearest'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var mongo = configuration.require,
      MongoClient = mongo.MongoClient,
      ReadPreference = mongo.ReadPreference,
      ReplSet = mongo.ReplSet,
      Server = mongo.Server,
      Db = mongo.Db;

    // Replica configuration
    var replSet = new ReplSet(
      [
        new Server(configuration.host, configuration.port),
        new Server(configuration.host, configuration.port + 1),
        new Server(configuration.host, configuration.port + 2)
      ],
      { rs_name: configuration.replicasetName, debug: true }
    );

    // Open the database
    var client = new MongoClient(replSet, {
      w: 1,
      readPreference: new ReadPreference(ReadPreference.NEAREST, { loc: 'ny' })
    });
    var success = false;
    // Trigger test once whole set is up
    client.on('fullsetup', function(client) {
      var db = client.db(configuration.database);
      client.topology.replset.once('pickedServer', function(readPreference, server) {
        // console.log("==================== pickedServer")
        // console.log(server.lastIsMaster());
        test.equal('ny', server.lastIsMaster().tags.loc);
        // Mark success
        success = true;
      });

      client.db('local').collection('system.replset').find().toArray(function(err, doc) {
        test.ok(success);
        client.close();
        restartAndDone(configuration, test);
      });
    });

    client.connect(function(err, p_db) {});
  }
};

/**
 * @ignore
 */
exports['Always uses primary readPreference for findAndModify'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var mongo = configuration.require,
      MongoClient = mongo.MongoClient,
      ReadPreference = mongo.ReadPreference,
      ReplSet = mongo.ReplSet,
      Server = mongo.Server,
      Db = mongo.Db;

    // Replica configuration
    var replSet = new ReplSet(
      [
        new Server(configuration.host, configuration.port),
        new Server(configuration.host, configuration.port + 1),
        new Server(configuration.host, configuration.port + 2)
      ],
      { rs_name: configuration.replicasetName, debug: true }
    );

    // Open the database
    var client = new MongoClient(replSet, {
      w: 0,
      readPreference: new ReadPreference(ReadPreference.SECONDARY_PREFERRED)
    });
    var success = false;
    // Trigger test once whole set is up
    client.on('fullsetup', function(client) {
      var db = client.db(configuration.database);
      db.collection('test').findAndModify({}, {}, { upsert: false }, function(err) {
        test.equal(null, err);
        client.close();
        restartAndDone(configuration, test);
      });
    });

    client.connect(function(err, p_db) {});
  }
};

/**
 * @ignore
 */
exports['should correctly apply read preference for direct secondary connection'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var mongo = configuration.require,
      MongoClient = mongo.MongoClient,
      Db = mongo.Db,
      ReplSet = mongo.ReplSet,
      Server = mongo.Server,
      ReadPreference = mongo.ReadPreference;

    // Replica configuration
    var replSet = new ReplSet(
      [
        new Server(configuration.host, configuration.port),
        new Server(configuration.host, configuration.port + 1),
        new Server(configuration.host, configuration.port + 2)
      ],
      { readPreference: ReadPreference.NEAREST, rs_name: configuration.replicasetName, debug: true }
    );

    // Open the database
    var client = new MongoClient(replSet, { w: 'majority', wtimeout: 10000 });
    client.on('fullsetup', function(client) {
      var db = client.db(configuration.database);

      db
        .collection('direct_secondary_read_test')
        .insertMany(
          [{ a: 1 }, { a: 1 }, { a: 1 }, { a: 1 }],
          configuration.writeConcernMax(),
          function(err, r) {
            test.equal(null, err);
            client.close();

            setTimeout(function() {
              var url = format(
                'mongodb://localhost:%s/integration_test_?readPreference=nearest',
                configuration.port + 1
              );
              // console.log("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! CONNECT")
              // Connect using the MongoClient
              MongoClient.connect(url, function(err, client) {
                test.equal(null, err);
                var db = client.db(configuration.database);
                test.ok(client.topology instanceof Server);

                db.collection('direct_secondary_read_test').count(function(err, n) {
                  test.equal(null, err);
                  test.ok(n > 0);

                  // console.log("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! CONNECT DONE")
                  client.close();
                  test.done();
                });
              });
            }, 1000);
          }
        );
    });

    client.connect(function(err, p_db) {});
  }
};

// /**
//  * @ignore
//  */
// exports['should correctly list Collections on secondary'] = {
//   metadata: { requires: { topology: 'replicaset' } },

//   // The actual test we wish to run
//   test: function(configuration, test) {
//     var mongo = configuration.require
//       , MongoClient = mongo.MongoClient
//       , ReadPreference = mongo.ReadPreference;

//     var manager = configuration.manager;
//     // var url = format("mongodb://localhost:%s,localhost:%s,localhost:%s/integration_test_?slaveOk=true&rs_name=%s"
//     //   , configuration.port, configuration.port + 1, configuration.port + 1, configuration.replicasetName);
//     var url = format("mongodb://localhost:%s/integration_test_?slaveOk=true"
//       , configuration.port);

//     // Connect using the MongoClient
//     MongoClient.connect(url, function(err,db){
//         test.equal(null, err);
//         test.ok(db != null);

//         db.collection("replicaset_slave_ok").insert({testfield:123}, function(err, result) {
//           test.equal(null, err);

//           db.listCollections().toArray(function(err, docs) {
//             console.log("-----------------------------------------------")
//             console.dir(err)
//             console.dir(docs)
//             client.close();
//             test.done();
//           });
//         });
//       });
//   }
// }
