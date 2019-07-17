'use strict';
const ServerType = require('./server_description').ServerType;
const ServerDescription = require('./server_description').ServerDescription;
const WIRE_CONSTANTS = require('../wireprotocol/constants');

// contstants related to compatability checks
const MIN_SUPPORTED_SERVER_VERSION = WIRE_CONSTANTS.MIN_SUPPORTED_SERVER_VERSION;
const MAX_SUPPORTED_SERVER_VERSION = WIRE_CONSTANTS.MAX_SUPPORTED_SERVER_VERSION;
const MIN_SUPPORTED_WIRE_VERSION = WIRE_CONSTANTS.MIN_SUPPORTED_WIRE_VERSION;
const MAX_SUPPORTED_WIRE_VERSION = WIRE_CONSTANTS.MAX_SUPPORTED_WIRE_VERSION;

// An enumeration of topology types we know about
const TopologyType = {
  Single: 'Single',
  ReplicaSetNoPrimary: 'ReplicaSetNoPrimary',
  ReplicaSetWithPrimary: 'ReplicaSetWithPrimary',
  Sharded: 'Sharded',
  Unknown: 'Unknown'
};

// Representation of a deployment of servers
class TopologyDescription {
  /**
   * Create a TopologyDescription
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
    maxElectionId,
    commonWireVersion,
    options,
    error
  ) {
    options = options || {};

    // TODO: consider assigning all these values to a temporary value `s` which
    //       we use `Object.freeze` on, ensuring the internal state of this type
    //       is immutable.
    this.type = topologyType || TopologyType.Unknown;
    this.setName = setName || null;
    this.maxSetVersion = maxSetVersion || null;
    this.maxElectionId = maxElectionId || null;
    this.servers = serverDescriptions || new Map();
    this.stale = false;
    this.compatible = true;
    this.compatibilityError = null;
    this.logicalSessionTimeoutMinutes = null;
    this.heartbeatFrequencyMS = options.heartbeatFrequencyMS || 0;
    this.localThresholdMS = options.localThresholdMS || 0;
    this.options = options;
    this.error = error;
    this.commonWireVersion = commonWireVersion || null;

    // determine server compatibility
    for (const serverDescription of this.servers.values()) {
      if (serverDescription.type === ServerType.Unknown) continue;

      if (serverDescription.minWireVersion > MAX_SUPPORTED_WIRE_VERSION) {
        this.compatible = false;
        this.compatibilityError = `Server at ${serverDescription.address} requires wire version ${
          serverDescription.minWireVersion
        }, but this version of the driver only supports up to ${MAX_SUPPORTED_WIRE_VERSION} (MongoDB ${MAX_SUPPORTED_SERVER_VERSION})`;
      }

      if (serverDescription.maxWireVersion < MIN_SUPPORTED_WIRE_VERSION) {
        this.compatible = false;
        this.compatibilityError = `Server at ${serverDescription.address} reports wire version ${
          serverDescription.maxWireVersion
        }, but this version of the driver requires at least ${MIN_SUPPORTED_WIRE_VERSION} (MongoDB ${MIN_SUPPORTED_SERVER_VERSION}).`;
        break;
      }
    }

    // Whenever a client updates the TopologyDescription from an ismaster response, it MUST set
    // TopologyDescription.logicalSessionTimeoutMinutes to the smallest logicalSessionTimeoutMinutes
    // value among ServerDescriptions of all data-bearing server types. If any have a null
    // logicalSessionTimeoutMinutes, then TopologyDescription.logicalSessionTimeoutMinutes MUST be
    // set to null.
    const readableServers = Array.from(this.servers.values()).filter(s => s.isReadable);
    this.logicalSessionTimeoutMinutes = readableServers.reduce((result, server) => {
      if (server.logicalSessionTimeoutMinutes == null) return null;
      if (result == null) return server.logicalSessionTimeoutMinutes;
      return Math.min(result, server.logicalSessionTimeoutMinutes);
    }, null);
  }

  /**
   * Returns a new TopologyDescription based on the SrvPollingEvent
   * @param {SrvPollingEvent} ev The event
   */
  updateFromSrvPollingEvent(ev) {
    const newAddresses = ev.addresses();
    const serverDescriptions = new Map(this.servers);
    for (const server of this.servers) {
      if (newAddresses.has(server[0])) {
        newAddresses.delete(server[0]);
      } else {
        serverDescriptions.delete(server[0]);
      }
    }

    if (serverDescriptions.size === this.servers.size && newAddresses.size === 0) {
      return this;
    }

    for (const address of newAddresses) {
      serverDescriptions.set(address, new ServerDescription(address));
    }

    return new TopologyDescription(
      this.type,
      serverDescriptions,
      this.setName,
      this.maxSetVersion,
      this.maxElectionId,
      this.commonWireVersion,
      this.options,
      null
    );
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
    let commonWireVersion = this.commonWireVersion;
    let error = serverDescription.error || null;

    const serverType = serverDescription.type;
    let serverDescriptions = new Map(this.servers);

    // update common wire version
    if (serverDescription.maxWireVersion !== 0) {
      if (commonWireVersion == null) {
        commonWireVersion = serverDescription.maxWireVersion;
      } else {
        commonWireVersion = Math.min(commonWireVersion, serverDescription.maxWireVersion);
      }
    }

    // update the actual server description
    serverDescriptions.set(address, serverDescription);

    if (topologyType === TopologyType.Single) {
      // once we are defined as single, that never changes
      return new TopologyDescription(
        TopologyType.Single,
        serverDescriptions,
        setName,
        maxSetVersion,
        maxElectionId,
        commonWireVersion,
        this.options,
        error
      );
    }

    if (topologyType === TopologyType.Unknown) {
      if (serverType === ServerType.Standalone) {
        serverDescriptions.delete(address);
      } else {
        topologyType = topologyTypeForServerType(serverType);
      }
    }

    if (topologyType === TopologyType.Sharded) {
      if ([ServerType.Mongos, ServerType.Unknown].indexOf(serverType) === -1) {
        serverDescriptions.delete(address);
      }
    }

    if (topologyType === TopologyType.ReplicaSetNoPrimary) {
      if ([ServerType.Mongos, ServerType.Unknown].indexOf(serverType) >= 0) {
        serverDescriptions.delete(address);
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
        serverDescriptions.delete(address);
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
      commonWireVersion,
      this.options,
      error
    );
  }

  /**
   * Determines if the topology description has any known servers
   */
  get hasKnownServers() {
    return Array.from(this.servers.values()).some(sd => sd.type !== ServerDescription.Unknown);
  }

  /**
   * Determines if this topology description has a data-bearing server available.
   */
  get hasDataBearingServers() {
    return Array.from(this.servers.values()).some(sd => sd.isDataBearing);
  }

  /**
   * Determines if the topology has a definition for the provided address
   *
   * @param {String} address
   * @return {Boolean} Whether the topology knows about this server
   */
  hasServer(address) {
    return this.servers.has(address);
  }
}

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
    serverDescriptions.delete(serverDescription.address);
    return [checkHasPrimary(serverDescriptions), setName, maxSetVersion, maxElectionId];
  }

  const electionIdOID = serverDescription.electionId ? serverDescription.electionId.$oid : null;
  const maxElectionIdOID = maxElectionId ? maxElectionId.$oid : null;
  if (serverDescription.setVersion != null && electionIdOID != null) {
    if (maxSetVersion != null && maxElectionIdOID != null) {
      if (maxSetVersion > serverDescription.setVersion || maxElectionIdOID > electionIdOID) {
        // this primary is stale, we must remove it
        serverDescriptions.set(
          serverDescription.address,
          new ServerDescription(serverDescription.address)
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
  for (const address of serverDescriptions.keys()) {
    const server = serverDescriptions.get(address);

    if (server.type === ServerType.RSPrimary && server.address !== serverDescription.address) {
      // Reset old primary's type to Unknown.
      serverDescriptions.set(address, new ServerDescription(server.address));

      // There can only be one primary
      break;
    }
  }

  // Discover new hosts from this primary's response.
  serverDescription.allHosts.forEach(address => {
    if (!serverDescriptions.has(address)) {
      serverDescriptions.set(address, new ServerDescription(address));
    }
  });

  // Remove hosts not in the response.
  const currentAddresses = Array.from(serverDescriptions.keys());
  const responseAddresses = serverDescription.allHosts;
  currentAddresses.filter(addr => responseAddresses.indexOf(addr) === -1).forEach(address => {
    serverDescriptions.delete(address);
  });

  return [checkHasPrimary(serverDescriptions), setName, maxSetVersion, maxElectionId];
}

function updateRsWithPrimaryFromMember(serverDescriptions, setName, serverDescription) {
  if (setName == null) {
    throw new TypeError('setName is required');
  }

  if (
    setName !== serverDescription.setName ||
    (serverDescription.me && serverDescription.address !== serverDescription.me)
  ) {
    serverDescriptions.delete(serverDescription.address);
  }

  return checkHasPrimary(serverDescriptions);
}

function updateRsNoPrimaryFromMember(serverDescriptions, setName, serverDescription) {
  let topologyType = TopologyType.ReplicaSetNoPrimary;

  setName = setName || serverDescription.setName;
  if (setName !== serverDescription.setName) {
    serverDescriptions.delete(serverDescription.address);
    return [topologyType, setName];
  }

  serverDescription.allHosts.forEach(address => {
    if (!serverDescriptions.has(address)) {
      serverDescriptions.set(address, new ServerDescription(address));
    }
  });

  if (serverDescription.me && serverDescription.address !== serverDescription.me) {
    serverDescriptions.delete(serverDescription.address);
  }

  return [topologyType, setName];
}

function checkHasPrimary(serverDescriptions) {
  for (const addr of serverDescriptions.keys()) {
    if (serverDescriptions.get(addr).type === ServerType.RSPrimary) {
      return TopologyType.ReplicaSetWithPrimary;
    }
  }

  return TopologyType.ReplicaSetNoPrimary;
}

module.exports = {
  TopologyType,
  TopologyDescription
};
