var ReadPreference = require('../read_preference').ReadPreference
  , DbCommand = require('../../commands/db_command').DbCommand
  , inherits = require('util').inherits
  , format = require('util').format
  , Server = require('../server').Server
  , PingStrategy = require('./strategies/ping_strategy').PingStrategy
  , StatisticsStrategy = require('./strategies/statistics_strategy').StatisticsStrategy
  , Options = require('./options').Options
  , ReplSetState = require('./repl_set_state').ReplSetState
  , HighAvailabilityProcess = require('./ha').HighAvailabilityProcess
  , Base = require('../base').Base;

const STATE_STARTING_PHASE_1 = 0;
const STATE_PRIMARY = 1;
const STATE_SECONDARY = 2;
const STATE_RECOVERING = 3;
const STATE_FATAL_ERROR = 4;
const STATE_STARTING_PHASE_2 = 5;
const STATE_UNKNOWN = 6;
const STATE_ARBITER = 7;
const STATE_DOWN = 8;
const STATE_ROLLBACK = 9;

/**
 * ReplSet constructor provides replicaset functionality
 *
 * Options
 *  - **ha** {Boolean, default:true}, turn on high availability.
 *  - **haInterval** {Number, default:2000}, time between each replicaset status check.
 *  - **reconnectWait** {Number, default:1000}, time to wait in miliseconds before attempting reconnect.
 *  - **retries** {Number, default:30}, number of times to attempt a replicaset reconnect.
 *  - **rs_name** {String}, the name of the replicaset to connect to.
 *  - **socketOptions** {Object, default:null}, an object containing socket options to use (noDelay:(boolean), keepAlive:(number), connectTimeoutMS:(number), socketTimeoutMS:(number))
 *  - **readPreference** {String}, the prefered read preference (ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST).
 *  - **strategy** {String, default:'ping'}, selection strategy for reads choose between (ping, statistical and none, default is ping)
 *  - **secondaryAcceptableLatencyMS** {Number, default:15}, sets the range of servers to pick when using NEAREST (lowest ping ms + the latency fence, ex: range of 1 to (1 + 15) ms)
 *  - **connectArbiter** {Boolean, default:false}, sets if the driver should connect to arbiters or not.
 *  - **logger** {Object, default:null}, an object representing a logger that you want to use, needs to support functions debug, log, error **({error:function(message, object) {}, log:function(message, object) {}, debug:function(message, object) {}})**.
 *  - **ssl** {Boolean, default:false}, use ssl connection (needs to have a mongod server with ssl support)
 *  - **sslValidate** {Boolean, default:false}, validate mongod server certificate against ca (needs to have a mongod server with ssl support, 2.4 or higher)
 *  - **sslCA** {Array, default:null}, Array of valid certificates either as Buffers or Strings (needs to have a mongod server with ssl support, 2.4 or higher)
 *  - **sslCert** {Buffer/String, default:null}, String or buffer containing the certificate we wish to present (needs to have a mongod server with ssl support, 2.4 or higher)
 *  - **sslKey** {Buffer/String, default:null}, String or buffer containing the certificate private key we wish to present (needs to have a mongod server with ssl support, 2.4 or higher)
 *  - **sslPass** {Buffer/String, default:null}, String or buffer containing the certificate password (needs to have a mongod server with ssl support, 2.4 or higher)
 *
 * @class Represents a Replicaset Configuration
 * @param {Array} list of server objects participating in the replicaset.
 * @param {Object} [options] additional options for the replicaset connection.
 */
var ReplSet = exports.ReplSet = function(servers, options) {
  // Set up basic
  if(!(this instanceof ReplSet))
    return new ReplSet(servers, options);

  // Set up event emitter
  Base.call(this);

  // Ensure we have a list of servers
  if(!Array.isArray(servers)) throw Error("The parameter must be an array of servers and contain at least one server");
  // Ensure no Mongos's
  for(var i = 0; i < servers.length; i++) {
    if(!(servers[i] instanceof Server)) throw new Error("list of servers must be of type Server");
  }

  // Save the options
  this.options = new Options(options);
  // Ensure basic validation of options
  this.options.init();
  // Server state
  this._serverState = ReplSet.REPLSET_DISCONNECTED;
  // Add high availability process
  this._haProcess = new HighAvailabilityProcess(this, this.options);

  // Let's iterate over all the provided server objects and decorate them
  this.servers = this.options.decorateAndClean(servers, this._callBackStore);
  // Throw error if no seed servers
  if(this.servers.length == 0) throw new Error("No valid seed servers in the array");
  // Set up a clean state
  this._state = new ReplSetState();  
}

/**
 * @ignore
 */
inherits(ReplSet, Base);

// Replicaset states
ReplSet.REPLSET_CONNECTING = 'connecting';
ReplSet.REPLSET_DISCONNECTED = 'disconnected';
ReplSet.REPLSET_CONNECTED = 'connected';
ReplSet.REPLSET_RECONNECTING = 'reconnecting';
ReplSet.REPLSET_DESTROYED = 'destroyed';
ReplSet.REPLSET_READ_ONLY = 'readonly';

ReplSet.prototype.isAutoReconnect = function() {
  return true;
}

ReplSet.prototype.canWrite = function() {
  return this._state.master && this._state.master.isConnected();
}

ReplSet.prototype.canRead = function() {
  return Object.keys(this._state.secondaries).length > 0;
}

/**
 * @ignore
 */
ReplSet.prototype.setReadPreference = function(preference) {
  // Set read preference
  this.options.readPreference = preference;
  // Ensure slaveOk is correct for secondaries read preference and tags
  if((preference == ReadPreference.SECONDARY_PREFERRED 
    || preference == ReadPreference.SECONDARY
    || preference == ReadPreference.NEAREST)
    || (preference != null && typeof preference == 'object')) {
    this.options.slaveOk = true;
  }  
}

ReplSet.prototype.connect = function(parent, options, callback) {
  if(this._serverState != ReplSet.REPLSET_DISCONNECTED) 
    return callback(new Error("in process of connection"));

  // If no callback throw
  if(!(typeof callback == 'function')) 
    throw new Error("cannot call ReplSet.prototype.connect with no callback function");

  var self = this;
  // Save db reference
  this.options.db = parent;
  // Set replicaset as connecting
  this._serverState = ReplSet.REPLSET_CONNECTING
  // Copy all the servers to our list of seeds
  var candidateServers = this.servers.slice(0);
  // Pop the first server
  var server = candidateServers.pop();
  server.name = format("%s:%s", server.host, server.port);
  // Set up the options
  var opts = {
    returnIsMasterResults: true,
    eventReceiver: server
  }

  // Register some event listeners
  this.once("fullsetup", function(err, db, replset) {
    // console.log("++++++++++++++++++ fullsetup")
    // Set state to connected
    self._serverState = ReplSet.REPLSET_CONNECTED;
    // Start the HA process
    self._haProcess.start();
    // Finishing up the call
    callback(err, db, replset);   
  });

  // Errors
  this.once("connectionError", callback);

  // Attempt to connect to the server
  server.connect(this.options.db, opts, _connectHandler(this, candidateServers, server));
}

// ReplSet.prototype.reconnect = function(callback) {
//   // console.log("======================== RECONNECT")
// }

ReplSet.prototype.close = function(callback) {  
  if(typeof callback == 'function') 
    return callback(null, null);
}

/**
 * Creates a new server for the `replset` based on `host`.
 *
 * @param {String} host - host:port pair (localhost:27017)
 * @param {ReplSet} replset - the ReplSet instance
 * @return {Server}
 * @ignore
 */
var createServer = function(self, host, options) {
  // copy existing socket options to new server
  var socketOptions = {}
  if(options.socketOptions) {
    var keys = Object.keys(options.socketOptions);
    for(var k = 0; k < keys.length; k++) {
      socketOptions[keys[k]] = options.socketOptions[keys[k]];
    }
  }

  var parts = host.split(/:/);
  if(1 === parts.length) {
    parts[1] = Connection.DEFAULT_PORT;
  }

  socketOptions.host = parts[0];
  socketOptions.port = parseInt(parts[1], 10);

  var serverOptions = {
    readPreference: options._readPreference,
    socketOptions: socketOptions,
    poolSize: options.poolSize,
    logger: options.logger,
    auto_reconnect: false,
    ssl: options.ssl,
    sslValidate: options.sslValidate,
    sslCA: options.sslCA,
    sslCert: options.sslCert,
    sslKey: options.sslKey,
    sslPass: options.sslPass
  }

  var server = new Server(socketOptions.host, socketOptions.port, serverOptions);
  server._callBackStore = self._callBackStore;
  server.replicasetInstance = self;
  server.on("close", _handler("close", self, server));
  server.on("error", _handler("error", self, server));
  server.on("timeout", _handler("timeout", self, server));
  return server;
}

var _handler = function(event, self, server) {
  return function(err, doc) {
    // console.log("=============================== handler event :: " + event)
    // console.dir(server.name)
    // console.dir(self._state.master.name)
    // console.dir(self._state.isPrimary(server))
    // console.dir(self._state.isSecondary(server))

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
  }
}

var locateNewServers = function(self, state, candidateServers, ismaster) {
  // Retrieve the host
  var hosts = ismaster.hosts;
  // In candidate servers
  var inCandidateServers = function(name, candidateServers) {
    for(var i = 0; i < candidateServers.length; i++) {
      if(candidateServers[i].name == name) return true;
    }

    return false;
  }

  // New servers
  var newServers = [];
  // Let's go over all the hosts
  for(var i = 0; i < hosts.length; i++) {
    if(!state.contains(hosts[i]) 
      && !inCandidateServers(hosts[i], candidateServers)) {
        newServers.push(createServer(self, hosts[i], self.options));
    }
  }

  // Return list of possible new servers
  return newServers;
}

var _connectHandler = function(self, candidateServers, instanceServer) {
  return function(err, doc) {
    // If we have an error add to the list
    if(err) self._state.errors[instanceServer.name] = instanceServer;

    // No error let's analyse the ismaster command
    if(!err) {
      var ismaster = doc.documents[0]

      // If we have a member that is not part of the set let's finish up
      if(ismaster.setName != self.options.rs_name) {
        return self.emit("connectionError", new Error("Replicaset name " + ismaster.setName + " does not match specified name " + self.options.rs_name));
      }

      // Add the error handlers
      instanceServer.on("close", _handler("close", self, instanceServer));
      instanceServer.on("error", _handler("error", self, instanceServer));
      instanceServer.on("timeout", _handler("timeout", self, instanceServer));

      // Add the server to the list
      self._state.addServer(instanceServer, ismaster);

      // Get additional new servers that are not currently in set
      var new_servers = locateNewServers(self, self._state, candidateServers, ismaster);
      
      // If we have new servers join them
      if(new_servers.length > 0) {
        candidateServers = candidateServers.concat(new_servers);
      }
    }

    // If the candidate server list is empty and no valid servers
    if(candidateServers.length == 0 &&
      !self._state.hasValidServers()) {
        return self.emit("connectionError", new Error("No valid replicaset instance servers found"));
    } else {
      return self.emit("fullsetup", null, self.options.db, self);
    }
        
    // Let's connect the next server    
    var nextServer = candidateServers.pop();
  
    // Set up the options
    var opts = {
      returnIsMasterResults: true,
      eventReceiver: nextServer
    }

    // Attempt to connect to the server
    nextServer.connect(self.options.db, opts, _connectHandler(self, candidateServers, nextServer));
  }
}

ReplSet.prototype.isConnected = function(read) {
  var isConnected = false;  

  if(read == null || read == ReadPreference.PRIMARY || read == false)
    isConnected = this._state.master != null && this._state.master.isConnected();

  if((read == ReadPreference.PRIMARY_PREFERRED || read == ReadPreference.SECONDARY_PREFERRED || read == ReadPreference.NEAREST)
    && ((this._state.master != null && this._state.master.isConnected())
    || (this._state && this._state.secondaries && Object.keys(this._state.secondaries).length > 0))) {
      isConnected = true;
  } else if(read == ReadPreference.SECONDARY) {
    isConnected = this._state && this._state.secondaries && Object.keys(this._state.secondaries).length > 0;
  }

  // No valid connection return false
  return isConnected;
}

ReplSet.prototype.isMongos = function() {
  return false;
}

ReplSet.prototype.checkoutWriter = function() {
  // console.log("============================== checkoutWriter")
  if(this._state.master) return this._state.master.checkoutWriter();
  throw new Error("no writer connection available");
}

ReplSet.prototype.allRawConnections = function() {
  var connections = [];

  for(name in this._state.addresses) {
    connections = connections.concat(this._state.addresses[name].allRawConnections());
  }

  return connections;
}

/**
 * @ignore
 */
ReplSet.prototype.checkoutReader = function(readPreference, tags) {
  var connection = null;

  // If we have a read preference object unpack it
  if(typeof readPreference == 'object' && readPreference['_type'] == 'ReadPreference') {
    // Validate if the object is using a valid mode
    if(!readPreference.isValid()) throw new Error("Illegal readPreference mode specified, " + readPreference.mode);
    // Set the tag
    tags = readPreference.tags;
    readPreference = readPreference.mode;
  } else if(typeof readPreference == 'object' && readPreference['_type'] != 'ReadPreference') {
    throw new Error("read preferences must be either a string or an instance of ReadPreference");
  }

  // Set up our read Preference, allowing us to override the readPreference
  var finalReadPreference = readPreference != null ? readPreference : this.options.readPreference;
  finalReadPreference = finalReadPreference == true ? ReadPreference.SECONDARY_PREFERRED : finalReadPreference;
  finalReadPreference = finalReadPreference == null ? ReadPreference.PRIMARY : finalReadPreference;

  // If we are reading from a primary
  if(finalReadPreference == 'primary') {
    // If we provide a tags set send an error
    if(typeof tags == 'object' && tags != null) {
      throw new Error("PRIMARY cannot be combined with tags");
    }

    // If we provide a tags set send an error
    if(this._state.master == null) {
      throw new Error("No replica set primary available for query with ReadPreference PRIMARY");
    }

    // Checkout a writer
    return this.checkoutWriter();
  }

  // If we have specified to read from a secondary server grab a random one and read
  // from it, otherwise just pass the primary connection
  if((this.options.readSecondary || finalReadPreference == ReadPreference.SECONDARY_PREFERRED || finalReadPreference == ReadPreference.SECONDARY) && Object.keys(this._state.secondaries).length > 0) {
    // If we have tags, look for servers matching the specific tag
    if(this.strategyInstance != null) {
      // Only pick from secondaries
      var _secondaries = [];
      for(var key in this._state.secondaries) {
        _secondaries.push(this._state.secondaries[key]);
      }

      if(finalReadPreference == ReadPreference.SECONDARY) {
        // Check out the nearest from only the secondaries
        connection = this.strategyInstance.checkoutConnection(tags, _secondaries);
      } else {
        connection = this.strategyInstance.checkoutConnection(tags, _secondaries);
        // No candidate servers that match the tags, error
        if(connection == null || connection instanceof Error) {
          // No secondary server avilable, attemp to checkout a primary server
          connection = this.checkoutWriter();
          // If no connection return an error
          if(connection == null) {
            throw new Error("No replica set members available for query");
          }
        }
      }
    } else if(tags != null && typeof tags == 'object') {
      // Get connection
      connection = _pickFromTags(this, tags);// = function(self, readPreference, tags) {
      // No candidate servers that match the tags, error
      if(connection == null) {
        throw new Error("No replica set members available for query");
      }
    } else {
      connection = _roundRobin(this, tags);
    }
  } else if(finalReadPreference == ReadPreference.PRIMARY_PREFERRED) {
    // Check if there is a primary available and return that if possible
    connection = this.checkoutWriter();
    // If no connection available checkout a secondary
    if(connection == null) {
      // If we have tags, look for servers matching the specific tag
      if(tags != null && typeof tags == 'object') {
        // Get connection
        connection = _pickFromTags(this, tags);// = function(self, readPreference, tags) {
        // No candidate servers that match the tags, error
        if(connection == null) {
          throw new Error("No replica set members available for query");
        }
      } else {
        connection = _roundRobin(this, tags);
      }
    }
  } else if(finalReadPreference == ReadPreference.SECONDARY_PREFERRED) {
    // If we have tags, look for servers matching the specific tag
    if(this.strategyInstance != null) {
      connection = this.strategyInstance.checkoutConnection(tags);
      // No candidate servers that match the tags, error
      if(connection == null || connection instanceof Error) {
        // No secondary server avilable, attemp to checkout a primary server
        connection = this.checkoutWriter();
        // If no connection return an error
        if(connection == null) {
          var preferenceName = finalReadPreference == ReadPreference.SECONDARY ? 'secondary' : finalReadPreference;
          throw new Error("No replica set member available for query with ReadPreference " + preferenceName + " and tags " + JSON.stringify(tags));
        }
      }
    } else if(tags != null && typeof tags == 'object') {
      // Get connection
      connection = _pickFromTags(this, tags);// = function(self, readPreference, tags) {
      // No candidate servers that match the tags, error
      if(connection == null) {
        // No secondary server avilable, attemp to checkout a primary server
        connection = this.checkoutWriter();
        // If no connection return an error
        if(connection == null) {
          var preferenceName = finalReadPreference == ReadPreference.SECONDARY ? 'secondary' : finalReadPreference;
          throw new Error("No replica set member available for query with ReadPreference " + preferenceName + " and tags " + JSON.stringify(tags));
        }
      }
    }
  } else if(finalReadPreference == ReadPreference.NEAREST && this.strategyInstance != null) {
    connection = this.strategyInstance.checkoutConnection(tags);
  } else if(finalReadPreference == ReadPreference.NEAREST && this.strategyInstance == null) {
    throw new Error("A strategy for calculating nearness must be enabled such as ping or statistical");
  } else if(finalReadPreference == ReadPreference.SECONDARY && Object.keys(this._state.secondaries).length == 0) {
    if(tags != null && typeof tags == 'object') {
      var preferenceName = finalReadPreference == ReadPreference.SECONDARY ? 'secondary' : finalReadPreference;
      throw new Error("No replica set member available for query with ReadPreference " + preferenceName + " and tags " + JSON.stringify(tags));
    } else {
      throw new Error("No replica set secondary available for query with ReadPreference SECONDARY");
    }
  } else {
    connection = this.checkoutWriter();
  }

  // Return the connection
  return connection;
}

/**
 * @ignore
 */
var _pickFromTags = function(self, tags) {
  // If we have an array or single tag selection
  var tagObjects = Array.isArray(tags) ? tags : [tags];
  // Iterate over all tags until we find a candidate server
  for(var _i = 0; _i < tagObjects.length; _i++) {
    // Grab a tag object
    var tagObject = tagObjects[_i];
    // Matching keys
    var matchingKeys = Object.keys(tagObject);
    // Match all the servers that match the provdided tags
    var keys = Object.keys(self._state.secondaries);
    var candidateServers = [];

    for(var i = 0; i < keys.length; i++) {
      var server = self._state.secondaries[keys[i]];
      // If we have tags match
      if(server.tags != null) {
        var matching = true;
        // Ensure we have all the values
        for(var j = 0; j < matchingKeys.length; j++) {
          if(server.tags[matchingKeys[j]] != tagObject[matchingKeys[j]]) {
            matching = false;
            break;
          }
        }

        // If we have a match add it to the list of matching servers
        if(matching) {
          candidateServers.push(server);
        }
      }
    }

    // If we have a candidate server return
    if(candidateServers.length > 0) {
      if(self.strategyInstance) return self.strategyInstance.checkoutConnection(tags, candidateServers);
      // Set instance to return
      return candidateServers[Math.floor(Math.random() * candidateServers.length)].checkoutReader();
    }
  }

  // No connection found
  return null;
}

/**
 * Pick a secondary using round robin
 *
 * @ignore
 */
function _roundRobin (replset, tags) {
  var keys = Object.keys(replset._state.secondaries);
  var key = keys[replset._currentServerChoice++ % keys.length];

  var conn = null != replset._state.secondaries[key]
    ? replset._state.secondaries[key].checkoutReader()
    : null;

  // If connection is null fallback to first available secondary
  if (null == conn) {
    conn = pickFirstConnectedSecondary(replset, tags);
  }

  return conn;
}



// var ReadPreference = require('../read_preference').ReadPreference,
//   DbCommand = require('../../commands/db_command').DbCommand,
//   inherits = require('util').inherits,
//   format = require('util').format,
//   Server = require('../server').Server,
//   PingStrategy = require('./strategies/ping_strategy').PingStrategy,
//   StatisticsStrategy = require('./strategies/statistics_strategy').StatisticsStrategy,
//   Base = require('../base').Base;

// const STATE_STARTING_PHASE_1 = 0;
// const STATE_PRIMARY = 1;
// const STATE_SECONDARY = 2;
// const STATE_RECOVERING = 3;
// const STATE_FATAL_ERROR = 4;
// const STATE_STARTING_PHASE_2 = 5;
// const STATE_UNKNOWN = 6;
// const STATE_ARBITER = 7;
// const STATE_DOWN = 8;
// const STATE_ROLLBACK = 9;

// var Options = function(options) {
//   // console.dir(options)
//   // Unpack options
//   this._options = options || {};
//   this.ha = options.ha || true;
//   this.haInterval = options.haInterval || 2000;
//   this.reconnectWait = options.reconnectWait || 1000;
//   this.retries = options.retries || 30;
//   this.rs_name = options.rs_name;
//   this.socketOptions = options.socketOptions || {};
//   this.readPreference = options.readPreference;
//   this.readSecondary = options.read_secondary;
//   this.poolSize = options.poolSize == null ? 5 : options.poolSize;
//   this.strategy = options.strategy || 'ping';
//   this.secondaryAcceptableLatencyMS = options.secondaryAcceptableLatencyMS || 15;
//   this.connectArbiter = options.connectArbiter || false;
//   this.logger = options.logger;
//   this.ssl = options.ssl || false;
//   this.sslValidate = options.sslValidate || false;
//   this.sslCA = options.sslCA;
//   this.sslCert = options.sslCert;
//   this.sslKey = options.sslKey;
//   this.sslPass = options.sslPass;
// }

// Options.prototype.init = function() {
//   if(this.sslValidate && (!Array.isArray(this.sslCA) || this.sslCA.length == 0)) {
//     throw new Error("The driver expects an Array of CA certificates in the sslCA parameter when enabling sslValidate");
//   }  

//   // Make sure strategy is one of the two allowed
//   if(this.strategy != null && (this.strategy != 'ping' && this.strategy != 'statistical' && this.strategy != 'none')) 
//       throw new Error("Only ping or statistical strategies allowed");    
  
//   if(this.strategy == null) this.strategy = 'ping';
  
//   // Let's set up our strategy object for picking secodaries
//   if(this.strategy == 'ping') {
//     // Create a new instance
//     this.strategyInstance = new PingStrategy(this, this.secondaryAcceptableLatencyMS);
//   } else if(this.strategy == 'statistical') {
//     // Set strategy as statistical
//     this.strategyInstance = new StatisticsStrategy(this);
//     // Add enable query information
//     this.enableRecordQueryStats(true);
//   }

//   // Set logger if strategy exists
//   if(this.strategyInstance) this.strategyInstance.logger = this.logger;

//   // Unpack read Preference
//   var readPreference = this.readPreference;
//   // Validate correctness of Read preferences
//   if(readPreference != null) {
//     if(readPreference != ReadPreference.PRIMARY && readPreference != ReadPreference.PRIMARY_PREFERRED
//       && readPreference != ReadPreference.SECONDARY && readPreference != ReadPreference.SECONDARY_PREFERRED
//       && readPreference != ReadPreference.NEAREST && typeof readPreference != 'object' && readPreference['_type'] != 'ReadPreference') {
//       throw new Error("Illegal readPreference mode specified, " + readPreference);
//     }

//     this.readPreference = readPreference;
//   } else {
//     this.readPreference = null;
//   } 

//      // Ensure read_secondary is set correctly
//   if(this.readSecondary != null)
//     this.readSecondary = this.readPreference == ReadPreference.PRIMARY 
//         || this.readPreference == false  
//         || this.readPreference == null ? false : true;

//   // Ensure correct slave set
//   if(this.readSecondary) this.slaveOk = true;

//   // Set up logger if any set
//   this.logger = this.logger != null
//     && (typeof this.logger.debug == 'function')
//     && (typeof this.logger.error == 'function')
//     && (typeof this.logger.debug == 'function')
//       ? this.logger : {error:function(message, object) {}, log:function(message, object) {}, debug:function(message, object) {}};  

//   // Connection timeout
//   this.connectTimeoutMS = this.socketOptions.connectTimeoutMS
//     ? this.socketOptions.connectTimeoutMS
//     : 1000;

//   // Socket connection timeout
//   this.socketTimeoutMS = this.socketOptions.socketTimeoutMS
//     ? this.socketOptions.socketTimeoutMS
//     : (this.replicasetStatusCheckInterval + 1000);      
// }

// Options.prototype.decorateAndClean = function(servers, callBackStore) {
//   var self = this;

//   // var deduplicate list
//   var uniqueServers = {};
//   // De-duplicate any servers in the seed list
//   for(var i = 0; i < servers.length; i++) {
//     var server = servers[i];
//     // If server does not exist set it
//     if(uniqueServers[server.host + ":" + server.port] == null) {
//       uniqueServers[server.host + ":" + server.port] = server;
//     }
//   }

//   // Let's set the deduplicated list of servers
//   var finalServers = [];
//   // Add the servers
//   for(var key in uniqueServers) {
//     finalServers.push(uniqueServers[key]);
//   }

//   finalServers.forEach(function(server) {
//     // Ensure no server has reconnect on
//     server.options.auto_reconnect = false;
//     // Set up ssl options
//     server.ssl = self.ssl;
//     server.sslValidate = self.sslValidate;
//     server.sslCA = self.sslCA;
//     server.sslCert = self.sslCert;
//     server.sslKey = self.sslKey;
//     server.sslPass = self.sslPass;
//     server.poolSize = self.poolSize;
//     // Set callback store
//     server._callBackStore = callBackStore;
//   });

//   return finalServers;
// }

// /**
//  * Interval state object constructor
//  *
//  * @ignore
//  */
// ReplSetState = function ReplSetState () {
//   this.errorMessages = [];
//   this.secondaries = {};
//   this.addresses = {};
//   this.arbiters = {};
//   this.passives = {};
//   this.members = [];
//   this.errors = {};
//   this.setName = null;
//   this.master = null;
// }

// ReplSetState.prototype.hasValidServers = function() {
//   var validServers = [];
//   if(this.master && this.master.isConnected()) return true;

//   if(this.secondaries) {
//     var keys = Object.keys(this.secondaries)
//     for(var i = 0; i < keys.length; i++) {
//       if(this.secondaries[keys[i]].isConnected())
//         return true;
//     }
//   }

//   return false;
// }

// ReplSetState.prototype.addServer = function(server, master) {
//   server.name = master.me;
//   // console.log("======================== server.name :: " + server.name)

//   if(master.ismaster) {
//     this.master = server;
//     this.addresses[server.name] = server;
//   } else if(master.secondary) {
//     this.secondaries[server.name] = server;
//     this.addresses[server.name] = server;
//   } else if(master.arbiters) {
//     this.arbiters[server.name] = server;
//     this.addresses[server.name] = server;
//   }
// }

// ReplSetState.prototype.contains = function(host) {
//   // console.dir(Object.keys(this.addresses))
//   return this.addresses[host] != null;
// }

// ReplSetState.prototype.isPrimary = function(server) {
//   return this.master && this.master.name == server.name;
// }

// ReplSetState.prototype.isSecondary = function(server) {
//   return this._state.secondaries[server.name] != null;
// }

// /**
//  * ReplSet constructor provides replicaset functionality
//  *
//  * Options
//  *  - **ha** {Boolean, default:true}, turn on high availability.
//  *  - **haInterval** {Number, default:2000}, time between each replicaset status check.
//  *  - **reconnectWait** {Number, default:1000}, time to wait in miliseconds before attempting reconnect.
//  *  - **retries** {Number, default:30}, number of times to attempt a replicaset reconnect.
//  *  - **rs_name** {String}, the name of the replicaset to connect to.
//  *  - **socketOptions** {Object, default:null}, an object containing socket options to use (noDelay:(boolean), keepAlive:(number), connectTimeoutMS:(number), socketTimeoutMS:(number))
//  *  - **readPreference** {String}, the prefered read preference (ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST).
//  *  - **strategy** {String, default:'ping'}, selection strategy for reads choose between (ping, statistical and none, default is ping)
//  *  - **secondaryAcceptableLatencyMS** {Number, default:15}, sets the range of servers to pick when using NEAREST (lowest ping ms + the latency fence, ex: range of 1 to (1 + 15) ms)
//  *  - **connectArbiter** {Boolean, default:false}, sets if the driver should connect to arbiters or not.
//  *  - **logger** {Object, default:null}, an object representing a logger that you want to use, needs to support functions debug, log, error **({error:function(message, object) {}, log:function(message, object) {}, debug:function(message, object) {}})**.
//  *  - **ssl** {Boolean, default:false}, use ssl connection (needs to have a mongod server with ssl support)
//  *  - **sslValidate** {Boolean, default:false}, validate mongod server certificate against ca (needs to have a mongod server with ssl support, 2.4 or higher)
//  *  - **sslCA** {Array, default:null}, Array of valid certificates either as Buffers or Strings (needs to have a mongod server with ssl support, 2.4 or higher)
//  *  - **sslCert** {Buffer/String, default:null}, String or buffer containing the certificate we wish to present (needs to have a mongod server with ssl support, 2.4 or higher)
//  *  - **sslKey** {Buffer/String, default:null}, String or buffer containing the certificate private key we wish to present (needs to have a mongod server with ssl support, 2.4 or higher)
//  *  - **sslPass** {Buffer/String, default:null}, String or buffer containing the certificate password (needs to have a mongod server with ssl support, 2.4 or higher)
//  *
//  * @class Represents a Replicaset Configuration
//  * @param {Array} list of server objects participating in the replicaset.
//  * @param {Object} [options] additional options for the replicaset connection.
//  */
// var ReplSet = exports.ReplSet = function(servers, options) {
//   // Set up basic
//   if(!(this instanceof ReplSet))
//     return new ReplSet(servers, options);

//   // Set up event emitter
//   Base.call(this);

//   // Ensure we have a list of servers
//   if(!Array.isArray(servers)) throw Error("The parameter must be an array of servers and contain at least one server");
//   // Ensure no Mongos's
//   for(var i = 0; i < servers.length; i++) {
//     if(!(servers[i] instanceof Server)) throw new Error("list of servers must be of type Server");
//   }

//   // Save the options
//   this.options = new Options(options);
//   // Ensure basic validation of options
//   this.options.init();
//   // Server state
//   this._serverState = ReplSet.REPLSET_DISCONNECTED;

//   // Let's iterate over all the provided server objects and decorate them
//   this.servers = this.options.decorateAndClean(servers, this._callBackStore);
//   // Throw error if no seed servers
//   if(this.servers.length == 0) throw new Error("No valid seed servers in the array");
//   // Set up a clean state
//   this._state = new ReplSetState();  
// }

// /**
//  * @ignore
//  */
// inherits(ReplSet, Base);

// // Replicaset states
// ReplSet.REPLSET_CONNECTING = 'connecting';
// ReplSet.REPLSET_DISCONNECTED = 'disconnected';
// ReplSet.REPLSET_CONNECTED = 'connected';
// ReplSet.REPLSET_RECONNECTING = 'reconnecting';
// ReplSet.REPLSET_DESTROYED = 'destroyed';
// ReplSet.REPLSET_READ_ONLY = 'readonly';

// ReplSet.prototype.isAutoReconnect = function() {
//   return true;
// }

// ReplSet.prototype.canWrite = function() {
//   return this._state.master && this._state.master.isConnected();
// }

// ReplSet.prototype.canRead = function() {
//   return Object.keys(this._state.secondaries).length > 0;
// }

// /**
//  * @ignore
//  */
// ReplSet.prototype.setReadPreference = function(preference) {
//   // Set read preference
//   this.options.readPreference = preference;
//   // Ensure slaveOk is correct for secondaries read preference and tags
//   if((preference == ReadPreference.SECONDARY_PREFERRED 
//     || preference == ReadPreference.SECONDARY
//     || preference == ReadPreference.NEAREST)
//     || (preference != null && typeof preference == 'object')) {
//     this.options.slaveOk = true;
//   }  
// }

// ReplSet.prototype.connect = function(parent, options, callback) {
//   // console.log("======================== CONNECT")
//   if(this._serverState != ReplSet.REPLSET_DISCONNECTED) 
//     return callback(new Error("in process of connection"));

//   // If no callback throw
//   if(!(typeof callback == 'function')) 
//     throw new Error("cannot call ReplSet.prototype.connect with no callback function");

//   var self = this;
//   // Save db reference
//   this.options.db = parent;
//   // Set replicaset as connecting
//   this._serverState = ReplSet.REPLSET_CONNECTING
//   // Copy all the servers to our list of seeds
//   var candidateServers = this.servers.slice(0);
//   // Pop the first server
//   var server = candidateServers.pop();
//   // Set up the options
//   var opts = {
//     returnIsMasterResults: true,
//     eventReceiver: server
//   }

//   // Register some event listeners
//   this.once("fullsetup", function(err, db, replset) {
//     self._serverState = ReplSet.REPLSET_CONNECTED;
//     callback(err, db, replset);   
//   });
//   // Errors
//   this.once("connectionError", callback);

//   // Attempt to connect to the server
//   server.connect(this.options.db, opts, _connectHandler(this, candidateServers, server));
// }

// // ReplSet.prototype.reconnect = function(callback) {
// //   // console.log("======================== RECONNECT")
// // }

// ReplSet.prototype.close = function(callback) {  
//   if(typeof callback == 'function') 
//     return callback(null, null);
// }

// /**
//  * Creates a new server for the `replset` based on `host`.
//  *
//  * @param {String} host - host:port pair (localhost:27017)
//  * @param {ReplSet} replset - the ReplSet instance
//  * @return {Server}
//  * @ignore
//  */
// var createServer = function(self, host, options) {
//   // copy existing socket options to new server
//   var socketOptions = {}
//   if(options.socketOptions) {
//     var keys = Object.keys(options.socketOptions);
//     for(var k = 0; k < keys.length; k++) {
//       socketOptions[keys[k]] = options.socketOptions[keys[k]];
//     }
//   }

//   var parts = host.split(/:/);
//   if(1 === parts.length) {
//     parts[1] = Connection.DEFAULT_PORT;
//   }

//   socketOptions.host = parts[0];
//   socketOptions.port = parseInt(parts[1], 10);

//   var serverOptions = {
//     readPreference: options._readPreference,
//     socketOptions: socketOptions,
//     poolSize: options.poolSize,
//     logger: options.logger,
//     auto_reconnect: false,
//     ssl: options.ssl,
//     sslValidate: options.sslValidate,
//     sslCA: options.sslCA,
//     sslCert: options.sslCert,
//     sslKey: options.sslKey,
//     sslPass: options.sslPass
//   }

//   var server = new Server(socketOptions.host, socketOptions.port, serverOptions);
//   server._callBackStore = self._callBackStore;
//   server.replicasetInstance = self;
//   server.on("close", _handler("close", self, server));
//   server.on("error", _handler("error", self, server));
//   server.on("timeout", _handler("timeout", self, server));
//   return server;
// }

// var _handler = function(event, self, server) {
//   return function(err, doc) {
//     // console.log("=============================== handler event :: " + event)
//     // console.dir(server.name)
//     // console.dir(self._state.master.name)
//     // console.dir(self._state.isPrimary(server))
//     // console.dir(self._state.isSecondary(server))

//     // The event happened to a primary
//     // Remove it from play
//     if(self._state.isPrimary(server)) {
//       self._state.master == null;
//       self._serverState = ReplSet.REPLSET_READ_ONLY;
//       delete self._state.addresses[server.name];
//     } else if(self._state.isSecondary(server)) {
//       delete self._state.secondaries[server.name];
//       delete self._state.addresses[server.name];
//     }
//   }
// }

// var locateNewServers = function(self, state, candidateServers, ismaster) {
//   // Retrieve the host
//   var hosts = ismaster.hosts;
//   // In candidate servers
//   var inCandidateServers = function(name, candidateServers) {
//     for(var i = 0; i < candidateServers.length; i++) {
//       if(candidateServers[i].name == name) return true;
//     }

//     return false;
//   }

//   // New servers
//   var newServers = [];
//   // Let's go over all the hosts
//   for(var i = 0; i < hosts.length; i++) {
//     if(!state.contains(hosts[i]) 
//       && !inCandidateServers(hosts[i], candidateServers)) {
//         newServers.push(createServer(self, hosts[i], self.options));
//     }
//   }

//   // Return list of possible new servers
//   return newServers;
// }

// var _connectHandler = function(self, candidateServers, instanceServer) {
//   return function(err, doc) {
//     // If we have an error add to the list
//     if(err) self._state.errors[instanceServer.name] = instanceServer;

//     // No error let's analyse the ismaster command
//     if(!err) {
//       var ismaster = doc.documents[0]

//       // If we have a member that is not part of the set let's finish up
//       if(ismaster.setName != self.options.rs_name) {
//         return self.emit("connectionError", new Error("Replicaset name " + ismaster.setName + " does not match specified name " + self.options.rs_name));
//       }

//       // Add the error handlers
//       instanceServer.on("close", _handler("close", self, instanceServer));
//       instanceServer.on("error", _handler("error", self, instanceServer));
//       instanceServer.on("timeout", _handler("timeout", self, instanceServer));

//       // Add the server to the list
//       self._state.addServer(instanceServer, ismaster);

//       // Get additional new servers that are not currently in set
//       var new_servers = locateNewServers(self, self._state, candidateServers, ismaster);
      
//       // If we have new servers join them
//       if(new_servers.length > 0) {
//         candidateServers = candidateServers.concat(new_servers);
//       }
//     }

//     // If the candidate server list is empty and no valid servers
//     if(candidateServers.length == 0 &&
//       !self._state.hasValidServers()) {
//         return self.emit("connectionError", new Error("No valid replicaset instance servers found"));
//     } else {
//       return self.emit("fullsetup", null, self.options.db, self);
//     }
        
//     // Let's connect the next server    
//     var nextServer = candidateServers.pop();
  
//     // Set up the options
//     var opts = {
//       returnIsMasterResults: true,
//       eventReceiver: nextServer
//     }

//     // Attempt to connect to the server
//     nextServer.connect(self.options.db, opts, _connectHandler(self, candidateServers, nextServer));
//   }
// }

// ReplSet.prototype.isConnected = function(read) {
//   var isConnected = false;  

//   if(read == null || read == ReadPreference.PRIMARY || read == false)
//     isConnected = this._state.master != null && this._state.master.isConnected();

//   if((read == ReadPreference.PRIMARY_PREFERRED || read == ReadPreference.SECONDARY_PREFERRED || read == ReadPreference.NEAREST)
//     && ((this._state.master != null && this._state.master.isConnected())
//     || (this._state && this._state.secondaries && Object.keys(this._state.secondaries).length > 0))) {
//       isConnected = true;
//   } else if(read == ReadPreference.SECONDARY) {
//     isConnected = this._state && this._state.secondaries && Object.keys(this._state.secondaries).length > 0;
//   }

//   // No valid connection return false
//   return isConnected;
// }

// ReplSet.prototype.isMongos = function() {
//   return false;
// }

// ReplSet.prototype.checkoutWriter = function() {
//   // console.log("============================== checkoutWriter")
//   if(this._state.master) return this._state.master.checkoutWriter();
//   throw new Error("no writer connection available");
// }

// ReplSet.prototype.allRawConnections = function() {
//   var connections = [];

//   for(name in this._state.addresses) {
//     connections = connections.concat(this._state.addresses[name].allRawConnections());
//   }

//   return connections;
// }

// /**
//  * @ignore
//  */
// ReplSet.prototype.checkoutReader = function(readPreference, tags) {
//   var connection = null;

//   // If we have a read preference object unpack it
//   if(typeof readPreference == 'object' && readPreference['_type'] == 'ReadPreference') {
//     // Validate if the object is using a valid mode
//     if(!readPreference.isValid()) throw new Error("Illegal readPreference mode specified, " + readPreference.mode);
//     // Set the tag
//     tags = readPreference.tags;
//     readPreference = readPreference.mode;
//   } else if(typeof readPreference == 'object' && readPreference['_type'] != 'ReadPreference') {
//     throw new Error("read preferences must be either a string or an instance of ReadPreference");
//   }

//   // Set up our read Preference, allowing us to override the readPreference
//   var finalReadPreference = readPreference != null ? readPreference : this.options.readPreference;
//   finalReadPreference = finalReadPreference == true ? ReadPreference.SECONDARY_PREFERRED : finalReadPreference;
//   finalReadPreference = finalReadPreference == null ? ReadPreference.PRIMARY : finalReadPreference;

//   // If we are reading from a primary
//   if(finalReadPreference == 'primary') {
//     // If we provide a tags set send an error
//     if(typeof tags == 'object' && tags != null) {
//       throw new Error("PRIMARY cannot be combined with tags");
//     }

//     // If we provide a tags set send an error
//     if(this._state.master == null) {
//       throw new Error("No replica set primary available for query with ReadPreference PRIMARY");
//     }

//     // Checkout a writer
//     return this.checkoutWriter();
//   }

//   // If we have specified to read from a secondary server grab a random one and read
//   // from it, otherwise just pass the primary connection
//   if((this.options.readSecondary || finalReadPreference == ReadPreference.SECONDARY_PREFERRED || finalReadPreference == ReadPreference.SECONDARY) && Object.keys(this._state.secondaries).length > 0) {
//     // If we have tags, look for servers matching the specific tag
//     if(this.strategyInstance != null) {
//       // Only pick from secondaries
//       var _secondaries = [];
//       for(var key in this._state.secondaries) {
//         _secondaries.push(this._state.secondaries[key]);
//       }

//       if(finalReadPreference == ReadPreference.SECONDARY) {
//         // Check out the nearest from only the secondaries
//         connection = this.strategyInstance.checkoutConnection(tags, _secondaries);
//       } else {
//         connection = this.strategyInstance.checkoutConnection(tags, _secondaries);
//         // No candidate servers that match the tags, error
//         if(connection == null || connection instanceof Error) {
//           // No secondary server avilable, attemp to checkout a primary server
//           connection = this.checkoutWriter();
//           // If no connection return an error
//           if(connection == null) {
//             throw new Error("No replica set members available for query");
//           }
//         }
//       }
//     } else if(tags != null && typeof tags == 'object') {
//       // Get connection
//       connection = _pickFromTags(this, tags);// = function(self, readPreference, tags) {
//       // No candidate servers that match the tags, error
//       if(connection == null) {
//         throw new Error("No replica set members available for query");
//       }
//     } else {
//       connection = _roundRobin(this, tags);
//     }
//   } else if(finalReadPreference == ReadPreference.PRIMARY_PREFERRED) {
//     // Check if there is a primary available and return that if possible
//     connection = this.checkoutWriter();
//     // If no connection available checkout a secondary
//     if(connection == null) {
//       // If we have tags, look for servers matching the specific tag
//       if(tags != null && typeof tags == 'object') {
//         // Get connection
//         connection = _pickFromTags(this, tags);// = function(self, readPreference, tags) {
//         // No candidate servers that match the tags, error
//         if(connection == null) {
//           throw new Error("No replica set members available for query");
//         }
//       } else {
//         connection = _roundRobin(this, tags);
//       }
//     }
//   } else if(finalReadPreference == ReadPreference.SECONDARY_PREFERRED) {
//     // If we have tags, look for servers matching the specific tag
//     if(this.strategyInstance != null) {
//       connection = this.strategyInstance.checkoutConnection(tags);
//       // No candidate servers that match the tags, error
//       if(connection == null || connection instanceof Error) {
//         // No secondary server avilable, attemp to checkout a primary server
//         connection = this.checkoutWriter();
//         // If no connection return an error
//         if(connection == null) {
//           var preferenceName = finalReadPreference == ReadPreference.SECONDARY ? 'secondary' : finalReadPreference;
//           throw new Error("No replica set member available for query with ReadPreference " + preferenceName + " and tags " + JSON.stringify(tags));
//         }
//       }
//     } else if(tags != null && typeof tags == 'object') {
//       // Get connection
//       connection = _pickFromTags(this, tags);// = function(self, readPreference, tags) {
//       // No candidate servers that match the tags, error
//       if(connection == null) {
//         // No secondary server avilable, attemp to checkout a primary server
//         connection = this.checkoutWriter();
//         // If no connection return an error
//         if(connection == null) {
//           var preferenceName = finalReadPreference == ReadPreference.SECONDARY ? 'secondary' : finalReadPreference;
//           throw new Error("No replica set member available for query with ReadPreference " + preferenceName + " and tags " + JSON.stringify(tags));
//         }
//       }
//     }
//   } else if(finalReadPreference == ReadPreference.NEAREST && this.strategyInstance != null) {
//     connection = this.strategyInstance.checkoutConnection(tags);
//   } else if(finalReadPreference == ReadPreference.NEAREST && this.strategyInstance == null) {
//     throw new Error("A strategy for calculating nearness must be enabled such as ping or statistical");
//   } else if(finalReadPreference == ReadPreference.SECONDARY && Object.keys(this._state.secondaries).length == 0) {
//     if(tags != null && typeof tags == 'object') {
//       var preferenceName = finalReadPreference == ReadPreference.SECONDARY ? 'secondary' : finalReadPreference;
//       throw new Error("No replica set member available for query with ReadPreference " + preferenceName + " and tags " + JSON.stringify(tags));
//     } else {
//       throw new Error("No replica set secondary available for query with ReadPreference SECONDARY");
//     }
//   } else {
//     connection = this.checkoutWriter();
//   }

//   // Return the connection
//   return connection;
// }

// /**
//  * @ignore
//  */
// var _pickFromTags = function(self, tags) {
//   // If we have an array or single tag selection
//   var tagObjects = Array.isArray(tags) ? tags : [tags];
//   // Iterate over all tags until we find a candidate server
//   for(var _i = 0; _i < tagObjects.length; _i++) {
//     // Grab a tag object
//     var tagObject = tagObjects[_i];
//     // Matching keys
//     var matchingKeys = Object.keys(tagObject);
//     // Match all the servers that match the provdided tags
//     var keys = Object.keys(self._state.secondaries);
//     var candidateServers = [];

//     for(var i = 0; i < keys.length; i++) {
//       var server = self._state.secondaries[keys[i]];
//       // If we have tags match
//       if(server.tags != null) {
//         var matching = true;
//         // Ensure we have all the values
//         for(var j = 0; j < matchingKeys.length; j++) {
//           if(server.tags[matchingKeys[j]] != tagObject[matchingKeys[j]]) {
//             matching = false;
//             break;
//           }
//         }

//         // If we have a match add it to the list of matching servers
//         if(matching) {
//           candidateServers.push(server);
//         }
//       }
//     }

//     // If we have a candidate server return
//     if(candidateServers.length > 0) {
//       if(self.strategyInstance) return self.strategyInstance.checkoutConnection(tags, candidateServers);
//       // Set instance to return
//       return candidateServers[Math.floor(Math.random() * candidateServers.length)].checkoutReader();
//     }
//   }

//   // No connection found
//   return null;
// }

// /**
//  * Pick a secondary using round robin
//  *
//  * @ignore
//  */
// function _roundRobin (replset, tags) {
//   var keys = Object.keys(replset._state.secondaries);
//   var key = keys[replset._currentServerChoice++ % keys.length];

//   var conn = null != replset._state.secondaries[key]
//     ? replset._state.secondaries[key].checkoutReader()
//     : null;

//   // If connection is null fallback to first available secondary
//   if (null == conn) {
//     conn = pickFirstConnectedSecondary(replset, tags);
//   }

//   return conn;
// }

