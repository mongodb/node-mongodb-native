var Configuration = require('integra').Configuration
  , Runner = require('integra').Runner
  , ParallelRunner = require('integra').ParallelRunner
  , mongodb = require('../../')
  , fs = require('fs')
  , Db = mongodb.Db
  , Server = mongodb.Server
  , ReplSet = mongodb.ReplSet
  , ShardedManager = require('../../test/tools/sharded_manager').ShardedManager
  , ServerManager = require('../../test/tools/server_manager').ServerManager
  , ReplicaSetManager = require('../../test/tools/replica_set_manager').ReplicaSetManager;

// Server manager
var startPort = 30000;

// Simple replicaset configuration
var sharded_config = function(options) {
  return function() {
    var self = this;
    options = options ? options : {};

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
      replicasetOptions: [
        {tags: [{"dc1":"ny"}, {"dc2":"sf"}]},
        {tags: [{"dc1":"ny"}, {"dc2":"sf"}]}
      ]
    };

    for(var name in options) {
      shard_options[name] = options[name];
    }

    this.shardManager = new ShardedManager(shard_options);


    // Test suite start
    this.start = function(callback) {
      // Start the shard
      self.shardManager.start(function(err, result) {
        callback();
      });
    }

    // Test suite stop
    this.stop = function(callback) {
      self.shardManager.killAll(function() {
        callback();
      });
    };

    var mapFunction = function(replicasetManager, name) {
      return function() {
        var args = Array.prototype.slice.call(arguments, 0);
        self.shardManager[name].apply(self.shardManager, args);        
      }
    }

    this.killMongoS = mapFunction(this.shardManager, 'killMongoS');
    this.killShard = mapFunction(this.shardManager, 'killShard');
    this.restartMongoS = mapFunction(this.shardManager, 'restartMongoS');

    // Pr test functions
    this.setup = function(callback) { 
      // Start the shard
      self.shardManager.restartAllMongos(function(err, result) {
        callback(); 
      });
    }
    
    this.teardown = function(callback) { 
      callback();
    };

    // Returns the package for using Mongo driver classes
    this.getMongoPackage = function() {
      return mongodb;
    }

    // Get the star port
    this.getShardedManager = function() {
      return shardedManager;
    }

    // Returns a db
    this.db = function() {
      return self._db;
    }

    // Used in tests
    this.db_name = "integration_tests";    
  }
}

exports.sharded_config = sharded_config;