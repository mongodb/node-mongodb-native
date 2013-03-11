var Configuration = require('integra').Configuration
  , Runner = require('integra').Runner
  , ParallelRunner = require('integra').ParallelRunner
  , mongodb = require('../../')
  , fs = require('fs')
  , Db = mongodb.Db
  , Server = mongodb.Server
  , ReplSet = mongodb.ReplSet
  , ServerManager = require('../../test/tools/server_manager').ServerManager
  , ReplicaSetManager = require('../../test/tools/replica_set_manager').ReplicaSetManager;

// Server manager
var startPort = 30000;

// Simple replicaset configuration
var replica_set_config = function() {
  var self = this;
  // Save the startPort
  this.startPort = startPort;
  // Set up replicaset manager
  var replicasetManager = new ReplicaSetManager(
    { 
        retries:120, secondary_count:2
      , passive_count:0, arbiter_count:1
      , start_port: startPort
      , tags:[{"dc1":"ny"}, {"dc1":"ny"}, {"dc2":"sf"}]
    }
  );

  // Adjust startPort
  startPort = startPort + 10;

  // Test suite start
  this.start = function(callback) {
    replicasetManager.startSet(true, function(err, result) {
      if(err) throw err;

      // Set up the replicaset
      var replSet = new ReplSet( [
              new Server( replicasetManager.host, replicasetManager.ports[1]),
              new Server( replicasetManager.host, replicasetManager.ports[0]),
              new Server( replicasetManager.host, replicasetManager.ports[2])
            ],
            {rs_name:replicasetManager.name}
          );

      self._db = new Db('integration_tests', replSet, {w:0, native_parser: false});
      self._db.open(function(err, result) {
        if(err) throw err;
        callback();
      })
    });
  }

  // Test suite stop
  this.stop = function(callback) {
    replicasetManager.killAll(function(err) {
      callback();
    });
  };

  var mapFunction = function(replicasetManager, name) {
    return function() {
      var args = Array.prototype.slice.call(arguments, 0);
      replicasetManager[name].apply(replicasetManager, args);        
    }
  }

  this.killPrimary = mapFunction(replicasetManager, 'killPrimary');
  this.restartKilledNodes = mapFunction(replicasetManager, 'restartKilledNodes');
  this.stepDownPrimary = mapFunction(replicasetManager, 'stepDownPrimary');
  this.getNodeFromPort = mapFunction(replicasetManager, 'getNodeFromPort');
  this.kill = mapFunction(replicasetManager, 'kill');
  this.killSecondary = mapFunction(replicasetManager, 'killSecondary');
  this.primary = mapFunction(replicasetManager, 'primary');
  this.secondaries = mapFunction(replicasetManager, 'secondaries');
  this.arbiters = mapFunction(replicasetManager, 'arbiters');

  // Pr test functions
  this.setup = function(callback) { 
    callback(); 
  }
  
  this.teardown = function(callback) { 
    replicasetManager.restartKilledNodes(function() {
      callback();
    });
  };

  // Returns the package for using Mongo driver classes
  this.getMongoPackage = function() {
    return mongodb;
  }

  // Get the star port
  this.getReplicasetManager = function() {
    return replicasetManager;
  }

  // Returns a db
  this.db = function() {
    return self._db;
  }

  // Used in tests
  this.db_name = "integration_tests";
}

exports.replica_set_config = replica_set_config;