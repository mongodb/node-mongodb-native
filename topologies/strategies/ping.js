var Logger = require('../../connection/logger')
  , f = require('util').format;

var Ping = function(options) {
  var pings = {};
  // Set no options if none provided
  options = options || {};
   // Logger
  var logger = Logger('Ping', options);
 // Ping interval
  var pingInterval = options.pingInterval || 5000;
  var acceptableLatency = options.acceptableLatency || 250;

  // Log the options set
  if(logger.isDebug()) logger.debug(f('ping strategy interval [%s], acceptableLatency [%s]', pingInterval, acceptableLatency));

  // Current ping time
  var lastPing = null;

  this.pickServer = function(set, readPreference) {
    // Transform the list
    var serverList = [];
    for(var name in pings) {
      serverList.push({name: name, time: pings[name]});
    }

    // Filter by latency
    serverList = serverList.filter(function(s) {
      return s.time < acceptableLatency;
    });

    // Sort by time
    serverList.sort(function(a, b) {
      return a.time > b.time;
    });

    // No servers, default to primary
    if(serverList.length == 0 && set.primary) {
      if(logger.isInfo()) logger.info(f('picked primary server [%s]', set.primary.name));
      return set.primary;
    } else if(serverList.length == 0) {
      return null;      
    }

    // We picked first server
    if(logger.isInfo()) logger.info(f('picked server [%s] with ping latency [%s]', serverList[0].name, serverList[0].time));
    // Return the first server of the sorted and filtered list
    return set.get(serverList[0].name);
  }

  this.startOperation = function(server, query, date) {
  }

  this.endOperation = function(server, err, result, date) {
  }

  this.ha = function(state, callback) {
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

  this.close = function(server) {
    removeServer(server);
  }

  this.error = function(server) {
    removeServer(server);
  }

  this.timeout = function(server) {
    removeServer(server);
  }

  this.connect = function(server, callback) {
    // Get the command start date
    var start = new Date();
    // Execute ping against server
    server.command('system.$cmd', {ping:1}, function(err, r) {
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

module.exports = Ping;