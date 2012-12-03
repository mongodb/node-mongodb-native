var mongodb = process.env['TEST_NATIVE'] != null ? require('../../../lib/mongodb').native() : require('../../../lib/mongodb').pure();
var noReplicasetStart = process.env['NO_REPLICASET_START'] != null ? true : false;

var testCase = require('nodeunit').testCase,
  debug = require('util').debug,
  inspect = require('util').inspect,
  gleak = require('../../../dev/tools/gleak'),
  ShardedManager = require('../../tools/sharded_manager').ShardedManager,
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
    shardKey: "_id",
    auth:true
  })

  // Start the shard
  Shard.start(function(err, result) {
    Shard.shardDb("integration_test_", function(err, result) {
      Shard.shardCollection("integration_test_.shard_all_operations_test", {_id:1}, function(err, result) {
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
  callback();
}

/**
 * @ignore
 */
exports['Should correctly connect to the mongoses using the connection string and auth'] = function(test) {
  // Set up mongos connection
  var mongos = new Mongos([
    new Server("localhost", 50000, { auto_reconnect: true })
  ]);

  // Connect using the mongos connections
  new Db('integration_test_', mongos, {w:0}).open(function(err, db) {
    db.admin().addUser("root", "root", function(err, result) {
      test.equal(null, err);
  
      db.admin().authenticate("root", "root", function(err, result) {
        test.equal(null, err);
        test.ok(result);

        db.close();
        test.done();
      });
    })
  });
}

/**
 * Retrieve the server information for the current
 * instance of the db client
 *
 * @ignore
 */
var numberOfTestsRun = Object.keys(this).length - 2;
