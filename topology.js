'use strict';
const EventEmitter = require('events');
const assert = require('assert');

// contstants related to compatability checks
const MIN_SUPPORTED_SERVER_VERSION = '2.6';
const MIN_SUPPORTED_WIRE_VERSION = 2;
const MAX_SUPPORTED_WIRE_VERSION = 5;

/**
 * An enumeration of topology types we know about
 */
const TopologyType = {
  Single: 'Single',
  ReplicaSetNoPrimary: 'ReplicaSetNoPrimary',
  ReplicaSetWithPrimary: 'ReplicaSetWithPrimary',
  Sharded: 'Sharded',
  Unknown: 'Unknown'
};

function topologyTypeForServerType(serverType) {
  if (serverType === ServerType.Mongos) return TopologyType.Sharded;
  if (serverType === ServerType.RSPrimary) return TopologyType.ReplicaSetWithPrimary;
  return TopologyType.ReplicaSetNoPrimary;
}

function updateRsFromPrimary(
  serverDescriptions,
  setName,
  serverDescription,
  maxSetVersion,
  maxElectionId
) {
  setName = setName || serverDescription.setName;
  if (setName !== serverDescription.setName) {
    delete serverDescriptions[serverDescription.address];
    return [checkHasPrimary(serverDescriptions), setName, maxSetVersion, maxElectionId];
  }

  const electionIdOID = serverDescription.electionId ? serverDescription.electionId.$oid : null;
  const maxElectionIdOID = maxElectionId ? maxElectionId.$oid : null;
  if (serverDescription.setVersion != null && electionIdOID != null) {
    if (maxSetVersion != null && maxElectionIdOID != null) {
      if (maxSetVersion > serverDescription.setVersion || maxElectionIdOID > electionIdOID) {
        // this primary is stale, we must remove it
        serverDescriptions[serverDescription.address] = new ServerDescription(
          serverDescription.address
        );

        return [checkHasPrimary(serverDescriptions), setName, maxSetVersion, maxElectionId];
      }
    }

    maxElectionId = serverDescription.electionId;
  }

  if (
    serverDescription.setVersion != null &&
    (maxSetVersion == null || serverDescription.setVersion > maxSetVersion)
  ) {
    maxSetVersion = serverDescription.setVersion;
  }

  // We've heard from the primary. Is it the same primary as before?
  for (const address in serverDescriptions) {
    const server = serverDescriptions[address];

    if (server.type === ServerType.RSPrimary && server.address !== serverDescription.address) {
      // Reset old primary's type to Unknown.
      serverDescriptions[address] = new ServerDescription(server.address);

      // There can only be one primary
      break;
    }
  }

  // Discover new hosts from this primary's response.
  serverDescription.allHosts.forEach(address => {
    if (!serverDescriptions.hasOwnProperty(address)) {
      serverDescriptions[address] = new ServerDescription(address);
    }
  });

  // Remove hosts not in the response.
  const currentAddresses = Object.keys(serverDescriptions);
  const responseAddresses = serverDescription.allHosts;
  currentAddresses.filter(addr => responseAddresses.indexOf(addr) === -1).forEach(address => {
    delete serverDescriptions[address];
  });

  return [checkHasPrimary(serverDescriptions), setName, maxSetVersion, maxElectionId];
}

function updateRsWithPrimaryFromMember(serverDescriptions, setName, serverDescription) {
  assert.ok(setName);

  if (setName !== serverDescription.setName) {
    delete serverDescriptions[serverDescription.address];
  } else if (serverDescription.me && serverDescription.address !== serverDescription.me) {
    delete serverDescriptions[serverDescription.address];
  }

  return checkHasPrimary(serverDescriptions);
}

function updateRsNoPrimaryFromMember(serverDescriptions, setName, serverDescription) {
  let topologyType = TopologyType.ReplicaSetNoPrimary;

  setName = setName || serverDescription.setName;
  if (setName !== serverDescription.setName) {
    delete serverDescriptions[serverDescription.address];
    return [topologyType, setName];
  }

  serverDescription.allHosts.forEach(address => {
    if (!serverDescriptions.hasOwnProperty(address)) {
      serverDescriptions[address] = new ServerDescription(address);
    }
  });

  if (serverDescription.me && serverDescription.address !== serverDescription.me) {
    delete serverDescriptions[serverDescription.address];
  }

  return [topologyType, setName];
}

function checkHasPrimary(serverDescriptions) {
  for (const addr in serverDescriptions) {
    if (serverDescriptions[addr].type === ServerType.RSPrimary) {
      return TopologyType.ReplicaSetWithPrimary;
    }
  }

  return TopologyType.ReplicaSetNoPrimary;
}

class TopologyDescription {
  /**
   * Representation of a deployment of servers
   *
   * @param {string} topologyType
   * @param {Map<string, ServerDescription>} serverDescriptions the a map of address to ServerDescription
   * @param {string} setName
   * @param {number} maxSetVersion
   * @param {ObjectId} maxElectionId
   */
  constructor(
    topologyType,
    serverDescriptions,
    setName,
    maxSetVersion,
    maxElectionId
    /*, options */
  ) {
    // TODO: consider assigning all these values to a temporary value `s` which
    //       we use `Object.freeze` on, ensuring the internal state of this type
    //       is immutable.

    this.type = topologyType || TopologyType.Unknown;
    this.setName = setName || null;
    this.maxSetVersion = maxSetVersion || null;
    this.maxElectionId = maxElectionId || null;
    this.servers = serverDescriptions || {};
    this.stale = false;
    this.compatible = false;
    this.compatibilityError = null;
    this.logicalSessionTimeoutMinutes = null;

    // determine server compatibility
    for (const serverDescription in this.servers) {
      if (serverDescription.maxWireVersion > MAX_SUPPORTED_WIRE_VERSION) {
        this.compatible = false;
        this.compatibilityError = `Server at ${serverDescription.address} requires wire version ${
          serverDescription.minWireVersion
        }, but this version of the driver only supports up to ${MAX_SUPPORTED_WIRE_VERSION}.`;
        break;
      }

      if (serverDescription.minWireVersion < MIN_SUPPORTED_WIRE_VERSION) {
        this.compatible = false;
        this.compatibilityError = `Server at ${serverDescription.address} reports wire version ${
          serverDescription.maxWireVersion
        }, but this version of the driver requires at least ${
          this.s.minWireVersion
        } (MongoDB ${MIN_SUPPORTED_SERVER_VERSION}).`;
        break;
      }
    }
  }

  /**
   * Returns a copy of this description updated with a given ServerDescription
   *
   * @param {ServerDescription} serverDescription
   */
  update(serverDescription) {
    const address = serverDescription.address;
    // NOTE: there are a number of prime targets for refactoring here
    //       once we support destructuring assignments

    // potentially mutated values
    let topologyType = this.type;
    let setName = this.setName;
    let maxSetVersion = this.maxSetVersion;
    let maxElectionId = this.maxElectionId;

    const serverType = serverDescription.type;
    let serverDescriptions = Object.assign({}, this.servers);

    // update the actual server description
    serverDescriptions[address] = serverDescription;

    if (topologyType === TopologyType.Single) {
      // once we are defined as single, that never changes
      return new TopologyDescription(
        TopologyType.Single,
        serverDescriptions,
        setName,
        maxSetVersion,
        maxElectionId,
        {}
      );
    }

    if (topologyType === TopologyType.Unknown) {
      if (serverType === ServerType.Standalone) {
        delete serverDescriptions[address];
      } else {
        topologyType = topologyTypeForServerType(serverType);
      }
    }

    if (topologyType === TopologyType.Sharded) {
      if ([ServerType.Mongos, ServerType.Unknown].indexOf(serverType) === -1) {
        delete serverDescriptions[address];
      }
    }

    if (topologyType === TopologyType.ReplicaSetNoPrimary) {
      if ([ServerType.Mongos, ServerType.Unknown].indexOf(serverType) >= 0) {
        delete serverDescriptions[address];
      }

      if (serverType === ServerType.RSPrimary) {
        const result = updateRsFromPrimary(
          serverDescriptions,
          setName,
          serverDescription,
          maxSetVersion,
          maxElectionId
        );

        (topologyType = result[0]),
          (setName = result[1]),
          (maxSetVersion = result[2]),
          (maxElectionId = result[3]);
      } else if (
        [ServerType.RSSecondary, ServerType.RSArbiter, ServerType.RSOther].indexOf(serverType) >= 0
      ) {
        const result = updateRsNoPrimaryFromMember(serverDescriptions, setName, serverDescription);
        (topologyType = result[0]), (setName = result[1]);
      }
    }

    if (topologyType === TopologyType.ReplicaSetWithPrimary) {
      if ([ServerType.Standalone, ServerType.Mongos].indexOf(serverType) >= 0) {
        delete serverDescriptions[address];
        topologyType = checkHasPrimary(serverDescriptions);
      } else if (serverType === ServerType.RSPrimary) {
        const result = updateRsFromPrimary(
          serverDescriptions,
          setName,
          serverDescription,
          maxSetVersion,
          maxElectionId
        );

        (topologyType = result[0]),
          (setName = result[1]),
          (maxSetVersion = result[2]),
          (maxElectionId = result[3]);
      } else if (
        [ServerType.RSSecondary, ServerType.RSArbiter, ServerType.RSOther].indexOf(serverType) >= 0
      ) {
        topologyType = updateRsWithPrimaryFromMember(
          serverDescriptions,
          setName,
          serverDescription
        );
      } else {
        topologyType = checkHasPrimary(serverDescriptions);
      }
    }

    return new TopologyDescription(
      topologyType,
      serverDescriptions,
      setName,
      maxSetVersion,
      maxElectionId,
      {}
    );
  }
}

/**
 * An enumeration of server types we know about
 */
const ServerType = {
  Standalone: 'Standalone',
  Mongos: 'Mongos',
  PossiblePrimary: 'PossiblePrimary',
  RSPrimary: 'RSPrimary',
  RSSecondary: 'RSSecondary',
  RSArbiter: 'RSArbiter',
  RSOther: 'RSOther',
  RSGhost: 'RSGhost',
  Unknown: 'Unknown'
};

/**
 * Parses an `ismaster` message and determines the server type
 *
 * @param {object} ismaster
 */
function parseServerType(ismaster) {
  if (!ismaster || !ismaster.ok) {
    return ServerType.Unknown;
  }

  if (ismaster.isreplicaset) {
    return ServerType.RSGhost;
  }

  if (ismaster.msg && ismaster.msg === 'isdbgrid') {
    return ServerType.Mongos;
  }

  if (ismaster.setName) {
    if (ismaster.hidden) {
      return ServerType.RSOther;
    } else if (ismaster.ismaster) {
      return ServerType.RSPrimary;
    } else if (ismaster.secondary) {
      return ServerType.RSSecondary;
    } else if (ismaster.arbiterOnly) {
      return ServerType.RSArbiter;
    } else {
      return ServerType.RSOther;
    }
  }

  return ServerType.Standalone;
}

/**
 * The client's view of a single server, based on the most recent ismaster outcome.
 *
 * Internal type, not meant to be directly instantiated
 */
class ServerDescription {
  constructor(address, ismaster) {
    this.address = address;
    this.error = null;
    this.roundTripTime = null;
    this.lastWriteDate = ismaster && ismaster.lastWrite ? ismaster.lastWrite.lasteWriteDate : null;
    this.opTime = ismaster && ismaster.lastWrite ? ismaster.lastWrite.opTime : null;
    this.type = parseServerType(ismaster);
    this.minWireVersion = (ismaster && ismaster.minWireVersion) || 0;
    this.maxWireVersion = (ismaster && ismaster.maxWireVersion) || 0;
    this.me = (ismaster && ismaster.me) || null;
    this.hosts = (ismaster && ismaster.hosts) || [];
    this.passives = (ismaster && ismaster.passives) || [];
    this.arbiters = (ismaster && ismaster.arbiters) || [];
    this.tags = (ismaster && ismaster.tags) || [];
    this.setName = (ismaster && ismaster.setName) || null;
    this.setVersion = (ismaster && ismaster.setVersion) || null;
    this.electionId = (ismaster && ismaster.electionId) || null;
    this.primary = (ismaster && ismaster.primary) || null;
    this.lastUpdateTime = null;
    this.logicalSessionTimeoutMinutes = (ismaster && ismaster.logicalSessionTimeoutMinutes) || null;

    // normalize case for hosts
    this.hosts = this.hosts.map(host => host.toLowerCase());
    this.passives = this.passives.map(host => host.toLowerCase());
    this.arbiters = this.arbiters.map(host => host.toLowerCase());
  }

  get allHosts() {
    return this.hosts.concat(this.arbiters).concat(this.passives);
  }
}

/**
 * A container of server instances representing a connection to a MongoDB topology.
 */
class Topology extends EventEmitter {
  /**
   * Create a topology
   *
   * @param {Array|String} seedlist a string list, or array of Server instances to connect to
   * @param {Object} [options] Optional settings
   */
  constructor(seedlist, options) {
    super();
    seedlist = seedlist || [];
    options = options || {};

    const topologyType =
      seedlist.length === 1 && !options.replicaset
        ? TopologyType.Single
        : options.replicaset
          ? TopologyType.ReplicaSetNoPrimary
          : TopologyType.Unknown;

    const serverDescriptions = seedlist.reduce((result, seed) => {
      const address = seed.port ? `${seed.host}:${seed.port}` : `${seed.host}:27017`;
      result[address] = new ServerDescription(address);
      return result;
    }, {});

    this.s = {
      // passed in options
      options: Object.assign({}, options),
      // initial seedlist of servers to connect to
      seedlist: seedlist,
      // the topology description
      description: new TopologyDescription(
        topologyType,
        serverDescriptions,
        options.replicaset,
        null,
        null,
        options
      )
    };
  }

  /**
   * @return A `TopologyDescription` for this topology
   */
  get description() {
    return this.s.description;
  }

  /**
   * Initiate server connect
   * @method
   * @param {array} [options.auth=null] Array of auth options to apply on connect
   */
  connect(/* options */) {
    return;
  }

  /**
   * Selects a server according to the selection predicate provided
   *
   * @param {function} [predicate] An optional predicate to select servers by, defaults to a random selection within a latency window
   * @return {Server} An instance of a `Server` meeting the criteria of the predicate provided
   */
  selectServer(/* predicate */) {
    return;
  }

  /**
   * Update the topology with a ServerDescription
   *
   * @param {object} serverDescription the server to update
   */
  update(serverDescription) {
    // first update the TopologyDescription
    this.s.description = this.s.description.update(serverDescription);
  }
}

module.exports.Topology = Topology;
module.exports.ServerDescription = ServerDescription;
