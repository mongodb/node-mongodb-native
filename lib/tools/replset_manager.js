var f = require('util').format
  , path = require('path')
  , fs = require('fs')
  , mkdirp = require('mkdirp')
  , rimraf = require('rimraf')
  , exec = require('child_process').exec
  , ServerManager = require('./server_manager')
  , ReadPreference = require('../../lib/topologies/read_preference')
  , Server = require('../../lib/topologies/server')
  , ReplSet = require('../../lib/topologies/replset')

var Logger = require('../../lib/connection/logger')

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

var ReplSetManager = function(replsetOptions) {
  replsetOptions = replsetOptions || {};
  var startPort = replsetOptions.port = replsetOptions.startPort || 31000;

  // Get the settings
  var secondaries = replsetOptions.secondaries || 2;
  var arbiters = replsetOptions.arbiters || 0;
  var passives = replsetOptions.passives || 1;
  var replSet = replsetOptions.replSet = replsetOptions.replSet || 'rs';
  var version = 1;
  var configSet = null;
  var tags = replsetOptions.tags;
  var host = replsetOptions.host || 'localhost';

  // All server addresses
  var serverAddresses = [];
  var secondaryServers = [];
  var arbiterServers = [];
  var passiveServers = [];
  var primaryServer = [];;
  // DbPath
  var dbpath = replsetOptions.dbpath = replsetOptions.dbpath || path.resolve('data');

  // Get the keys
  var keys = Object.keys(replsetOptions);

  // Internal check server
  var server = null;

  // Clone the options
  replsetOptions = cloneOptions(replsetOptions);
  
  // Any needed credentials
  var credentials;

  // Contains all the server managers
  var serverManagers = [];

  // filtered out internal keys
  var internalOptions = filterInternalOptionsOut(replsetOptions
    , ["bin", "host", "secondaries", "arbiters", "startPort", "tags"]);

  Object.defineProperty(this, 'secondaries', {
    enumerable:true, get: function() { return secondaryServers.slice(0); }
  });

  Object.defineProperty(this, 'passives', {
    enumerable:true, get: function() { return passiveServers.slice(0); }
  });

  Object.defineProperty(this, 'arbiters', {
    enumerable:true, get: function() { return arbiterServers.slice(0); }
  });

  Object.defineProperty(this, 'name', {
    enumerable:true, get: function() { return replSet; }
  });

  Object.defineProperty(this, 'startPort', {
    enumerable:true, get: function() { return startPort; }
  });

  Object.defineProperty(this, 'replicasetName', {
    enumerable:true, get: function() { return replSet; }
  });

  //
  // ensure replicaset is up and running
  var ensureUp = function(server, callback) {
    process.stdout.write(".");

    // Get the replicaset status
    server.command('admin.$cmd', {"replSetGetStatus": 1}, function(err, result) {
      if(err || result.result.ok == 0) return setTimeout(function() {
        ensureUp(server, callback);
      }, 1000);

      // The result
      var result = result.result;
      var ready = true;
      var hasPrimary = false;

      // Figure out if all the servers are ready
      result.members.forEach(function(m) {
        if([1, 2, 7].indexOf(m.state) == -1) ready = false;
      });

      if(ready) {
        result.members.forEach(function(m) {
          if(m.state == 1) hasPrimary = true;
        });
      }

      if(ready && hasPrimary) {
        // Get the ismaster
        server.destroy();
        return callback(null, result.result);
      }

      // Query the state of the replicaset again
      setTimeout(function() {
        ensureUp(server, callback);
      }, 1000);        
    });
  }

  //
  // Check all hosts to locate the primary
  var ensureIsMasterUp = function(configSet, callback) {
    var members = configSet.members.slice(0);
    var foundPrimary = false;

    // Query the server
    var queryServer = function(hosts, callback) {
      if(foundPrimary) {
        return callback(null, null);
      }

      if(hosts.length == 0 && !foundPrimary) {
        return setTimeout(function() {
          ensureIsMasterUp(configSet, callback);
        }, 1000);
      }

      var hostString = hosts.shift().host;
      var host = hostString.split(':')[0];
      var port = parseInt(hostString.split(':')[1], 10);
      var server = new Server({host: host, port: port, size: 1});

      // Process result
      var processResult = function(_s) {
        _s.destroy();
        if(_s.lastIsMaster().ismaster) foundPrimary = true;
        queryServer(hosts, callback);
      }

      var connectFailed = function() {
        server.destroy();
        queryServer(hosts, callback); 
      }

      server.once('connect', processResult);
      server.once('error', connectFailed);
      server.once('close', connectFailed);
      server.once('timeout', connectFailed);
      server.connect();
    }

    queryServer(members, function() {
      if(foundPrimary) return callback(null, null);
      setTimeout(ensureIsMasterUp(configSet, callback));
    });
  }

  //
  // Configure and ensure
  var configureAndEnsure = function(options, callback) {
    if(typeof options == 'function') {
      callback = options;
      options = {};
    }

    options = options || {};

    var _id = 0;
    configSet = {
        _id: replSet
      , version: version
      , members: [{
          _id: _id
        , host: serverManagers[_id].name
      }]
    }

    // Update _id
    _id = _id + 1;

    // For all servers add the members
    for(var i = 0; i < secondaries; i++, _id++) {
      configSet.members[_id] = {
          _id: _id
        , host: serverManagers[_id].name
      }      
    }

    // For all servers add the members
    for(var i = 0; i < arbiters; i++, _id++) {
      configSet.members[_id] = {
          _id: _id
        , host: serverManagers[_id].name
        , arbiterOnly: true
      }      
    }

    // For all servers add the members
    for(var i = 0; i < passives; i++, _id++) {
      configSet.members[_id] = {
          _id: _id
        , host: serverManagers[_id].name
        , priority: 0
      }      
    }

    // Do we have tags to add to our config
    if(Array.isArray(tags)) {
      for(var i = 0; i < tags.length; i++) {
        if(configSet.members[i] != null) {
          configSet.members[i].tags = tags[i];
        }
      }
    }
    
    var opts = {
        host: serverManagers[0].host
      , port: serverManagers[0].port
      , connectionTimeout: 2000
      , size: 1
      , reconnect: false
      , emitError: true
    }

    // Set the key
    if(keys.indexOf('sslOnNormalPorts') != -1) opts.ssl = true;
    if(keys.indexOf('ssl') != -1) opts.ssl = replsetOptions.ssl;
    if(keys.indexOf('ca') != -1) opts.ca = replsetOptions.ca;
    if(keys.indexOf('cert') != -1) opts.cert = replsetOptions.cert;
    if(keys.indexOf('rejectUnauthorized') != -1) opts.rejectUnauthorized = replsetOptions.rejectUnauthorized;
    if(keys.indexOf('key') != -1) opts.key = replsetOptions.key;
    if(keys.indexOf('passphrase') != -1) opts.passphrase = replsetOptions.passphrase;

    // Let's pick one of the servers and run the command against it
    server = new Server(opts);

    var onError = function(err) {
      callback(err, null);
    }

    // Set up the connection
    server.on('connect', function(server) {
      // Execute configure replicaset
      server.command('admin.$cmd'
        , {replSetInitiate: configSet}
        , {readPreference: new ReadPreference('secondary')}, function(err, result) {
          if(options.override || err == null) {
            // server.command('system.$cmd'
            //   , {ismaster:true}, function(err, r) {
            return ensureUp(server, function(err, r) {
              if(err) return callback(err);

              // Ensure IsMaster up across all the servers
              ensureIsMasterUp(configSet, function(err, r) {
                server.destroy();
                callback(err, r);
              });
            });
          }

          // Return error
          if(err) return callback(err, null);
      });
    });

    server.once('error', onError);
    server.once('close', onError);
    server.once('timeout', onError);
    // Connect
    server.connect();
  }

  // 
  // Reconfigure and ensure

  //
  // Start the server
  this.start = function(options, callback) {
    if(typeof options == 'function') {
      callback = options;
      options = {};
    }

    // Create server instances
    var totalServers = secondaries + arbiters + passives + 1;
    var serversLeft = totalServers;
    var purge = typeof options.purge == 'boolean' ? options.purge : true;
    var kill = typeof options.kill == 'boolean' ? options.kill : true;
    var signal = typeof options.signal == 'number' ? options.signal : -15;
    var self = this;

    // Remove db path and recreate it
    if(purge) {
      try {
        rimraf.sync(dbpath);
        mkdirp.sync(dbpath);
      } catch(err) {
      }
    }

    // Do we not have any server managers
    if(serverManagers.length == 0) {
      // Start all the servers
      for(var i = 0; i < totalServers; i++) {
        // Clone the options
        var opts = cloneOptions(internalOptions);
        // Emit errors
        opts.emitError = true;
        // Set the current Port 
        opts.host = host;
        opts.port = startPort + i;
        opts.dbpath = opts.dbpath ? opts.dbpath + f("/data-%s", opts.port) : null;
        opts.logpath = opts.logpath ? opts.logpath + f("/data-%s.log", opts.port) : null;
        opts.fork = null;
        // Add list
        serverAddresses.push(f("%s:%s", host, opts.port));      

        // Create a server manager
        serverManagers.push(new ServerManager(opts));
      }
    }

    // Starts all the provided servers
    var startServers = function() {
      // Start all the servers
      for(var i = 0; i < serverManagers.length; i++) {
        var startOpts = {purge: purge, signal: signal};

        // Start the server
        serverManagers[i].start(startOpts, function(err) {
          if(err) throw err;
          serversLeft = serversLeft - 1;

          // All servers are down
          if(serversLeft == 0) {
            // Configure the replicaset
            configureAndEnsure(function() {
              // Refresh view
              getServerManagerByType('primary', function() {
                callback(null, self);
              });
            });
          }
        });
      }      
    }

    // Kill all mongod instances if kill specified
    if(kill) {
      return exec(f("killall %d mongod", signal), function(err, stdout, stderr) {
        setTimeout(function() {
          startServers();
        }, 5000);
      });
    } 

    // Start all the servers
    startServers();
  }

  this.stop = function(options, callback) {    
    if(typeof options == 'function') {
      callback = options;
      options = {};
    }

    server.destroy()

    var count = serverManagers.length;
    // Stop all servers
    serverManagers.forEach(function(s) {
      s.stop(options, function() {
        count = count - 1;
        if(count == 0) {
          callback();
        }
      });
    });
  }

  this.restart = function(options, callback) {
    if(typeof options == 'function') {
      callback = options;
      options = {};
    }

    options = options || {};
    // Total server managers to check
    var count = serverManagers.length;

    // Check an individual servers state
    var checkServerManager = function(serverManager, _callback) {
      serverManager.connect(function(err, server) {
        // Attempt to restart server manager
        if(err) {
          serverManager.start(options, function(err) {
            count = count - 1;

            if(count == 0) {
              // Started all the servers, reconfigure and ensure
              configureAndEnsure({override:true}, function() {
                _callback(null, null);
              });
            }          
          });
        } else {
          count = count - 1;
        }

        if(count == 0) {
          // Started all the servers, reconfigure and ensure
          configureAndEnsure({override:true}, function() {
            _callback(null, null);
          });
        }          
      });
    }

    // Iterate over all the server managers restarting as needed
    for(var i = 0; i < serverManagers.length; i++) {
      checkServerManager(serverManagers[i], callback);
    }
  } 

  this.setCredentials = function(provider, db, user, password) {
    credentials = {
        provider: provider, db: db, user: user, password: password
    };
  }

  //
  // Get the current ismaster
  var getIsMaster = function(callback) {
    if(serverManagers.length == 0) return callback(new Error("no servers"));
    // Run ismaster against primary only
    getServerManagerByType('primary', function(err, manager) {
      if(err) return callback(err);
      manager.ismaster(callback);
    });
  } 

  //
  // Get a current serve
  var getServerManager = function(address, callback) {
    if(serverManagers.length == 0) return callback(new Error("no servers"));

    var manager = null;
    for(var i = 0; i < serverManagers.length; i++) {
      if(serverManagers[i].lastIsMaster().me == address) {
        manager = serverManagers[i];
      }
    }

    if(manager == null)  return callback(new Error("no servers"));    
    // We have an active server connection return it
    return callback(null, manager) ;
  }

  //
  // Get server by type
  var getServerManagerByType = function(type, callback) {
    if(serverManagers.length == 0) return callback(new Error("no servers"));

    // Left to validate
    var left = serverManagers.length;
    var manager = null;

    // Server function
    var s = function(_manager, callback) {
      _manager.ismaster(function(err, ismaster) {
        if(err) return callback(err, null);

        if(ismaster.secondary && ismaster.passive == null) {
          secondaryServers.push(ismaster.me);
        } else if(ismaster.arbiterOnly) {
          arbiterServers.push(ismaster.me);
        } else if(ismaster.ismaster) {
          primaryServer = ismaster.me;
        }

        if(type == 'secondary' && manager == null && ismaster.secondary && ismaster.passive == null) {
          manager = _manager;
        } else if(type == 'primary' && manager == null && ismaster.ismaster) {
          manager = _manager;
        } else if(type == 'arbiter' && manager == null && ismaster.arbiterOnly) {
          manager = _manager;
        }

        callback(null, null);
      });      
    }

    // Remove all internal services
    secondaryServers = [];
    arbiterServers = [];
    primaryServer = [];;

    // Locate a server of the right type
    for(var i = 0; i < serverManagers.length; i++) {
      s(serverManagers[i], function() {
        left = left - 1;

        // Done talking to all the servers
        if(left == 0) {
          if(manager == null) return callback(new Error("no servers"));
          callback(null, manager);
        }
      });
    }
  }

  this.getIsMaster = function(callback) {
    return getIsMaster(callback);
  }

  this.shutdown = function(type, options, callback) {
    if(typeof options == 'function') {
      callback = options;
      options = {};
    }

    options.signal = options.signal || -3;
    // Get server by type
    getServerManagerByType(type, function(err, manager) {
      if(err) return callback(err);
      // Set credentials
      if(credentials) manager.setCredentials(credentials.provider, credentials.db, credentials.user, credentials.password);
      // Shut down the server
      manager.stop(options, callback);
    });
  }

  this.restartServer = function(type, options, callback) {
    if(typeof options == 'function') {
      callback = options;
      options = {};
    }

    // Locate a downed secondary server
    var manager = null;
    for(var i = 0; i < serverManagers.length; i++) {
      if(!serverManagers[i].isConnected() && serverManagers[i].lastIsMaster().secondary) {
        manager = serverManagers[i];
        break;
      }
    }

    // Purge and delete
    options.purge = true;
    // No manager
    if(manager == null) return callback(new Error("no downed secondary server found"));
    // Restart the server
    manager.start(options, callback);
  }

  this.getServerManagerByType = function(type, callback) {
    return getServerManagerByType(type, callback);
  }

  this.remove = function(t, callback) {  
    if(typeof t == 'function') {
      callback = t; 
      t = 'secondary';
    }
    
    // Get primary manager 
    getServerManagerByType('primary', function(err, manager) {
      if(err) return callback(err, null);

      // Get a connection to the master
      manager.connect(function(err, server) {
        if(err) return callback(err, null);

        // Avoid double calls
        var done = false;

        // Execute find
        var cursor = server.cursor('local.system.replset', {
            find: 'local.system.replset'
          , query: {}
        }).next(function(err, d) {
          if(err) return callback(err, null);
          if(d == null) return;
          if(done) return;
          done = true;
          // Destroy the connection
          server.destroy();

          // Locate a secondary and remove it
          getServerManagerByType(t, function(err, m) {
            if(err) return callback(err);

            // Remove from the list of the result
            var members = [];
            // Find all all servers not matching the one we want removed
            for(var i = 0; i < d.members.length; i++) {
              if(d.members[i].host != m.lastIsMaster().me) {
                members.push(d.members[i]);
              } else {
                removedServer = d.members[i];
              }
            }

            // Update the config
            d.members = members;
            d.version = d.version + 1;

            // Set credentials
            if(credentials) manager.setCredentials(credentials.provider, credentials.db, credentials.user, credentials.password);

            // Get a connection to the master
            manager.connect(function(err, server) {
              if(err) return callback(err, null);

              // Reconfigure the replicaset
              server.command('admin.$cmd', {
                replSetReconfig: d
              }, function(err, result) {});
              // Call back as the command above will fail
              callback(null, removedServer);
            });
          });
        });
      });
    });
  }

  this.add = function(serverDetails, options, callback) {
    if(typeof options == 'function') {
      callback = options;
      options = {};
    }

    // Get primary manager 
    getServerManagerByType('primary', function(err, manager) {
      if(err) return callback(err, null);

      // Get a connection to the master
      manager.connect(function(err, server) {
        if(err) return callback(err, null);

        // Avoid double calls
        var done = false;
        // Execute find
        var cursor = server.cursor('local.system.replset', {
            find: 'local.system.replset'
          , query: {}
        }).next(function(err, d) {
          if(err) return callback(err, null);
          if(done) return;
          done = true;

          // Create a new members entry
          d.members.push(serverDetails)
          d.version = d.version + 1;

          // Set credentials
          if(credentials) manager.setCredentials(credentials.provider, credentials.db, credentials.user, credentials.password);

          // Get a connection to the master
          manager.connect(function(err, server) {
            if(err) return callback(err, null);

            // Reconfigure the replicaset
            server.command('admin.$cmd', {
              replSetReconfig: d
            }, function(err, result) {
              if(err) return callback(err);
              callback(null, result.result);
            });
          });
        });
      });
    });
  }

  this.stepDown = function(options, callback) {
    if(typeof options == 'function') {
      callback = options;
      options = {};
    }
  
    // Unpack all the options
    options.replSetStepDown = options.replSetStepDown || 60;
    options.force = typeof options.force == 'boolean' ? options.force : false;

    // Get is master from one of the servers
    getIsMaster(function(err, ismaster) {
      if(err) return callback(err);
      
      // Get a live connection to the primary
      getServerManager(ismaster.primary, function(err, manager) {
        if(err) return callback(err);

        // Set credentials
        if(credentials) manager.setCredentials(credentials.provider, credentials.db, credentials.user, credentials.password);
        
        // Get a new connection
        manager.connect(function(err, server) {
          if(err) return callback(err);

          // Execute step down
          server.command('admin.$cmd', {
              replSetStepDown: options.avoidElectionFor
            , force: options.force}, function(err, result) {
              // Destroy the server
              server.destroy();
              callback(err, result);
          });
        });
      });
    });
  }   
}

module.exports = ReplSetManager;