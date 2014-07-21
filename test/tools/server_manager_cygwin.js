var debug = require('util').debug,
  inspect = require('util').inspect,
  path = require('path'),
  fs = require('fs'),
  exec = require('child_process').exec,
  spawn = require('child_process').spawn,
  Connection = require('../../lib/mongodb').Connection,
  Db = require('../../lib/mongodb').Db,
  Server = require('../../lib/mongodb').Server,
  BaseServerManager = require('./server_manager').ServerManager;

var ensureUp = function(self, host, port, number_of_retries, callback) {
  var options = {poolSize:1, socketOptions:{connectTimeoutMS: 1000}, auto_reconnect:false};

  if(self.ssl) {
    options.ssl = self.ssl;
    options.sslValidate = self.sslValidate || false;
    options.sslCA = self.sslCA || null;
    options.sslKey = self.sslKey || null;
    options.sslCert = self.sslCert || null;
    options.sslPass = self.sslPass || null;
  }

  // console.dir(options)

  var db = new Db('test', new Server(host, port, options), {w:1});
  db.open(function(err, result) {
    db.close();

    if(err) {
      number_of_retries = number_of_retries - 1;
      if(number_of_retries == 0) return callback(new Error("Failed to connect to db"));
      
      setTimeout(function() {
        return ensureUp(self, host, port, number_of_retries, callback);
      }, 500);
    } else {
      return callback(null, null);
    }
  });
}

var ServerManager = exports.ServerManager = function(options) {
  BaseServerManager.call(this, options);
}

// Start up the server instance
ServerManager.prototype.start = function(killall, options, callback) {
  var self = this;

  // Unpack callback and variables
  if(typeof options == 'function') {
    callback = options;
    options = {};
  } else if(typeof killall == 'function') {
    callback  = killall;
    killall = true;
    options = {};
  }

  // Get the purge directories
  var purgedirectories = typeof options.purgedirectories == 'boolean' ? options.purgedirectories : true;

  // Create start command
  var startCmd = generateStartCmd(this, {configserver:self.configServer, log_path: self.log_path,
    db_path: self.db_path, port: self.port, journal: self.journal, auth:self.auth, ssl:self.ssl});

  // taskkill is cygwin's equivalent of kill
  exec(killall ? 'taskkill /F /IM mongod.exe' : '', function(err, stdout, stderr) {
    if(purgedirectories) {
      // Remove directory
      exec('rm -rf ' + self.db_path, function(err, stdout, stderr) {
        if(err != null) return callback(err, null);
        // Create directory
        exec('mkdir ' + self.db_path, function(err, stdout, stderr) {
          if(err != null) return callback(err, null);
          // Start up mongod process
          var mongodb = exec(startCmd,
            function (error, stdout, stderr) {
              console.log('stdout: ' + stdout);
              console.log('stderr: ' + stderr);
              if (error != null) {
                console.log('exec error: ' + error);
              }
          });

          if(options.ensureUp == false) return callback();

          // Wait for a half a second then check if up
          ensureUp(self, self.host, self.port, 100, function(err, result) {
            if(err) throw err;
            // Mark server as running
            self.up = true;
            // Callback
            callback();
          });
        });
      });
    } else {
      // Ensure we remove the lock file as we are not purging the directory

      // Start up mongod process
      var mongodb = exec(startCmd,
        function (error, stdout, stderr) {
          if (error != null) {
            console.log('exec error: ' + error);
          }
      });

      // Wait for a half a second then save the pids
      ensureUp(self, self.host, self.port, 100, function(err, result) {
        if(err) throw err;
        // Mark server as running
        self.up = true;
        //self.pid = fs.readFileSync(path.join(self.db_path, "mongod.lock"), 'ascii').trim();
        // Callback
        callback();
      });
    }
  });
}

ServerManager.prototype.stop = function(signal, callback) {
  var self = this;
  // Unpack callback and variables
  var args = Array.prototype.slice.call(arguments, 0);
  callback = args.pop();
  signal = args.length ? args.shift() : 2;
  // Stop the server
  var command = 'taskkill /F /IM mongod.exe';
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

ServerManager.prototype.killAll = function(callback) {
  // console.log("=============================================== SERVERMANAGER KILLALL")
  exec('taskkill /F /IM mongod.exe', function(err, stdout, stderr) {
    if(typeof callback == 'function') callback(null, null);
  });
}

// Get absolute path
var getPath = function(self, name) {
  return path.join(self.path, name);
}

// Generate start command
var generateStartCmd = function(self, options) {  
  // Create boot command
  var startCmd = "mongod --rest --noprealloc --smallfiles" +
      " --port " + options['port'];
  startCmd = options['journal'] ? startCmd + " --journal" : startCmd + " --nojournal";
  startCmd = options['auth'] ? startCmd + " --auth" : startCmd;
  startCmd = options['configserver'] ? startCmd + " --configsvr" : startCmd;
  startCmd = startCmd + " --setParameter enableTestCommands=1";
  // If we have ssl defined set up with test certificate
  if(options['ssl']) {
    var path = getPath(self, self.ssl_server_pem);
    startCmd = startCmd + " --sslOnNormalPorts --sslPEMKeyFile=" + path;

    if(self.ssl_server_pem_pass) {
      startCmd = startCmd + " --sslPEMKeyPassword=" + self.ssl_server_pem_pass;
    }

    if(self.ssl_ca) {
      startCmd = startCmd + " --sslCAFile=" + getPath(self, self.ssl_ca);
    }

    if(self.ssl_crl) {
      startCmd = startCmd + " --sslCRLFile=" + getPath(self, self.ssl_crl);
    }

    if(self.ssl_weak_certificate_validation) {
      startCmd = startCmd + " --sslWeakCertificateValidation"
    }

    if(self.ssl_fips) {
      startCmd = startCmd + " --sslFIPSMode"
    }
  }
  console.log(startCmd);

  // Return start command
  return startCmd;
}
