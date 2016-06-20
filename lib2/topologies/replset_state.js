"use strict"

var inherits = require('util').inherits,
  f = require('util').format,
  EventEmitter = require('events').EventEmitter,
  ObjectId = require('bson').ObjectId;

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
}

inherits(ReplSetState, EventEmitter);

function removeFrom(server, list) {
  for(var i = 0; i < list.length; i++) {
    if(list[i].equals && list[i].equals(server)) {
      return list.splice(i, 1);
    } else if(typeof list[i] == 'string' && list[i] == server.name) {
      return list.splice(i, 1);
    }
  }
}

ReplSetState.prototype.remove = function(server) {
  this.set[server.name].type = ServerType.Unknown;
  this.set[server.name].electionId = null;
  this.set[server.name].setName = null;
  this.set[server.name].setVersion = null;

  // Remove from any lists
  if(this.primary && this.primary.equals(server)) {
    this.primary = null;
    this.topologyType = TopologyType.ReplicaSetNoPrimary;
  }

  // Remove from any other server lists
  removeFrom(server, this.secondaries);
  removeFrom(server, this.arbiters);
  removeFrom(server, this.passives);
  removeFrom(server, this.ghosts);
  removeFrom(server, this.unknownServers);
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
      if(!this.set[hosts[i]]) {
        this.set[hosts[i]] = {
          type: ServerType.Unknown,
          electionId: null,
          setName: null,
          setVersion: null
        }
      }

      // Add to the list of unknown server
      if(this.unknownServers.indexOf(hosts[i]) == -1) {
        this.unknownServers.push(hosts[i]);
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
    addToList(self, ServerType.Unknown, ismaster, server, this.unknownServers);
    // Set the topology
    return false;
  }

  //
  // Is this a mongos
  //
  if(ismaster && ismaster.msg == 'isdbgrid') {
    return false;
  }

  //
  // Standalone server, destroy and return
  //
  if(ismaster && ismaster.ismaster && !ismaster.setName) {
    this.topologyType = this.primary ? TopologyType.ReplicaSetWithPrimary : TopologyType.Unknown;
    return false;
  }

  //
  // If the .me field does not match the passed in server
  //
  if(ismaster.me && ismaster.me != server.name) {
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
      return false;
    }

    if(!this.maxElectionId && ismasterElectionId) {
      this.maxElectionId = ismasterElectionId;
    } else if(this.maxElectionId && ismasterElectionId) {
      var result = compareObjectIds(this.maxElectionId, ismasterElectionId);

      if(result == 1 || result == 0) {
        return false;
      }
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
    return true;
  } else if(ismaster.ismaster && ismaster.setName) {
    // Get the electionIds
    var currentElectionId = self.set[self.primary.name].electionId;
    var currentSetVersion = self.set[self.primary.name].setVersion;
    var currentSetName = self.set[self.primary.name].setName;
    var ismasterElectionId = server.lastIsMaster().electionId;
    var ismasterSetVersion = server.lastIsMaster().setVersion;
    var ismasterSetName = server.lastIsMaster().setName;

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
      && currentSetVersion && ismasterSetVersion) {
        if(ismasterSetVersion < currentSetVersion) {
          return false;
        }
    }

    if(!this.maxElectionId && ismasterElectionId) {
      this.maxElectionId = ismasterElectionId;
    } else if(this.maxElectionId && ismasterElectionId) {
      var result = compareObjectIds(this.maxElectionId, ismasterElectionId);

      if(result == 1) {
        return false;
      }
    }

    // Modify the entry to unknown
    self.set[self.primary.name] = {
      type: ServerType.Unknown, setVersion: null,
      electionId: null, setName: null
    }
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
    return true;
  }

  // A possible instance
  if(!this.primary && ismaster.primary) {
    self.set[ismaster.primary] = {
      type: ServerType.PossiblePrimary, setVersion: null,
      electionId: null, setName: null
    }
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
    return true;
  }

  //
  // Remove the primary
  //
  if(this.set[server.name] && this.set[server.name].type == ServerType.RSPrimary) {
    this.primary.destroy();
    this.primary = null;
    this.topologyType = TopologyType.ReplicaSetNoPrimary;
    return false;
  }

  this.topologyType = this.primary ? TopologyType.ReplicaSetWithPrimary : TopologyType.ReplicaSetNoPrimary;
  return false;
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

module.exports = ReplSetState;
