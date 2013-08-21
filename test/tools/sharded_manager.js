var ReplicaSetManager = require('./replica_set_manager').ReplicaSetManager,
  ServerManager = require('./server_manager').ServerManager,
  MongosManager = require('./mongos_manager').MongosManager,
  exec = require('child_process').exec,
  Db = require('../../lib/mongodb').Db,
  Server = require('../../lib/mongodb').Server;

//
// Sharded tool that is used to manage a sharded cluster
//
// numberOfReplicaSets: number of replicasets used in the shard server
// numberOfMongosServers: number of mongos proxy instances
// replPortRangeSet: starting port number of replicaset servers
// mongosRangeSet: starting port number of mongos proxies
// db: database to shard on
// collection: collection to shard
// shardKey: the collection shard key
// auth: run servers in auth mode
//
var ShardedManager = function ShardedManager(options) {
  options = options == null ? {} : options;
  // Number of config servers
  this.numberOfConfigServers = options["numberOfConfigServers"] != null ? options["numberOfConfigServers"] : 1;
  if(this.numberOfConfigServers != 1 && this.numberOfConfigServers != 3) throw new Error("Only 1 or 3 config servers can be used");
  // Config Servers port range
  this.configPortRangeSet = options["configPortRangeSet"] || 40000;

  // Number of replicasets in the sharded setup
  this.numberOfReplicaSets = options["numberOfReplicaSets"] || 1;
  // Number of mongo's in the sharded setup
  this.numberOfMongosServers = options["numberOfMongosServers"] || 1;

  // Set the replicasetPortRange
  this.replPortRangeSet = options["replPortRangeSet"] || 30000;
  // Set up mongos port range
  this.mongosRangeSet = options["mongosRangeSet"] || 50000;
  // Database to shard
  this.db = options["db"] ||  "sharded_test_db";
  // Collection to shard
  this.collection = options["collection"] || "sharded_test_db_collection";
  // Key to shard on
  this.shardKey = options["shardKey"] || "_id";
  // Enable auth mode
  this.auth = options["auth"] || false;

  // Additional settings for each replicaset
  this.replicasetOptionsArray = options["replicasetOptions"] || [];

  // Build a the replicaset instances
  this.replicasetManagers = [];
  this.configServers = [];
  this.mongosProxies = [];

  // Set up the server
  var replStarPort = this.replPortRangeSet;
  var configStartPort = this.configPortRangeSet;
  var mongosStartPort = this.mongosRangeSet;

  // List of config server urls
  var mongosServerUrls = [];

  // Sets up the replicaset managers
  for(var i = 0; i < this.numberOfReplicaSets; i++) {
    var replicasetSettings = {
      name:("repl_set" + i), 
      start_port:replStarPort, 
      retries:120, 
      secondary_count:1, 
      passive_count:0, 
      arbiter_count:1,
      auth: this.auth
    };

    // If we have options merge them in
    if(this.replicasetOptionsArray.length >= (i + 1)) {
      var additionalOptions = this.replicasetOptionsArray[i];

      // Iterate over all the options and merge them in
      for(var key in additionalOptions) {
        replicasetSettings[key] = additionalOptions[key];
      }
    }

    // Add a replicaset manager
    this.replicasetManagers.push(new ReplicaSetManager(replicasetSettings));
    // Add a bunch of numbers to the port
    replStarPort = replStarPort + 10;
  }

  // Set up config servers
  for(var i = 0; i < this.numberOfConfigServers; i++) {
    // Add a server manager
    this.configServers.push(new ServerManager({configserver:true, start_port:configStartPort, purgedirectories:true}))
    // Set up the urls
    mongosServerUrls.push("localhost:" + configStartPort);
    // Set up the config
    configStartPort = configStartPort + 1;
  }

  // console.log("-------------------------------------------------------------------")
  // console.dir(mongosServerUrls)

  // Set up mongos proxies
  for(var i = 0; i < this.numberOfMongosServers; i++) {
    // Add a server proxy
    this.mongosProxies.push(new MongosManager({start_port:mongosStartPort, configservers:mongosServerUrls, purgedirectories:true}));
    // Set up the config
    mongosStartPort = mongosStartPort + 1;
  }
}

// Boots up the sharded system and configures it
ShardedManager.prototype.start = function(callback) {
  var self = this;
  // Start replicaset servers
  startReplicasetServers(self, function(err, result) {
    if(err) {
      console.log("============================ replicaset servers start failed");
      console.dir(err);
    }
    // Start the config servers
    startConfigServers(self, function(err, result) {
      if(err) {
        console.log("============================ config servers start failed");
        console.dir(err);
      }
      // Start the mongos proxies
      startMongosProxies(self, function(err, result) {
        if(err) {
          console.log("============================ mongos proxies start failed");
          console.dir(err);
        }

        // setTimeout(function() {
          // Setup shard
          setupShards(self, function(err, result) {
            callback();
          });
        // }, 10000);
      });
    });
  });
}

// Kill everything
ShardedManager.prototype.killAll = function(callback) {
  exec('killall -9 mongod', function(err, stdout, stderr) {
    exec('killall -9 mongos', function(err, stdout, stderr) {
      callback(null, null);
    });
  });
}

// Kill a random shard
ShardedManager.prototype.killShard = function(callback) {
  var replicasetServer = this.replicasetManagers.pop();
  replicasetServer.killSetServers(callback);
}

// Kill a shard primary
ShardedManager.prototype.killShardPrimary = function(callback) {
  var replicasetServer = this.replicasetManagers.pop();
  replicasetServer.killPrimary(9, callback);
}

// Kills the first server
ShardedManager.prototype.killMongoS = function(port, callback) {
  // Locate the server instance and kill it
  for(var i = 0; i < this.mongosProxies.length; i++) {
    var proxy = this.mongosProxies[i];
    // If it's the right one kill it
    if(proxy.port == port) {
      proxy.stop(9, callback);
    }
  }
}

// Restart a specific mongos server
ShardedManager.prototype.restartMongoS = function(port, callback) {
  // Locate the server instance and kill it
  for(var i = 0; i < this.mongosProxies.length; i++) {
    var proxy = this.mongosProxies[i];

    // If it's the right one restart it
    if(proxy.port == port) {
      proxy.start(false, callback);
    }
  }
}

// Restart any downed mongo's
ShardedManager.prototype.restartAllMongos = function(callback) {
  var number_of_mongos = this.mongosProxies.length;
  // // Locate the server instance and kill it
  for(var i = 0; i < this.mongosProxies.length; i++) {
    if(this.mongosProxies[i].up) {
      number_of_mongos = number_of_mongos - 1;
    } else {
      this.mongosProxies[i].start(false, function(err) {
        number_of_mongos = number_of_mongos - 1;

        if(number_of_mongos == 0) {
          callback();
        }        
      });
    }

    if(number_of_mongos == 0) {
      callback();
    }
  };
}

// Shard a db
ShardedManager.prototype.shardDb = function(dbname, callback) {
  if(this.mongosProxies.length == 0) throw new Error("need at least one mongos server");
  // Set up the db connection
  var db = new Db("admin", new Server("localhost", this.mongosRangeSet, {auto_reconnect: true, poolSize: 4}), {w:0});
  db.open(function(err, db) {
    // Run the add shard commands
    db.command({enablesharding:dbname}, function(err, result) {
      db.close();
      callback(err, result);      
    });
  });
}

// Shard a db
ShardedManager.prototype.shardCollection = function(collectionName, key, callback) {
  if(this.mongosProxies.length == 0) throw new Error("need at least one mongos server");
  // Set up the db connection
  var db = new Db("admin", new Server("localhost", this.mongosRangeSet, {auto_reconnect: true, poolSize: 4}), {w:0});
  db.open(function(err, db) {
    // Run the add shard commands
    db.command({shardcollection:collectionName, key:key}, function(err, result) {
      db.close();
      callback(err, result);      
    });
  });
}

var setupShards = function(self, callback) {
  if(self.mongosProxies.length == 0) throw new Error("need at least one mongos server");
  // Set up the db connection
  var db = new Db("admin", new Server("localhost", self.mongosRangeSet, {auto_reconnect: true, poolSize: 4}), {w:0});
  db.open(function(err, db) {
    if(err) throw err;
    // console.log("=================================================================")
    // console.dir(err)
    var numberOfShardsToAdd = self.numberOfReplicaSets;

    for(var i = 0; i < self.numberOfReplicaSets; i++) {
      // Generate a replicaset url to add it as a shard
      var command = self.replicasetManagers[i].name + "/localhost:" + self.replicasetManagers[i].startPort;
      // Run the add shard commands
      db.command({addshard:command}, function(err, result) {
        if(result.errmsg) {
          // Close db
          db.close();
          // Wait and re-try
          setTimeout(function() {
            setupShards(self, callback);
          }, 5000);
        } else {
          numberOfShardsToAdd = numberOfShardsToAdd - 1;

          if(numberOfShardsToAdd == 0) {
            db.close();
            callback(null);
          }
        }
      });
    }
  })
}

var startMongosProxies = function(self, callback) {
  if(self.mongosProxies.length == 0) throw new Error("need at least one mongos server");
  // Set up only the first to kill all
  var killAll = true;
  // Boot up the number of config servers needed
  var mongosProxiesToStart = self.numberOfMongosServers;
  // Boot up mongos proxies
  for(var i = 0; i < self.mongosProxies.length; i++) {
    // Start server
    self.mongosProxies[i].start(killAll, function(err, result) {
      mongosProxiesToStart = mongosProxiesToStart - 1;

      if(mongosProxiesToStart == 0) {
        callback(null);
      }
    });

    // Set killall to false
    killAll = false;
  }
}

var startConfigServers = function(self, callback) {
  if(self.configServers.length == 0) throw new Error("need at least one config server");
  // Boot up the number of config servers needed
  var configServersToStart = self.numberOfConfigServers;
  // Boot up config servers
  for(var i = 0; i < self.configServers.length; i++) {
    // Start server
    self.configServers[i].start(false, function(err, result) {
      configServersToStart = configServersToStart - 1;

      if(configServersToStart == 0) {
        callback(null);
      }
    });
  }
}

var startReplicasetServers = function(self, callback) {
  if(self.replicasetManagers.length == 0) throw new Error("need at least one replicaset server");
  // Bot up the repliaset servers
  var replicasetsToStart = self.numberOfReplicaSets;

  // Boot up replicaset servers
  for(var i = 0; i < self.replicasetManagers.length; i++) {
    // Start a replicaset
    self.replicasetManagers[i].startSet(true, function(err, result) {
      replicasetsToStart = replicasetsToStart - 1;

      // Replicasets are up and running
      if(replicasetsToStart == 0) {
        callback(null);
      }
    });
  }
}

exports.ShardedManager = ShardedManager;