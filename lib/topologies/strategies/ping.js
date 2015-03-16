"use strict";

var Logger = require('../../connection/logger')
  , EventEmitter = require('events').EventEmitter
  , inherits = require('util').inherits
  , f = require('util').format;

/**
 * Creates a new Ping read preference strategy instance
 * @class
 * @param {number} [options.pingInterval=5000] Ping interval to check the response time to the different servers
 * @param {number} [options.acceptableLatency=250] Acceptable latency for selecting a server for reading (in milliseconds)
 * @return {Ping} A cursor instance
 */
var Ping = function(options) {
  // Add event listener
  EventEmitter.call(this);

  // Contains the ping state
  this.s = {
    // Contains all the ping data
      pings: {}
    // Set no options if none provided
    , options: options || {}
    // Logger
    , logger: Logger('Ping', options)
    // Ping interval
    , pingInterval: options.pingInterval || 10000
    , acceptableLatency: options.acceptableLatency || 15
    // Debug options
    , debug: typeof options.debug == 'boolean' ? options.debug : false
    // Index
    , index: 0
    // Current ping time
    , lastPing: null

  }

  // Log the options set
  if(this.s.logger.isDebug()) this.s.logger.debug(f('ping strategy interval [%s], acceptableLatency [%s]', this.s.pingInterval, this.s.acceptableLatency));

  // If we have enabled debug 
  if(this.s.debug) {
    // Add access to the read Preference Strategies
    Object.defineProperty(this, 'data', {
      enumerable: true, get: function() { return this.s.pings; }
    });    
  }
}

inherits(Ping, EventEmitter);

/**
 * @ignore
 */
var filterByTags = function(readPreference, servers) {
  if(readPreference.tags == null) return servers;
  var filteredServers = [];
  var tags = readPreference.tags;

  // Iterate over all the servers
  for(var i = 0; i < servers.length; i++) {
    var serverTag = servers[i].lastIsMaster().tags || {};
    // Did we find the a matching server
    var found = true;
    // Check if the server is valid
    for(var name in tags) {
      if(serverTag[name] != tags[name]) found = false;
    }

    // Add to candidate list
    if(found) filteredServers.push(servers[i]);
  }

  // Returned filtered servers
  return filteredServers;
}

/**
 * Pick a server
 * @method
 * @param {State} set The current replicaset state object 
 * @param {ReadPreference} readPreference The current readPreference object
 * @param {readPreferenceResultCallback} callback The callback to return the result from the function
 * @return {object}
 */
Ping.prototype.pickServer = function(set, readPreference) {
  var self = this;
  // Only get primary and secondaries as seeds
  var seeds = {};
  var servers = [];
  if(set.primary) {
    servers.push(set.primary);
  }

  for(var i = 0; i < set.secondaries.length; i++) {
    servers.push(set.secondaries[i]);
  }

  // Filter by tags
  servers = filterByTags(readPreference, servers);

  // Transform the list
  var serverList = [];
  // for(var name in seeds) {
  for(var i = 0; i < servers.length; i++) {
    serverList.push({name: servers[i].name, time: self.s.pings[servers[i].name] || 0});
  }

  // Sort by time
  serverList.sort(function(a, b) {
    return a.time > b.time;
  });

  // Locate lowest time (picked servers are lowest time + acceptable Latency margin)
  var lowest = serverList.length > 0 ? serverList[0].time : 0;

  // Filter by latency
  serverList = serverList.filter(function(s) {
    return s.time <= lowest + self.s.acceptableLatency;
  });

  // No servers, default to primary
  if(serverList.length == 0 && set.primary) {
    if(self.s.logger.isInfo()) self.s.logger.info(f('picked primary server [%s]', set.primary.name));
    return set.primary;
  } else if(serverList.length == 0) {
    return null
  }

  // We picked first server
  if(self.s.logger.isInfo()) self.s.logger.info(f('picked server [%s] with ping latency [%s]', serverList[0].name, serverList[0].time));

  // Add to the index
  self.s.index = self.s.index + 1;
  // Select the index
  self.s.index = self.s.index % serverList.length;
  // Return the first server of the sorted and filtered list
  return set.get(serverList[self.s.index].name);
}

/**
 * Start of an operation
 * @method
 * @param {Server} server The server the operation is running against
 * @param {object} query The operation running
 * @param {Date} date The start time of the operation
 * @return {object}
 */
Ping.prototype.startOperation = function(server, query, date) {
}

/**
 * End of an operation
 * @method
 * @param {Server} server The server the operation is running against
 * @param {error} err An error from the operation
 * @param {object} result The result from the operation
 * @param {Date} date The start time of the operation
 * @return {object}
 */
Ping.prototype.endOperation = function(server, err, result, date) {
}

/**
 * High availability process running
 * @method
 * @param {State} set The current replicaset state object 
 * @param {resultCallback} callback The callback to return the result from the function
 * @return {object}
 */
Ping.prototype.ha = function(topology, state, callback) {
  var self = this;
  var servers = state.getAll();
  var count = servers.length;

  // No servers return
  if(servers.length == 0) return callback(null, null);

  // Return if we have not yet reached the ping interval
  if(self.s.lastPing != null) {
    var diff = new Date().getTime() - self.s.lastPing.getTime();
    if(diff < self.s.pingInterval) return callback(null, null);
  }

  // Execute operation
  var operation = function(_server) {
    var start = new Date();      
    // Execute ping against server
    _server.command('system.$cmd', {ismaster:1}, function(err, r) {
      count = count - 1;
      var time = new Date().getTime() - start.getTime();
      self.s.pings[_server.name] = time;
      // Log info for debug
      if(self.s.logger.isDebug()) self.s.logger.debug(f('ha latency for server [%s] is [%s] ms', _server.name, time));
      // We are done with all the servers
      if(count == 0) {
        // Emit ping event
        topology.emit('ping', err, r ? r.result : null);
        // Update the last ping time
        self.s.lastPing = new Date();
        // Return
        callback(null, null);
      }
    });
  }

  // Let's ping all servers
  while(servers.length > 0) {
    operation(servers.shift());
  }
}

var removeServer = function(self, server) {
  delete self.s.pings[server.name];
}

/**
 * Server connection closed
 * @method
 * @param {Server} server The server that closed
 */
Ping.prototype.close = function(server) {
  removeServer(this, server);
}

/**
 * Server connection errored out
 * @method
 * @param {Server} server The server that errored out
 */
Ping.prototype.error = function(server) {
  removeServer(this, server);
}

/**
 * Server connection timeout
 * @method
 * @param {Server} server The server that timed out
 */
Ping.prototype.timeout = function(server) {
  removeServer(this, server);
}

/**
 * Server connection happened
 * @method
 * @param {Server} server The server that connected
 * @param {resultCallback} callback The callback to return the result from the function
 */
Ping.prototype.connect = function(server, callback) {
  var self = this;
  // Get the command start date
  var start = new Date();
  // Execute ping against server
  server.command('system.$cmd', {ismaster:1}, function(err, r) {
    var time = new Date().getTime() - start.getTime();
    self.s.pings[server.name] = time;
    // Log info for debug
    if(self.s.logger.isDebug()) self.s.logger.debug(f('connect latency for server [%s] is [%s] ms', server.name, time));
    // Set last ping
    self.s.lastPing = new Date();
    // Done, return
    callback(null, null);
  });    
}

/**
 * This is a result from a readPreference strategy
 *
 * @callback readPreferenceResultCallback
 * @param {error} error An error object. Set to null if no error present
 * @param {Server} server The server picked by the strategy
 */

module.exports = Ping;