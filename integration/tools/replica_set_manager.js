var debug = require('util').debug,
  inspect = require('util').inspect,
  path = require('path'),
  exec = require('child_process').exec,
  spawn = require('child_process').spawn,
  Connection = require('../../lib/mongodb').Connection,
  Db = require('../../lib/mongodb').Db,
  Server = require('../../lib/mongodb').Server;  

var ReplicaSetManager = exports.ReplicaSetManager = function(options) {
  options = options == null ? {} : options;
  this.startPort = options["start_port"] || 30000;
  this.ports = [];
  this.name = options["name"] : "replica-set-foo";
  this.host = options["host"] : "localhost";
  this.retries = options["retries"] : 60;
  this.config = {"_id": this.name, "members": []};
  this.durable = options["durable"] : false;
  this.path = path.resolve("data");
  
  this.arbiterCount = options["arbiter_count"] || 2;
  this.secondaryCount = options["secondary_count"] || 1;
  this.passiveCount = options["passive_count"] || 1;
  this.primaryCount = 1;
  
  this.count = this.primaryCount + this.passiveCount + this.arbiterCount + this.secondaryCount;
  if(this.count > 7) {
    throw new Error("Cannot create a replica set with #{node_count} nodes. 7 is the max.");
  }
  
  this.mongods = {};
}

ReplicaSetManager.prototype.startSet = function(callback) {
  debug("** Starting a replica set with " + this.count + " nodes");
  
  // Kill all existing mongod instances
  exec('killall mongod', function(err, stdout, stderr) {
    if(err != null) return callback(err, null);
    
    var n = 0;
    for(var i = 0; i < (this.primaryCount + this.secondaryCount); i++) {
      this.initNode(n++);      
    }    
  })
}

ReplicaSetManager.prototype.initNode = function(n) {
  var self = this;
  this.mongods[n] = this.mongods[n] == null ? {} : this.mongods[n];
  var port = this.startPort + n;
  this.ports.push(port);
  this.mongods[n]["port"] = port;
  this.mongods[n]["db_path"] = getPath("rs-" + port);
  this.mongods[n]["log_path"] = getPath("log-" + port);
  
  // Perform cleanup of directories
  exec("rm -rf " + self.mongods[n]["db_path"], function(err, stdout, stderr) {
    if(err != null) return callback(err, null);
    
    // Create directory
    exec("mkdir -p " + self.mongods[n]["db_path"], function(err, stdout, stderr) {
      if(err != null) return callback(err, null);

      self.mongods[n]["start"] = self.startCmd(n);
      self.start(n, function() {
        // Add instance to list of members
        var member = {"_id": n, "host": this.host + ":" + this.mongods[n]["port"]};      
        this.config["members"].push(members);        
      });      
    });    
  });
}

ReplicaSetManager.prototype.kill = function(node, signal, callback) {
  // Unpack callback and variables
  var args = Array.prototype.slice.call(arguments, 1);
  callback = args.pop();
  signal = args.length ? args.shift() : 2;

  debug("** Killing node with pid #{pid} at port " + this.mongods[node]['port']);
  spawn("kill " + signal + " " + this.mongods[node]["pid"]);
  this.mongods[node]["up"] = false;
  // Wait for a second
  setTimeout(callback, 1000);
}

ReplicaSetManager.prototype.killPrimary = function(signal, callback) {
  // Unpack callback and variables
  var args = Array.prototype.slice.call(arguments, 0);
  callback = args.pop();  
  signal = args.length ? args.shift() : 2;
  
  var node = this.getNodeWithState(1);
  // Kill process and return node reference
  this.kill(node, signal, function() {
    callback(null, node);
  })
}

ReplicaSetManager.prototype.getNodeWithState = function(state, callback) {
  this.ensureUpRetries = 0;
  this.ensureUp(function(err, status) {
    if(err != null) return callback(err, null);
    
    var node = status["members"].filter(new function(element, index, array) {
      return element["state"] = state;
    }).shift();
        
    if(node != null) {
      var hostPort = node["name"].split(":");
      var port = hostPort[1] != null ? parseInt(hostPort[1]) : 27017;
      var key = Object.keys(this.mongods).filter(function(element, index, array) {
        return this.mongods[element]["port"] == port;
      }).shift();
      return callback(null, key);
    } else {
      return callback(null, false);
    }
  });
}

// def ensure_up
//   print "** Ensuring members are up..."
// 
//   attempt do
//     con = get_connection
//     status = con['admin'].command({'replSetGetStatus' => 1})
//     print "."
//     if status['members'].all? { |m| m['health'] == 1 && [1, 2, 7].include?(m['state']) } &&
//        status['members'].any? { |m| m['state'] == 1 }
//       print "all members up!\n\n"
//       return status
//     else
//       raise Mongo::OperationFailure
//     end
//   end
// end
ReplicaSetManager.prototype.ensureUp = function(callback) {
  debug("** Ensuring members are up...");
  var count = 0;
  var self = this;
  
  // Retry check for server up sleeping inbetween
  self.retriedConnects = 0;
  // Attemp to retrieve a connection
  self.getConnection(function(err, connection) {
    // Check repl set get status
    connection.admin().executeDbCommand({"replSetGetStatus": 1}, function(err, status) {
      // Establish all health member
      var healthyMembers = status["members"].filter(new function(element, index, array) {
        return element["health"] == 1 && [1, 2, 7].indexOf(element["state"]) != -1             
      });
      var stateCheck = status["members"].filter(new function(element, indexOf, array) {
        return element["state"] == 1;
      });
      
      if(healthyMembers.length == status["members"].length && stateCheck.length > 0) {
        debug("all members up! \n\n");
        return callback(null, status);
      } else {
        // Ensure we perform enough retries
        if(self.ensureUpRetries <  self.retriedConnects) {
          setTimeout(function() {
            self.ensureUpRetries++;
            self.ensureUp(callback);
          }, 1000)
        } else {
          return callback(new Error("Operation Failure"), null);          
        }        
      }
    });
  });
}

// def get_connection(node=nil)
//   con = attempt do
//     if !node
//       node = @mongods.keys.detect {|key| !@mongods[key]['arbiterOnly'] && @mongods[key]['up'] }
//     end
//     con = Mongo::Connection.new(@host, @mongods[node]['port'], :slave_ok => true)
//   end
// 
//   return con
// end
ReplicaSetManager.prototype.getConnection = function(node, callback) {
  var self = this;
  // Unpack callback and variables
  var args = Array.prototype.slice.call(arguments, 0);
  callback = args.pop();  
  node = args.length ? args.shift() : null;
  
  if(node == null) {
    var keys = Object.keys(this.mongods);
    for(var i = 0; i < keys.length; i++) {
      // Locate first db that's runing and is not an arbiter
      if(this.mongods[keys[i]]["arbiterOnly"] == null && this.mongods[key]["up"]) {
        node = keys[i];
        break;
      }
    }
  }
    
  // Fire up the connection to check if we are running
  // var db = new Db('node-mongo-blog', new Server(host, port, {}), {native_parser:true});
  var connection = new Db("", new Server(this.host, this.mongods[node]["port"], {}));
  connection.open(function(err, connection) {
    // We need to retry if we have not finished up the number of retries
    if(err != null && self.retriedConnects < self.retries) {
      // Sleep for a second then retry
      setTimeout(function() {
        // Update retries
        self.retriedConnects++;        
        // Perform anothe reconnect
        self.getConnection(node, callback);              
      }, 1000)      
    } else if(err != null && self.retriedConnects >= self.retries){
      callback(new Error("Failed to reconnect"), null);
    } else {
      callback(null, connection);
    }
  })
}

// def attempt
//   raise "No block given!" unless block_given?
//   count = 0
// 
//   while count < @retries do
//     begin
//       return yield
//       rescue Mongo::OperationFailure, Mongo::ConnectionFailure => ex
//         sleep(1)
//         count += 1
//     end
//   end
// 
//   raise ex
// end


// Fire up the mongodb instance
var start = ReplicaSetManager.prototype.start = function(node, callback) {
  // Fire up the server
  var mongodb = spawn(this.mongodb[node]["start"]);
  this.mongodb[node]["up"] = true;
  this.mongodb[node]["pid"]= mongodb.pid;  
  // Wait for a half a second
  setTimeout(callback, 500);
}

ReplicaSetManager.prototype.restart = start;

ReplicaSetManager.prototype.setCmd = function(n) {
  // Create boot command
  this.mongods[n]["start"] = "mongod --replSet " + this.name + " --logpath '" + this.mongods[n]['log_path'] + "' " +
      " --dbpath " + this.@mongods[n]['db_path'] + " --port " + this.mongods[n]['port'] + " --fork";
  this.mongods[n]["start"] = this.durable ? this.mongods[n]["start"] + "  --dur" : this.mongods[n]["start"];
  return this.mongods[n]["start"];
}













