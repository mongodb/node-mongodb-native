var Logger = require('../../connection/logger')
  , EventEmitter = require('events').EventEmitter
  , inherits = require('util').inherits
  , f = require('util').format;

/**
 * Creates a new Ping read preference strategy instance
 * @class
 * @param {object} [options.pingInterval=5000] Ping interval to check the response time to the different servers
 * @param {object} [options.acceptableLatency=250] Acceptable latency for selecting a server for reading (in milliseconds)
 * @return {Ping} A cursor instance
 */
var Ping = function(options) {
  // Add event listener
  EventEmitter.call(this);
  // Contains all the ping data
  var pings = {};
  
  // Set no options if none provided
  options = options || {};
  
  // Logger
  var logger = Logger('Ping', options);
 
  // Ping interval
  var pingInterval = options.pingInterval || 10000;
  var acceptableLatency = options.acceptableLatency || 15;

  // Debug options
  var debug = typeof options.debug == 'boolean' ? options.debug : false;

  // Index
  var index = 0;

  // Log the options set
  if(logger.isDebug()) logger.debug(f('ping strategy interval [%s], acceptableLatency [%s]', pingInterval, acceptableLatency));

  // Current ping time
  var lastPing = null;

  // If we have enabled debug 
  if(debug) {
    // Add access to the read Preference Strategies
    Object.defineProperty(this, 'data', {
      enumerable: true, get: function() { return pings; }
    });    
  }

  /**
   * Pick a server
   * @method
   * @param {State} set The current replicaset state object 
   * @param {ReadPreference} readPreference The current readPreference object
   * @param {readPreferenceResultCallback} callback The callback to return the result from the function
   * @return {object}
   */
  this.pickServer = function(set, readPreference) {
    // Only get primary and secondaries as seeds
    var seeds = {};
    if(set.primary) seeds[set.primary.name] = true;
    for(var i = 0; i < set.secondaries.length; i++) {
      seeds[set.secondaries[i].name] = true;
    }

    // Transform the list
    var serverList = [];
    for(var name in seeds) {
      serverList.push({name: name, time: pings[name] || 0});
    }

    // Sort by time
    serverList.sort(function(a, b) {
      return a.time > b.time;
    });

    // Locate lowest time (picked servers are lowest time + acceptable Latency margin)
    var lowest = serverList.length > 0 ? serverList[0].time : 0;

    // Filter by latency
    serverList = serverList.filter(function(s) {
      return s.time <= lowest + acceptableLatency;
    });

    // No servers, default to primary
    if(serverList.length == 0 && set.primary) {
      if(logger.isInfo()) logger.info(f('picked primary server [%s]', set.primary.name));
      return set.primary;
    } else if(serverList.length == 0) {
      return null
    }

    // We picked first server
    if(logger.isInfo()) logger.info(f('picked server [%s] with ping latency [%s]', serverList[0].name, serverList[0].time));

    // Add to the index
    index = index + 1;
    // Select the index
    index = index % serverList.length;
    // Return the first server of the sorted and filtered list
    return set.get(serverList[index].name);
  }

  /**
   * Start of an operation
   * @method
   * @param {Server} server The server the operation is running against
   * @param {object} query The operation running
   * @param {Date} date The start time of the operation
   * @return {object}
   */
  this.startOperation = function(server, query, date) {
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
  this.endOperation = function(server, err, result, date) {
  }

  /**
   * High availability process running
   * @method
   * @param {State} set The current replicaset state object 
   * @param {resultCallback} callback The callback to return the result from the function
   * @return {object}
   */
  this.ha = function(topology, state, callback) {
    var self = this;
    var servers = state.getAll();
    var count = servers.length;

    // No servers return
    if(servers.length == 0) return callback(null, null);

    // Return if we have not yet reached the ping interval
    if(lastPing != null) {
      var diff = new Date().getTime() - lastPing.getTime();
      if(diff < pingInterval) return callback(null, null);
    }

    // Execute operation
    var operation = function(_server) {
      var start = new Date();      
      // Execute ping against server
      _server.command('system.$cmd', {ismaster:1}, function(err, r) {
        count = count - 1;
        var time = new Date().getTime() - start.getTime();
        pings[_server.name] = time;
        // Log info for debug
        if(logger.isDebug()) logger.debug(f('ha latency for server [%s] is [%s] ms', _server.name, time));
        // We are done with all the servers
        if(count == 0) {
          // Emit ping event
          topology.emit('ping', err, r ? r.result : null);
          // Update the last ping time
          lastPing = new Date();
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

  var removeServer = function(server) {
    delete pings[server.name];
  }

  /**
   * Server connection closed
   * @method
   * @param {Server} server The server that closed
   */
  this.close = function(server) {
    removeServer(server);
  }

  /**
   * Server connection errored out
   * @method
   * @param {Server} server The server that errored out
   */
  this.error = function(server) {
    removeServer(server);
  }

  /**
   * Server connection timeout
   * @method
   * @param {Server} server The server that timed out
   */
  this.timeout = function(server) {
    removeServer(server);
  }

  /**
   * Server connection happened
   * @method
   * @param {Server} server The server that connected
   * @param {resultCallback} callback The callback to return the result from the function
   */
  this.connect = function(server, callback) {
    // Get the command start date
    var start = new Date();
    // Execute ping against server
    server.command('system.$cmd', {ismaster:1}, function(err, r) {
      var time = new Date().getTime() - start.getTime();
      pings[server.name] = time;
      // Log info for debug
      if(logger.isDebug()) logger.debug(f('connect latency for server [%s] is [%s] ms', server.name, time));
      // Set last ping
      lastPing = new Date();
      // Done, return
      callback(null, null);
    });    
  }
}

inherits(Ping, EventEmitter);

/**
 * This is a result from a readPreference strategy
 *
 * @callback readPreferenceResultCallback
 * @param {error} error An error object. Set to null if no error present
 * @param {Server} server The server picked by the strategy
 */

module.exports = Ping;