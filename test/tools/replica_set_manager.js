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
  this.tags = options['tags'] != null ? options['tags'] : [];
  this.ssl = options['ssl'] != null ? options['ssl'] : false; 
  
  this.arbiterCount = options["arbiter_count"] != null ? options["arbiter_count"] : 2;
  this.secondaryCount = options["secondary_count"] != null ? options["secondary_count"] : 1;
  this.passiveCount = options["passive_count"] != null ? options["passive_count"] : 1;
  this.primaryCount = options["primary_count"] != null ? options["primary_count"] : 1;
  this.keyPath = [process.cwd(), "test", "tools", "keyfile.txt"].join("/");
  try {
    fs.chmodSync(this.keyPath, 0600);    
  } catch(err) {
    console.dir(err);
  }
  
  this.count = this.primaryCount + this.passiveCount + this.arbiterCount + this.secondaryCount;
  if(this.count > 7) {
    throw new Error("Cannot create a replica set with #{node_count} nodes. 7 is the max.");
  }
  
  // Keeps all the mongod instances
  this.mongods = {};
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
  var self = this;
  // Unpack callback and variables
  var args = Array.prototype.slice.call(arguments, 0);
  callback = args.pop();
  killall = args.length ? args.shift() : true;  
  debug("** Starting a replica set with " + this.count + " nodes");

  // Kill all existing mongod instances
  exec(killall ? 'killall mongod' : '', function(err, stdout, stderr) {
    var n = 0;
    var tagsIndex = 0;

    Step(
        function startAllServers() {
          var group = this.group();
          // Start primary instances
          for(n = 0; n < (self.primaryCount + self.secondaryCount); n++) {
            self.initNode(n, {tags:self.tags[tagsIndex] != null ? self.tags[tagsIndex++] : null}, group());
          }  
          
          // Start passive instances
          for(var i = 0; i < self.passiveCount; i++) {
            self.initNode(n, {passive:true, priority:0, tags:self.tags[tagsIndex] != null ? self.tags[tagsIndex++] : null}, group())
            n = n + 1;
          }
          
          // Start arbiter instances
          for(var i = 0; i < self.arbiterCount; i++) {
            self.initNode(n, {arbiterOnly:true, tags:self.tags[tagsIndex] != null ? self.tags[tagsIndex++] : null}, group());
            n = n + 1;
          }          
        },
        
        function finishUp(err, values) {
          self.numberOfInitiateRetries = 0;
          // Initiate
          self.initiate(function(err, result) {
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
      // Close connection
      connection.close();
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
  this.mongods[n]["ssl"] = this.ssl;
  this.mongods[n]["host"] = this.host;
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
  
  // Perform cleanup of directories
  exec("rm -rf " + self.mongods[n]["db_path"], function(err, stdout, stderr) {
    if(err != null) return callback(err, null);
    
    // Create directory
    exec("mkdir -p " + self.mongods[n]["db_path"], function(err, stdout, stderr) {
      if(err != null) return callback(err, null);
      self.mongods[n]["start"] = self.startCmd(n);
      
      // console.log("----------------------------------------------------- node start command")
      // console.log(self.mongods[n]["start"])
      
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
        
        // Check if we have tags
        if(self.mongods[n]['tags'] != null) {
          member["tags"] = self.mongods[n]['tags'];
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
  var done = false;
  
  this.getNodeWithState(1, function(err, node) {
    if(!done) {
      // Ensure no double callbacks due to later scheduled connections returning
      done = true;    
      if(err != null) return callback(err, null);    

      // Kill process and return node reference
      self.kill(node, signal, options, function() {
        // Wait for a while before passing back
        callback(null, node);        
      })    
    }
  });
}

ReplicaSetManager.prototype.killSecondary = function(callback) {
  var self = this;
  var done = false;
  
  this.getNodeWithState(2, function(err, node) {
    if(!done) {
      // Ensure no double callbacks due to later scheduled connections returning
      done = true;    
      if(err != null) return callback(err, null);
      // Kill process and return node reference
      self.kill(node, function() {
        callback(null, node);
      })
    }    
  });  
}

ReplicaSetManager.prototype.stepDownPrimary = function(callback) {
  var self = this;
  // Get the primary node
  this.getNodeWithState(1, function(err, primary) {
    // Return error
    if(err) return callback(err, null);
    if(primary == null) return callback(new Error("No primary found"), null);
    // Get the connection for the primary
    self.getConnection(primary, function(err, connection) {
      // Return any errors
      if(err) return callback(err, null);
      // Execute stepdown process
      connection.admin().command({"replSetStepDown": 90});
      // Return the callback
      return callback(null, connection);
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
  var numberOfInitiateRetries = this.retries;
  var done = false;
  
  // Actual function doing testing
  var ensureUpFunction = function() {
    if(!done) {
      if(!self.up) process.stdout.write(".");
      // Attemp to retrieve a connection
      self.getConnection(function(err, connection) {
        // Adjust the number of retries
        numberOfInitiateRetries = numberOfInitiateRetries - 1
        // If have no more retries stop
        if(numberOfInitiateRetries == 0) {
          // Set that we are done
          done = true;
          // perform callback
          return callback(new Error("Servers did not come up again"), null);
        }

        // We have a connection, execute command and update server object
        if(err == null && connection != null) {
          // Check repl set get status
          connection.admin().command({"replSetGetStatus": 1}, function(err, object) {
            // Close connection
            if(connection != null) connection.close();
            // Get documents
            var documents = object.documents;
            // Get status object
            var status = documents[0];

            // If no members set
            if(status["members"] == null || err != null) {
              // if we have a connection force close it
              if(connection != null) connection.close();
              // Ensure we perform enough retries
              if(self.ensureUpRetries >=  self.retries) {
                // Set that we are done
                done = true;
                // Return error
                return callback(new Error("Operation Failure"), null);          
              } else {
                // Execute function again
                setTimeout(ensureUpFunction, 1000);
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
                // Set that we are done
                done = true;
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
                if(self.ensureUpRetries >=  self.retries) {
                  // Set that we are done
                  done = true;
                  // Return error
                  return callback(new Error("Operation Failure"), null);          
                } else {
                  // Execute function again
                  setTimeout(ensureUpFunction, 1000);                  
                }    
              }        
            }
          });
        } else if(err != null && connection != null) {
          if(connection != null) connection.close();
        }
      });      
    }
  }

  // Execute the first function call
  ensureUpFunction();  
}

// Restart 
ReplicaSetManager.prototype.restartKilledNodes = function(callback) {
  var self = this;

  var nodes = Object.keys(self.mongods).filter(function(key) {
    return self.mongods[key]["up"] == false;
  });

  var numberOfNodes = nodes.length;
  if(numberOfNodes == 0) return self.ensureUp(callback);

  // Restart all the number of nodes
  for(var i = 0; i < numberOfNodes; i++) {
    // Start the process
    self.start(nodes[i], function(err, result) {
      // Adjust the number of nodes we are starting
      numberOfNodes = numberOfNodes - 1;
      
      if(numberOfNodes === 0) {
        self.ensureUp(callback);
      }
    });
  }
}

ReplicaSetManager.prototype.getConnection = function(node, callback) {
  var self = this;
  // Function done
  var done = false;
  // Number of retries
  var numberOfRetries = self.retries;
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
  
  // Get the node
  if(self.mongods[node] != null) {
    var intervalId = setInterval(function() {
      var connection = new Db("replicaset_test", new Server(self.host, self.mongods[node]["port"], {ssl:self.ssl}));
      connection.open(function(err, db) {
        if(err == null && !done) {
          // Set done
          done = true;
          // Clear interval
          clearInterval(intervalId);
          // Callback as done
          return callback(null, connection);
        } else {          
          // Close the connection
          if(connection != null) connection.close();
          // Adjust the number of retries
          numberOfRetries = numberOfRetries - 1;            
          // If we have no more retries fail
          if(numberOfRetries == 0) {
            // Set done
            done = true;
            // Clear interval
            clearInterval(intervalId);
            // Callback as done
            return callback(new Error("Timed out connecting to primary"), null);              
          }
        }
      });        
    }, 1000);
  } else {
    callback(new Error("no primary node found to do stepDownPrimary"), null);
  }
}

// Fire up the mongodb instance
var start = ReplicaSetManager.prototype.start = function(node, callback) {
  var self = this;

  // Start up mongod process
  var mongodb = exec(self.mongods[node]["start"],
    function (error, stdout, stderr) {
      debug('stdout: ' + stdout);
      debug('stderr: ' + stderr);
      if (error !== null) {
        debug('exec error: ' + error);
      }
    });

  // Wait for a half a second then save the pids
  setTimeout(function() {
    // Mark server as running
    self.mongods[node]["up"] = true;
    self.mongods[node]["pid"]= fs.readFileSync(path.join(self.mongods[node]["db_path"], "mongod.lock"), 'ascii').trim();
    // Callback
    callback();
  }, 5000);
}

ReplicaSetManager.prototype.restart = start;

ReplicaSetManager.prototype.startCmd = function(n) {
  // Create boot command
  this.mongods[n]["start"] = "mongod --rest --noprealloc --smallfiles --replSet " + this.name + " --logpath '" + this.mongods[n]['log_path'] + "' " +
      " --dbpath " + this.mongods[n]['db_path'] + " --port " + this.mongods[n]['port'] + " --fork";
  this.mongods[n]["start"] = this.durable ? this.mongods[n]["start"] + " --dur" : this.mongods[n]["start"];
  
  if(this.auth) {
    this.mongods[n]["start"] = this.auth ? this.mongods[n]["start"] + " --keyFile " + this.keyPath : this.mongods[n]["start"];
  }
  
  // If we have ssl defined set up with test certificate
  if(this.ssl) {
    var path = getPath(this, '../test/certificates');
    this.mongods[n]["start"] = this.mongods[n]["start"] + " --sslOnNormalPorts --sslPEMKeyFile=" + path + "/mycert.pem --sslPEMKeyPassword=10gen";
  }
  
  return this.mongods[n]["start"];
}













