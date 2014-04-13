var f = require('util').format
  , path = require('path')
  , exec = require('child_process').exec
  , spawn = require('child_process').spawn
  , fs = require('fs')
  , mkdirp = require('mkdirp')
  , rimraf = require('rimraf')
  , Server = require('../../lib').Server;

//
// Clone the options
var cloneOptions = function(options) {
  var opts = {};
  for(var name in options) {
    opts[name] = options[name];
  }
  return opts;
}

//
// Remove any non-server specific settings
var filterInternalOptionsOut = function(options, internalOptions) {
  var opts = {};

  internalOptions.forEach(function(n) {
    if(options[n]) {
      opts[n] = options[n];
      delete options[n];
    }
  });

  return opts;
}

var ServerManager = function(serverOptions) {
  serverOptions = serverOptions || {};
  var host = serverOptions.host || 'localhost';
  var port = serverOptions.port = serverOptions.port || 27017;
  var bin = serverOptions.bin || 'mongod';
  // Set default db path if none set
  var dbpath = serverOptions.dbpath = serverOptions.dbpath || path.join(path.resolve('data'), f("data-%d", port));

  // Current process id
  var pid = 0;

  // Clone the options
  serverOptions = cloneOptions(serverOptions);

  // filtered out internal keys
  var internalOptions = {};
  internalOptions = filterInternalOptionsOut(serverOptions, ["bin", "host"]);

  // Return the startup command
  var buildStartupCommand = function(options) {
    var command = [];
    // Binary command
    command.push(f("%s", bin));

    for(var name in options) {
      if(options[name] === null) {
        command.push(f("--%s", name));      
      } else  if(options[name]) {
        command.push(f("--%s %s", name, options[name]));
      }
    }

    return command.join(" ");
  }

  var bootServer = function(cmd, callback) {
    var errHandler = function() {
      setTimeout(pingServer, 1000);
    }

    var pingServer = function() {
      if(callback == null) return;
      // Else we need to start checking if the server is up
      var server = new Server({host: host
        , port: port
        , connectionTimeout: 2000
      });
      
      // On connect let's go
      server.on('connect', function() {
        try {
          // Read the pidfile        
          pid = fs.readFileSync(path.join(dbpath, "mongod.lock"), 'ascii').trim();          
        } catch(err) {
          return setTimeout(pingServer, 1000);
        }
        
        // Finish up
        callback(null, server);          
      });
      
      // Error or close handling
      server.on('error', errHandler);
      server.on('close', errHandler);

      // Attempt connect
      server.connect();
    }    

    exec(cmd, function(error, stdout, stderr) {      
      if(error != null) {
        var _internal = callback;
        callback = null;
        return _internal(error);
      }
    });

    // Attempt to ping the server
    setTimeout(pingServer, 1000);
  }

  this.start = function(options, callback) {
    if(typeof options == 'function') {
      callback = options;
      options = {};
    }

    // If we have decided to remove the directory
    if(options.purge) {
      rimraf.sync(serverOptions.dbpath);
      mkdirp.sync(serverOptions.dbpath);
    }

    // Build startup command
    var cmd = buildStartupCommand(serverOptions);

    // If we have decided to kill all the processes
    if(typeof options.signal == 'number') {
      exec(f("killall %d mongod", options.signal), function(err, stdout, stderr) {
        bootServer(cmd, callback);
      });
    } else {
      bootServer(cmd, callback);
    }
  }

  this.destroy = function() {
  }

  this.stop = function(options, callback) {    
    if(typeof options == 'function') {
      callback = options;
      options = {};
    }

    var signal = options.signal || 15;
    // Kill the process with the desired signal
    exec(f("kill %d %s", signal, pid), function(error) {
      if(error) return callback(error, null);
      callback(null, null);
    });
  }

  this.restart = function() {
  }
}

module.exports = ServerManager;