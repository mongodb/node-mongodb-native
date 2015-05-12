"use strict";

var Logger = require('../connection/logger')
  , f = require('util').format
  , ObjectId = require('bson').ObjectId
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
  this.replSet = replSet;
  this.options = options;
  this.secondaries = [];
  this.arbiters = [];
  this.passives = [];
  this.primary = null;
  // Initial state is disconnected
  this.state = DISCONNECTED;
  // Current electionId
  this.electionId = null;
  // Get a logger instance
  this.logger = Logger('ReplSet', options);
  // Unpacked options
  this.id = options.id;
  this.setName = options.setName;
  this.connectingServers = options.connectingServers;
  this.secondaryOnlyConnectionAllowed = options.secondaryOnlyConnectionAllowed;
}

/**
 * Is there a secondary connected
 * @method
 * @return {boolean}
 */
State.prototype.isSecondaryConnected = function() {
  for(var i = 0; i < this.secondaries.length; i++) {
    if(this.secondaries[i].isConnected()) return true;
  }

  return false;
}

/**
 * Is there a primary connection
 * @method
 * @return {boolean}
 */
State.prototype.isPrimaryConnected = function() {
  return this.primary != null && this.primary.isConnected();
}

/**
 * Is the given address the primary
 * @method
 * @param {string} address Server address
 * @return {boolean}
 */
State.prototype.isPrimary = function(address) {
  if(this.primary == null) return false;
  return this.primary && this.primary.equals(address);
}

/**
 * Is the given address a secondary
 * @method
 * @param {string} address Server address
 * @return {boolean}
 */
State.prototype.isSecondary = function(address) {
  // Check if the server is a secondary at the moment
  for(var i = 0; i < this.secondaries.length; i++) {
    if(this.secondaries[i].equals(address)) {
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
State.prototype.isPassive = function(address) {
  // Check if the server is a secondary at the moment
  for(var i = 0; i < this.passives.length; i++) {
    if(this.passives[i].equals(address)) {
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
State.prototype.contains = function(address) {
  if(this.primary && this.primary.equals(address)) return true;
  for(var i = 0; i < this.secondaries.length; i++) {
    if(this.secondaries[i].equals(address)) return true;
  }

  for(var i = 0; i < this.arbiters.length; i++) {
    if(this.arbiters[i].equals(address)) return true;
  }

  for(var i = 0; i < this.passives.length; i++) {
    if(this.passives[i].equals(address)) return true;
  }

  return false;
}

/**
 * Clean out all dead connections
 * @method
 */
State.prototype.clean = function() {
  if(this.primary != null && !this.primary.isConnected()) {
    this.primary = null;
  }

  // Filter out disconnected servers
  this.secondaries = this.secondaries.filter(function(s) {
    return s.isConnected();
  });

  // Filter out disconnected servers
  this.arbiters = this.arbiters.filter(function(s) {
    return s.isConnected();
  });
}

/**
 * Destroy state
 * @method
 */
State.prototype.destroy = function() {
  this.state = DESTROYED;
  if(this.primary) this.primary.destroy();
  this.secondaries.forEach(function(s) {
    s.destroy();
  });
}

/**
 * Remove server from state
 * @method
 * @param {Server} Server to remove
 * @return {string} Returns type of server removed (primary|secondary)
 */
State.prototype.remove = function(server) {
  if(this.primary && this.primary.equals(server)) {
    this.primary = null;
    return 'primary';
  }

  var length = this.arbiters.length;
  // Filter out the server from the arbiters
  this.arbiters = this.arbiters.filter(function(s) {
    return !s.equals(server);
  });
  if(this.arbiters.length < length) return 'arbiter';

  var length = this.passives.length;
  // Filter out the server from the passives
  this.passives = this.passives.filter(function(s) {
    return !s.equals(server);
  });

  // We have removed a passive
  if(this.passives.length < length)  {
    // Ensure we removed it from the list of secondaries as well if it exists
    this.secondaries = this.secondaries.filter(function(s) {
      return !s.equals(server);
    });

    return 'passive';
  }

  // Filter out the server from the secondaries
  this.secondaries = this.secondaries.filter(function(s) {
    return !s.equals(server);
  });

  return 'secondary';
}

/**
 * Get the server by name
 * @method
 * @param {string} address Server address
 * @return {Server}
 */
State.prototype.get = function(server) {
  var found = false;
  // All servers to search
  var servers = this.primary ? [this.primary] : [];
  servers = servers.concat(this.secondaries);
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
State.prototype.getAll = function() {
  var servers = [];
  if(this.primary) servers.push(this.primary);
  return servers.concat(this.secondaries);
}

/**
 * All raw connections
 * @method
 * @return {array}
 */
State.prototype.getAllConnections = function() {
  var connections = [];
  if(this.primary) connections = connections.concat(this.primary.connections());
  this.secondaries.forEach(function(s) {
    connections = connections.concat(s.connections());
  })

  return connections;
}

/**
 * Return JSON object
 * @method
 * @return {object}
 */
State.prototype.toJSON = function() {
  return {
      primary: this.primary ? this.primary.lastIsMaster().me : null
    , secondaries: this.secondaries.map(function(s) {
      return s.lastIsMaster().me
    })
  }
}

/**
 * Returns the last known ismaster document for this server
 * @method
 * @return {object}
 */
State.prototype.lastIsMaster = function() {
  if(this.primary) return this.primary.lastIsMaster();
  if(this.secondaries.length > 0) return this.secondaries[0].lastIsMaster();
  return {};
}

/**
 * Promote server to primary
 * @method
 * @param {Server} server Server we wish to promote
 */
State.prototype.promotePrimary = function(server) {
  var currentServer = this.get(server);
  // Server does not exist in the state, add it as new primary
  if(currentServer == null) {
    this.primary = server;
    return;
  }

  // We found a server, make it primary and remove it from the secondaries
  // Remove the server first
  this.remove(currentServer);
  // Set as primary
  this.primary = currentServer;
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
State.prototype.addSecondary = function(server) {
  return add(this.secondaries, server);
}

/**
 * Add server to list of arbiters
 * @method
 * @param {Server} server Server we wish to add
 */
State.prototype.addArbiter = function(server) {
  return add(this.arbiters, server);
}

/**
 * Add server to list of passives
 * @method
 * @param {Server} server Server we wish to add
 */
State.prototype.addPassive = function(server) {
  return add(this.passives, server);
}

var compareObjectIds = function(id1, id2) {
  var a = new Buffer(id1.toHexString(), 'hex');
  var b = new Buffer(id2.toHexString(), 'hex');

  if(a === b) {
    return 0;
  }

  if(typeof Buffer.compare === 'function') {
    return Buffer.compare(a, b);
  }

  var x = a.length;
  var y = b.length;
  var len = Math.min(x, y);

  for (var i = 0; i < len; i++) {
    if (a[i] !== b[i]) {
      break;
    }
  }

  if (i !== len) {
    x = a[i];
    y = b[i];
  }

  return x < y ? -1 : y < x ? 1 : 0;
}

/**
 * Update the state given a specific ismaster result
 * @method
 * @param {object} ismaster IsMaster result
 * @param {Server} server IsMaster Server source
 */
State.prototype.update = function(ismaster, server) {
  var self = this;
  // Not in a known connection valid state
  if(!ismaster.ismaster && !ismaster.secondary && !ismaster.arbiterOnly) {
    // Remove the state
    var result = self.remove(server);
    if(self.state == CONNECTED)  {
      if(self.logger.isInfo()) self.logger.info(f('[%s] removing %s from set', self.id, ismaster.me));
      self.replSet.emit('left', self.remove(server), server);
    }

    return false;
  }

  // Set the setName if it's not set from the first server
  if(self.setName == null && ismaster.setName) {
    if(self.logger.isInfo()) self.logger.info(f('[%s] setting setName to %s', self.id, ismaster.setName));
    self.setName = ismaster.setName;
  }

  // Check if the replicaset name matches the provided one
  if(ismaster.setName && self.setName != ismaster.setName) {
    if(self.logger.isError()) self.logger.error(f('[%s] server in replset %s is not part of the specified setName %s', self.id, ismaster.setName, self.setName));
    self.remove(server);
    self.replSet.emit('error', new MongoError("provided setName for Replicaset Connection does not match setName found in server seedlist"));
    return false;
  }

  // Log information
  if(self.logger.isInfo()) self.logger.info(f('[%s] updating replicaset state %s', self.id, JSON.stringify(this)));

  // It's a master set it
  if(ismaster.ismaster && self.setName == ismaster.setName && !self.isPrimary(ismaster.me)) {
    // Check if the electionId is not null
    if(ismaster.electionId instanceof ObjectId && self.electionId instanceof ObjectId) {
      if(compareObjectIds(self.electionId, ismaster.electionId) == -1) {
        self.electionId = ismaster.electionId;
      } else if(compareObjectIds(self.electionId, ismaster.electionId) == 0) {
        self.electionId = ismaster.electionId;
      } else {
        return false;
      }
    }

    // Initial electionId
    if(ismaster.electionId instanceof ObjectId && self.electionId == null) {
      self.electionId = ismaster.electionId;
    }

    // Promote to primary
    self.promotePrimary(server);
    // Log change of primary
    if(self.logger.isInfo()) self.logger.info(f('[%s] promoting %s to primary', self.id, ismaster.me));
    // Emit primary
    self.replSet.emit('joined', 'primary', this.primary);

    // We are connected
    if(self.state == CONNECTING) {
      self.state = CONNECTED;
      self.replSet.emit('connect', self.replSet);
    } else {
      self.state = CONNECTED;
      self.replSet.emit('reconnect', server);
    }
  } else if(!ismaster.ismaster && self.setName == ismaster.setName
    && ismaster.arbiterOnly) {
      if(self.addArbiter(server)) {
        if(self.logger.isInfo()) self.logger.info(f('[%s] promoting %s to arbiter', self.id, ismaster.me));
        self.replSet.emit('joined', 'arbiter', server);
        return true;
      };

      return false;
  } else if(!ismaster.ismaster && self.setName == ismaster.setName
    && ismaster.secondary && ismaster.passive) {
      if(self.addPassive(server) && self.addSecondary(server)) {
        if(self.logger.isInfo()) self.logger.info(f('[%s] promoting %s to passive', self.id, ismaster.me));
        self.replSet.emit('joined', 'passive', server);
        return true;
      };

      return false;
  } else if(!ismaster.ismaster && self.setName == ismaster.setName
    && ismaster.secondary) {
      if(self.addSecondary(server)) {
        if(self.logger.isInfo()) self.logger.info(f('[%s] promoting %s to passive', self.id, ismaster.me));
        self.replSet.emit('joined', 'secondary', server);

        if(self.secondaryOnlyConnectionAllowed && self.state == CONNECTING) {
          self.state = CONNECTED;
          self.replSet.emit('connect', self.replSet);
        }

        return true;
      };

      return false;
  }

  // Return update applied
  return true;
}

module.exports = State;
