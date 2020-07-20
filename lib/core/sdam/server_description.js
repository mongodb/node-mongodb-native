'use strict';

const arrayStrictEqual = require('../utils').arrayStrictEqual;
const tagsStrictEqual = require('../utils').tagsStrictEqual;
const errorStrictEqual = require('../utils').errorStrictEqual;
const ServerType = require('./common').ServerType;
const now = require('../../utils').now;

const WRITABLE_SERVER_TYPES = new Set([
  ServerType.RSPrimary,
  ServerType.Standalone,
  ServerType.Mongos
]);

const DATA_BEARING_SERVER_TYPES = new Set([
  ServerType.RSPrimary,
  ServerType.RSSecondary,
  ServerType.Mongos,
  ServerType.Standalone
]);

const ISMASTER_FIELDS = [
  'minWireVersion',
  'maxWireVersion',
  'maxBsonObjectSize',
  'maxMessageSizeBytes',
  'maxWriteBatchSize',
  'compression',
  'me',
  'hosts',
  'passives',
  'arbiters',
  'tags',
  'setName',
  'setVersion',
  'electionId',
  'primary',
  'logicalSessionTimeoutMinutes',
  'saslSupportedMechs',
  '__nodejs_mock_server__',
  '$clusterTime'
];

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
    ismaster = Object.assign(
      {
        minWireVersion: 0,
        maxWireVersion: 0,
        hosts: [],
        passives: [],
        arbiters: [],
        tags: []
      },
      ismaster
    );

    this.address = address;
    this.error = options.error;
    this.roundTripTime = options.roundTripTime || -1;
    this.lastUpdateTime = now();
    this.lastWriteDate = ismaster.lastWrite ? ismaster.lastWrite.lastWriteDate : null;
    this.opTime = ismaster.lastWrite ? ismaster.lastWrite.opTime : null;
    this.type = parseServerType(ismaster);

    // direct mappings
    ISMASTER_FIELDS.forEach(field => {
      if (typeof ismaster[field] !== 'undefined') this[field] = ismaster[field];
    });

    // normalize case for hosts
    if (this.me) this.me = this.me.toLowerCase();
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
   * @return {Boolean} Is this server data bearing
   */
  get isDataBearing() {
    return DATA_BEARING_SERVER_TYPES.has(this.type);
  }

  /**
   * @return {Boolean} Is this server available for writes
   */
  get isWritable() {
    return WRITABLE_SERVER_TYPES.has(this.type);
  }

  get host() {
    const chopLength = `:${this.port}`.length;
    return this.address.slice(0, -chopLength);
  }

  get port() {
    const port = this.address.split(':').pop();
    return port ? Number.parseInt(port, 10) : port;
  }

  /**
   * Determines if another `ServerDescription` is equal to this one per the rules defined
   * in the {@link https://github.com/mongodb/specifications/blob/master/source/server-discovery-and-monitoring/server-discovery-and-monitoring.rst#serverdescription|SDAM spec}
   *
   * @param {ServerDescription} other
   * @return {Boolean}
   */
  equals(other) {
    return (
      other != null &&
      errorStrictEqual(this.error, other.error) &&
      this.type === other.type &&
      this.minWireVersion === other.minWireVersion &&
      this.me === other.me &&
      arrayStrictEqual(this.hosts, other.hosts) &&
      tagsStrictEqual(this.tags, other.tags) &&
      this.setName === other.setName &&
      this.setVersion === other.setVersion &&
      (this.electionId
        ? other.electionId && this.electionId.equals(other.electionId)
        : this.electionId === other.electionId) &&
      this.primary === other.primary &&
      this.logicalSessionTimeoutMinutes === other.logicalSessionTimeoutMinutes
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
  parseServerType
};
