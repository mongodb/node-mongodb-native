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

var ServerManager = function(serverOptions) {
  serverOptions = serverOptions || {};
  var host = serverOptions.host || 'localhost';
  var port = serverOptions.port = serverOptions.port || 27017;
  var bin = serverOptions.bin || 'mongod';
  // Set default db path if none set
  var dbpath = serverOptions.dbpath = serverOptions.dbpath || path.join(path.resolve('data'), f("data-%d", port));
  var logpath = serverOptions.logpath = serverOptions.logpath || path.join(path.resolve('data'), f("data-%d.log", port));
  var storageEngine = serverOptions.storageEngine;

  // Current process id
  var pid = 0;
  var self = this;

  // Clone the options
  serverOptions = cloneOptions(serverOptions);

  Object.defineProperty(this, 'host', {
    enumerable:true, get: function() { return host; }
  });

  Object.defineProperty(this, 'port', {
    enumerable:true, get: function() { return port; }
  });

  Object.defineProperty(this, 'dbpath', {
    enumerable:true, get: function() { return dbpath; }
  });

  Object.defineProperty(this, 'logpath', {
    enumerable:true, get: function() { return logpath; }
  });

  // filtered out internal keys
  var internalOptions = {};
  internalOptions = filterInternalOptionsOut(serverOptions, ["bin", "host"]);
  // internalOptions.fork = null;

  // Add rest options
  serverOptions.rest = null;

  // Any needed credentials
  var credentials;

  // Get the keys
  var keys = Object.keys(serverOptions);

  // Return
  this.port = port;
  this.host = host;
  this.name = f("%s:%s", host, port);

  // Actual server instance
  var server = null;
  var ismaster = null;

  // Allowed server options
  var allowedOptions = ['sslOnNormalPorts', 'sslMode', 'sslPEMKeyFile'
    , 'sslPEMKeyPassword', 'sslClusterFile', 'sslClusterPassword'
    , 'sslCAFile', 'sslCRLFile', 'sslWeakCertificateValidation'
    , 'sslAllowInvalidHostnames', 'sslAllowInvalidCertificates', 'sslFIPSMode'
    , 'configsvr', 'shardsvr', 'replSet', 'replIndexPrefetch'
    , 'autoresync', 'slavedelay', 'only', 'source', 'slave', 'master'
    , 'oplogSize', 'journalCommitInterval', 'journalOptions', 'nojournal'
    , 'journal', 'notablescan', 'noscripting', 'repairpath', 'repair'
    , 'upgrade', 'syncdelay', 'smallfiles', 'quotaFiles', 'quota'
    , 'nssize', 'noprealloc', 'noIndexBuildRetry', 'directoryperdb'
    , 'dbpath', 'sysinfo', 'cpu', 'profile', 'slowms', 'rest'
    , 'jsonp', 'ipv6', 'noauth', 'auth', 'fork', 'unixSocketPrefix'
    , 'nounixsocket', 'clusterAuthMode', 'httpinterface', 'setParameter'
    , 'keyFile', 'pidfilepath', 'timeStampFormat', 'logappend'
    , 'syslogFacility', 'syslog', 'logpath', 'maxConns', 'bind_ip', 'port'
    , 'storageEngine'];

  // Return the startup command
  var buildStartupCommand = function(options) {
    var command = [];
    // Binary command
    command.push(f('%s', bin));
    command.push('--smallfiles');
    command.push('--noprealloc')
    // Push test commands
    command.push('--setParameter enableTestCommands=1');

    // Add all other passed in options    
    for(var name in options) {
      if(allowedOptions.indexOf(name) != -1) {
        if(options[name] === null) {
          command.push(f('--%s', name));      
        } else if(typeof options[name] == 'function') {
        } else if(options[name]) {
          command.push(f('--%s %s', name, options[name]));
        }        
      }
    }

    var keys = Object.keys(options);
    if(keys.indexOf('journal') == -1) {
      command.push('--nojournal');
    }

    return command.join(' ');
  }

  var bootServer = function(cmd, callback) {
    var pingServer = function() {
      if(server) server.destroy();
      var opt = {host: host
        , port: port
        , connectionTimeout: 2000
        , socketTimeout: 2000
        , size: 1
        , reconnect: false
        , emitError: typeof serverOptions.emitError == 'boolean' ? serverOptions.emitError : false
      }

      // Set the key
      if(keys.indexOf('sslOnNormalPorts') != -1) opt.ssl = true;
      if(keys.indexOf('ssl') != -1) opt.ssl = serverOptions.ssl;
      if(keys.indexOf('ca') != -1) opt.ca = serverOptions.ca;
      if(keys.indexOf('cert') != -1) opt.cert = serverOptions.cert;
      if(keys.indexOf('rejectUnauthorized') != -1) opt.rejectUnauthorized = serverOptions.rejectUnauthorized;
      if(keys.indexOf('key') != -1) opt.key = serverOptions.key;
      if(keys.indexOf('passphrase') != -1) opt.passphrase = serverOptions.passphrase;

      // Else we need to start checking if the server is up
      server = new Server(opt);
      
      // On connect let's go
      server.on('connect', function(_server) {
        ismaster = server.lastIsMaster();
        _server.destroy();

        // Heap storage engine, no lock file available
        if(storageEngine == null) {
          try {
            // Read the pidfile        
            pid = fs.readFileSync(path.join(dbpath, "mongod.lock"), 'ascii').trim();
          } catch(err) {
            return setTimeout(pingServer, 1000);
          }          
        }
        
        // Finish up
        if(callback) {
          var _callback = callback;
          callback = null;
          _callback(null, null);
        }
      });

      var errHandler = function(err) {
        setTimeout(pingServer, 1000);
      }
      
      // Error or close handling
      server.on('error', errHandler);
      server.on('close', errHandler);
      server.on('timeout', errHandler);
      server.once('parseError', errHandler);

      // Attempt connect
      server.connect();
    }    

    setTimeout(function() {
      exec(cmd, function(error, stdout, stderr) {
        console.log(stdout)
        if(error != null && callback) {
          var _internal = callback;
          callback = null;
          return _internal(error);
        }
      });

      // Attempt to ping the server
      setTimeout(pingServer, 1000);      
    }, 1000);
  }

  this.start = function(options, callback) {
    if(typeof options == 'function') {
      callback = options;
      options = {};
    }

    // If we have decided to remove the directory
    if(options.purge) {
      try {
        rimraf.sync(serverOptions.dbpath);
        mkdirp.sync(serverOptions.dbpath);        
      } catch(err) {}
    }

    // Check if we have a pid file and remove it we do
    if(fs.existsSync(path.join(dbpath, "mongod.lock"))) {
      fs.unlinkSync(path.join(dbpath, "mongod.lock"));
    }
    
    // Build startup command
    var cmd = buildStartupCommand(serverOptions);
    // If we have decided to kill all the processes
    if(typeof options.signal == 'number' && options.kill) {
      options.signal = typeof options.signal == 'number' ? options.signal : -3;
      exec(f("killall %d mongod", options.signal), function(err, stdout, stderr) {
        setTimeout(function() {
          bootServer(cmd, callback);
        }, 5000);
      });
    } else {
      bootServer(cmd, callback);
    }
  }

  this.setCredentials = function(provider, db, user, password) {
    credentials = {
        provider: provider
      , db: db
      , user: user
      , password: password};
  }

  var waitToDie = function(pid, callback) {
    exec(f("ps %s", pid), function(error, stdout) {
      if(stdout.indexOf(pid) == -1) return callback();
      setTimeout(function() {
        waitToDie(pid, callback);
      }, 100);
    });
  }

  this.stop = function(options, callback) {    
    if(typeof options == 'function') {
      callback = options;
      options = {};
    }

    // Heap storage engine, no lock file available
    if(storageEngine == null) {
      try {
        // Read the pidfile        
        pid = fs.readFileSync(path.join(dbpath, "mongod.lock"), 'ascii').trim();
        if(pid == '') throw new Error("no pid kill all processes");
        // Get the signal
        var signal = options.signal || -3;
        // Stop server connection
        if(server) server.destroy();
        // Create kill command
        var cmd = f("kill %d %s", signal, pid);
        console.log("execute :: " + cmd)
        // Kill the process with the desired signal
        exec(cmd, function(error, stdout, stderr) {
          // Monitor for pid until it's dead
          waitToDie(pid, function() {
            try {
              // Destroy pid file
              fs.unlinkSync(path.join(dbpath, "mongod.lock"))
            } catch(err) {}

            // Return
            if(error) return callback(error, null);
            callback(null, null);
          });
        });
      } catch(err) {
        exec(f("killall %d mongod", signal), function(error) {
          if(error) return callback(error, null);
          setTimeout(function() {
            callback(null, null);
          }, 1000);
        });
      }          
    }
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

    var opt = {host: host
      , port: port
      , connectionTimeout: 2000
      , socketTimeout: 2000
      , size: 1
      , reconnect: false
      , emitError: true
    }

    // Set the key
    if(keys.indexOf('sslOnNormalPorts') != -1) opt.ssl = true;
    if(keys.indexOf('ssl') != -1) opt.ssl = serverOptions.ssl;
    if(keys.indexOf('ca') != -1) opt.ca = serverOptions.ca;
    if(keys.indexOf('cert') != -1) opt.cert = serverOptions.cert;
    if(keys.indexOf('rejectUnauthorized') != -1) opt.rejectUnauthorized = serverOptions.rejectUnauthorized;
    if(keys.indexOf('key') != -1) opt.key = serverOptions.key;
    if(keys.indexOf('passphrase') != -1) opt.passphrase = serverOptions.passphrase;

    // Else we need to start checking if the server is up
    var s = new Server(opt);
    
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

module.exports = ServerManager;