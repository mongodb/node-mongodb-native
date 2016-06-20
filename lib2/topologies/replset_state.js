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

var ReplSetState = function() {
  // Add event listener
  EventEmitter.call(this);
  // Topology state
  this.state = TopologyType.Unknown;
  this.setName = null;

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

ReplSetState.prototype.remove = function(server) {
  this.set[server.name].type = ServerType.Unknown;
  this.set[server.name].electionId = null;
  this.set[server.name].setName = null;
  this.set[server.name].setVersion = null;
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
    return false;
  }

  //
  // Standalone server, destroy and return
  //
  if(ismaster && ismaster.ismaster && !ismaster.setName) {
    return false;
  }

  //
  // Primary handling
  //
  if(!this.primary && ismaster.ismaster) {
    self.primary = server;
    self.set[server.name] = {
      type: ServerType.RSPrimary,
      setVersion: ismaster.setVersion,
      electionId: ismaster.electionId,
      setName: ismaster.setName
    }

    return true;
  } else if(ismaster.ismaster) {
    // Get the electionIds
    var currentElectionId = self.set[self.primary.name].electionId;
    var currentSetVersion = self.set[self.primary.name].setVersion;
    var currentSetName = self.set[self.primary.name].setName;
    var ismasterElectionId = server.lastIsMaster().electionId;
    var ismasterSetVersion = server.lastIsMaster().setVersion;
    var ismasterSetName = server.lastIsMaster().setName;

    // If we do not have the same rs name
    if(currentSetName && currentSetName != ismasterSetName) {
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

      // // Update the max election Id
      // this.maxElectionId = ismasterElectionId;
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

      if(result == 1 || result == 0) {
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
    return false;
  }

  // A RSOther instance
  if((ismaster.setName && ismaster.hidden)
    || (ismaster.setName && !ismaster.ismaster && !ismaster.secondary && !ismaster.arbiterOnly && !ismaster.passive)) {
    self.set[server.name] = {
      type: ServerType.RSOther, setVersion: null,
      electionId: null, setName: ismaster.setName
    }
    return false;
  }

  //
  // Secondary handling
  //
  if(ismaster.secondary && ismaster.setName && !inList(ismaster, server, this.secondaries)) {
    addToList(self, ServerType.RSSecondary, ismaster, server, this.secondaries);
    return true;
  }

  //
  // Arbiter handling
  //
  if(ismaster.arbiterOnly && ismaster.setName && !inList(ismaster, server, this.arbiters)) {
    addToList(self, ServerType.RSArbiter, ismaster, server, this.arbiters);
    return true;
  }

  //
  // Passive handling
  //
  if(ismaster.passive && ismaster.setName && !inList(ismaster, server, this.passives)) {
    addToList(self, ServerType.RSSecondary, ismaster, server, this.passives);
    return true;
  }

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
