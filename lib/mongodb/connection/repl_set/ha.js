var DbCommand = require('../../commands/db_command').DbCommand
  format = require('util').format;

var HighAvailabilityProcess = function(replset, options) {  
  this.replset = replset;
  this.options = options;
  this.server = null;
  this.state = HighAvailabilityProcess.INIT;
}

HighAvailabilityProcess.INIT = 'init';
HighAvailabilityProcess.RUNNING = 'running';
HighAvailabilityProcess.STOPPED = 'stopped';

HighAvailabilityProcess.prototype.start = function() {  
  // console.log("=================================== START")
  // console.log(Object.keys(this.replset._state.addresses).length)
  if(this.replset._state 
    && Object.keys(this.replset._state.addresses).length == 0) {
    // console.log("================================ PING :: DONE :: " + self.state)
    if(this.server) this.server.close();
    this.state = HighAvailabilityProcess.STOPPED;
    return;      
  }

  if(this.server) this.server.close();
  // console.log("========================================= HA start")
  // Start the running
  this._haProcessInProcess = false;
  this.state = HighAvailabilityProcess.RUNNING;
  // Get all possible reader servers
  var candidate_servers = this.replset._state.getAllReadServers();
  if(candidate_servers.length == 0) {
    // console.log("=============================================== WE ARE DONE")
    if(this.server) this.server.close();
    this.state = HighAvailabilityProcess.STOPPED;
    return;
  }

  var server = candidate_servers.pop();
  var self = this;
  
  // Unpack connection options
  var connectTimeoutMS = self.options.connectTimeoutMS || 1000;
  // var socketTimeoutMS = self.options.socketTimeoutMS || ((this.options.haInterval * Object.keys(this.replset._state.addresses).length) + 2000);
  // var socketTimeoutMS = self.options.socketTimeoutMS || 30000);
  var socketTimeoutMS = 30000;

  // console.log("============================================ HA :: " + server.port)
  // console.dir("connectTimeoutMS :: " + connectTimeoutMS)
  // console.dir("socketTimeoutMS :: " + socketTimeoutMS)
  // process.exit(0)

  // Just ensure we don't have a full cycle dependency
  var Db = require('../../db').Db
  var Server = require('../server').Server;
  // console.dir(this.options)

  // Set up a new server instance
  var newServer = new Server(server.host, server.port, {
      auto_reconnect: false
    , returnIsMasterResults: true
    , poolSize: 1
    , socketOptions: { 
        connectTimeoutMS: connectTimeoutMS,
        socketTimeoutMS: socketTimeoutMS,
        keepAlive: 100
      }
    , ssl: this.options.ssl
    , sslValidate: this.options.sslValidate
    , sslCA: this.options.sslCA
    , sslCert: this.options.sslCert
    , sslKey: this.options.sslKey
    , sslPass: this.options.sslPass
  });

  // Create new dummy db for app
  self.db = new Db('local', newServer, {w:1});

  // Set up the event listeners
  newServer.once("error", _handle(this, newServer));
  newServer.once("close", _handle(this, newServer));
  newServer.once("timeout", _handle(this, newServer));
  newServer.name = format("%s:%s", server.host, server.port);
  // newServer._callBackStore = self.replset._callBackStore;
  // newServer.replicasetInstance = self.replset;

  // Let's attempt a connection over here
  newServer.connect(self.db, function(err, result, _server) {
    if(self.server)
      self.server.close()

    // if(self.options.closeServerOnEachHA) {
    //   console.log("============================ shut down HA server")
    //   _server.close();
    // }

    if(self.state == HighAvailabilityProcess.STOPPED) {
      _server.close();
    }

    if(err) {
      // newServer.close();
      // console.log("================================================= PING CONNECT ERROR")
      // console.dir(err)
      // Check if we can even do HA (is there anything running)
      if(Object.keys(self.replset._state.addresses).length == 0) return;
      // Let's boot the ha timeout settings
      setTimeout(function() {
        self.start();
      }, self.options.haInterval);
      // self.start();
    } else {
      self.server = _server;
      // Let's boot the ha timeout settings
      setTimeout(_timeoutHandle(self), self.options.haInterval);
    }
  });
}

HighAvailabilityProcess.prototype.stop = function() {
  // console.log("=============================== HighAvailabilityProcess stop")
  this.state = HighAvailabilityProcess.STOPPED;
  if(this.server) this.server.close();
}

var _timeoutHandle = function(self) {
  return function() {
    // console.log("================================ PING :: " + self.state + " :: " + self.options.haInterval)

    // There are no servers available at all (no HA possible)
    if(self.replset._state 
      && Object.keys(self.replset._state.addresses).length == 0) {
      // console.log("================================ PING :: DONE :: " + self.state)
      self.state = HighAvailabilityProcess.STOPPED;
      return;      
    }
    // {
    //   console.log("addresses :: " + Object.keys(self.replset._state.addresses))
    //   console.log("secondaries :: " + Object.keys(self.replset._state.secondaries))
    //   console.log("primary :: " + (self.replset._state.master != null))
    // }

    if(self.state == HighAvailabilityProcess.STOPPED) {
      
      // Stop all server instances
      for(var name in self.replset._state.addresses) {
        self.replset._state.addresses[name].close();
      }

      // Finished pinging
      return;
    }

    // console.log("self.server.isConnected() = " + self.server.isConnected())
    // console.log("self._haProcessInProcess = " + self._haProcessInProcess)

    // If the server is connected
    if(self.server.isConnected() && !self._haProcessInProcess) {
      // Start HA process
      self._haProcessInProcess = true;
      // Execute is master command
      self.db._executeQueryCommand(DbCommand.createIsMasterCommand(self.db), 
          {failFast:true, connection: self.server.checkoutReader()}
        , function(err, res) {
          // console.log("================================ PING :: 0")
          // console.dir(err)
          // console.dir(res)
          if(err) {
            self.server.close();
            return setTimeout(_timeoutHandle(self), self.options.haInterval);
          }

          // Master document
          var master = res.documents[0];
          var hosts = master.hosts || [];
          var reconnect_servers = [];
          var state = self.replset._state;

          // console.log("command read length :: " + self.replset._commandsStore.commands.read.length)
          // console.log("command write_reads length :: " + self.replset._commandsStore.commands.write_reads.length)
          // console.log("command write length :: " + self.replset._commandsStore.commands.write.length)
          // console.dir(master)

          // For all the hosts let's check that we have connections
          for(var i = 0; i < hosts.length; i++) {
            var host = hosts[i];

            // Check if we need to reconnect to a server
            if(state.addresses[host] == null) {
              // console.log("=================================== no host exists :: " + host)


              reconnect_servers.push(host);
            } else if(state.addresses[host] && !state.addresses[host].isConnected()) {
              // console.log("=================================== host not connected :: " + host)

              reconnect_servers.push(host);              
            }

            if((master.primary && state.master == null)
              || (master.primary && state.master.name != master.primary)) {
              // console.log("=================================== need new primary")
              // console.log("master.primary :: " + master.primary)
              // console.log("state.master :: " + (state.master != null ? state.master.name : 'N/A'))
              // console.log("state.addresses[master.primary] :: " + (state.addresses[master.primary] != null))
              // Locate the primary and set it
              if(state.addresses[master.primary]) {
                delete state.secondaries[master.primary];
                state.master = state.addresses[master.primary];
              }
              
              // Set up the changes
              if(state.master != null && state.master.isMasterDoc != null) {
                state.master.isMasterDoc.ismaster = true;
                state.master.isMasterDoc.secondary = false;                
              } else if(state.master != null) {
                state.master.isMasterDoc = master;
                state.master.isMasterDoc.ismaster = true;
                state.master.isMasterDoc.secondary = false;                
              }

              // Execute any waiting writes
              self.replset._commandsStore.execute_writes();   
              // console.log("state.master :: " + (state.master != null ? state.master.name : 'N/A'))
            }
          }

          // console.log("============================== reconnect servers :: " + reconnect_servers.length)

          // Let's reconnect to any server needed
          if(reconnect_servers.length > 0) {
            // self._haProcessInProcess = true
          // console.log("================================ PING :: 1")
            // setTimeout(function() {
            _reconnect_servers(self, reconnect_servers);  
            // }, self.options.haInterval);            
          } else {
            self._haProcessInProcess = false
          // console.log("================================ PING :: 2")
            return setTimeout(_timeoutHandle(self), self.options.haInterval);
          }
          // console.log("=================== master")
          // console.dir(master)
      });
    } else if(!self.server.isConnected()) {
      setTimeout(function() {
        // console.log("================== SERVER NOT CONNECTED")
        return self.start();
      }, self.options.haInterval);
    } else {
      setTimeout(_timeoutHandle(self), self.options.haInterval);
    }
  }
}

var _reconnect_servers = function(self, reconnect_servers) {
  // console.log("======================================== :: _reconnect_servers --- " + reconnect_servers.length)

  if(reconnect_servers.length == 0) {
    self._haProcessInProcess = false    
    // console.log("%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%% _reconnect_servers")
    return setTimeout(_timeoutHandle(self), self.options.haInterval);
  }

  // Unpack connection options
  var connectTimeoutMS = self.options.connectTimeoutMS || 0;
  var socketTimeoutMS = self.options.socketTimeoutMS || 0;
  // Server class
  var Db = require('../../db').Db
  var Server = require('../server').Server;
  // Get the host
  var host = reconnect_servers.shift();
  // Split it up
  var _host = host.split(":")[0];
  var _port = parseInt(host.split(":")[1], 10);

  // Set up a new server instance
  var newServer = new Server(_host, _port, {
      auto_reconnect: false
    , returnIsMasterResults: true
    , poolSize: self.options.poolSize
    , socketOptions: { 
        connectTimeoutMS: connectTimeoutMS,
        socketTimeoutMS: socketTimeoutMS
      }
    , ssl: self.options.ssl
    , sslValidate: self.options.sslValidate
    , sslCA: self.options.sslCA
    , sslCert: self.options.sslCert
    , sslKey: self.options.sslKey
    , sslPass: self.options.sslPass
  });

  // Create new dummy db for app
  var db = new Db('local', newServer, {w:1});
  var state = self.replset._state;

  // Set up the event listeners
  newServer.once("error", _repl_set_handler("error", self.replset, newServer));
  newServer.once("close", _repl_set_handler("close", self.replset, newServer));
  newServer.once("timeout", _repl_set_handler("timeout", self.replset, newServer));

  // Set shared state
  newServer.name = host;
  newServer._callBackStore = self.replset._callBackStore;
  newServer.replicasetInstance = self.replset;
  newServer.enableRecordQueryStats(self.replset.recordQueryStats);
  // newServer.socketOptions = self.replset.socketOptions;
  // newServer.socketOptions.
  // state.addresses[host] = newServer;


  // Let's attempt a connection over here
  newServer.connect(db, function(err, result, _server) {
    // console.log("======================================== _reconnect_servers :: 1")
    // console.dir(err)
    // console.dir(_server.isMasterDoc)

    if(self.state == HighAvailabilityProcess.STOPPED) {
      _server.close();
    }

    // If we connected let's check what kind of server we have
    if(!err) {
      _apply_auths(self, db, _server, function(err, result) {
        var doc = _server.isMasterDoc;
        // console.dir(doc)
        // console.dir(Object.keys(state.secondaries))
        // console.dir(Object.keys(state.addresses))
    
        // Fire error on any unknown callbacks for this server
        self.replset.__executeAllServerSpecificErrorCallbacks(_server.socketOptions.host, _server.socketOptions.port, err);    

        if(doc.ismaster) {
          if(state.secondaries[doc.me]) {
            delete state.secondaries[doc.me];
          }

          // Override any server in list of addresses
          state.addresses[doc.me] = _server;
          // Set server as master
          state.master = _server;     
          // Execute any waiting writes
          self.replset._commandsStore.execute_writes();   
        } else if(doc.secondary) {
          state.secondaries[doc.me] = _server;
          // Override any server in list of addresses
          state.addresses[doc.me] = _server;
          // Execute any waiting reads
          self.replset._commandsStore.execute_queries();   
        }

        // Set any tags on the instance server
        _server.name = doc.me;
        _server.tags = doc.tags;
        // Process the next server
        setTimeout(function() {
          _reconnect_servers(self, reconnect_servers);  
        }, self.options.haInterval);            

        // _reconnect_servers(self, reconnect_servers);      
      });
    } else {
      newServer.close();
      self.replset.__executeAllServerSpecificErrorCallbacks(_server.socketOptions.host, _server.socketOptions.port, err);    

      setTimeout(function() {
        _reconnect_servers(self, reconnect_servers);  
      }, self.options.haInterval);            

      // _reconnect_servers(self, reconnect_servers);      
    }
  });
}

var _apply_auths = function(self, _db, _server, _callback) {
  if(self.replset.auth.length() == 0) return _callback(null);
  // Apply any authentication needed
  if(self.replset.auth.length() > 0) {
    var pending = self.replset.auth.length();
    var connections = _server.allRawConnections();
    var pendingAuthConn = connections.length;

    // Connection function
    var connectionFunction = function(_auth, _connection, __callback) {
      var pending = _auth.length();

      for(var j = 0; j < pending; j++) {
        // Get the auth object
        var _auth = _auth.get(j);
        // Unpack the parameter
        var username = _auth.username;
        var password = _auth.password;
        var options = { 
            authMechanism: _auth.authMechanism
          , authSource: _auth.authdb
          , connection: _connection 
        };

        // Hold any error
        var _error = null;
        
        // Authenticate against the credentials
        _db.authenticate(username, password, options, function(err, result) {
          _error = err != null ? err : _error;
          // Adjust the pending authentication
          pending = pending - 1;
          // Finished up
          if(pending == 0) __callback(_error ? _error : null, _error ? false : true);
        });
      }
    }

    // Final error object
    var finalError = null;
    // Iterate over all the connections
    for(var i = 0; i < connections.length; i++) {
      connectionFunction(self.replset.auth, connections[i], function(err, result) {
        // Pending authentication
        pendingAuthConn = pendingAuthConn - 1 ;

        // Save error if any
        finalError = err ? err : finalError;

        // If we are done let's finish up
        if(pendingAuthConn == 0) {
          _callback(null);
        }
      });
    }
  }
}

var _handle = function(self, server) {
  return function(err) {
    // console.log("============================== handler :: " + (server ? server.port : 'n/a') + " :: " + self.state)
    // If we have a server Should correctly throw timeout for replication to servers on insertsinstance close it
    server.close();    
    
    // // Connect to the next server if we are still running
    // if(self.state == HighAvailabilityProcess.RUNNING) {
    //   // Check if we can even do HA (is there anything running)
    //   if(Object.keys(self.replset._state.addresses).length == 0) return;
    //   // Let's boot the ha timeout settings
    //   setTimeout(function() {
    //     self.start();
    //   }, self.options.haInterval);      
    // }
  }
}

var _repl_set_handler = function(event, self, server) {
  var ReplSet = require('./repl_set').ReplSet;

  return function(err, doc) {
    server.close();
    // console.log("========================= event handler :: " + event + " :: server :: " + server.socketOptions.port)
    // console.dir(err)
    // The event happened to a primary
    // Remove it from play
    if(self._state.isPrimary(server)) {
      self._state.master == null;
      self._serverState = ReplSet.REPLSET_READ_ONLY;
      delete self._state.addresses[server.name];
    } else if(self._state.isSecondary(server)) {
      delete self._state.secondaries[server.name];
      delete self._state.addresses[server.name];
    }

    // Unpack variables
    var host = server.socketOptions.host;
    var port = server.socketOptions.port;

    // Fire error on any unknown callbacks
    self.__executeAllServerSpecificErrorCallbacks(host, port, err);    
  }
}

exports.HighAvailabilityProcess = HighAvailabilityProcess;