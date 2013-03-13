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

// Simple replicaset configuration
var none = function(options) {
  var self = this;

  // Test suite start
  this.start = function(callback) {
    callback();
  }

  // Test suite stop
  this.stop = function(callback) {
    callback();
  };

  // var mapFunction = function(replicasetManager, name) {
  //   return function() {
  //     var args = Array.prototype.slice.call(arguments, 0);
  //     replicasetManager[name].apply(replicasetManager, args);        
  //   }
  // }

  // this.killPrimary = mapFunction(replicasetManager, 'killPrimary');
  // this.restartKilledNodes = mapFunction(replicasetManager, 'restartKilledNodes');
  // this.stepDownPrimary = mapFunction(replicasetManager, 'stepDownPrimary');
  // this.getNodeFromPort = mapFunction(replicasetManager, 'getNodeFromPort');
  // this.kill = mapFunction(replicasetManager, 'kill');
  // this.killSecondary = mapFunction(replicasetManager, 'killSecondary');
  // this.primary = mapFunction(replicasetManager, 'primary');
  // this.secondaries = mapFunction(replicasetManager, 'secondaries');
  // this.arbiters = mapFunction(replicasetManager, 'arbiters');    
  // this.setAuths = mapFunction(replicasetManager, 'setAuths');
  // this.stepDownPrimary = mapFunction(replicasetManager, 'stepDownPrimary');

  // Pr test functions
  this.setup = function(callback) { 
    callback(); 
  }
  
  this.teardown = function(callback) { 
    callback();
  };

  // Returns the package for using Mongo driver classes
  this.getMongoPackage = function() {
    return mongodb;
  }

  // Get the star port
  this.getReplicasetManager = function() {
    return null;
  }

  // Returns a db
  this.db = function() {
    return null;
  }

  // Used in tests
  this.db_name = "integration_tests";    
}

exports.none = none;