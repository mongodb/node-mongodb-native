import { arrayStrictEqual, tagsStrictEqual, errorStrictEqual } from '../utils';
import { ServerType } from './common';
import { now } from '../utils';

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
  address: string;
  error: any;
  roundTripTime: any;
  lastUpdateTime: any;
  lastWriteDate: any;
  opTime: any;
  type: any;
  topologyVersion: any;
  me: any;
  hosts: any;
  passives: any;
  arbiters: any;
  minWireVersion: any;
  maxWireVersion: any;
  tags: any;
  setName: any;
  setVersion: any;
  electionId: any;
  primary: any;
  logicalSessionTimeoutMinutes: any;
  $clusterTime: any;

  /**
   * Create a ServerDescription
   *
   * @param {string} address The address of the server
   * @param {any} [ismaster] An optional ismaster response for this server
   * @param {object} [options] Optional settings
   * @param {number} [options.roundTripTime] The round trip time to ping this server (in ms)
   * @param {Error} [options.error] An Error used for better reporting debugging
   * @param {any} [options.topologyVersion] The topologyVersion
   */
  constructor(address: string, ismaster?: any, options?: any) {
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
    this.topologyVersion = options.topologyVersion || ismaster.topologyVersion;

    // direct mappings
    ISMASTER_FIELDS.forEach((field: any) => {
      if (typeof ismaster[field] !== 'undefined') (this as any)[field] = ismaster[field];
    });

    // normalize case for hosts
    if (this.me) this.me = this.me.toLowerCase();
    this.hosts = this.hosts.map((host: any) => host.toLowerCase());
    this.passives = this.passives.map((host: any) => host.toLowerCase());
    this.arbiters = this.arbiters.map((host: any) => host.toLowerCase());
  }

  get allHosts() {
    return this.hosts.concat(this.arbiters).concat(this.passives);
  }

  /**
   * @returns {boolean} Is this server available for reads
   */
  get isReadable() {
    return this.type === ServerType.RSSecondary || this.isWritable;
  }

  /**
   * @returns {boolean} Is this server data bearing
   */
  get isDataBearing() {
    return DATA_BEARING_SERVER_TYPES.has(this.type);
  }

  /**
   * @returns {boolean} Is this server available for writes
   */
  get isWritable() {
    return WRITABLE_SERVER_TYPES.has(this.type);
  }

  get host() {
    const chopLength = `:${this.port}`.length;
    return this.address.slice(0, -chopLength);
  }

  get port() {
    const addressParts = this.address.split(':');
    return Number.parseInt(addressParts[addressParts.length - 1], 10);
  }

  /**
   * Determines if another `ServerDescription` is equal to this one per the rules defined
   * in the {@link https://github.com/mongodb/specifications/blob/master/source/server-discovery-and-monitoring/server-discovery-and-monitoring.rst#serverdescription|SDAM spec}
   *
   * @param {ServerDescription} other
   * @returns {boolean}
   */
  equals(other: ServerDescription): boolean {
    const topologyVersionsEqual =
      this.topologyVersion === other.topologyVersion ||
      compareTopologyVersion(this.topologyVersion, other.topologyVersion) === 0;

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
      this.logicalSessionTimeoutMinutes === other.logicalSessionTimeoutMinutes &&
      topologyVersionsEqual
    );
  }
}

/**
 * Parses an `ismaster` message and determines the server type
 *
 * @param {any} ismaster The `ismaster` message to parse
 * @returns {string}
 */
function parseServerType(ismaster: any): string {
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
 * Compares two topology versions.
 *
 * @param {any} lhs
 * @param {any} rhs
 * @returns A negative number if `lhs` is older than `rhs`; positive if `lhs` is newer than `rhs`; 0 if they are equivalent.
 */
function compareTopologyVersion(lhs: any, rhs: any) {
  if (lhs == null || rhs == null) {
    return -1;
  }

  if (lhs.processId.equals(rhs.processId)) {
    // TODO: handle counters as Longs
    if (lhs.counter === rhs.counter) {
      return 0;
    } else if (lhs.counter < rhs.counter) {
      return -1;
    }

    return 1;
  }

  return -1;
}

export { ServerDescription, parseServerType, compareTopologyVersion };
