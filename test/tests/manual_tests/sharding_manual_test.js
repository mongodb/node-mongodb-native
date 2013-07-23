var ShardedManager = require('../../tools/sharded_manager').ShardedManager
  , MongoClient = require('../../../lib/mongodb').MongoClient;

var shard_options = {
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
  shardKey: "_id",
  // Additional settings
  replicasetOptions: []
};

// var shardManager = new ShardedManager(shard_options);
// // Start the shard
// shardManager.start(function(err, result) {
  
  MongoClient.connect("mongodb://localhost:50000,localhost:50001/sharded_test_db", function(err, db) {
    if(err) throw err;

    setInterval(function() {
      console.log("++++++++++++++++++++++++++ INTERVAL")

      db.collection('t').insert({a:1}, function(err, result) {
        console.log("++++++++++++++++++++++++++ INSERT")
        console.dir(err)
        console.dir(result)

        db.collection('t').findOne(function(err, doc) {
          console.log("++++++++++++++++++++++++++ FINDONE")
          console.dir(err)
          console.dir(doc)
        });
      });
    }, 5000);
  });
// });