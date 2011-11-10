var Connection = require('./connection').Connection,
  DbCommand = require('../commands/db_command').DbCommand,
  MongoReply = require('../responses/mongo_reply').MongoReply,
  debug = require('util').debug,
  SimpleEmitter = require('./simple_emitter').SimpleEmitter,
  inherits = require('util').inherits,
  inspect = require('util').inspect,
  Server = require('./server').Server;

/**
* ReplSetServers constructor provides master-slave functionality
*
* @param serverArr{Array of type Server}
* @return constructor of ServerCluster
*
*/
var ReplSetServers = exports.ReplSetServers = function(servers, options) {
  // Contains the master server entry
  this.options = options == null ? {} : options;
  this.reconnectWait = this.options["reconnectWait"] != null ? this.options["reconnectWait"] : 1000;
  this.retries = this.options["retries"] != null ? this.options["retries"] : 30;
  this.replicaSet = this.options["rs_name"];

  // Are we allowing reads from secondaries ?
  this.readSecondary = this.options["read_secondary"];
  this.slaveOk = this.readSecondary;
  this.closedConnectionCount = 0;

  // Just keeps list of events we allow
  this.eventHandlers = {error:[], parseError:[], poolReady:[], message:[], close:[]};
  // Internal state of server connection
  this._serverState = 'disconnected';
  
  // Ensure all the instances are of type server and auto_reconnect is false
  if(!Array.isArray(servers) || servers.length == 0) {
    throw Error("The parameter must be an array of servers and contain at least one server");
  } else if(Array.isArray(servers) || servers.length > 0) {
    var count = 0;
    servers.forEach(function(server) {
      if(server instanceof Server) count = count + 1;
      // Ensure no server has reconnect on
      server.options.auto_reconnect = false;
    });

    if(count < servers.length) {
      throw Error("All server entries must be of type Server");
    } else {
      this.servers = servers;
    }
  }

  // Auto Reconnect property
  Object.defineProperty(this, "autoReconnect", { enumerable: true
    , get: function () {
        return true;
        // if(this.target != null) return this.target.autoReconnect;
        // if(this.primary != null) return this.primary.autoReconnect;
      }
  });

  // Auto Reconnect property
  Object.defineProperty(this, "host", { enumerable: true
    , get: function () {
        if (this.primary != null) return this.primary.host;
      }
  });

  Object.defineProperty(this, "port", { enumerable: true
    , get: function () {
        if (this.primary != null) return this.primary.port;
      }
  });

  Object.defineProperty(this, "read", { enumerable: true
    , get: function () {
        return this.secondaries.length > 0 ? this.secondaries[0] : null;
      }
  });


  // Get list of secondaries
  Object.defineProperty(this, "secondaries", {enumerable: true
    , get: function() {              
        var keys = Object.keys(this._state.secondaries);
        var array = new Array(keys.length);
        // Convert secondaries to array
        for(var i = 0; i < keys.length; i++) {
          array[i] = this._state.secondaries[keys[i]];
        }
        return array;
      }
  });

  // Get list of all secondaries including passives
  Object.defineProperty(this, "allSecondaries", {enumerable: true
    , get: function() {              
        return this.secondaries.concat(this.passives);
      }
  });
  
  // Get list of arbiters
  Object.defineProperty(this, "arbiters", {enumerable: true
    , get: function() {
        var keys = Object.keys(this._state.arbiters);
        var array = new Array(keys.length);
        // Convert arbiters to array
        for(var i = 0; i < keys.length; i++) {
          array[i] = this._state.arbiters[keys[i]];
        }
        return array;
      }
  });

  // Get list of passives
  Object.defineProperty(this, "passives", {enumerable: true
    , get: function() {
        var keys = Object.keys(this._state.passives);
        var array = new Array(keys.length);
        // Convert arbiters to array
        for(var i = 0; i < keys.length; i++) {
          array[i] = this._state.passives[keys[i]];
        }
        return array;
      }
  });

  // Master connection property
  Object.defineProperty(this, "primary", { enumerable: true
    , get: function () {
        return this._state != null ? this._state.master : null;
      }
  });
};

inherits(ReplSetServers, SimpleEmitter);

ReplSetServers.prototype.setTarget = function(target) {
  this.target = target;
};

ReplSetServers.prototype.isConnected = function() {
  return this.primary != null && this._state.master != null && this._state.master.isConnected();
}

ReplSetServers.prototype.isPrimary = function(config) {
  return this.readSecondary && this.secondaries.length > 0 ? false : true;
}

ReplSetServers.prototype.isReadPrimary = ReplSetServers.prototype.isPrimary;

// Clean up dead connections
var cleanupConnections = function(connections, addresses) {
  // Ensure we don't have entries in our set with dead connections
  var keys = Object.keys(connections);
  for(var i = 0; i < keys.length; i++) {
    var server = connections[keys[i]];
    // If it's not connected remove it from the list
    if(!server.isConnected()) {
      delete connections[keys[i]];
      delete addresses[keys[i]];
    }
  }  
}

ReplSetServers.prototype.allServerInstances = function() {
  // Close all the servers (concatenate entire list of servers first for ease)
  var allServers = self._state.master != null ? [self._state.master] : [];

  // Secondary keys
  var keys = Object.keys(self._state.secondaries);
  // Add all secondaries
  for(var i = 0; i < keys.length; i++) {
    allServers.push(self._state.secondaries[keys[i]]);
  }

  // Arbiter keys
  var keys = Object.keys(self._state.arbiters);
  // Add all arbiters
  for(var i = 0; i < keys.length; i++) {
    allServers.push(self._state.arbiters[keys[i]]);
  }

  // Passive keys
  var keys = Object.keys(self._state.passives);
  // Add all arbiters
  for(var i = 0; i < keys.length; i++) {
    allServers.push(self._state.passives[keys[i]]);
  }

  // Return complete list of all servers
  return allServers;
}

ReplSetServers.prototype.connect = function(parent, options, callback) {
  if('function' === typeof options) callback = options, options = {};  
  if(options == null) options = {};
  if(!('function' === typeof callback)) callback = null;
  
  // Set server state to connecting
  this._serverState = 'connecting';
  // Reference to the instance
  var replSetSelf = this;
  var serverConnections = this.servers;
  // Ensure parent can do a slave query if it's set
  var firstCall = options.firstCall == null ? false : options.firstCall;
  parent.slaveOk = this.slaveOk ? this.slaveOk : parent.slaveOk;
  // Number of total servers that need to initialized (known servers)
  var numberOfServersLeftToInitialize = serverConnections.length;

  // If it's the first call let's reset our state
  if(firstCall || replSetSelf._state == null) {
    replSetSelf._state = {'master':null, 'secondaries':{}, 'arbiters':{}, 'passives':{}, 'errors':{}, 'addresses':{}, 'setName':null, 'errorMessages':[]};
  } else {
    // Clean out dead connections
    cleanupConnections(replSetSelf._state.arbiters, replSetSelf._state.addresses);
    cleanupConnections(replSetSelf._state.passives, replSetSelf._state.addresses);
    cleanupConnections(replSetSelf._state.secondaries, replSetSelf._state.addresses);
    // Get master
    var master = replSetSelf._state.master;
    if(master != null) {
      // Remove master from list
      replSetSelf._state.addresses[master.host + ":" + master.port];
      // Clean up master
      replSetSelf._state.master = null;      
    }    
  }
  
  // Add a close event handler to ourselves to notify the parent
  this.on("close", function() {
    parent.emit("close");
  })
  
  // Create a connection handler
  var connectionHandler = function(instanceServer) {
    return function(err, result) {
      // Don't attempt to connect if we are done
      if(replSetSelf._serverState === 'disconnected') return;
      // Remove a server from the list of intialized servers we need to perform
      numberOfServersLeftToInitialize = numberOfServersLeftToInitialize - 1;
      
      if(err == null && result.documents[0].hosts != null) {
        // Fetch the isMaster command result
        var document = result.documents[0];
        // Break out the results
        var setName = document.setName;
        var isMaster = document.ismaster;
        var secondary = document.secondary;
        var passive = document.passive;
        var arbiterOnly = document.arbiterOnly;
        var hosts = Array.isArray(document.hosts) ? document.hosts : [];
        var arbiters = Array.isArray(document.arbiters) ? document.arbiters : [];
        var passives = Array.isArray(document.passives) ? document.passives : [];
        var primary = document.primary;
        var me = document.me;

        // Error handler for the servers, this handles unexpected errors coming from 
        // a wrong callback or something else
        var errorHandler = function(err) {
          if(err.stack != null) console.log(err.stack)
          // Shut down the server and emit the error to the dbInstance
          replSetSelf.close();          
          // Emit error
          parent.emit("error", err);
          // Remove listener on parent
          parent.removeAllListeners("error");
        }

        // Add error handler to the instance of the server
        instanceServer.on("error", errorHandler);
        
        // Remove from error list
        delete replSetSelf._state.errors[instanceServer.host + ":" + instanceServer.port];
        
        // Add our server to the list of finished servers
        replSetSelf._state.addresses[instanceServer.host + ":" + instanceServer.port] = instanceServer;
        
        // Assign the set name
        if(replSetSelf.replicaSet == null) {
          replSetSelf._state.setName = setName;          
        } else if(replSetSelf.replicaSet != setName && replSetSelf._serverState != 'disconnected') {
          replSetSelf._state.errorMessages.push(new Error("configured mongodb replicaset does not match provided replicaset [" + setName + "] != [" + replSetSelf.replicaSet + "]"));
          // Set done
          replSetSelf._serverState = 'disconnected';
          // Return error message ignoring rest of calls
          return callback(replSetSelf._state.errorMessages[0], parent);
        }
        
        // Let's add the server to our list of server types
        if(secondary == true && (passive == false || passive == null)) {
          replSetSelf._state.secondaries[me] = instanceServer;
        } else if(arbiterOnly == true) {
          replSetSelf._state.arbiters[me] = instanceServer;
        } else if(secondary == true && passive == true) {
          replSetSelf._state.passives[me] = instanceServer;
        } else if(isMaster == true) {
          replSetSelf._state.master = instanceServer;
        } else if(isMaster == false && primary != null && replSetSelf._state.addresses[primary]) {
          replSetSelf._state.master = replSetSelf._state.addresses[primary];
        }
        
        // Let's go throught all the "possible" servers in the replicaset
        var candidateServers = hosts.concat(arbiters).concat(passives);        
      
        // If we have new servers let's add them
        for(var i = 0; i < candidateServers.length; i++) {
          // Fetch the server string
          var candidateServerString = candidateServers[i];        
          // Add the server if it's not defined
          if(replSetSelf._state.addresses[candidateServerString] == null) {            
            // Split the server string
            var parts = candidateServerString.split(/:/);
            if(parts.length == 1) {
              parts = [parts[0], Connection.DEFAULT_PORT];
            }

            // Create a new server instance
            var newServer = new Server(parts[0], parseInt(parts[1]), {auto_reconnect:false});
            // Add server to list, ensuring we don't get a cascade of request to the same server
            replSetSelf._state.addresses[candidateServerString] = newServer;

            // Add a new server to the total number of servers that need to initialized before we are done
            numberOfServersLeftToInitialize = numberOfServersLeftToInitialize + 1;

            // Let's set up a new server instance
            newServer.connect(parent, {firstCall:true, returnIsMasterResults: true, eventReceiver:newServer}, connectionHandler(newServer));
          }        
        }                
      }
      
      // If done finish up
      if((numberOfServersLeftToInitialize == 0) && replSetSelf._serverState === 'connecting' && replSetSelf._state.errorMessages.length == 0) {
        // Set db as connected
        replSetSelf._serverState = 'connected';

        // If we don't expect a master let's call back, otherwise we need a master before
        // the connection is successful
        if(replSetSelf.masterNotNeeded || replSetSelf._state.master != null) {
          callback(null, parent);
        } else if(replSetSelf.readSecondary == true && Object.keys(replSetSelf._state.secondaries).length > 0) {
          callback(null, parent);
        } else if(replSetSelf.readSecondary == true && Object.keys(replSetSelf._state.secondaries).length == 0) {          
          callback(new Error("no secondary server found"), null);
        } else {
          callback(new Error("no primary server found"), null);
        }          
      } else if((numberOfServersLeftToInitialize == 0) && replSetSelf._state.errorMessages.length > 0) {
        callback(replSetSelf._state.errorMessages[0], null);
      }
    }
  }
  
  // Ensure we have all registered servers in our set
  for(var i = 0; i < serverConnections.length; i++) {
    replSetSelf._state.addresses[serverConnections[i].host + ':' + serverConnections[i].port] = serverConnections[i];
  }

  // Initialize all the connections
  for(var i = 0; i < serverConnections.length; i++) {
    try {    
      serverConnections[i].connect(parent, {'firstCall':true, returnIsMasterResults: true, eventReceiver:serverConnections[i]}, connectionHandler(serverConnections[i]));
    } catch (err) {
      numberOfServersLeftToInitialize = numberOfServersLeftToInitialize - 1;
      // Remove from list off addresses, close down and fire error
      replSetSelf._state.addresses[serverConnections[i].host + ':' + serverConnections[i].port]
      // Close connections
      replSetSelf.close();
      // Add error message
      replSetSelf._state.errorMessages.push(err);
    }
  }  
}

ReplSetServers.prototype.checkoutWriter = function() {
  return this._state.master.checkoutWriter();
}

ReplSetServers.prototype.checkoutReader = function() {
  // If we have specified to read from a secondary server grab a random one and read
  // from it, otherwise just pass the primary connection
  if(this.readSecondary == true && Object.keys(this._state.secondaries).length > 0) {
    // Pick a random key
    var keys = Object.keys(this._state.secondaries);
    var key = keys[Math.floor(Math.random() * keys.length)];
    return this._state.secondaries[key].checkoutReader();
  } else {
    return this.checkoutWriter();
  }
}

ReplSetServers.prototype.allRawConnections = function() {
  // Neeed to build a complete list of all raw connections, start with master server
  var allConnections = [];
  // Get connection object
  var allConnectionsObject = this._state.master.connectionPool.getAllConnections();
  // Get the keys for the object
  var keys = Object.keys(allConnectionsObject);
  // For each connection entry add it to the list of connections
  for(var i = 0; i < keys.length; i++) {
    allConnections.push(allConnectionsObject[keys[i]]);
  }
  
  // If we have read secondary let's add all secondary servers
  if(this.readSecondary && Object.keys(this._state.secondaries).length > 0) {
    // Get all the keys
    keys = Object.keys(this._state.secondaries);
    // For each of the secondaries grab the connections
    for(var i = 0; i < keys.length; i++) {
      // Get connection object
      var secondaryConnectionObject = this._state.secondaries[keys[i]].connectionPool.getAllConnections();
      // Get the keys for the object
      var secondaryKeys = Object.keys(secondaryConnectionObject);
      // For each connection entry add it to the list of connections
      for(var i = 0; i < keys.length; i++) {
        allConnections.push(secondaryConnectionObject[secondaryKeys[i]]);
      }
    }
  }
  
  // Return all the conections
  return allConnections;
}

ReplSetServers.prototype.disconnect = function(callback) {
  this.close(callback);
}

ReplSetServers.prototype.close = function(callback) {  //
  var self = this;  
  // Set server status as disconnected
  this._serverState = 'disconnected';  
  // Close all the servers (concatenate entire list of servers first for ease)
  var allServers = self._state.master != null ? [self._state.master] : [];

  // Secondary keys
  var keys = Object.keys(self._state.secondaries);
  // Add all secondaries
  for(var i = 0; i < keys.length; i++) {
    allServers.push(self._state.secondaries[keys[i]]);
  }

  // Arbiter keys
  var keys = Object.keys(self._state.arbiters);
  // Add all arbiters
  for(var i = 0; i < keys.length; i++) {
    allServers.push(self._state.arbiters[keys[i]]);
  }

  // Passive keys
  var keys = Object.keys(self._state.passives);
  // Add all arbiters
  for(var i = 0; i < keys.length; i++) {
    allServers.push(self._state.passives[keys[i]]);
  }
  
  // Let's process all the closing
  var numberOfServersToClose = allServers.length;
  
  // Close the servers
  for(var i = 0; i < allServers.length; i++) {
    var server = allServers[i];
    // Close each server
    server.close(function() {
      numberOfServersToClose = numberOfServersToClose - 1;
      // Clear out state if we are done
      if(numberOfServersToClose == 0) {
        self._state = {'master':null, 'secondaries':{}, 'arbiters':{}, 'passives':{}, 'errors':{}, 'addresses':{}, 'setName':null, 'errorMessages':[]};
      }
            
      // If we are finished perform the call back
      if(numberOfServersToClose == 0 && typeof callback === 'function') {
        // Remove all the listeners
        self.removeAllListeners();
        // Perform the callback
        callback(null);
      } else if(numberOfServersToClose == 0) {
        // Remove all the listeners
        self.removeAllListeners();
      }
    })
  }
}