"use strict";

var f = require('util').format;

/**
 * @ignore
 */
exports['Should correctly connect and then handle a mongos failure'] = {
  metadata: { requires: { topology: 'sharded' } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var Mongos = configuration.require.Mongos
      , MongoClient = configuration.require.MongoClient
      , Server = configuration.require.Server
      , Db = configuration.require.Db
      , ReadPreference = configuration.require.ReadPreference;

    var manager = configuration.manager;
    var serverDetails = null;
    var url = f('mongodb://%s:%s,%s:%s/sharded_test_db?w=1'
      , configuration.host, configuration.port
      , configuration.host, configuration.port + 1);
    MongoClient.connect(url, {}, function(err, db) {
      test.equal(null, err);
      test.ok(db != null);

      db.collection("replicaset_mongo_client_collection").update({a:1}, {b:1}, {upsert:true}, function(err, result) {
        test.equal(null, err);
        test.equal(1, result);
        // process.exit(0)
        var numberOfTicks = 10;

        var ticker = function() {
          numberOfTicks = numberOfTicks - 1;

          db.collection('replicaset_mongo_client_collection').findOne(function(err, doc) {
            if(numberOfTicks == 0) {
              manager.add(serverDetails, function(err, result) {
                db.close();
                test.done();
              });
            } else {
              setTimeout(ticker, 1000);
            }
          });
        }

        // Kill the mongos proxy
        manager.remove('mongos', {index: 0}, function(err, details) {
          serverDetails = details;
          setTimeout(ticker, 1000);
        });
      });    
    });
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyConnectToMongoSShardedSetupAndKillTheMongoSProxy = {
  metadata: { requires: { topology: 'sharded' } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var Mongos = configuration.require.Mongos
      , MongoClient = configuration.require.MongoClient
      , Server = configuration.require.Server
      , Db = configuration.require.Db
      , ReadPreference = configuration.require.ReadPreference;

    var manager = configuration.manager;
    var serverDetails = null;
    // Set up mongos connection
    var mongos = new Mongos([
        new Server(configuration.host, configuration.port, { auto_reconnect: true }),
        new Server(configuration.host, configuration.port + 1, { auto_reconnect: true })
      ], {ha:true, poolSize:1})

    // Counters to track emitting of events
    var numberOfJoins = 0;
    var numberLeaving = 0;

    // Add some listeners
    mongos.on("left", function(_server_type, _server) {
      numberLeaving += 1;
    });

    mongos.on("joined", function(_server_type, _doc, _server) {
      numberOfJoins += 1;
    });

    // Connect using the mongos connections
    var db = new Db('integration_test_', mongos, {w:0});
    db.open(function(err, db) {
      test.equal(null, err);
      test.ok(db != null);

      // Perform a simple insert into a collection
      var collection = db.collection("shard_test2");
      // Insert a simple doc
      collection.insert({test:1}, {w:1}, function(err, result) {
        test.equal(null, err);

        // Kill the mongos proxy
        manager.remove('mongos', {index: 0}, function(err, serverDetails1) {

          // Attempt another insert
          collection.insert({test:2}, {w:1}, function(err, result) {
            test.equal(null, err);
            test.equal(1, mongos.allRawConnections().length);

            // Restart the other mongos
            manager.add(serverDetails1, function(err, result) {

              // Wait for the ha process to pick up the existing new server
              setTimeout(function() {
                test.equal(2, mongos.allRawConnections().length);

                // Kill the mongos proxy
                manager.remove('mongos', {index: 1}, function(err, serverDetails2) {
                  // Attempt another insert
                  collection.insert({test:3}, {w:1}, function(err, result) {
                    test.equal(null, err);
                    test.equal(1, mongos.allRawConnections().length);

                    // Restart the other mongos
                    manager.add(serverDetails2, function(err, result) {
                      // Wait for the ha process to pick up the existing new server
                      setTimeout(function() {
                        // Kill the mongos proxy
                        manager.remove('mongos', {index: 1}, function(err, serverDetails3) {
                          // Attempt another insert
                          collection.insert({test:4}, {w:1}, function(err, result) {
                            test.equal(null, err);

                            // Wait for the ha process to pick up the existing new server
                            setTimeout(function() {
                              test.equal(1, mongos.allRawConnections().length);

                              manager.add(serverDetails3, function(err, result) {
                                test.equal(2, mongos.allRawConnections().length);
                                test.equal(3, numberOfJoins);
                                test.equal(3, numberLeaving);
                                db.close();
                                test.done();
                              });
                            }, 10000);
                          });
                        });
                      }, 10000);
                    });
                  });
                });
              }, 10000)
            });
          })
        })
      });
    });
  }
}

/**
 * @ignore
 */
exports['Should correctly connect and emit a reconnect event after mongos failover'] = {
  metadata: { requires: { topology: 'sharded' } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var Mongos = configuration.require.Mongos
      , MongoClient = configuration.require.MongoClient
      , Server = configuration.require.Server
      , Db = configuration.require.Db
      , ReadPreference = configuration.require.ReadPreference;

    var manager = configuration.manager;
    var url = f('mongodb://%s:%s,%s:%s/sharded_test_db?w=1'
      , configuration.host, configuration.port
      , configuration.host, configuration.port + 1);

    MongoClient.connect(url, {}, function(err, db) {
      test.equal(null, err);
      test.ok(db != null);

      var reconnectCalled = false;
      // Add listener to the serverConfig
      db.serverConfig.on('reconnect', function(err) {
        reconnectCalled = true;
      });

      // Kill first mongos
      manager.remove('mongos', {index: 0}, function(err, serverDetails1) {
    
        // Kill second mongos
        manager.remove('mongos', {index: 1}, function(err, serverDetails2) {
          // Cause an insert to be buffered
          db.collection("replicaset_mongo_client_collection").insert({c:1}, function(err, db) {
          });

          // Restart the mongos 
          manager.add(serverDetails1, function(err, result) {

            // Restart the mongos 
            manager.add(serverDetails2, function(err, result) {

              db.collection("replicaset_mongo_client_collection").insert({c:1}, function(err) {
                test.equal(null, err);
                test.ok(reconnectCalled);
                db.close();
                test.done();
              });
            });
          });
        });
      });
    });
  }
}