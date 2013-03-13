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

var single_server_config = function(options) {
  return function() {
    var self = this;
    options = options != null ? options : {};
    var db = new Db('integration_tests', new Server("127.0.0.1", 27017,
     {auto_reconnect: false, poolSize: 4}), {w:0, native_parser: true});

    // Server Manager options
    var server_options = {
      purgedirectories: true
    }

    // Merge in any options
    for(var name in options) {
      server_options[name] = options[name];
    }

    // Server manager
    var serverManager = new ServerManager(server_options);

    // Test suite start
    this.start = function(callback) {
      serverManager.start(true, function(err) {
        if(err) throw err;

        db.open(function(err, result) {
          if(err) throw err;
          callback();
        })
      });
    }

    // Test suite stop
    this.stop = function(callback) {
      serverManager.killAll(function(err) {
        callback();
      });
    };

    // Pr test functions
    this.setup = function(callback) { callback(); }
    this.teardown = function(callback) { callback(); };

    // Returns the package for using Mongo driver classes
    this.getMongoPackage = function() {
      return mongodb;
    }

    this.newDbInstanceWithDomainSocket = function(host, db_options, server_options) {
      return new Db('integration_tests', new Server(host, server_options), db_options);      
    }

    this.newDbInstanceWithDomainSocketAndPort = function(host, port, db_options, server_options) {
      return new Db('integration_tests', new Server(host, port, server_options), db_options);      
    }

    this.newDbInstance = function(db_options, server_options) {
      return new Db('integration_tests', new Server("127.0.0.1", 27017,
        server_options), db_options);      
    }

    // Returns a db
    this.db = function() {
      return db;
    }

    this.url = function(user, password) {
      if(user) {
        return 'mongodb://' + user + ':' + password + '@localhost:27017/' + self.db_name + '?safe=false';
      }

      return 'mongodb://localhost:27017/' + self.db_name + '?safe=false';
    }

    this.creatUrl = 

    // Used in tests
    this.db_name = "integration_tests";    
  }
}

exports.single_server_config = single_server_config;