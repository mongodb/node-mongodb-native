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
  // Shard.killAll(function() {
    callback();
  // });
}

/**
 * Example of a simple url connection string to a shard, with acknowledgement of writes.
 *
 * @_class mongoclient
 * @_function MongoClient.connect
 */
exports['Should connect to mongos proxies using connectiong string'] = function(test) {
  MongoClient.connect('mongodb://localhost:50000,localhost:50001/sharded_test_db?w=1', function(err, db) {
    test.equal(null, err);
    test.ok(db != null);

    db.collection("replicaset_mongo_client_collection").update({a:1}, {b:1}, {upsert:true}, function(err, result) {
      test.equal(null, err);
      test.equal(1, result);

      db.close();
      test.done();
    });    
  });
}

/**
 * @ignore
 */
exports['Should connect to mongos proxies using connectiong string and options'] = function(test) {
  MongoClient.connect('mongodb://localhost:50000,localhost:50001/sharded_test_db?w=1', {
    mongos: {
      haInterval: 500
    }
  }, function(err, db) {
    test.equal(null, err);
    test.ok(db != null);
    test.equal(500, db.serverConfig.mongosStatusCheckInterval);

    db.collection("replicaset_mongo_client_collection").update({a:1}, {b:1}, {upsert:true}, function(err, result) {
      test.equal(null, err);
      test.equal(1, result);

      db.close();
      test.done();
    });    
  });
}

/**
 * @ignore
 */
exports['Should correctly connect and then handle a mongos failure'] = function(test) {
  MongoClient.connect('mongodb://localhost:50000,localhost:50001/sharded_test_db?w=1', {
    // mongos: {
    //   haInterval: 500
    // }
  }, function(err, db) {
    test.equal(null, err);
    test.ok(db != null);
    // test.equal(500, db.serverConfig.mongosStatusCheckInterval);

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
 * Retrieve the server information for the current
 * instance of the db client
 *
 * @ignore
 */
var numberOfTestsRun = Object.keys(this).length - 2;
