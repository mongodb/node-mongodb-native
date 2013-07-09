var debug = require('util').debug,
  inspect = require('util').inspect,
  path = require('path'),
  fs = require('fs'),
  exec = require('child_process').exec,
  spawn = require('child_process').spawn,
  Connection = require('../../lib/mongodb').Connection,
  Db = require('../../lib/mongodb').Db,
  Server = require('../../lib/mongodb').Server,
  Step = require("step");

var ReplicaSetManager = exports.ReplicaSetManager = function(options) {
  options = options == null ? {} : options;

  this.startPort = options["start_port"] || 30000;
  this.ports = [];
  this.name = options["name"] != null ? options["name"] : "replica-set-foo";
  this.host = options["host"] != null ? options["host"] : "localhost";
  this.retries = options["retries"] != null ? options["retries"] : 120;
  this.config = {"_id": this.name, "version": 1, "members": []};
  this.journal = options["journal"] != null ? options["journal"] : false;
  this.auth = options['auth'] != null ? options['auth'] : false;
  this.path = path.resolve("data");
  this.killNodeWaitTime = options['kill_node_wait_time'] != null ? options['kill_node_wait_time'] : 1000;
  this.tags = options['tags'] != null ? options['tags'] : [];
  this.ssl = options['ssl'] != null ? options['ssl'] : false;
  this.ssl_server_pem = options['ssl_server_pem'] != null ? options['ssl_server_pem'] : null;
  this.ssl_server_pem_pass = options['ssl_server_pem_pass'] != null ? options['ssl_server_pem_pass'] : null;
  this.ssl_weak_certificate_validation = options['ssl_weak_certificate_validation'] != null ? options['ssl_weak_certificate_validation'] : null;
  this.ssl_client_pem = options['ssl_client_pem'] != null ? options['ssl_client_pem'] : null;
  // Ca settings for ssl
  this.ssl_ca = options['ssl_ca'] != null ? options['ssl_ca'] : null;
  this.ssl_crl = options['ssl_crl'] != null ? options['ssl_crl'] : null;

  // Set up for creating different topologies
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

ReplicaSetManager.prototype.setAuths = function(user, password) {
  this.auths = {user: user, password: password};
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
  // Reset configuration for replicaset
  this.config = {"_id": this.name, "version": 1, "members": []};

  // Kill all existing mongod instances
  exec(killall ? 'killall -9 mongod' : '', function(err, stdout, stderr) {
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
  this.mongods[n]["ssl_server_pem"] = this.ssl_server_pem;
  this.mongods[n]["ssl_server_pem_pass"] = this.ssl_server_pem_pass;
  this.mongods[n]["ssl_force_validate_certificates"] = this.ssl_force_validate_certificates;
  this.mongods[n]["ssl_ca"] = this.ssl_ca;
  this.mongods[n]["ssl_crl"] = this.ssl_crl;
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
      exec("mkdir -p " + self.mongods[n]["db_path"] + "/journal", function(err, stdout, stderr) {
        if(err != null) return callback(err, null);
        self.mongods[n]["start"] = self.startCmd(n);

        // Start the node
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
  });
}

ReplicaSetManager.prototype.killAll = function(callback) {
  exec('killall -9 mongod', function(err, stdout, stderr) {
    if(typeof callback == 'function') return callback();
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
      if (error != null) {
        debug('exec error: ' + error);
      }

      self.mongods[node]["up"] = false;
      // Wait for 5 seconds to give the server time to die a proper death
      setTimeout(callback, killNodeWaitTime);
  });
}

ReplicaSetManager.prototype.killSetServers = function(callback) {
  var keys = Object.keys(this.mongods);
  var totalKeys = keys.length;
  var self = this;

  var killCallback = function(_nodeKey) {
    return function(err, result) {
      self.kill(_nodeKey, 9, function() {
        totalKeys = totalKeys - 1;
        if(totalKeys == 0) return callback(null, null);        
      })
    }
  }

  for(var i = 0; i < keys.length; i++) {
    killCallback(keys[i])();
  }
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

var _authenticateIfNeeded = function(self, connection, callback) {
  if(self.auths != null) {
    connection.admin().authenticate(self.auths.user, self.auths.password, function(err, result) {
      callback();
    });
  } else {
    callback();
  }
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
        console.log("[ensureUp] - " + self.startPort + " :: " + numberOfInitiateRetries)
        // console.dir(err)

        // Adjust the number of retries
        numberOfInitiateRetries = numberOfInitiateRetries - 1
        // If have no more retries stop
        if(numberOfInitiateRetries == 0) {
          console.log("[ensureUp] - " + self.startPort + " :: restarting set")

          // Close connection
          if(connection != null) connection.close();

          // Attempt to restart the whole set
          return self.startSet(true, function(err, result) {
            if(err) {
              console.log("[ensureUp] - " + self.startPort + " :: failed to restart set")
              // Set that we are done
              done = true;
              // perform callback
              return callback(new Error("Servers did not come up again"), null);              
            } else {
              console.log("[ensureUp] - " + self.startPort + " :: restart successful")
              return callback(null, null);
            }
          });
        }

        // We have a connection, execute command and update server object
        if(err == null && connection != null) {
          _authenticateIfNeeded(self, connection, function() {
            // Check repl set get status
            connection.admin().command({"replSetGetStatus": 1}, function(err, object) {              
              // Close connection
              if(connection != null) connection.close();
              // Get documents
              var documents = object.documents;
              // Get status object
              var status = documents[0];
              // console.dir(status)

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
                    // && element['lastHeartbeatMessage'] == null
                    && element['errmsg'] == null
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
  // console.log("[ReplicaSetManager] :: restartKilledNodes :: " + this.startPort)
  var self = this;

  var nodes = Object.keys(self.mongods).filter(function(key) {
    return self.mongods[key]["up"] == false;
  });

  var numberOfNodes = nodes.length;
  if(numberOfNodes == 0) return self.ensureUp(callback);

  // Restart all the number of nodes
  for(var i = 0; i < numberOfNodes; i++) {    
    // Start the process
    self.reStart(nodes[i], function(err, result) {
      // Adjust the number of nodes we are starting
      numberOfNodes = numberOfNodes - 1;

      if(numberOfNodes === 0) {
        self.ensureUp(function(err, result) {
          callback(err, result);
        });
      }
    });
  }
}

ReplicaSetManager.prototype.addSecondary = function(options, callback) {
  if(typeof options == 'function') {
    callback = options;
    options = {};
  }
  
  var self = this;  
  var retries = options.retries || 100;
  // Add a node
  var n = this.primaryCount + this.secondaryCount + 1;
  
  // Start the node
  this.initNode(n, {}, function(err, result) {
    if(err) return callback(err);

    // Get the primary and add the secondary
    self.primary(function(err, primary) {
      if(err) return callback(err);

      // Execute add server command
      var mongoObject = self.mongods[n];
      var host = mongoObject.host;
      var port = mongoObject.port;

      // Get the configuration
      var connection = new Db("local", new Server(primary.split(":")[0], parseInt(primary.split(":")[1], 10), {
          ssl:self.ssl
        , auto_reconnect:false
        , poolSize:1
        , socketOptions: {
            connectTimeoutMS: 30000
          , socketTimeoutMS: 30000
        }
        , sslKey:self.ssl_client_pem
        , sslCert:self.ssl_client_pem
      }), {w:0}).open(function(err, db) {
        if(err) return callback(err);
  
        // Authenticate if needed
        _authenticateIfNeeded(self, db, function(err, result) {
          if(err) {
            if(db) db.close();
            return callback(err);
          }

          // Get the current configuration        
          db.collection('system.replset').findOne({}, function(err, doc) {
            if(err) {
              if(db) db.close();
              return callback(err);
            }

            // Create member config
            var config = {
                _id: (doc.members.length + 1)
              , host: (host + ":" + port)            
            }

            // Add to list of members
            doc.members.push(config);
            doc.version = doc.version + 1;

            // Re configure
            db.admin().command({replSetReconfig: doc}, function(err, result) {
              if(err) {
                if(db) db.close();
                return callback(err);
              }

              var checkHealthy = function() {
                // Wait for the secondary to come up properly
                db.admin().command({"replSetGetStatus": 1}, function(_err, _doc) {
                  if(_err) {
                    db.close();
                    return callback(_err);
                  }

                  _doc = _doc.documents[0];

                  var members = _doc.members;
                  // Adjust the number of retries
                  retries = retries - 1;

                  // Go over find the server and check the state
                  for(var i = 0; i < members.length; i++) {
                    if(members[i].name == (host + ":" + port) 
                      && members[i].state == 2) {
                      db.close();
                      return callback(null, self.mongods[n]);
                    }
                  }

                  // No more retries
                  if(retries == 0) {
                    db.close();                    
                    return callback(new Error("Failed to add Secondary server"));
                  }

                  // Execute again
                  setTimeout(checkHealthy, 1000);
                });                
              }

              setTimeout(checkHealthy, 1000);
            });
          });
        });
      });
    });
  });
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
      var connection = new Db("replicaset_test", new Server(self.host, self.mongods[node]["port"], {
          ssl:self.ssl
        , auto_reconnect:false
        , socketOptions: {
            connectTimeoutMS: 30000
          , socketTimeoutMS: 30000
        }
        , poolSize:1
        , sslKey:self.ssl_client_pem
        , sslCert:self.ssl_client_pem
      }), {w:0});
      connection.open(function(err, db) {
        if(err == null && !done) {
          // Set done
          done = true;
          // Clear interval
          clearInterval(intervalId);
          // Callback as done
          return callback(null, connection);
        } else {
          if(err == null && db != null)
            db.close();
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

ReplicaSetManager.prototype.reStartAndConfigure = function(node_configs, callback) {
  var self = this;

  if(typeof node_configs == 'function') {
    callback = node_configs;
    node_configs = {};
  }

  // Number of retries
  var retries = self.retries;  

  // Get the primary
  this.primary(function(err, primary) {

    // Get the configuration
    var connection = new Db("local", new Server(primary.split(":")[0], parseInt(primary.split(":")[1], 10), {
        ssl:self.ssl
      , auto_reconnect:false
        , socketOptions: {
            connectTimeoutMS: 30000
          , socketTimeoutMS: 30000
        }
      , poolSize:1
      , sslKey:self.ssl_client_pem
      , sslCert:self.ssl_client_pem
    }), {w:0}).open(function(err, db) {
      if(err) return callback(err);

      // Authenticate if needed
      _authenticateIfNeeded(self, db, function(err, result) {
        if(err) {
          db.close();
          return callback(err);
        }

        // Get the current configuration        
        db.collection('system.replset').findOne({}, function(err, doc) {
          if(err) {
            db.close();
            return callback(err);
          }

          // Iterate over all the member docs and apply and config changes
          for(var i = 0; i < doc.members.length; i++) {
            var member = doc.members[i];

            // Add config variables
            if(node_configs[member.host]) {
              for(var name in node_configs[member.host]) {
                member[name] = node_configs[member.host][name];
              }
            }
          }

          // Update the document version
          doc.version = doc.version + 1;

          // Re configure
          db.admin().command({replSetReconfig: doc}, function(err, result) {
            // Ensure severs are back and running
            // self.ensureUp(callback);
            var checkHealthy = function() {
              // Wait for the secondary to come up properly
              db.admin().command({"replSetGetStatus": 1}, function(_err, _doc) {
                // Adjust the number of retries
                retries = retries - 1;
                // No more retries
                if(retries == 0) return callback(new Error("Failed to add Secondary server"));

                if(_err) {
                  return setTimeout(checkHealthy, 1000);
                }

                // if(_err) return callback(_err);
                _doc = _doc.documents[0];

                var members = _doc.members;
                var health_members = 0;

                // Go over find the server and check the state
                for(var i = 0; i < members.length; i++) {
                  if(members[i].health == 1) {
                    health_members = health_members + 1;
                  }
                }

                if(health_members == members.length) {
                  // Close the server
                  db.close();
                  return callback(null);
                }

                // Execute again
                setTimeout(checkHealthy, 1000);
              });                
            }
            setTimeout(checkHealthy, 1000);
          });
        });
      });
    });
  });
}

var reStart = ReplicaSetManager.prototype.reStart = function(node, options, callback) {  
  var self = this;
  if(typeof options == 'function') {
    callback = options;
    options = {};
  }
  // Perform cleanup of directories
  exec("rm -rf " + self.mongods[node]["db_path"], function(err, stdout, stderr) {
    if(err != null) return callback(err, null);

    // Create directory
    exec("mkdir -p " + self.mongods[node]["db_path"], function(err, stdout, stderr) {
      exec("mkdir -p " + self.mongods[node]["db_path"] + "/journal", function(err, stdout, stderr) {
        // Clear out instances
        this.mongods = {};
        // Start set again
        self.start(node, callback);
      });
    });
  });
}

// Fire up the mongodb instance
var start = ReplicaSetManager.prototype.start = function(node, options, callback) {
  var self = this;
  if(typeof options == 'function') {
    callback = options;
    options = {};
  }

  // Start up mongod process
  var mongodb = exec(self.mongods[node]["start"],
    function (error, stdout, stderr) {
      debug('stdout: ' + stdout);
      debug('stderr: ' + stderr);
      if (error != null) {
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
  }, options.timeout ? options.timeout : 5000);
}

ReplicaSetManager.prototype.restart = start;

ReplicaSetManager.prototype.startCmd = function(n) {
  // Create boot command
  this.mongods[n]["start"] = "mongod --oplogSize 1 --rest --noprealloc --smallfiles --replSet " + this.name + " --logpath '" + this.mongods[n]['log_path'] + "' " +
      " --dbpath " + this.mongods[n]['db_path'] + " --port " + this.mongods[n]['port'] + " --fork";
  this.mongods[n]["start"] = this.journal ? this.mongods[n]["start"] + " --journal" : this.mongods[n]["start"] + " --nojournal";

  if(this.auth) {
    this.mongods[n]["start"] = this.auth ? this.mongods[n]["start"] + " --auth --keyFile " + this.keyPath : this.mongods[n]["start"];
  }

  // If we have ssl defined set up with test certificate
  if(this.ssl) {
    var path = getPath(this, this.ssl_server_pem);
    this.mongods[n]["start"] = this.mongods[n]["start"] + " --sslOnNormalPorts --sslPEMKeyFile=" + path;

    if(this.ssl_server_pem_pass) {
      this.mongods[n]["start"] = this.mongods[n]["start"] + " --sslPEMKeyPassword=" + this.ssl_server_pem_pass;
    }

    if(this.ssl_ca) {
      this.mongods[n]["start"] = this.mongods[n]["start"] + " --sslCAFile=" + getPath(this, this.ssl_ca);
    }

    if(this.ssl_crl) {
      this.mongods[n]["start"] = this.mongods[n]["start"] + " --sslCRLFile=" + getPath(this, this.ssl_crl);
    }

    if(this.ssl_weak_certificate_validation) {
      this.mongods[n]["start"] = this.mongods[n]["start"] + " --sslWeakCertificateValidation"
    }
  }

  // console.log(this.mongods[n]["start"]);
  return this.mongods[n]["start"];
}
