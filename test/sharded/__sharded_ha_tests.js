var mongodb = process.env['TEST_NATIVE'] != null ? require('../../lib/mongodb').native() : require('../../lib/mongodb').pure();
var noReplicasetStart = process.env['NO_REPLICASET_START'] != null ? true : false;

var testCase = require('nodeunit').testCase,
  debug = require('util').debug,
  inspect = require('util').inspect,
  gleak = require('../../dev/tools/gleak'),
  ShardedManager = require('../tools/sharded_manager').ShardedManager,
  Db = mongodb.Db,
  Mongos = mongodb.Mongos,
  ReadPreference = mongodb.ReadPreference,
  MongoClient = mongodb.MongoClient,
  Server = mongodb.Server;

// Keep instance of ReplicaSetManager
var serversUp = false;
var Shard = Shard == null ? null : Shard;

/**
 * Retrieve the server information for the current
 * instance of the db client
 *
 * @ignore
 */
exports.setUp = function(callback) {
  Shard = new ShardedManager({
    // A single replicaset in our sharded system
    numberOfReplicaSets:1,
    replPortRangeSet:30000,
    // A single configuration server
    numberOfConfigServers:1,
    configPortRangeSet:40000,
    // Two mongos proxies to ensure correct failover
    numberOfMongosServers:2,
    mongosRangeSet:50000,
    // Collection and shard key setup
    db:"sharded_test_db",
    collection:"sharded_test_db_collection",
    shardKey: "_id"
  })

  // Start the shard
  Shard.start(function(err, result) {
    serversUp = true;
    callback();
  });    
}

/**
 * Retrieve the server information for the current
 * instance of the db client
 *
 * @ignore
 */
exports.tearDown = function(callback) {
  callback();
}

/**
 * @ignore
 */
exports['Should correctly connect and then handle a mongos failure'] = function(test) {
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
            db.close();
            test.done();          
          } else {
            setTimeout(ticker, 1000);
          }
        });
      }

      var killport = db.serverConfig._currentMongos.port;

      // Kill the mongos proxy
      Shard.killMongoS(killport, function(err, result) {
        setTimeout(ticker, 1000);
      });
    });    
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlyPerformAllOperationsAgainstShardedSystem = function(test) {
  return test.done();
  console.log("____________________________________________________________________")
  // Set up mongos connection
  var mongos = new Mongos([
      new Server("localhost", 50000, { auto_reconnect: true })
    ])

  // Set up a bunch of documents
  var docs = [];
  for(var i = 0; i < 1000; i++) {
    docs.push({a:i, data:new Buffer(1024)});
  }

  // Connect using the mongos connections
  var db = new Db('integration_test_', mongos, {w:0});
  db.open(function(err, db) {
    test.equal(null, err);
    test.ok(db != null);

    var collection = db.collection("shard_all_operations_test");
    collection.insert(docs, {safe:{w:1, wtimeout:1000}}, function(err, result) {
      test.equal(null, err);

        Shard.killShard(function() {

          collection.find({}, {partial:true}).toArray(function(err, items) {
            // test.equal(null, err);
            // test.ok(items.length > 0)
            console.log("-------------------------------------------------------------")
            console.dir(err)
            console.dir(items)

            db.close();
            test.done();
          });
        });
    });
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlyConnectToMongoSShardedSetupAndKillTheMongoSProxy = function(test) {
  // Set up mongos connection
  var mongos = new Mongos([
      new Server("localhost", 50000, { auto_reconnect: true }),
      new Server("localhost", 50001, { auto_reconnect: true })
    ], {ha:true})

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
      Shard.killMongoS(50000, function(err, result) {

        // Attempt another insert
        collection.insert({test:2}, {w:1}, function(err, result) {
          test.equal(null, err);
          test.equal(1, db.serverConfig.downServers.length);

          // Restart the other mongos
          Shard.restartMongoS(50000, function(err, result) {

            // Wait for the ha process to pick up the existing new server
            setTimeout(function() {
              test.equal(0, db.serverConfig.downServers.length);

              // Kill the mongos proxy
              Shard.killMongoS(50001, function(err, result) {
                // Attempt another insert
                collection.insert({test:3}, {w:1}, function(err, result) {
                  test.equal(null, err);
                  test.equal(1, db.serverConfig.downServers.length);

                  // Restart the other mongos
                  Shard.restartMongoS(50001, function(err, result) {
                    // Wait for the ha process to pick up the existing new server
                    setTimeout(function() {
                      // Kill the mongos proxy
                      Shard.killMongoS(50000, function(err, result) {
                        // Attempt another insert
                        collection.insert({test:4}, {w:1}, function(err, result) {
                          test.equal(null, err);

                          // Wait for the ha process to pick up the existing new server
                          setTimeout(function() {
                            test.equal(1, db.serverConfig.downServers.length);

                            db.close();
                            test.done();
                          }, 5000);
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

/**
 * Retrieve the server information for the current
 * instance of the db client
 *
 * @ignore
 */
var numberOfTestsRun = Object.keys(this).length - 2;
