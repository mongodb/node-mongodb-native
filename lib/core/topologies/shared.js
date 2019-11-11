'use strict';

const os = require('os');
const ReadPreference = require('./read_preference');
const Buffer = require('safe-buffer').Buffer;
const TopologyType = require('../sdam/topology_description').TopologyType;
const MongoError = require('../error').MongoError;

const MMAPv1_RETRY_WRITES_ERROR_CODE = 20;

/**
 * Emit event if it exists
 * @method
 */
function emitSDAMEvent(self, event, description) {
  if (self.listeners(event).length > 0) {
    self.emit(event, description);
  }
}

// Get package.json variable
const driverVersion = require('../../../package.json').version;
const nodejsVersion = `'Node.js ${process.version}, ${os.endianness}`;
const type = os.type();
const name = process.platform;
const architecture = process.arch;
const release = os.release();

function createClientInfo(options) {
  const clientInfo = options.clientInfo
    ? clone(options.clientInfo)
    : {
        driver: {
          name: 'nodejs',
          version: driverVersion
        },
        os: {
          type: type,
          name: name,
          architecture: architecture,
          version: release
        }
      };

  if (options.useUnifiedTopology) {
    clientInfo.platform = `${nodejsVersion} (${options.useUnifiedTopology ? 'unified' : 'legacy'})`;
  }

  // Do we have an application specific string
  if (options.appname) {
    // Cut at 128 bytes
    var buffer = Buffer.from(options.appname);
    // Return the truncated appname
    var appname = buffer.length > 128 ? buffer.slice(0, 128).toString('utf8') : options.appname;
    // Add to the clientInfo
    clientInfo.application = { name: appname };
  }

  return clientInfo;
}

function createCompressionInfo(options) {
  if (!options.compression || !options.compression.compressors) {
    return [];
  }

  // Check that all supplied compressors are valid
  options.compression.compressors.forEach(function(compressor) {
    if (compressor !== 'snappy' && compressor !== 'zlib') {
      throw new Error('compressors must be at least one of snappy or zlib');
    }
  });

  return options.compression.compressors;
}

function clone(object) {
  return JSON.parse(JSON.stringify(object));
}

var getPreviousDescription = function(self) {
  if (!self.s.serverDescription) {
    self.s.serverDescription = {
      address: self.name,
      arbiters: [],
      hosts: [],
      passives: [],
      type: 'Unknown'
    };
  }

  return self.s.serverDescription;
};

var emitServerDescriptionChanged = function(self, description) {
  if (self.listeners('serverDescriptionChanged').length > 0) {
    // Emit the server description changed events
    self.emit('serverDescriptionChanged', {
      topologyId: self.s.topologyId !== -1 ? self.s.topologyId : self.id,
      address: self.name,
      previousDescription: getPreviousDescription(self),
      newDescription: description
    });

    self.s.serverDescription = description;
  }
};

var getPreviousTopologyDescription = function(self) {
  if (!self.s.topologyDescription) {
    self.s.topologyDescription = {
      topologyType: 'Unknown',
      servers: [
        {
          address: self.name,
          arbiters: [],
          hosts: [],
          passives: [],
          type: 'Unknown'
        }
      ]
    };
  }

  return self.s.topologyDescription;
};

var emitTopologyDescriptionChanged = function(self, description) {
  if (self.listeners('topologyDescriptionChanged').length > 0) {
    // Emit the server description changed events
    self.emit('topologyDescriptionChanged', {
      topologyId: self.s.topologyId !== -1 ? self.s.topologyId : self.id,
      address: self.name,
      previousDescription: getPreviousTopologyDescription(self),
      newDescription: description
    });

    self.s.serverDescription = description;
  }
};

var changedIsMaster = function(self, currentIsmaster, ismaster) {
  var currentType = getTopologyType(self, currentIsmaster);
  var newType = getTopologyType(self, ismaster);
  if (newType !== currentType) return true;
  return false;
};

var getTopologyType = function(self, ismaster) {
  if (!ismaster) {
    ismaster = self.ismaster;
  }

  if (!ismaster) return 'Unknown';
  if (ismaster.ismaster && ismaster.msg === 'isdbgrid') return 'Mongos';
  if (ismaster.ismaster && !ismaster.hosts) return 'Standalone';
  if (ismaster.ismaster) return 'RSPrimary';
  if (ismaster.secondary) return 'RSSecondary';
  if (ismaster.arbiterOnly) return 'RSArbiter';
  return 'Unknown';
};

var inquireServerState = function(self) {
  return function(callback) {
    if (self.s.state === 'destroyed') return;
    // Record response time
    var start = new Date().getTime();

    // emitSDAMEvent
    emitSDAMEvent(self, 'serverHeartbeatStarted', { connectionId: self.name });

    // Attempt to execute ismaster command
    self.command('admin.$cmd', { ismaster: true }, { monitoring: true }, function(err, r) {
      if (!err) {
        // Legacy event sender
        self.emit('ismaster', r, self);

        // Calculate latencyMS
        var latencyMS = new Date().getTime() - start;

        // Server heart beat event
        emitSDAMEvent(self, 'serverHeartbeatSucceeded', {
          durationMS: latencyMS,
          reply: r.result,
          connectionId: self.name
        });

        // Did the server change
        if (changedIsMaster(self, self.s.ismaster, r.result)) {
          // Emit server description changed if something listening
          emitServerDescriptionChanged(self, {
            address: self.name,
            arbiters: [],
            hosts: [],
            passives: [],
            type: !self.s.inTopology ? 'Standalone' : getTopologyType(self)
          });
        }

        // Updat ismaster view
        self.s.ismaster = r.result;

        // Set server response time
        self.s.isMasterLatencyMS = latencyMS;
      } else {
        emitSDAMEvent(self, 'serverHeartbeatFailed', {
          durationMS: latencyMS,
          failure: err,
          connectionId: self.name
        });
      }

      // Peforming an ismaster monitoring callback operation
      if (typeof callback === 'function') {
        return callback(err, r);
      }

      // Perform another sweep
      self.s.inquireServerStateTimeout = setTimeout(inquireServerState(self), self.s.haInterval);
    });
  };
};

//
// Clone the options
var cloneOptions = function(options) {
  var opts = {};
  for (var name in options) {
    opts[name] = options[name];
  }
  return opts;
};

function Interval(fn, time) {
  var timer = false;

  this.start = function() {
    if (!this.isRunning()) {
      timer = setInterval(fn, time);
    }

    return this;
  };

  this.stop = function() {
    clearInterval(timer);
    timer = false;
    return this;
  };

  this.isRunning = function() {
    return timer !== false;
  };
}

function Timeout(fn, time) {
  var timer = false;

  this.start = function() {
    if (!this.isRunning()) {
      timer = setTimeout(fn, time);
    }
    return this;
  };

  this.stop = function() {
    clearTimeout(timer);
    timer = false;
    return this;
  };

  this.isRunning = function() {
    if (timer && timer._called) return false;
    return timer !== false;
  };
}

function diff(previous, current) {
  // Difference document
  var diff = {
    servers: []
  };

  // Previous entry
  if (!previous) {
    previous = { servers: [] };
  }

  // Check if we have any previous servers missing in the current ones
  for (var i = 0; i < previous.servers.length; i++) {
    var found = false;

    for (var j = 0; j < current.servers.length; j++) {
      if (current.servers[j].address.toLowerCase() === previous.servers[i].address.toLowerCase()) {
        found = true;
        break;
      }
    }

    if (!found) {
      // Add to the diff
      diff.servers.push({
        address: previous.servers[i].address,
        from: previous.servers[i].type,
        to: 'Unknown'
      });
    }
  }

  // Check if there are any severs that don't exist
  for (j = 0; j < current.servers.length; j++) {
    found = false;

    // Go over all the previous servers
    for (i = 0; i < previous.servers.length; i++) {
      if (previous.servers[i].address.toLowerCase() === current.servers[j].address.toLowerCase()) {
        found = true;
        break;
      }
    }

    // Add the server to the diff
    if (!found) {
      diff.servers.push({
        address: current.servers[j].address,
        from: 'Unknown',
        to: current.servers[j].type
      });
    }
  }

  // Got through all the servers
  for (i = 0; i < previous.servers.length; i++) {
    var prevServer = previous.servers[i];

    // Go through all current servers
    for (j = 0; j < current.servers.length; j++) {
      var currServer = current.servers[j];

      // Matching server
      if (prevServer.address.toLowerCase() === currServer.address.toLowerCase()) {
        // We had a change in state
        if (prevServer.type !== currServer.type) {
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

/**
 * Shared function to determine clusterTime for a given topology
 *
 * @param {*} topology
 * @param {*} clusterTime
 */
function resolveClusterTime(topology, $clusterTime) {
  if (topology.clusterTime == null) {
    topology.clusterTime = $clusterTime;
  } else {
    if ($clusterTime.clusterTime.greaterThan(topology.clusterTime.clusterTime)) {
      topology.clusterTime = $clusterTime;
    }
  }
}

// NOTE: this is a temporary move until the topologies can be more formally refactored
//       to share code.
const SessionMixins = {
  endSessions: function(sessions, callback) {
    if (!Array.isArray(sessions)) {
      sessions = [sessions];
    }

    // TODO:
    //   When connected to a sharded cluster the endSessions command
    //   can be sent to any mongos. When connected to a replica set the
    //   endSessions command MUST be sent to the primary if the primary
    //   is available, otherwise it MUST be sent to any available secondary.
    //   Is it enough to use: ReadPreference.primaryPreferred ?
    this.command(
      'admin.$cmd',
      { endSessions: sessions },
      { readPreference: ReadPreference.primaryPreferred },
      () => {
        // intentionally ignored, per spec
        if (typeof callback === 'function') callback();
      }
    );
  }
};

function topologyType(topology) {
  if (topology.description) {
    return topology.description.type;
  }

  if (topology.type === 'mongos') {
    return TopologyType.Sharded;
  } else if (topology.type === 'replset') {
    return TopologyType.ReplicaSetWithPrimary;
  }

  return TopologyType.Single;
}

const RETRYABLE_WIRE_VERSION = 6;

/**
 * Determines whether the provided topology supports retryable writes
 *
 * @param {Mongos|Replset} topology
 */
const isRetryableWritesSupported = function(topology) {
  const maxWireVersion = topology.lastIsMaster().maxWireVersion;
  if (maxWireVersion < RETRYABLE_WIRE_VERSION) {
    return false;
  }

  if (!topology.logicalSessionTimeoutMinutes) {
    return false;
  }

  if (topologyType(topology) === TopologyType.Single) {
    return false;
  }

  return true;
};

const MMAPv1_RETRY_WRITES_ERROR_MESSAGE =
  'This MongoDB deployment does not support retryable writes. Please add retryWrites=false to your connection string.';

function getMMAPError(err) {
  if (err.code !== MMAPv1_RETRY_WRITES_ERROR_CODE || !err.errmsg.includes('Transaction numbers')) {
    return err;
  }

  // According to the retryable writes spec, we must replace the error message in this case.
  // We need to replace err.message so the thrown message is correct and we need to replace err.errmsg to meet the spec requirement.
  const newErr = new MongoError({
    message: MMAPv1_RETRY_WRITES_ERROR_MESSAGE,
    errmsg: MMAPv1_RETRY_WRITES_ERROR_MESSAGE,
    originalError: err
  });
  return newErr;
}

module.exports.SessionMixins = SessionMixins;
module.exports.resolveClusterTime = resolveClusterTime;
module.exports.inquireServerState = inquireServerState;
module.exports.getTopologyType = getTopologyType;
module.exports.emitServerDescriptionChanged = emitServerDescriptionChanged;
module.exports.emitTopologyDescriptionChanged = emitTopologyDescriptionChanged;
module.exports.cloneOptions = cloneOptions;
module.exports.createClientInfo = createClientInfo;
module.exports.createCompressionInfo = createCompressionInfo;
module.exports.clone = clone;
module.exports.diff = diff;
module.exports.Interval = Interval;
module.exports.Timeout = Timeout;
module.exports.isRetryableWritesSupported = isRetryableWritesSupported;
module.exports.getMMAPError = getMMAPError;
module.exports.topologyType = topologyType;
