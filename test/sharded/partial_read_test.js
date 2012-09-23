var mongodb = process.env['TEST_NATIVE'] != null ? require('../../lib/mongodb').native() : require('../../lib/mongodb').pure();
if(process.env['TEST_COVERAGE']) var mongodb = process.env['TEST_NATIVE'] != null ? require('../../lib-cov/mongodb').native() : require('../../lib-cov/mongodb').pure();
var noReplicasetStart = process.env['NO_REPLICASET_START'] != null ? true : false;

var testCase = require('nodeunit').testCase,
  debug = require('util').debug,
  inspect = require('util').inspect,
  gleak = require('../../dev/tools/gleak'),
  ShardedManager = require('../tools/sharded_manager').ShardedManager,
  Db = mongodb.Db,
  Mongos = mongodb.Mongos,
  ReadPreference = mongodb.ReadPreference,
  Server = mongodb.Server;

// Keep instance of ReplicaSetManager
var serversUp = false;
var retries = 120;
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
    numberOfReplicaSets:2,
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
    Shard.shardDb("integration_test_", function(err, result) {
      console.log("================================= sharded db")
      console.dir(err)
      console.dir(result)

      Shard.shardCollection("integration_test_.shard_all_operations_test", {_id:1}, function(err, result) {
        console.log("================================= sharded collection")
        console.dir(err)
        console.dir(result)
    
        callback();
      });
    });
  });
}

/**
 * Retrieve the server information for the current
 * instance of the db client
 *
 * @ignore
 */
exports.tearDown = function(callback) {
  // Shard.killAll(function() {
    callback();
  // });
}

/**
 * @ignore
 */
exports.shouldCorrectlyPerformAllOperationsAgainstShardedSystem = function(test) {
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
  var db = new Db('integration_test_', mongos);
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

        // // Perform a find and each
        // collection.find().each(function(err, item) {
        //   if(err) console.dir(err)

        //   if(item == null) {
        //     test.equal(1000, numberOfRecords);

        //     // Perform a find and each
        //     collection.find().toArray(function(err, items) {
        //       if(err) console.dir(err)
        //       test.equal(1000, items.length);

        //       db.close();
        //       test.done();
        //     })
        //   } else {
        //     numberOfRecords = numberOfRecords + 1;
        //   }
        // });
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
