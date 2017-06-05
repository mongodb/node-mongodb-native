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
    // console.log("----------------------------- 0")
    // console.log(url)
    MongoClient.connect(url, {}, function(err, client) {
      // console.log("----------------------------- 1")
      test.equal(null, err);
      var db = client.db(configuration.database);

      db.collection("replicaset_mongo_client_collection").update({a:1}, {b:1}, {upsert:true}, function(err, result) {
        // console.log("----------------------------- 2")
        test.equal(null, err);
        test.equal(1, result.result.n);
        var numberOfTicks = 10;

        var ticker = function() {
          // console.log("----------------------------- 4")
          numberOfTicks = numberOfTicks - 1;

          db.collection('replicaset_mongo_client_collection').findOne(function(err, doc) {
            // console.log("----------------------------- 5")
            // console.dir(err)
            if(numberOfTicks == 0) {
              // console.log("----------------------------- 5:1")
              mongos.start().then(function() {
                // console.log("----------------------------- 5:2")
                client.close();
                test.done();
              });
            } else {
              // console.log("----------------------------- 5:2")
              setTimeout(ticker, 1000);
            }
          });
        }

        // Get first proxy
        var mongos = manager.proxies()[0];
        mongos.stop().then(function() {
          // console.log("----------------------------- 3")
          serverDetails = mongos;
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
      ], {ha:true, haInterval: 500, poolSize:1})

    // Counters to track emitting of events
    var numberOfJoins = 0;
    var numberLeaving = 0;

    // Add some listeners
    mongos.on("left", function(_server_type, _server) {
      // console.log("----------------------------- left :: " + _server.name)
      numberLeaving += 1;
    });

    mongos.on("joined", function(_server_type, _server) {
      // console.log("----------------------------- joined :: " + _server.name)
      numberOfJoins += 1;
    });

    // console.log("+++++++++++++++++++++++++++++++++++++ 0")
    // Connect using the mongos connections
    var client = new MongoClient(mongos, {w:0});
    client.connect(function(err, client) {
      // console.log("+++++++++++++++++++++++++++++++++++++ 1")
      test.equal(null, err);
      var db = client.db(configuration.database);

      // Perform a simple insert into a collection
      var collection = db.collection("shard_test2");
      // Insert a simple doc
      collection.insert({test:1}, {w:1}, function(err, result) {
        test.equal(null, err);

        // Server managers
        var proxies = manager.proxies();

        // Kill the mongos proxy
        proxies[0].stop().then(function() {

          // Attempt another insert
          collection.insert({test:2}, {w:1}, function(err, result) {
            test.equal(null, err);
            test.equal(1, mongos.connections().length);

            // Restart the other mongos
            proxies[0].start().then(function() {

              // Wait for the ha process to pick up the existing new server
              setTimeout(function() {
                test.equal(2, mongos.connections().length);
                global.debug = false
                // // Kill the mongos proxy
                // manager.remove('mongos', {index: 1}, function(err, serverDetails2) {
                proxies[1].stop().then(function() {
                  // Attempt another insert
                  collection.insert({test:3}, {w:1}, function(err, result) {
                    test.equal(null, err);
                    global.debug = false
                    test.equal(1, mongos.connections().length);

                    // Restart the other mongos
                    proxies[1].start().then(function() {
                      // Wait for the ha process to pick up the existing new server
                      setTimeout(function() {
                        // Kill the mongos proxy
                        proxies[1].stop().then(function() {
                          // Attempt another insert
                          collection.insert({test:4}, {w:1}, function(err, result) {
                            test.equal(null, err);
                            test.equal(1, mongos.connections().length);

                            // manager.add(serverDetails3, function(err, result) {
                            proxies[1].start().then(function() {
                              // Wait for the ha process to pick up the existing new server
                              setTimeout(function() {
                                test.equal(2, mongos.connections().length);
                                // console.log("=========== numberOfJoins :: " + numberOfJoins)
                                // console.log("=========== numberLeaving :: " + numberLeaving)

                                test.equal(5, numberOfJoins);
                                test.equal(3, numberLeaving);
                                client.close();
                                test.done();
                              }, 10000);
                            });
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

    MongoClient.connect(url, {}, function(err, client) {
      test.equal(null, err);
      test.ok(client != null);
      var db = client.db(configuration.database);

      var reconnectCalled = false;
      // Add listener to the serverConfig
      client.topology.on('reconnect', function(err) {
        reconnectCalled = true;
      });

      // Server managers
      var proxies = manager.proxies();

      // Kill the mongos proxy
      proxies[0].stop().then(function() {

        // Kill the mongos proxy
        proxies[1].stop().then(function() {

          // Cause an insert to be buffered
          db.collection("replicaset_mongo_client_collection").insert({c:1}, function(err, db) {
          });

          // Kill the mongos proxy
          proxies[0].start().then(function() {

            // Kill the mongos proxy
            proxies[1].start().then(function() {
              db.collection("replicaset_mongo_client_collection").insert({c:1}, function(err) {
                test.equal(null, err);
                test.ok(reconnectCalled);
                client.close();
                test.done();
              });
            });
          });
        });
      });
    });
  }
}
