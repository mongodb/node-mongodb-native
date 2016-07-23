"use strict"

var inherits = require('util').inherits,
  f = require('util').format,
  EventEmitter = require('events').EventEmitter,
  Logger = require('../connection/logger'),
  ObjectId = require('bson').ObjectId,
  ReadPreference = require('./read_preference'),
  MongoError = require('../error');

var TopologyType = {
  'Single': 'Single', 'ReplicaSetNoPrimary': 'ReplicaSetNoPrimary',
  'ReplicaSetWithPrimary': 'ReplicaSetWithPrimary', 'Sharded': 'Sharded',
  'Unknown': 'Unknown'
};

var ServerType = {
  'Standalone': 'Standalone', 'Mongos': 'Mongos', 'PossiblePrimary': 'PossiblePrimary',
  'RSPrimary': 'RSPrimary', 'RSSecondary': 'RSSecondary', 'RSArbiter': 'RSArbiter',
  'RSOther': 'RSOther', 'RSGhost': 'RSGhost', 'Unknown': 'Unknown'
};

var ReplSetState = function(options) {
  options = options || {};
  // Add event listener
  EventEmitter.call(this);
  // Topology state
  this.topologyType = TopologyType.ReplicaSetNoPrimary;
  this.setName = options.setName;

  // Server set
  this.set = {};

  // Unpacked options
  this.id = options.id;
  this.setName = options.setName;

  // Replicaset logger
  this.logger = options.logger || Logger('ReplSet', options);

  // Server selection index
  this.index = 0;
  // Acceptable latency
  this.acceptableLatency = options.acceptableLatency || 15;

  // heartbeatFrequencyMS
  this.heartbeatFrequencyMS = options.heartbeatFrequencyMS || 10000;

  // Server side
  this.primary = null;
  this.secondaries = [];
  this.arbiters = [];
  this.passives = [];
  this.ghosts = [];
  // Current unknown hosts
  this.unknownServers = [];
  // In set status
  this.set = {};
  // Status
  this.maxElectionId = null;
  this.maxSetVersion = 0;
  // Description of the Replicaset
  this.replicasetDescription = {
    "topologyType": "Unknown", "servers": []
  };
}

inherits(ReplSetState, EventEmitter);

ReplSetState.prototype.hasPrimaryAndSecondary = function(server) {
  return this.primary && this.secondaries.length > 0;
}

ReplSetState.prototype.hasPrimary = function(server) {
  return this.primary != null;
}

ReplSetState.prototype.hasSecondary = function(server) {
  return this.secondaries.length > 0;
}

ReplSetState.prototype.allServers = function(options) {
  options = options || {};
  var servers = this.primary ? [this.primary] : [];
  servers = servers.concat(this.secondaries);
  if(!options.ignoreArbiters) servers = servers.concat(this.arbiters);
  servers = servers.concat(this.passives);
  return servers;
}

ReplSetState.prototype.destroy = function() {
  // Destroy all sockets
  if(this.primary) this.primary.destroy();
  this.secondaries.forEach(function(x) { x.destroy(); });
  this.arbiters.forEach(function(x) { x.destroy(); });
  this.passives.forEach(function(x) { x.destroy(); });
  this.ghosts.forEach(function(x) { x.destroy(); });
  // Clear out the complete state
  this.secondaries = [];
  this.arbiters = [];
  this.passives = [];
  this.ghosts = [];
  this.unknownServers = [];
  this.set = {};
}

ReplSetState.prototype.remove = function(server, options) {
  options = options || {};

  // Only remove if the current server is not connected
  var servers = this.primary ? [this.primary] : [];
  servers = servers.concat(this.secondaries);
  servers = servers.concat(this.arbiters);
  servers = servers.concat(this.passives);

  // Check if it's active and this is just a failed connection attempt
  for(var i = 0; i < servers.length; i++) {
    if(!options.force && servers[i].equals(server) && servers[i].isConnected && servers[i].isConnected()) {
      return;
    }
  }

  // If we have it in the set remove it
  if(this.set[server.name]) {
    this.set[server.name].type = ServerType.Unknown;
    this.set[server.name].electionId = null;
    this.set[server.name].setName = null;
    this.set[server.name].setVersion = null;
  }

  // Remove type
  var removeType = null;

  // Remove from any lists
  if(this.primary && this.primary.equals(server)) {
    this.primary = null;
    this.topologyType = TopologyType.ReplicaSetNoPrimary;
    removeType = 'primary';
  }

  // Remove from any other server lists
  removeType = removeFrom(server, this.secondaries) ? 'secondary' : removeType;
  removeType = removeFrom(server, this.arbiters) ? 'arbiter' : removeType;
  removeType = removeFrom(server, this.passives) ? 'secondary' : removeType;
  removeFrom(server, this.ghosts);
  removeFrom(server, this.unknownServers);

  // Do we have a removeType
  if(removeType) {
    this.emit('left', removeType, server);
  }
}

ReplSetState.prototype.update = function(server) {
  var self = this;
  // Get the current ismaster
  var ismaster = server.lastIsMaster();

  //
  // Add any hosts
  //
  if(ismaster) {
    // Join all the possible new hosts
    var hosts = Array.isArray(ismaster.hosts) ? ismaster.hosts : [];
    hosts = hosts.concat(Array.isArray(ismaster.arbiters) ? ismaster.arbiters : []);
    hosts = hosts.concat(Array.isArray(ismaster.passives) ? ismaster.passives : []);

    // Add all hosts as unknownServers
    for(var i = 0; i < hosts.length; i++) {
      // Add to the list of unknown server
      if(this.unknownServers.indexOf(hosts[i]) == -1
        && (!this.set[hosts[i]] || this.set[hosts[i]].type == ServerType.Unknown)) {
        this.unknownServers.push(hosts[i]);
      }

      if(!this.set[hosts[i]]) {
        this.set[hosts[i]] = {
          type: ServerType.Unknown,
          electionId: null,
          setName: null,
          setVersion: null
        }
      }
    }
  }

  //
  // Unknown server
  //
  if(!ismaster && !inList(ismaster, server, this.unknownServers)) {
    self.set[server.name] = {
      type: ServerType.Unknown, setVersion: null, electionId: null, setName: null
    }
    // Update set information about the server instance
    self.set[server.name].type = ServerType.Unknown;
    self.set[server.name].electionId = ismaster ? ismaster.electionId : ismaster;
    self.set[server.name].setName = ismaster ? ismaster.setName : ismaster;
    self.set[server.name].setVersion = ismaster ? ismaster.setVersion : ismaster;

    if(self.unknownServers.indexOf(server.name) == -1) {
      self.unknownServers.push(server.name);
    }

    // Set the topology
    return false;
  }

  //
  // Is this a mongos
  //
  if(ismaster && ismaster.msg == 'isdbgrid') {
    return false;
  }

  // A RSOther instance
  if((ismaster.setName && ismaster.hidden)
    || (ismaster.setName && !ismaster.ismaster && !ismaster.secondary && !ismaster.arbiterOnly && !ismaster.passive)) {
    self.set[server.name] = {
      type: ServerType.RSOther, setVersion: null,
      electionId: null, setName: ismaster.setName
    }
    // Set the topology
    this.topologyType = this.primary ? TopologyType.ReplicaSetWithPrimary : TopologyType.ReplicaSetNoPrimary;
    if(ismaster.setName) this.setName = ismaster.setName;
    return false;
  }

  // A RSGhost instance
  if(ismaster.isreplicaset) {
    self.set[server.name] = {
      type: ServerType.RSGhost, setVersion: null,
      electionId: null, setName: null
    }

    // Set the topology
    this.topologyType = this.primary ? TopologyType.ReplicaSetWithPrimary : TopologyType.ReplicaSetNoPrimary;
    if(ismaster.setName) this.setName = ismaster.setName;

    // Set the topology
    return false;
  }

  //
  // Standalone server, destroy and return
  //
  if(ismaster && ismaster.ismaster && !ismaster.setName) {
    this.topologyType = this.primary ? TopologyType.ReplicaSetWithPrimary : TopologyType.Unknown;
    this.remove(server, {force:true});
    return false;
  }

  //
  // Server in maintanance mode
  //
  if(ismaster && !ismaster.ismaster && !ismaster.secondary && !ismaster.arbiterOnly) {
    this.remove(server, {force:true});
    return false;
  }

  //
  // If the .me field does not match the passed in server
  //
  if(ismaster.me && ismaster.me != server.name) {
    if(this.logger.isWarn()) {
      this.logger.warn(f('the seedlist server was removed due to its address %s not matching its ismaster.me address %s', server.name, ismaster.me));
    }

    // Set the type of topology we have
    if(this.primary && !this.primary.equals(server)) {
      this.topologyType = TopologyType.ReplicaSetWithPrimary;
    } else {
      this.topologyType = TopologyType.ReplicaSetNoPrimary;
    }

    return false;
  }

  //
  // Primary handling
  //
  if(!this.primary && ismaster.ismaster && ismaster.setName) {
    var ismasterElectionId = server.lastIsMaster().electionId;
    if(this.setName && this.setName != ismaster.setName) {
      this.topologyType = TopologyType.ReplicaSetNoPrimary;
      return new MongoError(f('setName from ismaster does not match provided connection setName [%s] != [%s]', ismaster.setName, this.setName));
    }

    if(!this.maxElectionId && ismasterElectionId) {
      this.maxElectionId = ismasterElectionId;
    } else if(this.maxElectionId && ismasterElectionId) {
      var result = compareObjectIds(this.maxElectionId, ismasterElectionId);
      // Get the electionIds
      var ismasterSetVersion = server.lastIsMaster().setVersion;

      // if(result == 1 || result == 0) {
      if(result == 1) {
        this.topologyType = TopologyType.ReplicaSetNoPrimary;
        return false;
      } else if(result == 0 && ismasterSetVersion) {
        if(ismasterSetVersion < this.maxSetVersion) {
          this.topologyType = TopologyType.ReplicaSetNoPrimary;
          return false;
        }
      }

      this.maxSetVersion = ismasterSetVersion;
      this.maxElectionId = ismasterElectionId;
    }

    self.primary = server;
    self.set[server.name] = {
      type: ServerType.RSPrimary,
      setVersion: ismaster.setVersion,
      electionId: ismaster.electionId,
      setName: ismaster.setName
    }

    // Set the topology
    this.topologyType = TopologyType.ReplicaSetWithPrimary;
    if(ismaster.setName) this.setName = ismaster.setName;
    removeFrom(server, self.unknownServers);
    removeFrom(server, self.secondaries);
    removeFrom(server, self.passives);
    self.emit('joined', 'primary', server);
    emitTopologyDescriptionChanged(self);
    return true;
  } else if(ismaster.ismaster && ismaster.setName) {
    // Get the electionIds
    var currentElectionId = self.set[self.primary.name].electionId;
    var currentSetVersion = self.set[self.primary.name].setVersion;
    var currentSetName = self.set[self.primary.name].setName;
    var ismasterElectionId = server.lastIsMaster().electionId;
    var ismasterSetVersion = server.lastIsMaster().setVersion;
    var ismasterSetName = server.lastIsMaster().setName;

    // Is it the same server instance
    if(this.primary.equals(server)
      && currentSetName == ismasterSetName) {
        return false;
    }

    // If we do not have the same rs name
    if(currentSetName && currentSetName != ismasterSetName) {
      if(!this.primary.equals(server)) {
        this.topologyType = TopologyType.ReplicaSetWithPrimary;
      } else {
        this.topologyType = TopologyType.ReplicaSetNoPrimary;
      }

      return false;
    }

    // Check if we need to replace the server
    if(currentElectionId && ismasterElectionId) {
      var result = compareObjectIds(currentElectionId, ismasterElectionId);

      if(result == 1) {
        return false;
      } else if(result == 0 && (currentSetVersion > ismasterSetVersion)) {
        return false;
      }
    } else if(!currentElectionId && ismasterElectionId
      && ismasterSetVersion) {
        if(ismasterSetVersion < this.maxSetVersion) {
          return false;
        }
    }

    if(!this.maxElectionId && ismasterElectionId) {
      this.maxElectionId = ismasterElectionId;
    } else if(this.maxElectionId && ismasterElectionId) {
      var result = compareObjectIds(this.maxElectionId, ismasterElectionId);

      if(result == 1) {
        return false;
      } else if(result == 0 && currentSetVersion && ismasterSetVersion) {
        if(ismasterSetVersion < this.maxSetVersion) {
          return false;
        }
      } else {
        if(ismasterSetVersion < this.maxSetVersion) {
          return false;
        }
      }

      this.maxElectionId = ismasterElectionId;
      this.maxSetVersion = ismasterSetVersion;
    } else {
      this.maxSetVersion = ismasterSetVersion;
    }

    // Modify the entry to unknown
    self.set[self.primary.name] = {
      type: ServerType.Unknown, setVersion: null,
      electionId: null, setName: null
    }

    // Signal primary left
    self.emit('left', 'primary', this.primary);
    // Destroy the instance
    self.primary.destroy();
    // Set the new instance
    self.primary = server;
    // Set the set information
    self.set[server.name] = {
      type: ServerType.RSPrimary, setVersion: ismaster.setVersion,
      electionId: ismaster.electionId, setName: ismaster.setName
    }

    // Set the topology
    this.topologyType = TopologyType.ReplicaSetWithPrimary;
    if(ismaster.setName) this.setName = ismaster.setName;
    removeFrom(server, self.unknownServers);
    removeFrom(server, self.secondaries);
    removeFrom(server, self.passives);
    self.emit('joined', 'primary', server);
    emitTopologyDescriptionChanged(self);
    return true;
  }

  // A possible instance
  if(!this.primary && ismaster.primary) {
    self.set[ismaster.primary] = {
      type: ServerType.PossiblePrimary, setVersion: null,
      electionId: null, setName: null
    }
  }

  //
  // Secondary handling
  //
  if(ismaster.secondary && ismaster.setName
    && !inList(ismaster, server, this.secondaries)
    && this.setName && this.setName == ismaster.setName) {
    addToList(self, ServerType.RSSecondary, ismaster, server, this.secondaries);
    // Set the topology
    this.topologyType = this.primary ? TopologyType.ReplicaSetWithPrimary : TopologyType.ReplicaSetNoPrimary;
    if(ismaster.setName) this.setName = ismaster.setName;
    removeFrom(server, self.unknownServers);

    // Remove primary
    if(this.primary && this.primary.name == server.name) {
      server.destroy();
      this.primary = null;
      self.emit('left', 'primary', server);
    }

    self.emit('joined', 'secondary', server);
    emitTopologyDescriptionChanged(self);
    return true;
  }

  //
  // Arbiter handling
  //
  if(ismaster.arbiterOnly && ismaster.setName
    && !inList(ismaster, server, this.arbiters)
    && this.setName && this.setName == ismaster.setName) {
    addToList(self, ServerType.RSArbiter, ismaster, server, this.arbiters);
    // Set the topology
    this.topologyType = this.primary ? TopologyType.ReplicaSetWithPrimary : TopologyType.ReplicaSetNoPrimary;
    if(ismaster.setName) this.setName = ismaster.setName;
    removeFrom(server, self.unknownServers);
    self.emit('joined', 'arbiter', server);
    emitTopologyDescriptionChanged(self);
    return true;
  }

  //
  // Passive handling
  //
  if(ismaster.passive && ismaster.setName
    && !inList(ismaster, server, this.passives)
    && this.setName && this.setName == ismaster.setName) {
    addToList(self, ServerType.RSSecondary, ismaster, server, this.passives);
    // Set the topology
    this.topologyType = this.primary ? TopologyType.ReplicaSetWithPrimary : TopologyType.ReplicaSetNoPrimary;
    if(ismaster.setName) this.setName = ismaster.setName;
    removeFrom(server, self.unknownServers);

    // Remove primary
    if(this.primary && this.primary.name == server.name) {
      server.destroy();
      this.primary = null;
      self.emit('left', 'primary', server);
    }

    self.emit('joined', 'secondary', server);
    emitTopologyDescriptionChanged(self);
    return true;
  }

  //
  // Remove the primary
  //
  if(this.set[server.name] && this.set[server.name].type == ServerType.RSPrimary) {
    self.emit('left', 'primary', this.primary);
    this.primary.destroy();
    this.primary = null;
    this.topologyType = TopologyType.ReplicaSetNoPrimary;
    return false;
  }

  this.topologyType = this.primary ? TopologyType.ReplicaSetWithPrimary : TopologyType.ReplicaSetNoPrimary;
  return false;
}

/**
 * Recalculate single server max staleness
 * @method
 * @return
 */
ReplSetState.prototype.updateServerMaxStaleness = function(server, haInterval) {
  // Locate the max secondary lastwrite
  var max = 0;
  // Go over all secondaries
  for(var i = 0; i < this.secondaries.length; i++) {
    max = Math.max(max, this.secondaries[i].lastWriteDate);
  }
  // console.log("!!!!!!!!!!!!!!!! 0")
  // console.dir(max)
  // Perform this servers staleness calculation
  if(server.ismaster.maxWireVersion >= 5
    && server.ismaster.secondary
    && this.hasPrimary()) {
      // console.log("=========== updateServerMaxStaleness 0")
    server.staleness = (server.lastUpdateTime - server.lastWriteDate)
      - (this.primary.lastUpdateTime - this.primary.lastWriteDate)
      + haInterval;
  } else if(server.ismaster.maxWireVersion >= 5
    && server.ismaster.secondary){
      // console.log("=========== updateServerMaxStaleness 1")
      // console.log("    max :: " + max)
      // console.log("    server.lastWriteDate :: " + server.lastWriteDate)
      // console.log("    haInterval :: " + haInterval)
    server.staleness = max - server.lastWriteDate + haInterval;
  }
}

/**
 * Recalculate all the stalness values for secodaries
 * @method
 * @return
 */
ReplSetState.prototype.updateSecondariesMaxStaleness = function(haInterval) {
  for(var i = 0; i < this.secondaries.length; i++) {
    this.updateServerMaxStaleness(this.secondaries[i], haInterval);
  }
}

/**
 * Pick a server by the passed in ReadPreference
 * @method
 * @param {ReadPreference} readPreference The ReadPreference instance to use
 * @return
 */
ReplSetState.prototype.pickServer = function(readPreference) {
  // If no read Preference set to primary by default
  readPreference = readPreference || ReadPreference.primary;

  // maxStalenessMS is not allowed with a primary read
  if(readPreference.preference == 'primary' && readPreference.maxStalenessMS) {
    return new MongoError('primary readPreference incompatible with maxStalenessMS');
  }

  // Check if we have any non compatible servers for maxStalenessMS
  var allservers = this.primary ? [this.primary] : [];
  allservers = allservers.concat(this.secondaries);

  // Does any of the servers not support the right wire protocol version
  // for maxStalenessMS when maxStalenessMS specified on readPreference. Then error out
  if(readPreference.maxStalenessMS) {
    for(var i = 0; i < allservers.length; i++) {
      if(allservers[i].ismaster.maxWireVersion < 5) {
        return new MongoError('maxStalenessMS not supported by at least one of the replicaset members');
      }
    }
  }

  // Do we have the nearest readPreference
  if(readPreference.preference == 'nearest' && !readPreference.maxStalenessMS) {
    return pickNearest(this, readPreference);
  } else if(readPreference.preference == 'nearest' && readPreference.maxStalenessMS) {
    return pickNearestMaxStalenessMS(this, readPreference);
  }

  // Get all the secondaries
  var secondaries = this.secondaries;

  // Check if we can satisfy and of the basic read Preferences
  if(readPreference.equals(ReadPreference.secondary)
    && secondaries.length == 0) {
      return new MongoError("no secondary server available");
    }

  if(readPreference.equals(ReadPreference.secondaryPreferred)
    && secondaries.length == 0
    && this.primary == null) {
      return new MongoError("no secondary or primary server available");
    }

  if(readPreference.equals(ReadPreference.primary)
    && this.primary == null) {
      return new MongoError("no primary server available");
    }

  // Secondary preferred or just secondaries
  if(readPreference.equals(ReadPreference.secondaryPreferred)
    || readPreference.equals(ReadPreference.secondary)) {

    if(secondaries.length > 0 && !readPreference.maxStalenessMS) {
      // Pick nearest of any other servers available
      var server = pickNearest(this, readPreference);
      // No server in the window return primary
      if(server) {
        return server;
      }
    } else if(secondaries.length > 0 && readPreference.maxStalenessMS) {
      // Pick nearest of any other servers available
      var server = pickNearestMaxStalenessMS(this, readPreference);
      // No server in the window return primary
      if(server) {
        return server;
      }
    }

    if(readPreference.equals(ReadPreference.secondaryPreferred)){
      return this.primary;
    }

    return null;
  }

  // Primary preferred
  if(readPreference.equals(ReadPreference.primaryPreferred)) {
    // console.log("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! primaryPreferred")
    var server = null;

    // We prefer the primary if it's available
    if(this.primary) {
      return this.primary;
    }

    // Pick a secondary
    if(secondaries.length > 0 && !readPreference.maxStalenessMS) {
      // console.log("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! primaryPreferred 0")
      server = pickNearest(this, readPreference);
    } else if(secondaries.length > 0 && readPreference.maxStalenessMS) {
      // console.log("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! primaryPreferred 1")
      server = pickNearestMaxStalenessMS(this, readPreference);
    }

    //  Did we find a server
    if(server) return server;
  }

  // Return the primary
  return this.primary;
}

//
// Filter serves by tags
var filterByTags = function(readPreference, servers) {
  if(readPreference.tags == null) return servers;
  var filteredServers = [];
  var tagsArray = Array.isArray(readPreference.tags) ? readPreference.tags : [readPreference.tags];

  // Iterate over the tags
  for(var j = 0; j < tagsArray.length; j++) {
    var tags = tagsArray[j];

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
      if(found) {
        filteredServers.push(servers[i]);
      }
    }

    // We found servers by the highest priority
    if(found) break;
  }

  // Returned filtered servers
  return filteredServers;
}

function pickNearestMaxStalenessMS(self, readPreference) {
  // console.log("=== pickNearestMaxStalenessMS 0")
  // Only get primary and secondaries as seeds
  var seeds = {};
  var servers = [];
  var heartbeatFrequencyMS = self.heartbeatFrequencyMS;

  // console.log("=== readPreference.maxStalenessMS = " + readPreference.maxStalenessMS)
  // console.log("=== (heartbeatFrequencyMS * 2) = " + (heartbeatFrequencyMS * 2))

  // Check if the maxStalenessMS > heartbeatFrequencyMS * 2
  if(readPreference.maxStalenessMS < (heartbeatFrequencyMS * 2)) {
    return new MongoError('maxStalenessMS must be at least twice the haInterval');
  }

  // Add primary to list if not a secondary read preference
  if(self.primary && readPreference.preference != 'secondary') {
    servers.push(self.primary);
  }

  // Add all the secondaries
  for(var i = 0; i < self.secondaries.length; i++) {
    servers.push(self.secondaries[i]);
  }

  // Filter by tags
  servers = filterByTags(readPreference, servers);
  // console.log("=== pickNearestMaxStalenessMS 1 :: " + servers.length)

  //
  // // Locate lowest time (picked servers are lowest time + acceptable Latency margin)
  // var lowest = servers.length > 0 ? servers[0].lastIsMasterMS : 0;

  // Filter by latency
  servers = servers.filter(function(s) {
    // console.log("  == " + s.name + " :: " + s.staleness + " <= " + readPreference.maxStalenessMS)
    return s.staleness <= readPreference.maxStalenessMS;
  });
  // console.log("=== pickNearestMaxStalenessMS 2 :: " + servers.length)

  // Sort by time
  servers.sort(function(a, b) {
    // return a.time > b.time;
    return a.lastIsMasterMS > b.lastIsMasterMS
  });

  // console.log("^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ servers.length = " + servers.length)
  // console.log(servers.map(function(x) { return x.name}))

  // No servers, default to primary
  if(servers.length == 0) {
    return null
  }

  // Ensure index does not overflow the number of available servers
  self.index = self.index % servers.length;

  // // Does any of the servers not support the right wire protocol version
  // // Then error out
  // for(var i = 0; i < servers.length; i++) {
  //   if(servers[i].ismaster.maxWireVersion < 5) {
  //     return new MongoError('maxStalenessMS not supported by at least one of the replicaset members');
  //   }
  // }

  // Get the server
  var server = servers[self.index];
  // Add to the index
  self.index = self.index + 1;
  // Return the first server of the sorted and filtered list
  return server;
}

function pickNearest(self, readPreference) {
  // Only get primary and secondaries as seeds
  var seeds = {};
  var servers = [];

  // Add primary to list if not a secondary read preference
  if(self.primary && readPreference.preference != 'secondary') {
    servers.push(self.primary);
  }

  // Add all the secondaries
  for(var i = 0; i < self.secondaries.length; i++) {
    servers.push(self.secondaries[i]);
  }

  // Filter by tags
  servers = filterByTags(readPreference, servers);

  // Sort by time
  servers.sort(function(a, b) {
    // return a.time > b.time;
    return a.lastIsMasterMS > b.lastIsMasterMS
  });

  // Locate lowest time (picked servers are lowest time + acceptable Latency margin)
  var lowest = servers.length > 0 ? servers[0].lastIsMasterMS : 0;

  // Filter by latency
  servers = servers.filter(function(s) {
    return s.lastIsMasterMS <= lowest + self.acceptableLatency;
  });

  // No servers, default to primary
  if(servers.length == 0) {
    return null
  }

  // Ensure index does not overflow the number of available servers
  self.index = self.index % servers.length;
  // Get the server
  var server = servers[self.index];
  // Add to the index
  self.index = self.index + 1;
  // Return the first server of the sorted and filtered list
  return server;
}

function inList(ismaster, server, list) {
  for(var i = 0; i < list.length; i++) {
    if(list[i].name == server.name) return true;
  }

  return false;
}

function addToList(self, type, ismaster, server, list) {
  // Update set information about the server instance
  self.set[server.name].type = type;
  self.set[server.name].electionId = ismaster ? ismaster.electionId : ismaster;
  self.set[server.name].setName = ismaster ? ismaster.setName : ismaster;
  self.set[server.name].setVersion = ismaster ? ismaster.setVersion : ismaster;
  // Add to the list
  list.push(server);
}

function compareObjectIds(id1, id2) {
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

function removeFrom(server, list) {
  for(var i = 0; i < list.length; i++) {
    if(list[i].equals && list[i].equals(server)) {
      list.splice(i, 1);
      return true;
    } else if(typeof list[i] == 'string' && list[i] == server.name) {
      list.splice(i, 1);
      return true;
    }
  }

  return false;
}

function emitTopologyDescriptionChanged(self) {
  if(self.listeners('topologyDescriptionChanged').length > 0) {
    var topology = 'Unknown';
    var setName = self.setName;

    if(self.hasPrimaryAndSecondary()) {
      topology = 'ReplicaSetWithPrimary';
    } else if(!self.hasPrimary() && self.hasSecondary()) {
      topology = 'ReplicaSetNoPrimary';
    }

    // Generate description
    var description = {
      topologyType: topology,
      setName: setName,
      servers: []
    }

    // Add the primary to the list
    if(self.hasPrimary()) {
      var desc = self.primary.getDescription();
      desc.type = 'RSPrimary';
      description.servers.push(desc);
    }

    // Add all the secondaries
    description.servers = description.servers.concat(self.secondaries.map(function(x) {
      var description = x.getDescription();
      description.type = 'RSSecondary';
      return description;
    }));

    // Add all the arbiters
    description.servers = description.servers.concat(self.arbiters.map(function(x) {
      var description = x.getDescription();
      description.type = 'RSArbiter';
      return description;
    }));

    // Add all the passives
    description.servers = description.servers.concat(self.passives.map(function(x) {
      var description = x.getDescription();
      description.type = 'RSSecondary';
      return description;
    }));

    // Create the result
    var result = {
      topologyId: self.id,
      previousDescription: self.replicasetDescription,
      newDescription: description,
      diff: diff(self.replicasetDescription, description)
    };

    // Emit the topologyDescription change
    self.emit('topologyDescriptionChanged', result);

    // Set the new description
    self.replicasetDescription = description;
  }
}

function diff(previous, current) {
  // Difference document
  var diff = {
    servers: []
  }

  // Previous entry
  if(!previous) {
    previous = { servers: [] };
  }

  // Got through all the servers
  for(var i = 0; i < previous.servers.length; i++) {
    var prevServer = previous.servers[i];

    // Go through all current servers
    for(var j = 0; j < current.servers.length; j++) {
      var currServer = current.servers[j];

      // Matching server
      if(prevServer.address === currServer.address) {
        // We had a change in state
        if(prevServer.type != currServer.type) {
          diff.servers.push({
            address: prevServer.address,
            from: prevServer.type,
            to: currServer.type
          });
        }
      }
    }
  }

  // Return difference
  return diff;
}

module.exports = ReplSetState;
