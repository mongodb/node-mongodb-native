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

  for(var name in options) {
    if(internalOptions.indexOf(name) == -1) {
      opts[name] = options[name];
    }
  }

  return opts;
}

var ServerManager = function(serverOptions) {
  serverOptions = serverOptions || {};
  var host = serverOptions.host || 'localhost';
  var port = serverOptions.port = serverOptions.port || 27017;
  var bin = serverOptions.bin || 'mongod';
  // Set default db path if none set
  var dbpath = serverOptions.dbpath = serverOptions.dbpath || path.join(path.resolve('data'), f("data-%d", port));
  var logpath = serverOptions.logpath = serverOptions.logpath || path.join(path.resolve('data'), f("data-%d.log", port));

  // Current process id
  var pid = 0;
  var self = this;

  // Clone the options
  serverOptions = cloneOptions(serverOptions);

  // filtered out internal keys
  var internalOptions = {};
  internalOptions = filterInternalOptionsOut(serverOptions, ["bin", "host"]);
  internalOptions.fork = null;

  // Add rest options
  serverOptions.rest = null;
  serverOptions.httpinterface = null;

  // Return
  this.port = port;
  this.host = host;
  this.name = f("%s:%s", host, port);

  // Actual server instance
  var server = null;
  var ismaster = null;

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
      // Else we need to start checking if the server is up
      server = new Server({host: host
        , port: port
        , connectionTimeout: 2000
        , size: 1
        , reconnect: false
      });
      
      // On connect let's go
      server.on('connect', function(_server) {
        ismaster = server.lastIsMaster();
        // // Destroy the connection
        // _server.destroy();

        try {
          // Read the pidfile        
          pid = fs.readFileSync(path.join(dbpath, "mongod.lock"), 'ascii').trim();          
        } catch(err) {
          return setTimeout(pingServer, 1000);
        }
        
        // Finish up
        if(callback) {
          var _callback = callback;
          callback = null;
          _callback(null, server);
        }
      });
      
      // Error or close handling
      server.on('error', errHandler);
      server.on('close', errHandler);
      server.on('timeout', errHandler);

      // Attempt connect
      server.connect();
    }    

    exec(cmd, function(error, stdout, stderr) {      
      if(error != null && callback) {
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
    if(typeof options.signal == 'number' || options.purge) {
      options.signal = typeof options.signal == 'number' ? options.signal : -9;

      exec(f("killall %d mongod", options.signal), function(err, stdout, stderr) {
        bootServer(cmd, callback);
      });
    } else {
      bootServer(cmd, callback);
    }
  }

  this.stop = function(options, callback) {    
    if(typeof options == 'function') {
      callback = options;
      options = {};
    }

    var signal = options.signal || -15;
    // Stop server connection
    server.destroy();
    // Kill the process with the desired signal
    exec(f("kill %d %s", signal, pid), function(error) {
      if(error) return callback(error, null);
      callback(null, null);
    });
  }

  this.restart = function(options, callback) {
    if(typeof options == 'function') {
      callback = options;
      options = {};
    }

    var self = this;
    self.stop(options, function(err, result) {
      if(err) return callback(err, null);

      self.start(options, function() {
        if(err) return callback(err, null);
        callback(null, null);
      });
    });
  }

  this.ismaster = function(callback) {
    self.connect(function(err, _server) {
      if(err) return callback(err);

      _server.command('system.$cmd', {ismaster:true}, function(err, r) {
        _server.destroy();
        if(err) return callback(err);
        ismaster = r.result;
        callback(null, ismaster);
      });
    });
  }

  this.lastIsMaster = function(callback) {
    return ismaster;
  }

  this.isConnected = function() {
    return server != null && server.isConnected();
  }

  this.connect = function(callback) {
    if(server.isConnected()) return callback(null, server);

    // Else we need to start checking if the server is up
    var s = new Server({host: host
      , port: port
      , connectionTimeout: 2000
      , socketTimeout: 2000
      , size: 1
      , reconnect: false
      , emitError: true
    });
    
    // On connect let's go
    s.on('connect', function(_server) {
      server = _server;

      ['error', 'close', 'timeout', 'parseError'].forEach(function(e) {
        server.removeAllListeners(e);
      })

      callback(null, _server);
    });
    
    // Error
    var e = function(err) {
      callback(err, null);
    }

    // Error or close handling
    s.once('error', e);
    s.once('close', e);
    s.once('timeout', e);

    // Attempt connect
    s.connect();    
  }

  this.server = function() {
    return server;
  }
}

module.exports = ServerManager;