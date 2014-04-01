var inherits = require('util').inherits
  , f = require('util').format
  , EventEmitter = require('events').EventEmitter
  , Server = require('./server')
  , ReadPreference = require('./read_preference')
  , MongoError = require('../error');

var DISCONNECTED = 'disconnected';
var CONNECTING = 'connecting';
var CONNECTED = 'connected';
var DESTROYED = 'destroyed';

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
// Contains the state
var State = function() {
  this.secondaries = [];
  this.arbiters = [];
  this.primary = null;
}

var ReplSet = function(seedlist, options) {
  var self = this;
  options = options || {};

  // Default state
  var state = DISCONNECTED;
  // Index
  var index = 0;
  // Special replicaset options
  var secondaryOnlyConnectionAllowed = typeof options.secondaryOnlyConnectionAllowed == 'boolean'
    ? options.secondaryOnlyConnectionAllowed : false;
  
  // Replicaset state
  var replState = new State();

  // All the servers
  var disconnectedServers = [];
 
  // Validate seedlist
  if(!Array.isArray(seedlist)) throw new MongoError("seedlist must be an array");
  // Validate list
  if(seedlist.length == 0) throw new MongoError("seedlist must contain at least one entry");
  // Validate entries
  seedlist.forEach(function(e) {
    if(typeof e.host != 'string' || typeof e.port != 'number') 
      throw new MongoError("seedlist entry must contain a host and port");
  });

  // Add event listener
  EventEmitter.call(this);

  //
  // Actually exposed methods
  //

  // connect
  this.connect = function() {
    // For all entries in the seedlist build a server instance
    seedlist.forEach(function(e) {
      // Clone options
      var opts = cloneOptions(options);
      // Add host and port
      opts.host = e.host;
      opts.port = e.port;
      // Create a new Server
      disconnectedServers.push(new Server(opts));
    });

    // Error handler for initial connect
    var errorHandler = function(err, server) {
      disconnectedServers.push(server);
    }

    // Connect handler
    var connectHandler = function(server) {
      // Execute an ismaster
      server.command('system.$cmd', {ismaster:true}, function(err, r) {
        if(err) return disconnectedServers.push(server);

        // Discover any additional servers
        var ismaster = r.result;
        // It's a master set it
        if(ismaster.ismaster) {
          replState.primary = server;
          
          // We are connected
          if(state == DISCONNECTED) {
            state = CONNECTED;
            self.emit('connect', self);
          }
        } else if(!ismaster.ismaster && ismaster.secondary) {
          replState.secondaries.push(server);
          
          // We can connect with only a secondary
          if(secondaryOnlyConnectionAllowed && state == DISCONNECTED) {
            state = CONNECTED;
            self.emit('connect', self);            
          }
        }
      });
    }

    // Attempt to connect to all the servers
    while(disconnectedServers.length > 0) {
      // Get the server
      var server = disconnectedServers.shift();
      
      // Set up the event handlers
      server.once('error', errorHandler);
      server.once('close', errorHandler);
      server.once('timeout', errorHandler);
      server.once('connect', connectHandler);
      // Attempt to connect
      server.connect();
    }
  }

  // destroy the server instance
  this.destroy = function() {
  }

  // is the server connected
  this.isConnected = function() {
  }

  // Execute a command
  this.command = function(ns, cmd, options, callback) {
    if(typeof options == 'function') {
      callback = options;
      options = {};
    }

    // Ensure we have no options
    options = options || {};
    // Pick the right server based on readPreference
    var server = pickServer(options, callback);
    // No server returned we had an error
    if(server == null) return;

    // Execute the command
    server.command(ns, cmd, options, callback);
  }

  // Execute a write
  this.insert = function(ns, ops, options, callback) {
  }

  // Execute a write
  this.update = function(ns, ops, options, callback) {
  }

  // Execute a write
  this.remove = function(ns, ops, options, callback) {
  }    

  // Create a cursor for the command
  this.cursor = function(ns, cmd, options) {
  }

  //
  // Pick a server based on readPreference
  var pickServer = function(options, callback) {
    var readPreference = options.readPreference || ReadPreference.primary;
    if(readPreference == ReadPreference.secondary 
      && replState.secondaries.length == 0)
        return callback(new Error("no secondary server available"));
    
    if(readPreference == ReadPreference.secondaryPreferred 
        && replState.secondaries.length == 0
        && replState.primary == null)
      return callback(new Error("no secondary or primary server available"));

    if(readPreference == ReadPreference.primary 
      && replState.primary == null)
        return callback(new Error("no primary server available"));

    // Secondary
    if(readPreference == ReadPreference.secondary) {
      index = index + 1;
      return replState.secondaries[index % replState.secondaries.length];
    }

    // Secondary preferred
    if(readPreference == ReadPreference.secondaryPreferred) {
      if(replState.secondaries.length > 0) {
        index = index + 1;
        return replState.secondaries[index % replState.secondaries.length];        
      }

      return replState.primary;
    }

    // Primary preferred
    if(readPreference == ReadPreference.primaryPreferred) {
      if(replState.primary) return replState.primary;

      if(replState.secondaries.length > 0) {
        index = index + 1;
        return replState.secondaries[index % replState.secondaries.length];        
      }
    }

    // Return the primary
    return replState.primary;
  }
}

inherits(ReplSet, EventEmitter);

module.exports = ReplSet;