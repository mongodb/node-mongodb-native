var Logger = require('../connection/logger')
  , f = require('util').format
  , MongoError = require('../error');

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
var State = function(replSet, options) {
  var secondaries = [];
  var arbiters = [];
  var passives = [];
  var primary = null;
  // Initial state is disconnected
  var state = DISCONNECTED;
  // Get a logger instance
  var logger = Logger('ReplSet', options);
  // Unpacked options
  var id = options.id;
  var setName = options.setName;
  var connectingServers = options.connectingServers;
  var secondaryOnlyConnectionAllowed = options.secondaryOnlyConnectionAllowed;

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

  Object.defineProperty(this, 'setName', {
      enumerable:true
    , get: function() { return setName; }
  });

  Object.defineProperty(this, 'state', {
      enumerable:true
    , get: function() { return state; }
    , set: function(value) { state = value; }
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

    var length = arbiters.length;
    // Filter out the server from the arbiters
    arbiters = arbiters.filter(function(s) {
      return !s.equals(server);
    });
    if(arbiters.length < length) return 'arbiter';

    var length = passives.length;
    // Filter out the server from the passives
    passives = passives.filter(function(s) {
      return !s.equals(server);
    });
    if(passives.length < length) return 'passive';

    // var length = secondaries.length;
    // Filter out the server from the secondaries
    secondaries = secondaries.filter(function(s) {
      return !s.equals(server);
    });
    // if(secondaries.length < length) return 'secondary';
    return 'secondary';

    // Return that it's a secondary
    return null;
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
      if(list[i].equals(server)) return false;
    }

    list.push(server);
    return true; 
  }

  /**
   * Add server to list of secondaries
   * @method
   * @param {Server} server Server we wish to add
   */
  this.addSecondary = function(server) {
    return add(secondaries, server);
  }

  /**
   * Add server to list of arbiters
   * @method
   * @param {Server} server Server we wish to add
   */
  this.addArbiter = function(server) {
    return add(arbiters, server);
  }

  /**
   * Add server to list of passives
   * @method
   * @param {Server} server Server we wish to add
   */
  this.addPassive = function(server) {
    return add(passives, server);
  }

  // // Add to server list if not there
  // var addToList = function(ismaster, list, server) {
  //   // Clean up
  //   delete connectingServers[server.name];

  //   // Iterate over all the list items
  //   for(var i = 0; i < list.length; i++) {
  //     console.log("####################### EQUAL")
  //     console.log(list[i].name + " :: " + server.name)
  //     if(list[i].equals(server)) {
  //     console.log("####################### EQUAL1")
  //       server.destroy();
  //       return false;
  //     }
  //   }

  //     console.log("####################### EQUAL 1")
  //   // Add to list
  //   list.push(server);
  //   return true;
  // }

  // this.updateHA = function(ismaster, server) {
  //   // console.log("---------------------------------------- updateHA")
  //   var self = this;
  //   // Let's check what kind of server this is
  //   if(ismaster.ismaster && setName == ismaster.setName
  //     && !self.isPrimary(ismaster.me)) {
        
  //       if(logger.isInfo()) logger.info(f('[%s] promoting %s to primary', id, ismaster.me));
  //       self.promotePrimary(server);
  //       replSet.emit('reconnect', server);
  //       replSet.emit('joined', 'primary', server);
  //   } else if(ismaster.secondary && ismaster.passive && setName == ismaster.setName
  //     && !self.isPassive(ismaster.me)) {
        
  //       if(logger.isInfo()) logger.info(f('[%s] promoting %s to secondary', id, ismaster.me));
  //       self.addPassive(server);
  //       replSet.emit('joined', 'passive', server);
  //   } else if(ismaster.secondary && setName == ismaster.setName
  //     && !self.isSecondary(ismaster.me)) {
        
  //       if(logger.isInfo()) logger.info(f('[%s] promoting %s to secondary', id, ismaster.me));
  //       self.addSecondary(server);
  //       replSet.emit('joined', 'secondary', server);
  //   } else if(ismaster.arbiterOnly && setName == ismaster.setName) {
      
  //     if(logger.isInfo()) logger.info(f('[%s] promoting %s to ariter', id, ismaster.me));
  //     self.addArbiter(server);
  //     replSet.emit('joined', 'arbiter', server);
  //   } else if(!ismaster.ismaster && !ismaster.secondary && !ismaster.arbiterOnly) {
  //     console.log("----------------------------- LEFT")
  //     if(logger.isInfo()) logger.info(f('[%s] removing %s from set', id, ismaster.me));
  //     replSet.emit('left', self.remove(server), server);
  //   }    
  // }

  /**
   * Update the state given a specific ismaster result
   * @method
   * @param {object} ismaster IsMaster result
   * @param {Server} server IsMaster Server source
   */
  this.update = function(ismaster, server) {
    // console.log("-------------------------------------------------- 0")
    var self = this;
    // Not in a known connection valid state
    if(!ismaster.ismaster && !ismaster.secondary && !ismaster.arbiterOnly) {
    // console.log("-------------------------e------------------------- 1")
      // Remove the state
      var result = self.remove(server);
      if(state == CONNECTED)  {
        if(logger.isInfo()) logger.info(f('[%s] removing %s from set', id, ismaster.me));
        replSet.emit('left', self.remove(server), server);        
      }
    // console.log("-------------------------------------------------- 2")

      return false;
    }

    // Check if the replicaset name matches the provided one
    if(ismaster.setName && setName != ismaster.setName) {
      if(logger.isError()) logger.error(f('[%s] server in replset %s is not part of the specified setName %s', id, ismaster.setName, setName));
    // console.log("-------------------------------------------------- 3")
      self.remove(server);
      // if(result) replSet.emit('left', result, server);
      replSet.emit('error', new MongoError("provided setName for Replicaset Connection does not match setName found in server seedlist"));
    // console.log("-------------------------------------------------- 4")
      return false;
    }

    // Log information
    if(logger.isInfo()) logger.info(f('[%s] updating replicaset state %s', id, JSON.stringify(replState)));    
    // console.log("-------------------------------------------------- 5")

    // It's a master set it
    if(ismaster.ismaster && setName == ismaster.setName && !self.isPrimary(ismaster.me)) {
      self.promotePrimary(server);
      if(logger.isInfo()) logger.info(f('[%s] promoting %s to primary', id, ismaster.me));
    // console.log("-------------------------------------------------- 6")
      // Emit primary
      replSet.emit('joined', 'primary', primary);

    // console.log("-------------------------------------------------- 7")
      // We are connected
      if(state == CONNECTING) {
        state = CONNECTED;
        replSet.emit('connect', replSet);
      } else {
        replSet.emit('reconnect', server);        
      }
    // console.log("-------------------------------------------------- 8")
    } else if(!ismaster.ismaster && setName == ismaster.setName
      && ismaster.arbiterOnly) {
    // console.log("-------------------------------------------------- 9")
        if(self.addArbiter(server)) {
          if(logger.isInfo()) logger.info(f('[%s] promoting %s to arbiter', id, ismaster.me));
          replSet.emit('joined', 'arbiter', server);
          return true;
        };

    // console.log("-------------------------------------------------- 10")
        return false;
    } else if(!ismaster.ismaster && setName == ismaster.setName
      && ismaster.secondary && ismaster.passive) {
    // console.log("-------------------------------------------------- 11")
        if(self.addPassive(server)) {
          if(logger.isInfo()) logger.info(f('[%s] promoting %s to passive', id, ismaster.me));
          replSet.emit('joined', 'passive', server);
    // console.log("-------------------------------------------------- 11")
          return true;
        };

    // console.log("-------------------------------------------------- 12")
        return false;
    } else if(!ismaster.ismaster && setName == ismaster.setName
      && ismaster.secondary) {
    // console.log("-------------------------------------------------- 13")
        if(self.addSecondary(server)) {
    // console.log("-------------------------------------------------- 14")
          if(logger.isInfo()) logger.info(f('[%s] promoting %s to passive', id, ismaster.me));
          replSet.emit('joined', 'secondary', server);
          
          if(secondaryOnlyConnectionAllowed && state == CONNECTING) {
            state = CONNECTED;
            replSet.emit('connect', replSet);
          }

    // console.log("-------------------------------------------------- 15")
          return true;
        };

    // console.log("-------------------------------------------------- 16")
        return false;
    }

    // console.log("-------------------------------------------------- 17")
    // Return update applied
    return true;
  }
}

module.exports = State;