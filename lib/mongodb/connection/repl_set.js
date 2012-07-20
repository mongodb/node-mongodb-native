var Connection = require('./connection').Connection,
  ReadPreference = require('./read_preference').ReadPreference,
  DbCommand = require('../commands/db_command').DbCommand,
  MongoReply = require('../responses/mongo_reply').MongoReply,
  debug = require('util').debug,
  EventEmitter = require('events').EventEmitter,
  inherits = require('util').inherits,
  inspect = require('util').inspect,
  Server = require('./server').Server,
  PingStrategy = require('./strategies/ping_strategy').PingStrategy,
  StatisticsStrategy = require('./strategies/statistics_strategy').StatisticsStrategy;

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
 *  - **strategy** {String, default:null}, selection strategy for reads choose between (ping and statistical, default is round-robin)
 *  - **secondaryAcceptableLatencyMS** {Number, default:15}, sets the range of servers to pick when using NEAREST (lowest ping ms + the latency fence, ex: range of 1 to (1 + 15) ms)
 *
 * @class Represents a Replicaset Configuration
 * @param {Array} list of server objects participating in the replicaset.
 * @param {Object} [options] additional options for the replicaset connection.
 */
var ReplSet = exports.ReplSet = function(servers, options) {
  this.count = 0;

  // Set up basic
  if(!(this instanceof ReplSet))
    return new ReplSet(servers, options);

  // Set up event emitter
  EventEmitter.call(this);

  // Ensure no Mongos's
  for(var i = 0; i < servers.length; i++) {
    if(!(servers[i] instanceof Server)) throw new Error("list of servers must be of type Server");
  }

  // Just reference for simplicity
  var self = this;
  // Contains the master server entry
  this.options = options == null ? {} : options;
  this.reconnectWait = this.options["reconnectWait"] != null ? this.options["reconnectWait"] : 1000;
  this.retries = this.options["retries"] != null ? this.options["retries"] : 30;
  this.replicaSet = this.options["rs_name"];

  // Are we allowing reads from secondaries ?
  this.readSecondary = this.options["read_secondary"];
  this.slaveOk = true;
  this.closedConnectionCount = 0;
  this._used = false;

  // Default poolSize for new server instances
  this.poolSize = this.options.poolSize == null ? 5 : this.options.poolSize;
  this._currentServerChoice = 0;

  // Set up ssl connections
  this.ssl = this.options.ssl == null ? false : this.options.ssl;

  // Just keeps list of events we allow
  this.eventHandlers = {error:[], parseError:[], poolReady:[], message:[], close:[], timeout:[]};
  // Internal state of server connection
  this._serverState = 'disconnected';
  // Read preference
  this._readPreference = null;
  // Number of initalized severs
  this._numberOfServersLeftToInitialize = 0;
  // Do we record server stats or not
  this.recordQueryStats = false;

  // Get the readPreference
  var readPreference = this.options['readPreference'];

  // Validate correctness of Read preferences
  if(readPreference != null) {
    if(readPreference != ReadPreference.PRIMARY && readPreference != ReadPreference.PRIMARY_PREFERRED
      && readPreference != ReadPreference.SECONDARY && readPreference != ReadPreference.SECONDARY_PREFERRED
      && readPreference != ReadPreference.NEAREST && typeof readPreference != 'object' && readPreference['_type'] != 'ReadPreference') {
      throw new Error("Illegal readPreference mode specified, " + readPreference);
    }

    this._readPreference = readPreference;
  } else {
    this._readPreference = null;
  }

  // Strategy for picking a secondary
  this.secondaryAcceptableLatencyMS = this.options['secondaryAcceptableLatencyMS'] == null ? 15 : this.options['secondaryAcceptableLatencyMS'];
  this.strategy = this.options['strategy'];
  // Make sure strategy is one of the two allowed
  if(this.strategy != null && (this.strategy != 'ping' && this.strategy != 'statistical')) throw new Error("Only ping or statistical strategies allowed");
  // Let's set up our strategy object for picking secodaries
  if(this.strategy == 'ping') {
    // Create a new instance
    this.strategyInstance = new PingStrategy(this, this.secondaryAcceptableLatencyMS);
  } else if(this.strategy == 'statistical') {
    // Set strategy as statistical
    this.strategyInstance = new StatisticsStrategy(this);
    // Add enable query information
    this.enableRecordQueryStats(true);
  }

  // Set default connection pool options
  this.socketOptions = this.options.socketOptions != null ? this.options.socketOptions : {};

  // Set up logger if any set
  this.logger = this.options.logger != null
    && (typeof this.options.logger.debug == 'function')
    && (typeof this.options.logger.error == 'function')
    && (typeof this.options.logger.debug == 'function')
      ? this.options.logger : {error:function(message, object) {}, log:function(message, object) {}, debug:function(message, object) {}};

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

  // Enabled ha
  this.haEnabled = this.options['ha'] == null ? true : this.options['ha'];
  // How often are we checking for new servers in the replicaset
  this.replicasetStatusCheckInterval = this.options['haInterval'] == null ? 1000 : this.options['haInterval'];
  this._replicasetTimeoutId = null;
  // Connection timeout
  this._connectTimeoutMS = 1000;
  // Current list of servers to test
  this.pingCandidateServers = [];

  // Last replicaset check time
  this.lastReplicaSetTime = new Date().getTime();
};

/**
 * @ignore
 */
inherits(ReplSet, EventEmitter);

/**
 * @ignore
 */
// Allow setting the read preference at the replicaset level
ReplSet.prototype.setReadPreference = function(preference) {
  // Set read preference
  this._readPreference = preference;
  // Ensure slaveOk is correct for secodnaries read preference and tags
  if((this._readPreference == ReadPreference.SECONDARY_PREFERRED || this._readPreference == ReadPreference.SECONDARY)
    || (this._readPreference != null && typeof this._readPreference == 'object')) {
    this.slaveOk = true;
  }
}

/**
 * Return the used state
 * @ignore
 */
ReplSet.prototype._isUsed = function() {
  return this._used;
}

/**
 * @ignore
 */
ReplSet.prototype.isMongos = function() {
  return false;
}

/**
 * @ignore
 */
ReplSet.prototype.isConnected = function() {
  // Return the state of the replicaset server
  return this.primary != null && this._state.master != null && this._state.master.isConnected();
}

/**
 * @ignore
 */
ReplSet.prototype.isSetMember = function() {
  return false;
}

/**
 * @ignore
 */
ReplSet.prototype.isPrimary = function(config) {
  return this.readSecondary && Object.keys(this._state.secondaries).length > 0 ? false : true;
}

/**
 * @ignore
 */
ReplSet.prototype.isReadPrimary = ReplSet.prototype.isPrimary;

/**
 * @ignore
 * @private
 **/
ReplSet.prototype._checkReplicaSet = function() {
  if(!this.haEnabled) return false;
  var currentTime = new Date().getTime();
  if((currentTime - this.lastReplicaSetTime) >= this.replicasetStatusCheckInterval) {
    this.lastReplicaSetTime = currentTime;
    return true;
  } else {
    return false;
  }
}

/**
 * @ignore
 */
ReplSet.prototype.allServerInstances = function() {
  var self = this;
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

/**
 * @ignore
 */
var __executeAllCallbacksWithError = function(dbInstance, error) {
  var keys = Object.keys(dbInstance._callBackStore._notReplied);
  // Iterate over all callbacks
  for(var i = 0; i < keys.length; i++) {
    // Delete info object
    delete dbInstance._callBackStore._notReplied[keys[i]];
    // Emit the error
    dbInstance._callBackStore.emit(keys[i], error);
  }
}

/**
 * @ignore
 * @private
 */
ReplSet.prototype._validateReplicaset = function(result, auths) {
  var self = this;
  // For each member we need to check if we have a new connection that needs to be established
  var members = result['documents'][0]['members'];
  // Get members
  var members = Array.isArray(result['documents'][0]['members']) ? result['documents'][0]['members'] : [];
  // The total members we check
  var serversToConnectList = {};

  // Iterate over all the members and see if we need to reconnect
  for(var i = 0, jlen = members.length; i < jlen; i++) {
    var member = members[i];

    if(member['health'] != 0
      && null == self._state['addresses'][member['name']]
      && null == serversToConnectList[member['name']]) {
      // Split the server string
      var parts = member.name.split(/:/);
      if(parts.length == 1) {
        parts = [parts[0], Connection.DEFAULT_PORT];
      }

      // Default empty socket options object
      var socketOptions = {host:parts[0], port:parseInt(parts[1], 10)};
      // If a socket option object exists clone it
      if(self.socketOptions != null) {
        var keys = Object.keys(self.socketOptions);
        for(var k = 0; k < keys.length;k++) socketOptions[keys[i]] = self.socketOptions[keys[i]];
      }

      // Create a new server instance
      var newServer = new Server(parts[0], parseInt(parts[1], 10), {auto_reconnect:false, 'socketOptions':socketOptions
                      , logger:self.logger, ssl:self.ssl, poolSize:self.poolSize});
      // Set the replicaset instance
      newServer.replicasetInstance = self;

      // Add handlers
      newServer.on("close", self.closeHandler);
      newServer.on("timeout", self.timeoutHandler);
      newServer.on("error", self.errorHandler);
      // Add to list of server connection target
      serversToConnectList[member['name']] = newServer;
    } else if(member['stateStr'] == 'PRIMARY' && self._state.master['name'] != member['name']) {
      // Delete master record so we can rediscover it
      delete self._state['addresses'][self._state.master['name']];
      // Update inormation on new primary
      var newMaster = self._state.addresses[member['name']];
      newMaster.isMasterDoc.ismaster = true;
      newMaster.isMasterDoc.secondary = false;
      self._state.master = newMaster;
      // Remove from secondaries
      delete self._state.secondaries[member['name']];
      newMaster = null;
    }
  }

  // All servers we want to connect to
  var serverKeys = Object.keys(serversToConnectList);
  // For all remaining servers on the list connect
  while(serverKeys.length > 0) {
    var _serverKey = serverKeys.pop();
    // Fetch the server
    var _server = serversToConnectList[_serverKey];
    // Add a new server to the total number of servers that need to initialized before we are done
    var newServerCallback = self.connectionHandler(_server);
    // Connect To the new server
    _server.connect(self.db, {returnIsMasterResults: true, eventReceiver:newServer}, function(err, result, _server) {
      if(err == null && result != null) {
        // Fetch the myState
        var document = result.documents[0];
        // Remove from list until
        if(document.ismaster || document.secondary || document.arbiterOnly) {
          process.nextTick(function() {
            // Apply any auths
            if(Array.isArray(auths) && auths.length > 0) {
              // Get number of auths we need to execute
              var numberOfAuths = auths.length;
              // Apply all auths
              for(var i = 0; i < auths.length; i++) {
                self.db.authenticate(auths[i].username, auths[i].password, {'authdb':auths[i].authdb}, function(err, authenticated) {
                  numberOfAuths = numberOfAuths - 1;
                  // If we have no more authentications to replay
                  if(numberOfAuths == 0) {
                    newServerCallback(err, result, _server);
                  }
                });
              }
            } else {
              newServerCallback(err, result, _server);
            }
          });
        } else {
          _server.close();
        }
      } else {
        _server.close();
      }
    });
  }
}

/**
 * @ignore
 */
ReplSet.prototype.connect = function(parent, options, callback) {
  var self = this;
  var dateStamp = new Date().getTime();
  if('function' === typeof options) callback = options, options = {};
  if(options == null) options = {};
  if(!('function' === typeof callback)) callback = null;

  // Keep reference to parent
  this.db = parent;
  // Set server state to connecting
  this._serverState = 'connecting';
  // Reference to the instance
  var replSetSelf = this;
  var serverConnections = this.servers;
  // Ensure parent can do a slave query if it's set
  parent.slaveOk = this.slaveOk ? this.slaveOk : parent.slaveOk;
  // Number of total servers that need to initialized (known servers)
  this._numberOfServersLeftToInitialize = serverConnections.length;

  // Clean up state
  replSetSelf._state = {'master':null, 'secondaries':{}, 'arbiters':{}, 'passives':{}
    , 'errors':{}, 'addresses':{}, 'setName':null, 'errorMessages':[], 'members':[]};

  // Create a connection handler
  self.connectionHandler = function(instanceServer) {
    return function(err, result) {
      self.count = self.count + 1;

      // If we found a master call it at the end
      var masterCallback = null;

      // Remove a server from the list of intialized servers we need to perform
      self._numberOfServersLeftToInitialize = self._numberOfServersLeftToInitialize - 1;

      if(err != null) {
        self._state.errors[instanceServer.name] = instanceServer;
      }

      // Add enable query information
      instanceServer.enableRecordQueryStats(replSetSelf.recordQueryStats);

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
        var tags = document.tags ? document.tags : {};
        var primary = document.primary;

        // Ensure we are keying on the same name for lookups as mongodb might return
        // dns name and the driver is using ip's
        // Rename the connection so we are keying on the name used by mongod
        var userProvidedServerString = instanceServer.host + ":" + instanceServer.port;
        var me = document.me || userProvidedServerString;

        // If we have user provided entries already, switch them to avoid additional
        // open connections
        if(replSetSelf._state['addresses'][userProvidedServerString]) {
          // Fetch server
          var server = replSetSelf._state['addresses'][userProvidedServerString];
          // Remove entry
          delete replSetSelf._state['addresses'][userProvidedServerString];
          // Remove other entries
          if(replSetSelf._state['secondaries'][userProvidedServerString]) {
            delete replSetSelf._state['secondaries'][userProvidedServerString];
            replSetSelf._state['secondaries'][me] = server;
          } else if(replSetSelf._state['passives'][userProvidedServerString]) {
            delete replSetSelf._state['passives'][userProvidedServerString];
            replSetSelf._state['passives'][me] = server;
          } else if(replSetSelf._state['arbiters'][userProvidedServerString]) {
            delete replSetSelf._state['arbiters'][userProvidedServerString];
            replSetSelf._state['arbiters'][me] = server;
          }

          // Set name of the server
          server.name = me;
          // Add the existing one to the replicaset list of addresses
          replSetSelf._state['addresses'][me] = server;
        } else {
          instanceServer.name = me;
        }

        // Only add server to our internal list if it's a master, secondary or arbiter
        if(isMaster == true || secondary == true || arbiterOnly == true) {
          // Handle a closed connection
          replSetSelf.closeHandler = function(err, server) {
            var closeServers = function() {
              // Set the state to disconnected
              parent._state = 'disconnected';
              // Shut down the replicaset for now and Fire off all the callbacks sitting with no reply
              if(replSetSelf._serverState == 'connected') {
                // Close the replicaset
                replSetSelf.close(function() {
                  __executeAllCallbacksWithError(parent, err);
                  // Set the parent
                  if(typeof parent.openCalled != 'undefined')
                    parent.openCalled = false;
                  // Ensure single callback only
                  if(callback != null) {
                    // Single callback only
                    var internalCallback = callback;
                    callback = null;
                    // Return the error
                    internalCallback(err, null, replSetSelf);
                  } else {
                    // If the parent has listeners trigger an event
                    if(parent.listeners("close").length > 0) {
                      parent.emit("close", err);
                    }
                  }
                });
              }
            }

            // Check if this is the primary server, then disconnect otherwise keep going
            if(replSetSelf._state.master != null) {
              var primaryAddress = replSetSelf._state.master.host + ":" + replSetSelf._state.master.port;
              var errorServerAddress = server.name;

              // Only shut down the set if we have a primary server error
              if(primaryAddress == errorServerAddress) {
                closeServers();
              } else {
                // Remove from the list of servers
                delete replSetSelf._state.addresses[errorServerAddress];
                // Locate one of the lists and remove
                if(replSetSelf._state.secondaries[errorServerAddress] != null) {
                  delete replSetSelf._state.secondaries[errorServerAddress];
                } else if(replSetSelf._state.arbiters[errorServerAddress] != null) {
                  delete replSetSelf._state.arbiters[errorServerAddress];
                } else if(replSetSelf._state.passives[errorServerAddress] != null) {
                  delete replSetSelf._state.passives[errorServerAddress];
                }

                // Check if we are reading from Secondary only
                if(replSetSelf._readPreference == ReadPreference.SECONDARY && Object.keys(replSetSelf._state.secondaries).length == 0) {
                  closeServers();
                }
              }
            } else {
              closeServers();
            }
          }

          // Handle a connection timeout
          replSetSelf.timeoutHandler = function(err, server) {
            var closeServers = function() {
              // Set the state to disconnected
              parent._state = 'disconnected';
              // Shut down the replicaset for now and Fire off all the callbacks sitting with no reply
              if(replSetSelf._serverState == 'connected') {
                // Close the replicaset
                replSetSelf.close(function() {
                  __executeAllCallbacksWithError(parent, err);
                  // Set the parent
                  if(typeof parent.openCalled != 'undefined')
                    parent.openCalled = false;
                  // Ensure single callback only
                  if(callback != null) {
                    // Single callback only
                    var internalCallback = callback;
                    callback = null;
                    // Return the error
                    internalCallback(new Error("connection timed out"), null, replSetSelf);
                  } else {
                    // If the parent has listeners trigger an event
                    if(parent.listeners("error").length > 0) {
                      parent.emit("timeout", new Error("connection timed out"));
                    }
                  }
                });
              }
            }

            // Check if this is the primary server, then disconnect otherwise keep going
            if(replSetSelf._state.master != null) {
              var primaryAddress = replSetSelf._state.master.host + ":" + replSetSelf._state.master.port;
              var errorServerAddress = server.name;

              // Only shut down the set if we have a primary server error
              if(primaryAddress == errorServerAddress) {
                closeServers();
              } else {
                // Remove from the list of servers
                delete replSetSelf._state.addresses[errorServerAddress];
                // Locate one of the lists and remove
                if(replSetSelf._state.secondaries[errorServerAddress] != null) {
                  delete replSetSelf._state.secondaries[errorServerAddress];
                } else if(replSetSelf._state.arbiters[errorServerAddress] != null) {
                  delete replSetSelf._state.arbiters[errorServerAddress];
                } else if(replSetSelf._state.passives[errorServerAddress] != null) {
                  delete replSetSelf._state.passives[errorServerAddress];
                }

                // Check if we are reading from Secondary only
                if(replSetSelf._readPreference == ReadPreference.SECONDARY && Object.keys(replSetSelf._state.secondaries).length == 0) {
                  closeServers();
                }
              }
            } else {
              closeServers();
            }
          }

          // Handle an error
          replSetSelf.errorHandler = function(err, server) {
            var closeServers = function() {
              // Set the state to disconnected
              parent._state = 'disconnected';
              // Shut down the replicaset for now and Fire off all the callbacks sitting with no reply
              if(replSetSelf._serverState == 'connected') {
                // Close the replicaset
                replSetSelf.close(function() {
                  __executeAllCallbacksWithError(parent, err);
                  // Set the parent
                  if(typeof parent.openCalled != 'undefined')
                    parent.openCalled = false;
                  // Ensure single callback only
                  if(callback != null) {
                    // Single callback only
                    var internalCallback = callback;
                    callback = null;
                    // Return the error
                    internalCallback(err, null, replSetSelf);
                  } else {
                    // If the parent has listeners trigger an event
                    if(parent.listeners("error").length > 0) {
                      parent.emit("error", err);
                    }
                  }
                });
              }
            }

            // Check if this is the primary server, then disconnect otherwise keep going
            if(replSetSelf._state.master != null) {
              var primaryAddress = replSetSelf._state.master.host + ":" + replSetSelf._state.master.port;
              var errorServerAddress = server.name;
              // Only shut down the set if we have a primary server error
              if(primaryAddress == errorServerAddress) {
                closeServers();
              } else {
                // Remove from the list of servers
                delete replSetSelf._state.addresses[errorServerAddress];
                // Locate one of the lists and remove
                if(replSetSelf._state.secondaries[errorServerAddress] != null) {
                  delete replSetSelf._state.secondaries[errorServerAddress];
                } else if(replSetSelf._state.arbiters[errorServerAddress] != null) {
                  delete replSetSelf._state.arbiters[errorServerAddress];
                } else if(replSetSelf._state.passives[errorServerAddress] != null) {
                  delete replSetSelf._state.passives[errorServerAddress];
                }

                // Check if we are reading from Secondary only
                if(replSetSelf._readPreference == ReadPreference.SECONDARY && Object.keys(replSetSelf._state.secondaries).length == 0) {
                  closeServers();
                }
              }
            } else {
              closeServers();
            }
          }

          // Ensure we don't have duplicate handlers
          instanceServer.removeAllListeners("close");
          instanceServer.removeAllListeners("error");
          instanceServer.removeAllListeners("timeout");

          // Add error handler to the instance of the server
          instanceServer.on("close", replSetSelf.closeHandler);
          // Add error handler to the instance of the server
          instanceServer.on("error", replSetSelf.errorHandler);
          // instanceServer.on("timeout", errorHandler);
          instanceServer.on("timeout", replSetSelf.timeoutHandler);
          // Add tag info
          instanceServer.tags = tags;

          // Remove from error list
          delete replSetSelf._state.errors[me];

          // Add our server to the list of finished servers
          replSetSelf._state.addresses[me] = instanceServer;

          // Assign the set name
          if(replSetSelf.replicaSet == null) {
            replSetSelf._state.setName = setName;
          } else if(replSetSelf.replicaSet != setName && replSetSelf._serverState != 'disconnected') {
            replSetSelf._state.errorMessages.push(new Error("configured mongodb replicaset does not match provided replicaset [" + setName + "] != [" + replSetSelf.replicaSet + "]"));
            // Set done
            replSetSelf._serverState = 'disconnected';
            // ensure no callbacks get called twice
            var internalCallback = callback;
            callback = null;
            // Return error message ignoring rest of calls
            return internalCallback(replSetSelf._state.errorMessages[0], parent, replSetSelf);
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
            masterCallback = callback;
            callback = null;
          } else if(isMaster == false && primary != null && replSetSelf._state.addresses[primary]) {
            replSetSelf._state.master = replSetSelf._state.addresses[primary];
            masterCallback = callback;
            callback = null;
          }

          // Let's go throught all the "possible" servers in the replicaset
          var candidateServers = hosts.concat(arbiters).concat(passives);

          // If we have new servers let's add them
          for(var i = 0; i < candidateServers.length; i++) {
            // Fetch the server string
            var candidateServerString = candidateServers[i];
            // Add the server if it's not defined and not already errored out
            if(null == replSetSelf._state.addresses[candidateServerString]
              && null == replSetSelf._state.errors[candidateServerString]) {
              // Split the server string
              var parts = candidateServerString.split(/:/);
              if(parts.length == 1) {
                parts = [parts[0], Connection.DEFAULT_PORT];
              }

              // Default empty socket options object
              var socketOptions = {};
              // If a socket option object exists clone it
              if(replSetSelf.socketOptions != null) {
                var keys = Object.keys(replSetSelf.socketOptions);
                for(var i = 0; i < keys.length;i++) socketOptions[keys[i]] = replSetSelf.socketOptions[keys[i]];
              }

              // Add host information to socket options
              socketOptions['host'] = parts[0];
              socketOptions['port'] = parseInt(parts[1], 10);
              // Set fast connect timeout
              socketOptions['connectTimeoutMS'] = replSetSelf._connectTimeoutMS

              // Create a new server instance
              var newServer = new Server(parts[0], parseInt(parts[1], 10), {auto_reconnect:false, 'socketOptions':socketOptions
                              , logger:replSetSelf.logger, ssl:replSetSelf.ssl, poolSize:replSetSelf.poolSize});
              // Set the replicaset instance
              newServer.replicasetInstance = replSetSelf;

              // Add handlers
              newServer.on("close", replSetSelf.closeHandler);
              newServer.on("timeout", replSetSelf.timeoutHandler);
              newServer.on("error", replSetSelf.errorHandler);

              // Add server to list, ensuring we don't get a cascade of request to the same server
              replSetSelf._state.addresses[candidateServerString] = newServer;

              // Add a new server to the total number of servers that need to initialized before we are done
              self._numberOfServersLeftToInitialize = self._numberOfServersLeftToInitialize + 1;

              // Let's set up a new server instance
              newServer.connect(parent, {returnIsMasterResults: true, eventReceiver:newServer}, self.connectionHandler(newServer));
            }
          }
        } else {
          // Remove the instance from out list of servers
          delete replSetSelf._state.addresses[me];
        }
      } else {
        instanceServer.close();
        delete replSetSelf._state.addresses[instanceServer.host + ":" + instanceServer.port];
      }

      // Check if we are ready in the next tick to allow more connections to be done
      // process.nextTick(function() {
        // Call back as we have a master letting the rest of the connections happen async
        if(masterCallback != null) {
          var internalCallback = masterCallback;
          masterCallback = null;

          // Fire open event
          process.nextTick(function() {
            // Emit the open event
            parent.emit("open", null, parent);
          });

          internalCallback(null, parent, replSetSelf);
        }
      // });

      // If done finish up
      if((self._numberOfServersLeftToInitialize == 0) && replSetSelf._serverState === 'connecting' && replSetSelf._state.errorMessages.length == 0) {
        // Set db as connected
        replSetSelf._serverState = 'connected';
        // If we don't expect a master let's call back, otherwise we need a master before
        // the connection is successful
        if(replSetSelf.masterNotNeeded || replSetSelf._state.master != null) {
          // If we have a read strategy boot it
          if(replSetSelf.strategyInstance != null) {
            // Ensure we have a proper replicaset defined
            replSetSelf.strategyInstance.replicaset = replSetSelf;
            // Start strategy
            replSetSelf.strategyInstance.start(function(err) {
              // ensure no callbacks get called twice
              var internalCallback = callback;
              callback = null;

              // Fire open event
              process.nextTick(function() {
                // Emit on db parent
                parent.emit("fullsetup", null, parent);
                // Emit all servers done
                replSetSelf.emit("fullsetup", null, parent);
              });

              // Callback
              if(typeof internalCallback == 'function') {
                internalCallback(null, parent, replSetSelf);
              }
            })
          } else {
            // ensure no callbacks get called twice
            var internalCallback = callback;
            callback = null;

            // Fire open event
            process.nextTick(function() {
              parent.emit("fullsetup", null, parent);
              // Emit all servers done
              replSetSelf.emit("fullsetup", null, parent);
            });

            // Callback
            if(typeof internalCallback == 'function') {
              internalCallback(null, parent, replSetSelf);
            }
          }
        } else if(replSetSelf.readSecondary == true && Object.keys(replSetSelf._state.secondaries).length > 0) {
          // If we have a read strategy boot it
          if(replSetSelf.strategyInstance != null) {
            // Ensure we have a proper replicaset defined
            replSetSelf.strategyInstance.replicaset = replSetSelf;
            // Start strategy
            replSetSelf.strategyInstance.start(function(err) {
              // ensure no callbacks get called twice
              var internalCallback = callback;
              callback = null;

              // Fire open event
              process.nextTick(function() {
                parent.emit("fullsetup", null, parent);
                // Emit all servers done
                replSetSelf.emit("fullsetup", null, parent)
              });

              // Callback
              if(typeof internalCallback == 'function') {
                internalCallback(null, parent, replSetSelf);
              }
            })
          } else {
            // ensure no callbacks get called twice
            var internalCallback = callback;
            callback = null;

            // Fire open event
            process.nextTick(function() {
              parent.emit("fullsetup", null, parent);
              // Emit all servers done
              replSetSelf.emit("fullsetup", null, parent);
            });

            // Callback
            if(typeof internalCallback == 'function') {
              internalCallback(null, parent, replSetSelf);
            }
          }
        } else if(replSetSelf.readSecondary == true && Object.keys(replSetSelf._state.secondaries).length == 0) {
          replSetSelf._serverState = 'disconnected';
          // ensure no callbacks get called twice
          var internalCallback = callback;
          callback = null;
          // Force close all server instances
          replSetSelf.close();
          // Perform callback
          internalCallback(new Error("no secondary server found"), null, replSetSelf);
        } else if(typeof callback === 'function') {
          replSetSelf._serverState = 'disconnected';
          // ensure no callbacks get called twice
          var internalCallback = callback;
          callback = null;
          // Force close all server instances
          replSetSelf.close();
          // Perform callback
          internalCallback(new Error("no primary server found"), null, replSetSelf);
        }
      } else if((self._numberOfServersLeftToInitialize == 0) && replSetSelf._state.errorMessages.length > 0 && replSetSelf._serverState != 'disconnected') {
        // Set done
        replSetSelf._serverState = 'disconnected';
        // ensure no callbacks get called twice
        var internalCallback = callback;
        callback = null;
        // Force close all server instances
        replSetSelf.close();
        // Callback to signal we are done
        internalCallback(replSetSelf._state.errorMessages[0], null, replSetSelf);
      }
    }
  }

  // Ensure we have all registered servers in our set
  for(var i = 0; i < serverConnections.length; i++) {
    replSetSelf._state.addresses[serverConnections[i].host + ':' + serverConnections[i].port] = serverConnections[i];
  }

  // Initialize all the connections
  for(var i = 0; i < serverConnections.length; i++) {
    // Set up the logger for the server connection
    serverConnections[i].logger = replSetSelf.logger;
    // Default empty socket options object
    var socketOptions = {};
    // If a socket option object exists clone it
    if(this.socketOptions != null && typeof this.socketOptions === 'object') {
      var keys = Object.keys(this.socketOptions);
      for(var j = 0; j < keys.length;j++) socketOptions[keys[j]] = this.socketOptions[keys[j]];
    }

    // If ssl is specified
    if(replSetSelf.ssl) serverConnections[i].ssl = true;

    // Add host information to socket options
    socketOptions['host'] = serverConnections[i].host;
    socketOptions['port'] = serverConnections[i].port;
    // Set fast connect timeout
    socketOptions['connectTimeoutMS'] = replSetSelf._connectTimeoutMS

    // Set the socket options
    serverConnections[i].socketOptions = socketOptions;
    // Set the replicaset instance
    serverConnections[i].replicasetInstance = replSetSelf;
    // Connect to server
    serverConnections[i].connect(parent, {returnIsMasterResults: true, eventReceiver:serverConnections[i]}, self.connectionHandler(serverConnections[i]));
  }
}

/**
 * @ignore
 */
ReplSet.prototype.checkoutWriter = function() {
  // Establish connection
  var connection = this._state.master != null ? this._state.master.checkoutWriter() : null;
  // Return the connection
  return connection;
}

/**
 * @ignore
 */
var pickFirstConnectedSecondary = function pickFirstConnectedSecondary(self, tags) {
  var keys = Object.keys(self._state.secondaries);
  var connection = null;

  // Find first available reader if any
  for(var i = 0; i < keys.length; i++) {
    connection = self._state.secondaries[keys[i]].checkoutReader();
    if(connection != null) break;
  }

  // If we still have a null, read from primary if it's not secondary only
  if(self._readPreference == ReadPreference.SECONDARY_PREFERRED) {
    connection = self._state.master.checkoutReader();
  }

  if(connection == null) {
    var preferenceName = self._readPreference == ReadPreference.SECONDARY_PREFERRED ? 'secondary' : self._readPreference;
    return new Error("No replica set member available for query with ReadPreference " + preferenceName + " and tags " + JSON.stringify(tags));
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
      if(this.strategyInstance) return this.strategyInstance.checkoutSecondary(tags, candidateServers);
      // Set instance to return
      return candidateServers[Math.floor(Math.random() * candidateServers.length)].checkoutReader();
    }
  }

  // No connection found
  return null;
}

/**
 * @ignore
 */
ReplSet.prototype.checkoutReader = function(readPreference, tags) {
  var connection = null;

  // If we have a read preference object unpack it
  if(typeof readPreference == 'object' && readPreference['_type'] == 'ReadPreference') {
    tags = readPreference.tags;
    readPreference = readPreference.mode;
  } else if(typeof readPreference == 'object' && readPreference['_type'] != 'ReadPreference') {
    throw new Error("read preferences must be either a string or an instance of ReadPreference");
  }

  // Set up our read Preference, allowing us to override the readPreference
  var finalReadPreference = readPreference != null ? readPreference : this._readPreference;
  finalReadPreference = finalReadPreference == true ? ReadPreference.SECONDARY_PREFERRED : finalReadPreference;

  // If we are reading from a primary
  if(finalReadPreference == 'primary') {
    // If we provide a tags set send an error
    if(typeof tags == 'object' && tags != null) {
      return new Error("PRIMARY cannot be combined with tags");
    }

    // If we provide a tags set send an error
    if(this._state.master == null) {
      return new Error("No replica set primary available for query with ReadPreference PRIMARY");
    }

    // Checkout a writer
    return this.checkoutWriter();
  }

  // If we have specified to read from a secondary server grab a random one and read
  // from it, otherwise just pass the primary connection
  if((this.readSecondary || finalReadPreference == ReadPreference.SECONDARY_PREFERRED || finalReadPreference == ReadPreference.SECONDARY) && Object.keys(this._state.secondaries).length > 0) {
    // If we have tags, look for servers matching the specific tag
    if(tags != null && typeof tags == 'object') {
      // Get connection
      connection = _pickFromTags(this, tags);// = function(self, readPreference, tags) {
      // No candidate servers that match the tags, error
      if(connection == null) {
        return new Error("No replica set members available for query");
      }
    } else {
      // Pick a random key
      var keys = Object.keys(this._state.secondaries);
      this._currentServerChoice = this._currentServerChoice % keys.length;
      var key = keys[this._currentServerChoice++];
      // Fetch a connectio
      connection = this._state.secondaries[key] != null ? this._state.secondaries[key].checkoutReader() : null;
      // If connection is null fallback to first available secondary
      connection = connection == null ? pickFirstConnectedSecondary(this, tags) : connection;
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
          return new Error("No replica set members available for query");
        }
      } else {
        // Pick a random key
        var keys = Object.keys(this._state.secondaries);
        this._currentServerChoice = this._currentServerChoice % keys.length;
        var key = keys[this._currentServerChoice++];
        // Fetch a connectio
        connection = this._state.secondaries[key] != null ? this._state.secondaries[key].checkoutReader() : null;
        // If connection is null fallback to first available secondary
        connection = connection == null ? pickFirstConnectedSecondary(this, tags) : connection;
      }
    }
  } else if(finalReadPreference == ReadPreference.SECONDARY_PREFERRED && tags == null && Object.keys(this._state.secondaries).length == 0) {
    connection = this.checkoutWriter();
    // If no connection return an error
    if(connection == null) {
      var preferenceName = finalReadPreference == ReadPreference.SECONDARY ? 'secondary' : finalReadPreference;
      connection = new Error("No replica set member available for query with ReadPreference " + preferenceName + " and tags " + JSON.stringify(tags));
    }
  } else if(finalReadPreference == ReadPreference.SECONDARY_PREFERRED) {
    // If we have tags, look for servers matching the specific tag
    if(tags != null && typeof tags == 'object') {
      // Get connection
      connection = _pickFromTags(this, tags);// = function(self, readPreference, tags) {
      // No candidate servers that match the tags, error
      if(connection == null) {
        // No secondary server avilable, attemp to checkout a primary server
        connection = this.checkoutWriter();
        // If no connection return an error
        if(connection == null) {
          return new Error("No replica set members available for query");
        }
      }
    } else if(this.strategyInstance != null) {
      connection = this.strategyInstance.checkoutReader(tags);
    }
  } else if(finalReadPreference == ReadPreference.NEAREST && this.strategyInstance != null) {
    connection = this.strategyInstance.checkoutSecondary(tags);
  } else if(finalReadPreference == ReadPreference.NEAREST && this.strategyInstance == null) {
    return new Error("A strategy for calculating nearness must be enabled such as ping or statistical");
  } else if(finalReadPreference == ReadPreference.SECONDARY && Object.keys(this._state.secondaries).length == 0) {
    if(tags != null && typeof tags == 'object') {
      var preferenceName = finalReadPreference == ReadPreference.SECONDARY ? 'secondary' : finalReadPreference;
      connection = new Error("No replica set member available for query with ReadPreference " + preferenceName + " and tags " + JSON.stringify(tags));
    } else {
      connection = new Error("No replica set secondary available for query with ReadPreference SECONDARY");
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
ReplSet.prototype.allRawConnections = function() {
  // Neeed to build a complete list of all raw connections, start with master server
  var allConnections = [];
  // Get connection object
  var allMasterConnections = this._state.master.connectionPool.getAllConnections();
  // Add all connections to list
  allConnections = allConnections.concat(allMasterConnections);

  // If we have read secondary let's add all secondary servers
  if(this.readSecondary && Object.keys(this._state.secondaries).length > 0) {
    // Get all the keys
    var keys = Object.keys(this._state.secondaries);
    // For each of the secondaries grab the connections
    for(var i = 0; i < keys.length; i++) {
      // Get connection object
      var secondaryPoolConnections = this._state.secondaries[keys[i]].connectionPool.getAllConnections();
      // Add all connections to list
      allConnections = allConnections.concat(secondaryPoolConnections);
    }
  }

  // Return all the conections
  return allConnections;
}

/**
 * @ignore
 */
ReplSet.prototype.enableRecordQueryStats = function(enable) {
  // Set the global enable record query stats
  this.recordQueryStats = enable;
  // Ensure all existing servers already have the flag set, even if the
  // connections are up already or we have not connected yet
  if(this._state != null && this._state.addresses != null) {
    var keys = Object.keys(this._state.addresses);
    // Iterate over all server instances and set the  enableRecordQueryStats flag
    for(var i = 0; i < keys.length; i++) {
      this._state.addresses[keys[i]].enableRecordQueryStats(enable);
    }
  } else if(Array.isArray(this.servers)) {
    for(var i = 0; i < this.servers.length; i++) {
      this.servers[i].enableRecordQueryStats(enable);
    }
  }
}

/**
 * @ignore
 */
ReplSet.prototype.disconnect = function(callback) {
  this.close(callback);
}

/**
 * @ignore
 */
ReplSet.prototype.close = function(callback) {
  var self = this;
  // Set server status as disconnected
  this._serverState = 'disconnected';
  // Get all the server instances and close them
  var allServers = [];
  // Make sure we have servers
  if(this._state['addresses'] != null) {
    var keys = Object.keys(this._state.addresses);
    for(var i = 0; i < keys.length; i++) {
      allServers.push(this._state.addresses[keys[i]]);
    }
  }


  // Let's process all the closing
  var numberOfServersToClose = allServers.length;

  // Remove all the listeners
  self.removeAllListeners();

  // Special case where there are no servers
  if(allServers.length == 0 && typeof callback === 'function') return callback(null, null);

  // Close the servers
  for(var i = 0; i < allServers.length; i++) {
    var server = allServers[i];
    // Close each server
    server.close(function() {
      numberOfServersToClose = numberOfServersToClose - 1;
      // Clear out state if we are done
      if(numberOfServersToClose == 0) {
        // Clear out state
        self._state = {'master':null, 'secondaries':{}, 'arbiters':{}, 'passives':{}
          , 'errors':{}, 'addresses':{}, 'setName':null, 'errorMessages':[], 'members':[]};
      }

      // If we are finished perform the call back
      if(numberOfServersToClose == 0 && typeof callback === 'function') {
        callback(null);
      }
    })
  }
}

/**
 * Auto Reconnect property
 * @ignore
 */
Object.defineProperty(ReplSet.prototype, "autoReconnect", { enumerable: true
  , get: function () {
      return true;
    }
});

/**
 * Get Read Preference method
 * @ignore
 */
Object.defineProperty(ReplSet.prototype, "readPreference", { enumerable: true
  , get: function () {
      if(this._readPreference == null && this.readSecondary) {
        return ReadPreference.SECONDARY_PREFERRED;
      } else if(this._readPreference == null && !this.readSecondary) {
        return ReadPreference.PRIMARY;
      } else {
        return this._readPreference;
      }
    }
});

/**
 * Db Instances
 * @ignore
 */
Object.defineProperty(ReplSet.prototype, "dbInstances", {enumerable:true
  , get: function() {
    var servers = this.allServerInstances();
    return servers.length > 0 ? servers[0].dbInstances : [];
  }
})

/**
 * Just make compatible with server.js
 * @ignore
 */
Object.defineProperty(ReplSet.prototype, "host", { enumerable: true
  , get: function () {
      if (this.primary != null) return this.primary.host;
    }
});

/**
 * Just make compatible with server.js
 * @ignore
 */
Object.defineProperty(ReplSet.prototype, "port", { enumerable: true
  , get: function () {
      if (this.primary != null) return this.primary.port;
    }
});

/**
 * Get status of read
 * @ignore
 */
Object.defineProperty(ReplSet.prototype, "read", { enumerable: true
  , get: function () {
      return this.secondaries.length > 0 ? this.secondaries[0] : null;
    }
});

/**
 * Get list of secondaries
 * @ignore
 */
Object.defineProperty(ReplSet.prototype, "secondaries", {enumerable: true
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

/**
 * Get list of all secondaries including passives
 * @ignore
 */
Object.defineProperty(ReplSet.prototype, "allSecondaries", {enumerable: true
  , get: function() {
      return this.secondaries.concat(this.passives);
    }
});

/**
 * Get list of arbiters
 * @ignore
 */
Object.defineProperty(ReplSet.prototype, "arbiters", {enumerable: true
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

/**
 * Get list of passives
 * @ignore
 */
Object.defineProperty(ReplSet.prototype, "passives", {enumerable: true
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

/**
 * Master connection property
 * @ignore
 */
Object.defineProperty(ReplSet.prototype, "primary", { enumerable: true
  , get: function () {
      return this._state != null ? this._state.master : null;
    }
});

/**
 * @ignore
 */
// Backward compatibility
exports.ReplSetServers = ReplSet;
