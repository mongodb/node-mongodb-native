var debug = require('util').debug,
  inspect = require('util').inspect,
  path = require('path'),
  fs = require('fs'),
  exec = require('child_process').exec,
  spawn = require('child_process').spawn,
  Connection = require('../../lib/mongodb').Connection,
  Db = require('../../lib/mongodb').Db,
  Server = require('../../lib/mongodb').Server;
  
var MongosManager = exports.MongosManager = function(options) {
  options = options == null ? {} : options;
  // Basic unpack values
  this.path = path.resolve("data");
  this.port = options["start_port"] != null ? options["start_port"] : 50000;  
  this.db_path = getPath(this, "data-" + this.port);
  this.log_path = getPath(this, "log-" + this.port);
  this.pidfilepath = this.db_path;
  this.configServer = options['configservers'] != null ? options['configservers'] : null;
  this.purgedirectories = options['purgedirectories'] != null ? options['purgedirectories'] : true;
  if(this.configServer == null) throw new Error("one or tree config servers needed in an array");
 
  // Server status values
  this.up = false;
  this.pid = null;
}

// Start up the server instance
MongosManager.prototype.start = function(killall, callback) {
  var self = this;
  // Unpack callback and variables
  var args = Array.prototype.slice.call(arguments, 0);
  callback = args.pop();
  killall = args.length ? args.shift() : true;  
  // Create start command
  var startCmd = generateStartCmd(this, {pidfilepath:self.pidfilepath, configserver:self.configServer, log_path: self.log_path, 
    db_path: self.db_path, port: self.port, ssl:self.ssl});
    
  // console.log("------------------------------------------------------------------------------")
  // console.log(startCmd)
    
  exec(killall ? 'killall -9 mongos' : '', function(err, stdout, stderr) {
    if(self.purgedirectories) {
      // Remove directory
      exec("rm -rf " + self.db_path, function(err, stdout, stderr) {
        if(err != null) return callback(err, null);    
        // Create directory
        exec("mkdir -p " + self.db_path, function(err, stdout, stderr) {
          if(err != null) return callback(err, null);
          // Start up mongod process
          var mongodb = exec(startCmd,
            function (error, stdout, stderr) {
              // console.log('stdout: ' + stdout);
              // console.log('stderr: ' + stderr);
              if (error != null) {
                console.log('exec error: ' + error);
              }
          });

          // Wait for a half a second then save the pids
          setTimeout(function() {        
            // Mark server as running
            self.up = true;
            self.pid = fs.readFileSync(path.join(self.db_path, "mongos.lock"), 'ascii').trim();
            // Callback
            callback();
          }, 2000);
        });    
      });        
    } else {
      // Ensure we remove the lock file as we are not purging the directory
      fs.unlinkSync(path.join(self.db_path, "mongos.lock"));
      
      // Start up mongod process
      var mongodb = exec(startCmd,
        function (error, stdout, stderr) {
          if (error != null) {
            console.log('exec error: ' + error);
          }
      });

      // Wait for a half a second then save the pids
      setTimeout(function() {        
        // Mark server as running
        self.up = true;
        self.pid = fs.readFileSync(path.join(self.db_path, "mongos.lock"), 'ascii').trim();
        // Callback
        callback();
      }, 5000);      
    }
  });
}

MongosManager.prototype.stop = function(signal, callback) {
  var self = this;
  // Unpack callback and variables
  var args = Array.prototype.slice.call(arguments, 0);
  callback = args.pop();
  signal = args.length ? args.shift() : 2;  
  // Stop the server
  var command = "kill -" + signal + " " + self.pid;
	// console.log(command)
  // Kill process
  exec(command,
    function (error, stdout, stderr) {
      // console.log('stdout: ' + stdout);
      // console.log('stderr: ' + stderr);
      if (error !== null) {
        console.log('exec error: ' + error);
      }

      self.up = false;
      // Wait for a second
      setTimeout(callback, 1000);
  });    
}

MongosManager.prototype.killAll = function(callback) {
  exec('killall -9 mongos', function(err, stdout, stderr) {
    callback(null, null);
  });
}

// Get absolute path
var getPath = function(self, name) {
  return path.join(self.path, name);
}

// Generate start command
var generateStartCmd = function(self, options) {
  // Create boot command
  var startCmd = "mongos --logpath '" + options['log_path'] + "' " +
      " --port " + options['port'] + " --fork --pidfilepath " + options['pidfilepath'] + "/mongos.lock";
  startCmd = options['configserver'] ? startCmd + " --configdb " + options['configserver'].join(",") : startCmd;
  // If we have ssl defined set up with test certificate
  if(options['ssl']) {
    var path = getPath(self, '../test/certificates');
    startCmd = startCmd + " --sslOnNormalPorts --sslPEMKeyFile=" + path + "/mycert.pem --sslPEMKeyPassword=10gen";
  }
  // Return start command
  return startCmd;
}
