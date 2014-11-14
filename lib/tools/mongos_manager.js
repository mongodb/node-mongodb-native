var f = require('util').format
  , path = require('path')
  , exec = require('child_process').exec
  , spawn = require('child_process').spawn
  , fs = require('fs')
  , mkdirp = require('mkdirp')
  , rimraf = require('rimraf')
  , Server = require('../../lib/topologies/server');

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

var MongosManager = function(mongosOptions) {
  mongosOptions = mongosOptions || {};
  mongosOptions = cloneOptions(mongosOptions);
  var host = mongosOptions.host || 'localhost';
  var port = mongosOptions.port = mongosOptions.port || 50000;
  var bin = mongosOptions.bin || 'mongos';
  // Set default db path if none set
  var pidfilepath = mongosOptions.pidfilepath = mongosOptions.pidfilepath || path.join(path.resolve('data'), f("data-%d", port));
  var logpath = mongosOptions.logpath = mongosOptions.logpath || path.join(path.resolve('data'), f("data-%d.log", port));
  var configdb = mongosOptions.configdb = mongosOptions.configdb ? mongosOptions.configdb.join(',') : ['localhost:50000'].join(',');

  // Current process id
  var pid = 0;
  var self = this;

  // Any needed credentials
  var credentials;

  // Clone the options
  mongosOptions = cloneOptions(mongosOptions);

  // filtered out internal keys
  var internalOptions = {};
  internalOptions = filterInternalOptionsOut(mongosOptions, ["bin", "host"]);
  internalOptions.fork = null;

  // Return
  this.port = port;
  this.host = host;
  this.name = f("%s:%s", host, port);

  // Add the file path
  pidfilepath = mongosOptions.pidfilepath = f("%s/mongos-%s.pid", pidfilepath, port);

  // Fork
  mongosOptions.fork = null;

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
    var pingServer = function() {
      // Else we need to start checking if the server is up
      server = new Server({host: host
        , port: port
        , connectionTimeout: 2000
        , socketTimeout: 2000
        , size: 1
        , reconnect: false
      });
      
      // On connect let's go
      server.on('connect', function(_server) {
        ismaster = server.lastIsMaster();
        _server.destroy();

        try {
          pid = fs.readFileSync(pidfilepath, 'ascii').trim();          
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

      var errHandler = function(err) {
        if(err.code == 10185) {
          try {
            pid = fs.readFileSync(pidfilepath, 'ascii').trim();          
          } catch(err) {
            return setTimeout(pingServer, 1000);
          }

          var _callback = callback;
          callback = null;
          return _callback(null, server); 
        }

        setTimeout(pingServer, 1000);
      }
      
      // Error or close handling
      server.once('error', errHandler);
      server.once('close', errHandler);
      server.once('timeout', errHandler);
      server.once('parseError', errHandler);

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
    setTimeout(pingServer, 5000);
  }

  this.setCredentials = function(provider, db, user, password) {
    credentials = {
        provider: provider, db: db, user: user, password: password
    };
  }

  this.start = function(options, callback) {
    if(typeof options == 'function') {
      callback = options;
      options = {};
    }

    // Build startup command
    var cmd = buildStartupCommand(mongosOptions);
    // If we have decided to kill all the processes
    if(typeof options.signal == 'number' || options.kill) {
      options.signal = typeof options.signal == 'number' ? options.signal : -9;

      exec(f("killall %d mongos", options.signal), function(err, stdout, stderr) {
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

    var signal = options.signal || -3;
    // Stop server connection
    server.destroy();
    // Kill the process with the desired signal
    exec(f("kill %d %s", signal, pid), function(error) {
      if(error) return callback(error, null);
      setTimeout(function() {
        callback(null, null);
      }, 500);
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

      // If we have credentials apply them
      if(credentials) {
        return _server.auth(credentials.provider, credentials.db, credentials.user, credentials.password, function(err) {
          if(err) return callback(err);
          callback(null, _server)
        });
      }

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

module.exports = MongosManager;