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
  var dbs = [];

  // Test suite start
  this.start = function(callback) {
    callback();
  }

  // Test suite stop
  this.stop = function(callback) {
    callback();
  };

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

  this.newDbInstance = function(db_options, server_options) {
    var db = new Db('integration_tests', new Server("127.0.0.1", 27017, server_options), db_options);
    dbs.push(db);
    return db;
  }

  // Returns a db
  this.db = function() {
    return null;
  }

  // Used in tests
  this.db_name = "integration_tests";    
}

exports.none = none;