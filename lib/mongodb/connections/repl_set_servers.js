var Connection = require('../connection').Connection,
  DbCommand = require('../commands/db_command').DbCommand,
  MongoReply = require('../responses/mongo_reply').MongoReply,
  debug = require('util').debug,
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
  // this.master = null;
  // this.target = null;
  this.options = options == null ? {} : options;
  this.reconnectWait = this.options["reconnectWait"] != null ? this.options["reconnectWait"] : 1000;
  this.retries = this.options["retries"] != null ? this.options["retries"] : 30;
  this.replicaSet = this.options["rs_name"];

  // // Keep references to node types for caching purposes
  // this.secondaries = [];
  // this.arbiters = [];
  // this.otherErrors = [];

  // Are we allowing reads from secondaries ?
  this.readSecondary = this.options["read_secondary"];
  this.masterNotNeeded = this.options["master_not_needed"];
  this.slaveOk = this.readSecondary;
  this.closedConnectionCount = 0;

  // Just keeps list of events we allow
  this.eventHandlers = {error:[], parseError:[], poolReady:[], message:[], close:[]};
  
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
  Object.defineProperty(this, "autoReconnect", {
      enumerable: true
    , get: function () {
        if(this.target != null) return this.target.autoReconnect;
        if(this.primary != null) return this.primary.autoReconnect;
      }
  });

  // Auto Reconnect property
  Object.defineProperty(this, "host", {
      enumerable: true
    , get: function () {
        if (this.primary != null) return this.primary.host;
      }
  });

  Object.defineProperty(this, "port", {
      enumerable: true
    , get: function () {
        if (this.primary != null) return this.primary.port;
      }
  });

  Object.defineProperty(this, "read", {
      enumerable: true
    , get: function () {
        return this.secondaries.length > 0 ? this.secondaries[0] : null;
      }
  });

  // Master connection property
  Object.defineProperty(this, "primary", {
      enumerable: true
    , get: function () {
        // Allow overriding to a specific connection
        if(this.target != null && this.target instanceof Server) {
          return this.target.primary;
        } else {
          var finalServer = null;
          this.servers.forEach(function(server) {
            if(server.master == true && (server.isConnected())) finalServer = server;
          });
          return finalServer != null ? finalServer.primary : finalServer;
        }
      }
  });
};

ReplSetServers.prototype.setTarget = function(target) {
  this.target = target;
};

ReplSetServers.prototype.isConnected = function() {
  return this.primary != null && this._state.master.isConnected();
}

ReplSetServers.prototype.isPrimary = function(config) {
  return this.readSecondary && this.secondaries.length > 0 ? false : true;
}

ReplSetServers.prototype.isReadPrimary = ReplSetServers.prototype.isPrimary;

ReplSetServers.prototype.connect = function(parent, options, callback) {
  if('function' === typeof options) callback = options, options = {};  
  if(options == null) options = {};
  if(!('function' === typeof callback)) callback = null;
  
  // Reference to the instance
  var replSetSelf = this;
  var serverConnections = this.servers;
  // Ensure parent can do a slave query if it's set
  var firstCall = options.firstCall == null ? false : options.firstCall;
  parent.slaveOk = this.slaveOk ? this.slaveOk : parent.slaveOk;
  // Number of total servers that need to initialized (known servers)
  var numberOfServersLeftToInitialize = serverConnections.length;

  // If it's the first call let's reset our state
  replSetSelf._state = {'master':null, 'secondaries':{}, 'arbiters':{}, 'passives':{}, 'errors':{}, 'addresses':{}, 'setName':null, 'errorMessages':[]};

  // console.log("###############################################################################################")
  // console.log("###############################################################################################")
  // console.log("###############################################################################################")

  // Initialize server
  var initServer = function(server)  {        

    // console.log("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! 2")

    // Handles the connections off the individual servers
    var connectHandler = function(err, result) {
      // console.log("====================================================================== replicaset connect")
      // console.dir(err)
      // console.dir(result)
      // console.dir(server.connectionPool.getAllConnections())
        
      // Remove a server from the list of intialized servers we need to perform
      numberOfServersLeftToInitialize = numberOfServersLeftToInitialize - 1;
      
      // If we have no errors and this is a replicaset server, let's process our entries
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

        // Print info
        // console.log("--------------------------------------------------------- replicaset server :: " + me)
        // console.log("  setName = " + setName)
        // console.log("  isMaster = " + isMaster)
        // console.log("  primary = " + primary)
        // console.log("  secondary = " + secondary)
        // console.log("  passive = " + passive)
        // console.log("  hosts------------------------")
        // console.dir(hosts)
        // console.log("  arbiters------------------------")
        // console.dir(arbiters)
        
        // Check if the server does not exist in our connected list
        // Add server to list of connected servers
        if(replSetSelf._state.addresses[server.host + ":" + server.port] == null) {
          // Add server to addresses, ensure we don't have duplicate entries
          replSetSelf._state.addresses[server.host + ":" + server.port] = 1;
        }
        
        // If the server was previous an error remove it
        if(replSetSelf._state.errors[server.host + ":" + server.port] != null) {
          delete replSetSelf._state.errors[server.host + ":" + server.port];
        }
        
        // Assign the set name
        if(replSetSelf.replicaSet == null) {
          replSetSelf._state.setName = setName;          
        } else if(replSetSelf.replicaSet != setName) {
          replSetSelf._state.errorMessages.push(new Error("configured mongodb replicaset does not match provided replicaset [" + setName + "] != [" + replSetSelf.replicaSet + "]"))
        }
        
        // Let's add the server to our list of server types
        if(secondary == true && (passive == false || passive == null)) {
          replSetSelf._state.secondaries[server.host + ":" + server.port] = server;
        } else if(arbiterOnly == true) {
          replSetSelf._state.arbiters[server.host + ":" + server.port] = server;
        } else if(secondary == true && passive == true) {
          replSetSelf._state.passives[server.host + ":" + server.port] = server;
        } else if(isMaster == true) {
          replSetSelf._state.master = server;
        } else if(isMaster == false && (server.host + ":" + server.port) === primary) {
          replSetSelf._state.master = server;          
        }
        
        // Let's go throught all the "possible" servers in the replicaset
        var candidateServers = hosts.concat(arbiters).concat(passives);        
        // console.log("$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$")
        // console.dir(candidateServers)

        // If we have new servers let's add them
        for(var i = 0; i < candidateServers.length; i++) {
          // Fetch the server string
          var candidateServerString = candidateServers[i];
          
          // console.log("---------------------------- candidateServer :: " + candidateServerString)
          // console.dir(replSetSelf._state.addresses)
          
          // Skip this server if it's alreay defined
          if(replSetSelf._state.addresses[candidateServerString] == 1) continue;
          // Add server to list, ensuring we don't get a cascade of request to the same server
          replSetSelf._state.addresses[candidateServerString] = 1;
          
          // console.log("--------------------------------------- ++++++++++++++++++++ adding new server")
          
          // Split the server string
          var parts = candidateServerString.split(/:/);
          if(parts.length == 1) {
            parts = [parts[0], Connection.DEFAULT_PORT];
          }
          
          // Add a new server to the total number of servers that need to initialized before we are done
          numberOfServersLeftToInitialize = numberOfServersLeftToInitialize + 1;
          
          // Let's set up a new server instance
          process.nextTick(function() {
            // console.log("----------------------------------------------------- adding new server")
            var newServer = new Server(parts[0], parseInt(parts[1]), {auto_reconnect:true});
            newServer.connect(parent, {firstCall:true, returnIsMasterResults: true}, connectHandler);
          });
        }
      } else {
        // Force a close, make sure we don't leave the connection hanging on a dead socket
        server.close();
      }
      
      // console.log("@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@ numberOfServersLeftToInitialize :: " + numberOfServersLeftToInitialize)
      
      if(numberOfServersLeftToInitialize == 0) {
        // console.log("---------------------------------------------------------- callback")
        // console.dir(replSetSelf._state.errors)
        // console.dir(replSetSelf._state.errorMessages)
        
        // Check if we have errors
        if(replSetSelf._state.errorMessages.length > 0) {
          callback(replSetSelf._state.errorMessages[0], parent);
        } else {          
          // If we don't expect a master let's call back, otherwise we need a master before
          // the connection is successful
          if(replSetSelf.masterNotNeeded || replSetSelf._state.master != null) {
            callback(null, parent)            
          } else {
            callback(new Error("no primary server found"), null);
          }          
        }
      }
    };
    
    // Start the server connection, having the callback return the ismaster results for
    // each server we are connecting to
    server.connect(parent, {'firstCall':true, returnIsMasterResults: true}, connectHandler);
  };
  
  // console.log("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! 0")
  
  // Ensure we have all registered servers in our set
  for(var i = 0; i < serverConnections.length; i++) {
    replSetSelf._state.addresses[serverConnections[i].host + ':' + serverConnections[i].port] = 1;    
  }

  // console.log("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! 1")

  // Initialize all the connections
  for(var i = 0; i < serverConnections.length; i++) {
    initServer(serverConnections[i]);
  }  
}

ReplSetServers.prototype.checkoutWriter = function() {
  return this.primary.connection;
}

ReplSetServers.prototype.checkoutReader = function() {
  // If we have specified to read from a secondary server grab a random one and read
  // from it, otherwise just pass the primary connection
  if(this.readSecondary && this.secondaries.length > 0) {
    var server = this.secondaries[Math.floor(Math.random() * this.secondaries.length)];
    return server.connection;
  } else {
    return this.checkoutWriter();
  }
}

ReplSetServers.prototype.allRawConnections = function() {
  var connections = this.checkoutWriter().pool.slice(0);
  // Add all the pool connections
  if(this.readSecondary && this.secondaries.length > 0) {
    for(var i = 0; i < this.secondaries.length; i++) {
      connections = connections.concat(this.secondaries[i].connection.pool);
    }
  }
  // Return the server connections
  return connections;
}

ReplSetServers.prototype.disconnect = function(callback) {
  this.close(callback);
}

ReplSetServers.prototype.close = function(callback) {
  // console.log("-------------------------------------------------------------- ReplSetServers :: close")  
  
  var self = this;  

  // console.log("---------------------------------------------------------------- arbiters")
  // console.dir(self._state.arbiters)
  // console.log("---------------------------------------------------------------- secondaries")
  // console.dir(self._state.secondaries)
  // console.log("---------------------------------------------------------------- passives")
  // console.dir(self._state.passives)

  // Close all the servers (concatenate entire list of servers first for ease)
  var allServers = self._state.master != null ? [self._state.master] : [];
  // console.log("-------------------------------------------------------------- ReplSetServers :: close :: 0")

  // Secondary keys
  var keys = Object.keys(self._state.secondaries);
  // Add all secondaries
  for(var i = 0; i < keys.length; i++) {
    allServers.push(self._state.secondaries[keys[i]]);
  }

  // console.log("-------------------------------------------------------------- ReplSetServers :: close :: 1")

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
  
  // console.log("-------------------------------------------------------------- ReplSetServers :: close :: 2")  
  // console.dir(allServers)
  
  // Let's process all the closing
  var numberOfServersToClose = allServers.length;
  
  // Close the servers
  for(var i = 0; i < allServers.length; i++) {
    // console.log("-------------------------------------------------------------- ReplSetServers :: close :: 3")  
    var server = allServers[i];
    // console.dir(server)
    // Close each server
    server.close(function() {
      // console.log("-------------------------------------------------------------- ReplSetServers :: close :: 4")  
      numberOfServersToClose = numberOfServersToClose - 1;
      // Clear out state if we are done
      if(numberOfServersToClose == 0) {
        self._state = {'master':null, 'secondaries':{}, 'arbiters':{}, 'passives':{}, 'errors':{}, 'addresses':{}, 'setName':null, 'errorMessages':[]};
      }
      
      // If we are finished perform the call back
      if(numberOfServersToClose == 0 && typeof callback === 'function') {
        // console.log("-------------------------------------------------------------- ReplSetServers :: close :: 5")  
        callback(null);
      } else if(numberOfServersToClose == 0) {
        // console.log("-------------------------------------------------------------- ReplSetServers :: close :: 6")  
        self.emit("close");
      }
    })
  }
}

//
// My own simple synchronous emit support, We don't need the overhead of the built in flexible node.js
// event emitter as we are looking for as low latency as possible.
//
ReplSetServers.prototype.on = function(event, callback) {
  // console.log("===================================================== Server on :: " + event)

  if(this.eventHandlers[event] == null) throw "Event handler only accepts values of " + Object.keys(this.eventHandlers);
  // Just add callback to our event handler (avoiding the cost of the node.js event handler)
  this.eventHandlers[event].push(callback);
}

ReplSetServers.prototype.emit = function(event, err, object) {
  // console.log("===================================================== Server emit :: " + event)
  
  if(this.eventHandlers[event] == null) throw "Event handler only accepts values of " + Object.keys(this.eventHandlers);
  // Fire off all the callbacks
  var callbacks = this.eventHandlers[event];
  // Attemp to emit
  try {
    // Perform a callback on all the registered callback handlers
    for(var i = 0; i < callbacks.length; i++) {
      callbacks[i](err, object);
    }    
  } catch (err) {
    this.emit("error", err);
  }
}

ReplSetServers.prototype.removeListeners = function(event) {
  // console.log("===================================================== Server removeListeners:: " + event)

  if(this.eventHandlers[event] == null) throw "Event handler only accepts values of " + Object.keys(this.eventHandlers);
  // Throw away all handlers
  this.eventHandlers[event] = [];
}

ReplSetServers.prototype.removeAllListeners = function() {
  // Fetch all the keys of handlers
  var keys = Object.keys(this.eventHandlers);  
  // Remove all handlers
  for(var i = 0; i < keys.length; i++) {
    this.eventHandlers[keys[i]] = [];
  }
}

