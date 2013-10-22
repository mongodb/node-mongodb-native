/**
 * @ignore
 */
exports['Should correctly connect and then handle a mongos failure'] = function(configuration, test) {
  var Mongos = configuration.getMongoPackage().Mongos
    , MongoClient = configuration.getMongoPackage().MongoClient
    , Server = configuration.getMongoPackage().Server
    , Db = configuration.getMongoPackage().Db
    , ReadPreference = configuration.getMongoPackage().ReadPreference;

  MongoClient.connect('mongodb://localhost:50000,localhost:50001/sharded_test_db?w=1', {}, function(err, db) {
    test.equal(null, err);
    test.ok(db != null);

    db.collection("replicaset_mongo_client_collection").update({a:1}, {b:1}, {upsert:true}, function(err, result) {
      test.equal(null, err);
      test.equal(1, result);
      var numberOfTicks = 10;

      var ticker = function() {
        numberOfTicks = numberOfTicks - 1;

        db.collection('replicaset_mongo_client_collection').findOne(function(err, doc) {
          if(numberOfTicks == 0) {
            configuration.restartMongoS(killport, function(err, result) {
              db.close();
              test.done();
            });
          } else {
            setTimeout(ticker, 1000);
          }
        });
      }

      var killport = db.serverConfig.servers[0].port;

      // Kill the mongos proxy
      configuration.killMongoS(killport, function(err, result) {
        setTimeout(ticker, 1000);
      });
    });    
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlyConnectToMongoSShardedSetupAndKillTheMongoSProxy = function(configuration, test) {
  var Mongos = configuration.getMongoPackage().Mongos
    , MongoClient = configuration.getMongoPackage().MongoClient
    , Server = configuration.getMongoPackage().Server
    , Db = configuration.getMongoPackage().Db
    , ReadPreference = configuration.getMongoPackage().ReadPreference;

  // Set up mongos connection
  var mongos = new Mongos([
      new Server("localhost", 50000, { auto_reconnect: true }),
      new Server("localhost", 50001, { auto_reconnect: true })
    ], {ha:true})

  // Counters to track emitting of events
  var numberOfJoins = 0;
  var numberLeaving = 0;

  // Add some listeners
  mongos.on("left", function(_server_type, _server) {
    numberLeaving += 1;
    // console.log("========================= " + _server_type + " at " + _server.host + ":" + _server.port + " left")
  });

  mongos.on("joined", function(_server_type, _doc, _server) {
    numberOfJoins += 1;
    // console.log("========================= " + _server_type + " at " + _server.host + ":" + _server.port + " joined")
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
      configuration.killMongoS(50000, function(err, result) {

        // Attempt another insert
        collection.insert({test:2}, {w:1}, function(err, result) {
          test.equal(null, err);
          test.equal(1, Object.keys(db.serverConfig.downServers).length);

          // Restart the other mongos
          configuration.restartMongoS(50000, function(err, result) {

            // Wait for the ha process to pick up the existing new server
            setTimeout(function() {
              test.equal(0, Object.keys(db.serverConfig.downServers).length);

              // Kill the mongos proxy
              configuration.killMongoS(50001, function(err, result) {
                // Attempt another insert
                collection.insert({test:3}, {w:1}, function(err, result) {
                  test.equal(null, err);
                  test.equal(1, Object.keys(db.serverConfig.downServers).length);

                  // Restart the other mongos
                  configuration.restartMongoS(50001, function(err, result) {
                    // Wait for the ha process to pick up the existing new server
                    setTimeout(function() {
                      // Kill the mongos proxy
                      configuration.killMongoS(50000, function(err, result) {
                        // Attempt another insert
                        collection.insert({test:4}, {w:1}, function(err, result) {
                          test.equal(null, err);

                          // Wait for the ha process to pick up the existing new server
                          setTimeout(function() {
                            test.equal(1, Object.keys(db.serverConfig.downServers).length);

                            configuration.restartMongoS(50000, function(err, result) {

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