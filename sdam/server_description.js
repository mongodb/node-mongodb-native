'use strict';

// An enumeration of server types we know about
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
 * The client's view of a single server, based on the most recent ismaster outcome.
 *
 * Internal type, not meant to be directly instantiated
 */
class ServerDescription {
  /**
   * Create a ServerDescription
   * @param {String} address The address of the server
   * @param {Object} [ismaster] An optional ismaster response for this server
   * @param {Object} [options] Optional settings
   * @param {Number} [options.roundTripTime] The round trip time to ping this server (in ms)
   */
  constructor(address, ismaster, options) {
    options = options || {};

    this.address = address;
    this.error = null;
    this.roundTripTime = options.roundTripTime || 0;
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

  /**
   * @return {Boolean} Is this server available for reads
   */
  get isReadable() {
    return this.type === ServerType.RSSecondary || this.isWritable;
  }

  /**
   * @return {Boolean} Is this server available for writes
   */
  get isWritable() {
    return (
      [ServerType.RSPrimary, ServerType.Standalone, ServerType.Mongos].indexOf(this.type) !== -1
    );
  }
}

/**
 * Parses an `ismaster` message and determines the server type
 *
 * @param {Object} ismaster The `ismaster` message to parse
 * @return {ServerType}
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

module.exports = {
  ServerDescription,
  ServerType
};
