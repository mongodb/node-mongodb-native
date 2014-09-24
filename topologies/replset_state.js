var DISCONNECTED = 'disconnected';
var CONNECTING = 'connecting';
var CONNECTED = 'connected';
var DESTROYED = 'destroyed';

/**
 * Creates a new Replicaset State object
 * @class
 * @property {object} primary Primary property
 * @property {array} secondaries List of secondaries
 * @property {array} arbiters List of arbiters
 * @return {State} A cursor instance
 */
var State = function() {
  var secondaries = [];
  var arbiters = [];
  var passives = [];
  var primary = null;

  Object.defineProperty(this, 'primary', {
      enumerable:true
    , get: function() { return primary; }
  });

  Object.defineProperty(this, 'secondaries', {
      enumerable:true
    , get: function() { return secondaries; }
  });

  Object.defineProperty(this, 'arbiters', {
      enumerable:true
    , get: function() { return arbiters; }
  });

  Object.defineProperty(this, 'passives', {
      enumerable:true
    , get: function() { return passives; }
  });

  /**
   * Is there a secondary connected
   * @method
   * @return {boolean}
   */
  this.isSecondaryConnected = function() {    
    for(var i = 0; i < secondaries.length; i++) {
      if(secondaries[i].isConnected()) return true;
    }

    return false;
  }

  /**
   * Is there a primary connection
   * @method
   * @return {boolean}
   */
  this.isPrimaryConnected = function() {
    return primary != null && primary.isConnected();
  }

  /**
   * Is the given address the primary
   * @method
   * @param {string} address Server address
   * @return {boolean}
   */
  this.isPrimary = function(address) {
    if(primary == null) return false;
    return primary && primary.equals(address);
  }

  /**
   * Is the given address a secondary
   * @method
   * @param {string} address Server address
   * @return {boolean}
   */
  this.isSecondary = function(address) {
    // Check if the server is a secondary at the moment
    for(var i = 0; i < secondaries.length; i++) {
      if(secondaries[i].equals(address)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Is the given address a secondary
   * @method
   * @param {string} address Server address
   * @return {boolean}
   */
  this.isPassive = function(address) {
    // Check if the server is a secondary at the moment
    for(var i = 0; i < passives.length; i++) {
      if(passives[i].equals(address)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Does the replicaset contain this server
   * @method
   * @param {string} address Server address
   * @return {boolean}
   */
  this.contains = function(address) {
    if(primary && primary.equals(address)) return true;
    for(var i = 0; i < secondaries.length; i++) {
      if(secondaries[i].equals(address)) return true;
    }

    for(var i = 0; i < arbiters.length; i++) {
      if(arbiters[i].equals(address)) return true;
    }

    for(var i = 0; i < passives.length; i++) {
      if(passives[i].equals(address)) return true;
    }

    return false;
  }

  /**
   * Clean out all dead connections
   * @method
   */
  this.clean = function() {
    if(primary != null && !primary.isConnected()) {
      primary = null;
    }

    // Filter out disconnected servers
    secondaries = secondaries.filter(function(s) {
      return s.isConnected();
    });

    // Filter out disconnected servers
    arbiters = arbiters.filter(function(s) {
      return s.isConnected();
    });
  }

  /**
   * Destroy state
   * @method
   */
  this.destroy = function() {
    state = DESTROYED;
    if(primary) primary.destroy();
    secondaries.forEach(function(s) {
      s.destroy();
    });
  }

  /**
   * Remove server from state
   * @method
   * @param {Server} Server to remove
   * @return {string} Returns type of server removed (primary|secondary)
   */
  this.remove = function(server) {
    if(primary && primary.equals(server)) {
      primary = null;
      return 'primary';
    }

    // console.log("------------------------- REMOVE SERVER from state pre")
    // console.dir(secondaries.map(function(x) { return x.name }))
    // Filter out the server from the secondaries
    secondaries = secondaries.filter(function(s) {
      // console.log("" + server.name + " = " + s.name)
      return !s.equals(server);
    });

    // Filter out the server from the arbiters
    arbiters = arbiters.filter(function(s) {
      // console.log("" + server.name + " = " + s.name)
      return !s.equals(server);
    });

    // Filter out the server from the passives
    passives = passives.filter(function(s) {
      // console.log("" + server.name + " = " + s.name)
      return !s.equals(server);
    });

    // console.log("------------------------- REMOVE SERVER from state after")
    // console.dir(secondaries.map(function(x) { return x.name }))

    // Return that it's a secondary
    return 'secondary';
  }

  /**
   * Get the server by name
   * @method
   * @param {string} address Server address
   * @return {Server}
   */
  this.get = function(server) {
    var found = false;
    // All servers to search
    var servers = primary ? [primary] : [];
    servers = servers.concat(secondaries);
    // Locate the server
    for(var i = 0; i < servers.length; i++) {
      if(servers[i].equals(server)) {
        return servers[i];
      }
    }
  }

  /**
   * Get all the servers in the set
   * @method
   * @return {array}
   */
  this.getAll = function() {
    var servers = [];
    if(primary) servers.push(primary);
    return servers.concat(secondaries);
  }

  /**
   * All raw connections
   * @method
   * @return {array}
   */
  this.getAllConnections = function() {
    var connections = [];
    if(primary) connections = connections.concat(primary.connections());
    secondaries.forEach(function(s) {
      connections = connections.concat(s.connections());
    })

    return connections;
  }

  /**
   * Return JSON object
   * @method
   * @return {object}
   */
  this.toJSON = function() {
    return {
        primary: primary ? primary.lastIsMaster().me : null
      , secondaries: secondaries.map(function(s) {
        return s.lastIsMaster().me
      })
    }
  }

  /**
   * Returns the last known ismaster document for this server
   * @method
   * @return {object}
   */
  this.lastIsMaster = function() {
    if(primary) return primary.lastIsMaster();
    if(secondaries.length > 0) return secondaries[0].lastIsMaster();
    return {};
  }

  /**
   * Promote server to primary
   * @method
   * @param {Server} server Server we wish to promote
   */
  this.promotePrimary = function(server) {
    var currentServer = this.get(server);
    // Server does not exist in the state, add it as new primary
    if(currentServer == null) {
      primary = server;
      return;
    }

    // We found a server, make it primary and remove it from the secondaries
    // Remove the server first
    this.remove(currentServer);
    // Set as primary
    primary = currentServer;
  }

  var add = function(list, server) {
    // Check if the server is a secondary at the moment
    for(var i = 0; i < list.length; i++) {
      if(list[i].equals(server)) return;
    }

    list.push(server);    
  }

  /**
   * Add server to list of secondaries
   * @method
   * @param {Server} server Server we wish to add
   */
  this.addSecondary = function(server) {
    add(secondaries, server);
  }

  /**
   * Add server to list of arbiters
   * @method
   * @param {Server} server Server we wish to add
   */
  this.addArbiter = function(server) {
    add(arbiters, server);
  }

  /**
   * Add server to list of passives
   * @method
   * @param {Server} server Server we wish to add
   */
  this.addPassive = function(server) {
    add(passives, server);
  }
}

module.exports = State;