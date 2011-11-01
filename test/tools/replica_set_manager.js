var debug = require('util').debug,
  inspect = require('util').inspect,
  path = require('path'),
  fs = require('fs'),
  exec = require('child_process').exec,
  spawn = require('child_process').spawn,
  Connection = require('../../lib/mongodb').Connection,
  Db = require('../../lib/mongodb').Db,
  Server = require('../../lib/mongodb').Server,
  Step = require("../../deps/step/lib/step");  

var ReplicaSetManager = exports.ReplicaSetManager = function(options) {
  options = options == null ? {} : options;
  
  this.startPort = options["start_port"] || 30000;
  this.ports = [];
  this.name = options["name"] != null ? options["name"] : "replica-set-foo";
  this.host = options["host"] != null ? options["host"] : "localhost";
  this.retries = options["retries"] != null ? options["retries"] : 60;
  this.config = {"_id": this.name, "members": []};
  this.durable = options["durable"] != null ? options["durable"] : false;
  this.auth = options['auth'] != null ? options['auth'] : false; 
  this.path = path.resolve("data");
  this.killNodeWaitTime = options['kill_node_wait_time'] != null ? options['kill_node_wait_time'] : 20000;
  
  this.arbiterCount = options["arbiter_count"] != null ? options["arbiter_count"] : 2;
  this.secondaryCount = options["secondary_count"] != null ? options["secondary_count"] : 1;
  this.passiveCount = options["passive_count"] != null ? options["passive_count"] : 1;
  this.primaryCount = 1;
  this.keyPath = [process.cwd(), "test", "tools", "keyfile.txt"].join("/");
  fs.chmodSync(this.keyPath, 0600);
  
  this.count = this.primaryCount + this.passiveCount + this.arbiterCount + this.secondaryCount;
  if(this.count > 7) {
    throw new Error("Cannot create a replica set with #{node_count} nodes. 7 is the max.");
  }
  
  this.mongods = {};
  var self = this;
  
  // Add a handler for errors that bubble up all the way
  // process.on('uncaughtException', function (err) {
  //   debug("============================================================= uncaught Exception")
  //   debug(inspect(err))
  //   // Kill all mongod servers and cleanup before exiting
  //   self.killAll(function() {
  //     // Force exit
  //     process.exit();
  //   })  
  // });  
}

ReplicaSetManager.prototype.secondaries = function(callback) {
  return this.allHostPairsWithState(2, callback);
}

ReplicaSetManager.prototype.arbiters = function(callback) {
  return this.allHostPairsWithState(7, callback);
}

ReplicaSetManager.prototype.primary = function(callback) {
  return this.allHostPairsWithState(1, function(err, items) {
    if(items.length == 0) {
      return callback(null, null);
    } else {
      return callback(null, items[0]);
    }
  });
}

ReplicaSetManager.prototype.allHostPairsWithState = function(state, callback) {
  this.ensureUp(function(err, status) {
    if(err != null) return callback(err, null);

    var members = status["members"];

    // Get the correct state memebers
    var nodes = members.filter(function(value) {
      return value["state"] == state;
    });    
    
    // Filter out address of the server
    var servers = nodes.map(function(item) {
      return item["name"];
    });

    // Map nodes
    return callback(null, servers);
  })            
}

ReplicaSetManager.prototype.startSet = function(killall, callback) {
  console.log("----------------------------------- START SET")
  var self = this;
  // Unpack callback and variables
  var args = Array.prototype.slice.call(arguments, 0);
  callback = args.pop();
  killall = args.length ? args.shift() : true;  

  debug("** Starting a replica set with " + this.count + " nodes");

  // Kill all existing mongod instances
  exec(killall ? 'killall mongod' : '', function(err, stdout, stderr) {
    var n = 0;

    Step(
        function startPrimaries() {
          var group = this.group();
          // Start primary instances
          for(n = 0; n < (self.primaryCount + self.secondaryCount); n++) {
            self.initNode(n, {}, group());
          }  
          
          // Start passive instances
          for(var i = 0; i < self.passiveCount; i++) {
            self.initNode(n, {priority:0}, group())
            n = n + 1;
          }
          
          // Start arbiter instances
          for(var i = 0; i < self.arbiterCount; i++) {
            self.initNode(n, {arbiterOnly:true}, group());
            n = n + 1;
          }          
        },
        
        function finishUp(err, values) {
          self.numberOfInitiateRetries = 0;
          // Initiate
          self.initiate(function(err, result) {
            console.log("-------------------------------------------------- FFFFFFFFFFFFFFFFFFFFUUUUUUUUUUUUUUUUUCCCCCCCCCK")
            if(err != null) return callback(err, null);
            self.ensureUpRetries = 0;

            // Ensure all the members are up
            debug("** Ensuring members are up...");
            // Let's ensure everything is up
            self.ensureUp(function(err, result) {
              if(err != null) return callback(err, null);
              // Return a correct result
              callback(null, result);
            })            
          });          
        }
    );
  })
}

ReplicaSetManager.prototype.initiate = function(callback) {
  var self = this;
  var done = false;
  // Get master connection
  self.getConnection(function(err, connection) {    
    if(err != null) return callback(err, null);   
    // debug("=================================================== replicaset config")
    // debug(inspect(self.config))
     
    // Set replica configuration
    connection.admin().command({replSetInitiate:self.config}, function(err, result) {
      // If we have an error let's 
      if(err != null) {
        // Retry a number of times
        if(self.numberOfInitiateRetries < self.retries) {
          setTimeout(function() {
            self.numberOfInitiateRetries = self.numberOfInitiateRetries + 1;
            self.initiate(callback);
          }, 1000);          
        }
      } else {
        // Make sure we only do this once, even if some messages are late
        if(!done) {
          done = true;
          self.numberOfInitiateRetries = 0;
          callback(null, null);                  
        }
      }      
    });    
  });
}

// Get absolute path
var getPath = function(self, name) {
  return path.join(self.path, name);
}

ReplicaSetManager.prototype.initNode = function(n, fields, callback) {
  var self = this;
  this.mongods[n] = this.mongods[n] == null ? {} : this.mongods[n];
  var port = this.startPort + n;
  this.ports.push(port);
  this.mongods[n]["port"] = port;
  this.mongods[n]["db_path"] = getPath(this, "rs-" + port);
  this.mongods[n]["log_path"] = getPath(this, "log-" + port);
  this.up = false;
  
  // Set priority off server in config
  var priority = typeof fields === 'object' ? fields.priority : null;
  
  // Add extra fields provided
  for(var name in fields) {
    this.mongods[n][name] = fields[name];
  }
  
  // debug("================================================== initNode")
  // debug(inspect(this.mongods[n]));
  
  // Perform cleanup of directories
  exec("rm -rf " + self.mongods[n]["db_path"], function(err, stdout, stderr) {
    // debug("======================================== err1::" + err)
    
    if(err != null) return callback(err, null);
    
    // Create directory
    exec("mkdir -p " + self.mongods[n]["db_path"], function(err, stdout, stderr) {
      // debug("======================================== err2::" + err)

      if(err != null) return callback(err, null);

      // debug("= ======================================= start1::" + self.mongods[n]["start"])

      self.mongods[n]["start"] = self.startCmd(n);
      self.start(n, function() {
        // Add instance to list of members
        var member = {"_id": n, "host": self.host + ":" + self.mongods[n]["port"]};   
        // Set it to arbiter if it's been passed
        if(self.mongods[n]['arbiterOnly']) {
          member['arbiterOnly'] = true;
        }
        // Set priority level if it's defined
        if(priority != null) {
          member['priority'] = priority;
        }
        // Push member to config
        self.config["members"].push(member);
        // Return
        return callback();
      });      
    });    
  });
}

ReplicaSetManager.prototype.killAll = function(callback) {
  exec('killall mongod', function(err, stdout, stderr) {
    return callback();
  });  
}

ReplicaSetManager.prototype.kill = function(node, signal, options, callback) {
  var self = this;
  // Unpack callback and variables
  var args = Array.prototype.slice.call(arguments, 1);
  callback = args.pop();
  signal = args.length ? args.shift() : 2;
  options = args.length ? args.shift() : {};
  // kill node wait time
  var killNodeWaitTime = options.killNodeWaitTime == null ? self.killNodeWaitTime : options.killNodeWaitTime;
  // console.log("===================================== ReplicaSetManager.prototype.kill ::" + killNodeWaitTime);

  debug("** Killing node with pid " + this.mongods[node]["pid"] + " at port " + this.mongods[node]['port']);
  var command = "kill -" + signal + " " + this.mongods[node]["pid"];
  // Kill process
  exec(command,
    function (error, stdout, stderr) {
      debug('stdout: ' + stdout);
      debug('stderr: ' + stderr);
      if (error !== null) {
        debug('exec error: ' + error);
      }

      self.mongods[node]["up"] = false;
      // Wait for 5 seconds to give the server time to die a proper death
      setTimeout(callback, killNodeWaitTime);
  });  
}

ReplicaSetManager.prototype.killPrimary = function(signal, options, callback) {
  var self = this;
  // Unpack callback and variables
  var args = Array.prototype.slice.call(arguments, 0);
  callback = args.pop();  
  signal = args.length ? args.shift() : 2;
  options = args.length ? args.shift() : {};
  
  this.getNodeWithState(1, function(err, node) {
    // console.log("------------------------------------------------------ killPrimary :: 0")
    if(err != null) return callback(err, null);    

    // Kill process and return node reference
    self.kill(node, signal, options, function() {
      // console.log("------------------------------------------------------ killPrimary :: 1")
      // Wait for a while before passing back
      callback(null, node);        
    })    
  });
}

ReplicaSetManager.prototype.killSecondary = function(callback) {
  var self = this;
  
  this.getNodeWithState(2, function(err, node) {
    if(err != null) return callback(err, null);
    // Kill process and return node reference
    self.kill(node, function() {
      callback(null, node);
    })    
  });  
}

ReplicaSetManager.prototype.stepDownPrimary = function(callback) {
  var self = this;

  this.getNodeWithState(1, function(err, primary) {
    self.getConnection(primary, function(err, connection) {
      if(err) return callback(err, null);

      // Closes the connection so never gets a response
      connection.admin().command({"replSetStepDown": 90});
      // Call back
      return callback(null, null);
    });
  });
}

ReplicaSetManager.prototype.getNodeFromPort = function(port, callback) {
  var self = this;
  var nodes = Object.keys(this.mongods).filter(function(key, index, array) {
    return self.mongods[key]["port"] == port;
  });
  // Return first node
  callback(null, nodes.length > 0 ? nodes.shift() : null);
}

ReplicaSetManager.prototype.getNodeWithState = function(state, callback) {
  var self = this;
  self.ensureUpRetries = 0;
  self.ensureUp(function(err, status) {
    if(err != null) return callback(err, null);
    
    var node = status["members"].filter(function(element, index, array) {
      return element["state"] == state;
    }).shift();
        
    if(node != null) {
      var hostPort = node["name"].split(":");
      var port = hostPort[1] != null ? parseInt(hostPort[1]) : 27017;
      var key = Object.keys(self.mongods).filter(function(element, index, array) {
        return self.mongods[element]["port"] == port;
      }).shift();
      return callback(null, key);
    } else {
      return callback(null, false);
    }
  });
}

ReplicaSetManager.prototype.ensureUp = function(callback) {
  var self = this;
  
  // Write out the ensureUp
  // process.stdout.write(".");  
  if(!self.up) process.stdout.write(".");
  // Retry check for server up sleeping inbetween
  self.retriedConnects = 0;
  // Attemp to retrieve a connection
  self.getConnection(function(err, connection) {
    // If we have an error or no connection object retry
    if(err != null || connection == null) {
      // if we have a connection force close it
      if(connection != null) connection.close();
      // Retry the connection
      setTimeout(function() {
        self.ensureUpRetries++;
        self.ensureUp(callback);
      }, 1000)
      // Return
      return;      
    }
    
    // Check repl set get status
    connection.admin().command({"replSetGetStatus": 1}, function(err, object) {
      /// Get documents
      var documents = object.documents;
      // Get status object
      var status = documents[0];

      // If no members set
      if(status["members"] == null || err != null) {
        // if we have a connection force close it
        if(connection != null) connection.close();
        // Ensure we perform enough retries
        if(self.ensureUpRetries <  self.retries) {
          setTimeout(function() {
            self.ensureUpRetries++;
            self.ensureUp(callback);
          }, 1000)
        } else {
          // if we have a connection force close it
          if(connection != null) connection.close();
          // Return error
          return callback(new Error("Operation Failure"), null);          
        }                
      } else {
        // Establish all health member
        var healthyMembers = status.members.filter(function(element) {
          return element["health"] == 1 && [1, 2, 7].indexOf(element["state"]) != -1             
        });
        
        var stateCheck = status["members"].filter(function(element, indexOf, array) {
          return element["state"] == 1;
        });

        if(healthyMembers.length == status.members.length && stateCheck.length > 0) {
          // if we have a connection force close it
          if(connection != null) connection.close();
          // process.stdout.write("all members up! \n\n");  
          if(!self.up) process.stdout.write("all members up!\n\n")
          self.up = true;
          return callback(null, status);
        } else {
          // if we have a connection force close it
          if(connection != null) connection.close();
          // Ensure we perform enough retries
          if(self.ensureUpRetries <  self.retries) {
            setTimeout(function() {
              self.ensureUpRetries++;
              self.ensureUp(callback);
            }, 1000)
          } else {
            return callback(new Error("Operation Failure"), null);          
          }        
        }        
      }      
    });
  });
}

// Restart 
ReplicaSetManager.prototype.restartKilledNodes = function(callback) {
  var self = this;
  // console.log("------------------------------------------------------ ReplicaSetManager.prototype.restartKilledNodes :: 0")

  var nodes = Object.keys(self.mongods).filter(function(key) {
    return self.mongods[key]["up"] == false;
  });

  // console.log("------------------------------------------------------ ReplicaSetManager.prototype.restartKilledNodes :: 1")
  // console.dir(nodes)

  var numberOfNodes = nodes.length;
  if(numberOfNodes == 0) return self.ensureUp(callback);
  // console.log("------------------------------------------------------ ReplicaSetManager.prototype.restartKilledNodes :: 2 :: " + numberOfNodes)
  // Restart all the number of nodes
  for(var i = 0; i < numberOfNodes; i++) {
    // console.log("------------------------------------------------------ ReplicaSetManager.prototype.restartKilledNodes :: 3")
    // Start the process
    self.start(nodes[i], function(err, result) {
      // Adjust the number of nodes we are starting
      numberOfNodes = numberOfNodes - 1;
      
      // console.log("-------------------------------------------------------------------- restartKilledNodes.start :: " + numberOfNodes)
      // console.dir(err)
      // console.dir(result)
      
      if(numberOfNodes === 0) {
        self.ensureUp(callback);
      }
    });
  }
}

ReplicaSetManager.prototype.getConnection = function(node, callback) {
  var self = this;
  // Unpack callback and variables
  var args = Array.prototype.slice.call(arguments, 0);
  callback = args.pop();  
  node = args.length ? args.shift() : null;
  
  if(node == null) {    
    var keys = Object.keys(this.mongods);
    for(var i = 0; i < keys.length; i++) {
      var key = keys[i];
      // Locate first db that's runing and is not an arbiter
      if(this.mongods[keys[i]]["arbiterOnly"] == null && this.mongods[key]["up"]) {
        node = keys[i];
        break;
      }
    }
  }

  // Fire up the connection to check if we are running
  // var db = new Db('node-mongo-blog', new Server(host, port, {}), {native_parser:true});
  // if(this.mongods[node] == null) {
  //   console.log("%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%% :: " + node)
  //   debug(inspect(this.mongods))
  // }
  
  if(this.mongods[node] != null) {
    var connection = new Db("replicaset_test", new Server(this.host, this.mongods[node]["port"], {}));
    connection.on("error", function(err) {
      console.log("------------------------------------------------------------------------ db error")
      console.dir(err)
    });

    connection.open(function(err, connection) {
      process.nextTick(function() {
        // We need to retry if we have not finished up the number of retries
        if(err != null && self.retriedConnects < self.retries) {
          // Close connection to server
          if(connection != null) connection.close();
          // Sleep for a second then retry
          setTimeout(function() {
            // Update retries
            self.retriedConnects++;        
            // Perform anothe reconnect
            self.getConnection(node, callback);              
          }, 1000)        
        } else if(err != null && self.retriedConnects >= self.retries){
          // Close connection to server
          if(connection != null) connection.close();
          // Return error
          callback(new Error("Failed to reconnect"), null);
        } else {
          callback(null, connection);
        }
      });
    })    
  } else {
    if(self.retriedConnects < self.retries) {
      process.nextTick(function() {
        // Sleep for a second then retry
        setTimeout(function() {
          // Update retries
          self.retriedConnects++;        
          // Perform anothe reconnect
          self.getConnection(node, callback);              
        }, 1000)        
      })
    } else if(self.retriedConnects >= self.retries){
      callback(new Error("Failed to reconnect"), null);
    } else {
      callback(null, connection);
    }    
  }
}

// Fire up the mongodb instance
var start = ReplicaSetManager.prototype.start = function(node, callback) {
  var self = this;
  // Start up mongod process
  // debug("======================================================================================= starting process")
  // debug(self.mongods[node]["start"])

  // Start up the process
  var mongodb = exec(self.mongods[node]["start"],
    function (error, stdout, stderr) {
      // debug("======================================================================================= starting process :: 0")
      debug('stdout: ' + stdout);
      debug('stderr: ' + stderr);
      if (error !== null) {
        debug('exec error: ' + error);
      }
      // debug("======================================================================================= starting process :: 1")
    });
      
  // debug("======================================================================================= starting process :: 2")
  // Wait for a half a second then save the pids
  setTimeout(function() {
    // debug("======================================================================================= starting process :: 3")
    // Mark server as running
    self.mongods[node]["up"] = true;
    // debug("======================================================================================= starting process :: 4")
    self.mongods[node]["pid"]= fs.readFileSync(path.join(self.mongods[node]["db_path"], "mongod.lock"), 'ascii').trim();
    // debug("======================================================================================= starting process :: 5")
    // Callback
    callback();
  }, 5000);
}

ReplicaSetManager.prototype.restart = start;

ReplicaSetManager.prototype.startCmd = function(n) {
  // Create boot command
  this.mongods[n]["start"] = "mongod --noprealloc --smallfiles --replSet " + this.name + " --logpath '" + this.mongods[n]['log_path'] + "' " +
      " --dbpath " + this.mongods[n]['db_path'] + " --port " + this.mongods[n]['port'] + " --fork";
  this.mongods[n]["start"] = this.durable ? this.mongods[n]["start"] + " --dur" : this.mongods[n]["start"];
  
  if(this.auth) {
    this.mongods[n]["start"] = this.auth ? this.mongods[n]["start"] + " --keyFile " + this.keyPath : this.mongods[n]["start"];
  }
  return this.mongods[n]["start"];
}













