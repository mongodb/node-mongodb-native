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
var replica_set_config = function(options) {
  return function() {
    var self = this;
    // Save the startPort
    this.startPort = startPort;
    // Setting up replicaset options
    var repl_options = { 
        retries:120, secondary_count:2
      , passive_count:0, arbiter_count:1
      , start_port: this.startPort
      , tags:[{"dc1":"ny"}, {"dc1":"ny"}, {"dc2":"sf"}]
    }

    // Add additional options
    for(var name in options) {
      repl_options[name] = options[name];
    }

    // Set up replicaset manager
    var replicasetManager = new ReplicaSetManager(repl_options);

    // Adjust startPort
    startPort = startPort + 10;

    // Db variable
    var __db = null;
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
              {rs_name:replicasetManager.name, haInterval: 2000, strategy: "none"}
            );

        __db = self._db = new Db('integration_tests', replSet, {w:0, native_parser: false});
        self._db.open(function(err, _db) {
          var db2 = _db.db('node-native-test');
          db2.addUser("me", "secret", {w:3}, function(err, result) {
            if(err) throw err;
            callback();
          });
        });
      });
    }

    // Test suite stop
    this.stop = function(callback) {
      if(self._db) self._db.close();

      replicasetManager.killSetServers(function(err) {
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
    this.setAuths = mapFunction(replicasetManager, 'setAuths');
    this.stepDownPrimary = mapFunction(replicasetManager, 'stepDownPrimary');
    this.addSecondary = mapFunction(replicasetManager, 'addSecondary');
    this.startS = mapFunction(replicasetManager, 'start');
    this.reStart = mapFunction(replicasetManager, 'reStart');
    this.reStartAndConfigure = mapFunction(replicasetManager, 'reStartAndConfigure');

    this.newDbInstanceWithDomainSocket = function(host, db_options, server_options) {
      return new Db('integration_tests', new ReplSet([new Server(host, server_options)], {poolSize:1}), db_options);      
    }

    this.newDbInstanceWithDomainSocketAndPort = function(host, port, db_options, server_options) {
      return new Db('integration_tests', new ReplSet([new Server(host, port, server_options)], {poolSize:1}), db_options);      
    }

    this.newDbInstance = function(db_options, server_options) {
      return new Db('integration_tests', new ReplSet([new Server("127.0.0.1", self.startPort, server_options)], {poolSize:1}), db_options);      
    }

    // Pr test functions
    this.setup = function(callback) { 
      callback();
    }
    
    this.teardown = function(callback) { 
      replicasetManager.restartKilledNodes(function() {
      // replicasetManager.startSet(true, function() {
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

    this.url = function(user, password) {
      if(user) {
        return 'mongodb://' + user + ':' + password + '@localhost:' + this.startPort + '/' + self.db_name + '?safe=false';
      }

      return 'mongodb://localhost:' + this.startPort + '/' + self.db_name + '?safe=false';
    }    

    // Used in tests
    this.db_name = "integration_tests";    
  }
}

// Simple replicaset configuration
var replica_set_config_auth = function(options) {
  return function() {
    var self = this;
    // Save the startPort
    this.startPort = 30000;
    // Setting up replicaset options
    var repl_options = { 
        retries:120, secondary_count:2
      , passive_count:0, arbiter_count:1
      , start_port: this.startPort
      , tags:[{"dc1":"ny"}, {"dc1":"ny"}, {"dc2":"sf"}]
    }

    // Add additional options
    for(var name in options) {
      repl_options[name] = options[name];
    }

    // Set up replicaset manager
    var replicasetManager = null;

    // Test suite start
    this.start = function(callback) {
      callback();
    }

    // Test suite stop
    this.stop = function(callback) {
      callback();
    };

    var mapFunction = function(replicasetManager, name) {
      return function() {
        var args = Array.prototype.slice.call(arguments, 0);
        replicasetManager[name].apply(replicasetManager, args);        
      }
    }

    // Set up replicaset manager
    replicasetManager = new ReplicaSetManager(repl_options);
    // Set up methods 
    self.killPrimary = mapFunction(replicasetManager, 'killPrimary');
    self.restartKilledNodes = mapFunction(replicasetManager, 'restartKilledNodes');
    self.stepDownPrimary = mapFunction(replicasetManager, 'stepDownPrimary');
    self.getNodeFromPort = mapFunction(replicasetManager, 'getNodeFromPort');
    self.kill = mapFunction(replicasetManager, 'kill');
    self.killSecondary = mapFunction(replicasetManager, 'killSecondary');
    self.primary = mapFunction(replicasetManager, 'primary');
    self.secondaries = mapFunction(replicasetManager, 'secondaries');
    self.arbiters = mapFunction(replicasetManager, 'arbiters');    
    self.setAuths = mapFunction(replicasetManager, 'setAuths');
    self.stepDownPrimary = mapFunction(replicasetManager, 'stepDownPrimary');
    self.addSecondary = mapFunction(replicasetManager, 'addSecondary');
    self.reConfigure = mapFunction(replicasetManager, 'reConfigure');
    self.startS = mapFunction(replicasetManager, 'start');
    self.reStart = mapFunction(replicasetManager, 'reStart');
    self.reStartAndConfigure = mapFunction(replicasetManager, 'reStartAndConfigure');

    // Pr test functions
    this.setup = function(callback) {   
      // Start set
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
        self._db.open(function(err, _db) {
          var db2 = _db.db('node-native-test');
          db2.addUser("me", "secret", {w:3}, function(err, result) {
            if(err) throw err;
            callback();
          });
        })
      });
    }
    
    this.teardown = function(callback) {
      if(self._db) self._db.close();
      
      replicasetManager.killAll(function(err) {
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
}

exports.replica_set_config = replica_set_config;
exports.replica_set_config_auth = replica_set_config_auth;