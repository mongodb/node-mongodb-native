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
  // Status
  this.maxElectionId = null;
  this.maxSetVersion = 0;
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
  // console.log("================================== remove :: " + server.name)

  // Only remove if the current server is not connected
  var servers = this.primary ? [this.primary] : [];
  servers = servers.concat(this.secondaries);
  servers = servers.concat(this.arbiters);
  servers = servers.concat(this.passives);

  // Check if it's active and this is just a failed connection attempt
  for(var i = 0; i < servers.length; i++) {
    if(!options.force && servers[i].equals(server) && servers[i].isConnected && servers[i].isConnected()) {
      // console.log("============== removing server")
      // console.dir(server.ismaster)
      // console.log("============== current server")
      // console.dir(servers[i].ismaster)
      // console.log("================================== remove :: " + server.name)
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

  // console.log("=================================== remove :: " + removeType)
  // console.log("======== remove :: " + removeType + " :: " + server.name)
  // console.log(Object.keys(this.set))
  // Do we have a removeType
  if(removeType) {
    this.emit('left', removeType, server);
  }
}

ReplSetState.prototype.update = function(server) {
  var self = this;
  // Get the current ismaster
  var ismaster = server.lastIsMaster();
//   if(global.debug) {
//   console.log("========================== update")
//   console.dir(ismaster)
// }

  // console.log("=== ReplSetState.prototype.update 0")
  // console.dir(ismaster)

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
        // console.log("============ push unknownServers :: " + hosts[i])
        // console.dir(this.set[hosts[i]])
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

    // console.log("================== hosts :: ")
    // console.dir(this.unknownServers)
  }

  // console.log("=== ReplSetState.prototype.update 2")

  //
  // Unknown server
  //
  if(!ismaster && !inList(ismaster, server, this.unknownServers)) {
    self.set[server.name] = {
      type: ServerType.Unknown, setVersion: null, electionId: null, setName: null
    }
    // console.log("======== addToList unknownServers 0 :: " + server.name)
    // Update set information about the server instance
    self.set[server.name].type = ServerType.Unknown;
    self.set[server.name].electionId = ismaster ? ismaster.electionId : ismaster;
    self.set[server.name].setName = ismaster ? ismaster.setName : ismaster;
    self.set[server.name].setVersion = ismaster ? ismaster.setVersion : ismaster;

    if(self.unknownServers.indexOf(server.name) == -1) {
      self.unknownServers.push(server.name);
    }

    // addToList(self, ServerType.Unknown, ismaster, server, this.unknownServers);
    // console.log("======== addToList unknownServers 1")
    // Set the topology
    return false;
  }

  // console.log("=== ReplSetState.prototype.update 3")

  //
  // Is this a mongos
  //
  if(ismaster && ismaster.msg == 'isdbgrid') {
    return false;
  }

  // console.log("=== ReplSetState.prototype.update 4")

  //
  // Standalone server, destroy and return
  //
  if(ismaster && ismaster.ismaster && !ismaster.setName) {
    this.topologyType = this.primary ? TopologyType.ReplicaSetWithPrimary : TopologyType.Unknown;
    this.remove(server, {force:true});
    return false;
  }

  // console.log("=== ReplSetState.prototype.update 5")

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

  // console.log("=== ReplSetState.prototype.update 6")

  //
  // Primary handling
  //
  if(!this.primary && ismaster.ismaster && ismaster.setName) {
    // console.log("=== ReplSetState.prototype.update 6:1")
    var ismasterElectionId = server.lastIsMaster().electionId;
    if(this.setName && this.setName != ismaster.setName) {
      this.topologyType = TopologyType.ReplicaSetNoPrimary;
      return false;
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
      // console.log("======================= MAX")
      // console.log("maxSetVersion = " + this.maxSetVersion)
      // console.log("maxElectionId = " + this.maxElectionId)
    }
    // console.log("=== ReplSetState.prototype.update 6:1:2")

    self.primary = server;
    self.set[server.name] = {
      type: ServerType.RSPrimary,
      setVersion: ismaster.setVersion,
      electionId: ismaster.electionId,
      setName: ismaster.setName
    }
    // console.log("=== ReplSetState.prototype.update 6:1:3")

    // Set the topology
    this.topologyType = TopologyType.ReplicaSetWithPrimary;
    if(ismaster.setName) this.setName = ismaster.setName;
    // console.log("=== ReplSetState.prototype.update 6:1:4")
    // console.log("========================= joined primary")
    removeFrom(server, self.unknownServers);
    // console.log("=== ReplSetState.prototype.update 6:1:5")
    self.emit('joined', 'primary', server);
    return true;
  } else if(ismaster.ismaster && ismaster.setName) {
    // console.log("=== ReplSetState.prototype.update 6:2")
    // console.log("========== existing primary 0")

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
        // console.log("========== existing primary 1")
        // console.log("=================== 1:1")
        return false;
    }

    // If we do not have the same rs name
    if(currentSetName && currentSetName != ismasterSetName) {
      // console.log("========== existing primary 2")
      // console.log("=================== 2")
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
      // console.log("========== existing primary 3")

      if(result == 1) {
        return false;
      } else if(result == 0 && (currentSetVersion > ismasterSetVersion)) {
        return false;
      }
    } else if(!currentElectionId && ismasterElectionId
      && ismasterSetVersion) {
        // console.log("========== existing primary 4")
        if(ismasterSetVersion < this.maxSetVersion) {
          return false;
        }
    }

    if(!this.maxElectionId && ismasterElectionId) {
      this.maxElectionId = ismasterElectionId;
    } else if(this.maxElectionId && ismasterElectionId) {
      var result = compareObjectIds(this.maxElectionId, ismasterElectionId);
      // console.log("========== existing primary 5")

      if(result == 1) {
        return false;
      } else if(result == 0 && currentSetVersion && ismasterSetVersion) {
        if(ismasterSetVersion < this.maxSetVersion) {
          return false;
        }
      }


      this.maxElectionId = ismasterElectionId;
      this.maxSetVersion = ismasterSetVersion;

      // console.log("!! maxElectionId :: " + this.maxElectionId)
      // console.log("!! maxSetVersion :: " + this.maxSetVersion)
    }

    // console.log("========== existing primary 6")

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
    // console.log("========== existing primary 7")

    // Set the topology
    this.topologyType = TopologyType.ReplicaSetWithPrimary;
    if(ismaster.setName) this.setName = ismaster.setName;
    removeFrom(server, self.unknownServers);
    // console.log("========================= joined primary 2")
    self.emit('joined', 'primary', server);
    return true;
  }

  // console.log("=== ReplSetState.prototype.update 7")

  // A possible instance
  if(!this.primary && ismaster.primary) {
    self.set[ismaster.primary] = {
      type: ServerType.PossiblePrimary, setVersion: null,
      electionId: null, setName: null
    }
  }

  // console.log("=== ReplSetState.prototype.update 8")

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

  // console.log("=== ReplSetState.prototype.update 9")

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

  // console.log("=== ReplSetState.prototype.update 10")

  //
  // Secondary handling
  //
  if(ismaster.secondary && ismaster.setName
    && !inList(ismaster, server, this.secondaries)
    && this.setName && this.setName == ismaster.setName) {
      // console.log("---- secondary :: " + )
      // console.log("========================== update 1 :: " + server.name)
      // console.log("ismaster.secondary = " + ismaster.secondary)
      // console.log("ismaster.setName = " + ismaster.setName)
      // console.log("this.setName = " + this.setName)
      // console.log("this.secondaries.length = " + this.secondaries.map(function(x) {
      //   return x.name
      // }))


    addToList(self, ServerType.RSSecondary, ismaster, server, this.secondaries);
    // Set the topology
    this.topologyType = this.primary ? TopologyType.ReplicaSetWithPrimary : TopologyType.ReplicaSetNoPrimary;
    if(ismaster.setName) this.setName = ismaster.setName;
    removeFrom(server, self.unknownServers);
    self.emit('joined', 'secondary', server);
    return true;
  }

  // console.log("=== ReplSetState.prototype.update 11")

  // console.log("========================== update 2")
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
    return true;
  }

  // console.log("=== ReplSetState.prototype.update 12")

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
    self.emit('joined', 'secondary', server);
    return true;
  }

  // console.log("=== ReplSetState.prototype.update 13")

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

  // console.log("=== ReplSetState.prototype.update 14")

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

module.exports = ReplSetState;
