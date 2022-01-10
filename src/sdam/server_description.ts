import { Document, Long, ObjectId } from '../bson';
import type { MongoError } from '../error';
import { arrayStrictEqual, errorStrictEqual, HostAddress, now } from '../utils';
import type { ClusterTime } from './common';
import { ServerType } from './common';

const WRITABLE_SERVER_TYPES = new Set<ServerType>([
  ServerType.RSPrimary,
  ServerType.Standalone,
  ServerType.Mongos,
  ServerType.LoadBalancer
]);

const DATA_BEARING_SERVER_TYPES = new Set<ServerType>([
  ServerType.RSPrimary,
  ServerType.RSSecondary,
  ServerType.Mongos,
  ServerType.Standalone,
  ServerType.LoadBalancer
]);

/** @public */
export interface TopologyVersion {
  processId: ObjectId;
  counter: Long;
}

/** @public */
export type TagSet = { [key: string]: string };

/** @internal */
export interface ServerDescriptionOptions {
  /** An Error used for better reporting debugging */
  error?: MongoError;

  /** The round trip time to ping this server (in ms) */
  roundTripTime?: number;

  /** The topologyVersion */
  topologyVersion?: TopologyVersion;

  /** If the client is in load balancing mode. */
  loadBalanced?: boolean;
}

/**
 * The client's view of a single server, based on the most recent hello outcome.
 *
 * Internal type, not meant to be directly instantiated
 * @public
 */
export class ServerDescription {
  private _hostAddress: HostAddress;
  address: string;
  type: ServerType;
  hosts: string[];
  passives: string[];
  arbiters: string[];
  tags: TagSet;

  error?: MongoError;
  topologyVersion?: TopologyVersion;
  minWireVersion: number;
  maxWireVersion: number;
  roundTripTime: number;
  lastUpdateTime: number;
  lastWriteDate: number;

  me?: string;
  primary?: string;
  setName?: string;
  setVersion?: number;
  electionId?: ObjectId;
  logicalSessionTimeoutMinutes?: number;

  // NOTE: does this belong here? It seems we should gossip the cluster time at the CMAP level
  $clusterTime?: ClusterTime;

  /**
   * Create a ServerDescription
   * @internal
   *
   * @param address - The address of the server
   * @param hello - An optional hello response for this server
   */
  constructor(address: HostAddress | string, hello?: Document, options?: ServerDescriptionOptions) {
    if (typeof address === 'string') {
      this._hostAddress = new HostAddress(address);
      this.address = this._hostAddress.toString();
    } else {
      this._hostAddress = address;
      this.address = this._hostAddress.toString();
    }
    this.type = parseServerType(hello, options);
    this.hosts = hello?.hosts?.map((host: string) => host.toLowerCase()) ?? [];
    this.passives = hello?.passives?.map((host: string) => host.toLowerCase()) ?? [];
    this.arbiters = hello?.arbiters?.map((host: string) => host.toLowerCase()) ?? [];
    this.tags = hello?.tags ?? {};
    this.minWireVersion = hello?.minWireVersion ?? 0;
    this.maxWireVersion = hello?.maxWireVersion ?? 0;
    this.roundTripTime = options?.roundTripTime ?? -1;
    this.lastUpdateTime = now();
    this.lastWriteDate = hello?.lastWrite?.lastWriteDate ?? 0;

    if (options?.topologyVersion) {
      this.topologyVersion = options.topologyVersion;
    } else if (hello?.topologyVersion) {
      this.topologyVersion = hello.topologyVersion;
    }

    if (options?.error) {
      this.error = options.error;
    }

    if (hello?.primary) {
      this.primary = hello.primary;
    }

    if (hello?.me) {
      this.me = hello.me.toLowerCase();
    }

    if (hello?.setName) {
      this.setName = hello.setName;
    }

    if (hello?.setVersion) {
      this.setVersion = hello.setVersion;
    }

    if (hello?.electionId) {
      this.electionId = hello.electionId;
    }

    if (hello?.logicalSessionTimeoutMinutes) {
      this.logicalSessionTimeoutMinutes = hello.logicalSessionTimeoutMinutes;
    }

    if (hello?.$clusterTime) {
      this.$clusterTime = hello.$clusterTime;
    }
  }

  get hostAddress(): HostAddress {
    if (this._hostAddress) return this._hostAddress;
    else return new HostAddress(this.address);
  }

  get allHosts(): string[] {
    return this.hosts.concat(this.arbiters).concat(this.passives);
  }

  /** Is this server available for reads*/
  get isReadable(): boolean {
    return this.type === ServerType.RSSecondary || this.isWritable;
  }

  /** Is this server data bearing */
  get isDataBearing(): boolean {
    return DATA_BEARING_SERVER_TYPES.has(this.type);
  }

  /** Is this server available for writes */
  get isWritable(): boolean {
    return WRITABLE_SERVER_TYPES.has(this.type);
  }

  get host(): string {
    const chopLength = `:${this.port}`.length;
    return this.address.slice(0, -chopLength);
  }

  get port(): number {
    const port = this.address.split(':').pop();
    return port ? Number.parseInt(port, 10) : 27017;
  }

  /**
   * Determines if another `ServerDescription` is equal to this one per the rules defined
   * in the {@link https://github.com/mongodb/specifications/blob/master/source/server-discovery-and-monitoring/server-discovery-and-monitoring.rst#serverdescription|SDAM spec}
   */
  equals(other: ServerDescription): boolean {
    const topologyVersionsEqual =
      this.topologyVersion === other.topologyVersion ||
      compareTopologyVersion(this.topologyVersion, other.topologyVersion) === 0;

    const electionIdsEqual: boolean =
      this.electionId && other.electionId
        ? other.electionId && this.electionId.equals(other.electionId)
        : this.electionId === other.electionId;

    return (
      other != null &&
      errorStrictEqual(this.error, other.error) &&
      this.type === other.type &&
      this.minWireVersion === other.minWireVersion &&
      arrayStrictEqual(this.hosts, other.hosts) &&
      tagsStrictEqual(this.tags, other.tags) &&
      this.setName === other.setName &&
      this.setVersion === other.setVersion &&
      electionIdsEqual &&
      this.primary === other.primary &&
      this.logicalSessionTimeoutMinutes === other.logicalSessionTimeoutMinutes &&
      topologyVersionsEqual
    );
  }
}

// Parses a `hello` message and determines the server type
export function parseServerType(hello?: Document, options?: ServerDescriptionOptions): ServerType {
  if (options?.loadBalanced) {
    return ServerType.LoadBalancer;
  }

  if (!hello || !hello.ok) {
    return ServerType.Unknown;
  }

  if (hello.isreplicaset) {
    return ServerType.RSGhost;
  }

  if (hello.msg && hello.msg === 'isdbgrid') {
    return ServerType.Mongos;
  }

  if (hello.setName) {
    if (hello.hidden) {
      return ServerType.RSOther;
    } else if (hello.isWritablePrimary) {
      return ServerType.RSPrimary;
    } else if (hello.secondary) {
      return ServerType.RSSecondary;
    } else if (hello.arbiterOnly) {
      return ServerType.RSArbiter;
    } else {
      return ServerType.RSOther;
    }
  }

  return ServerType.Standalone;
}

function tagsStrictEqual(tags: TagSet, tags2: TagSet): boolean {
  const tagsKeys = Object.keys(tags);
  const tags2Keys = Object.keys(tags2);

  return (
    tagsKeys.length === tags2Keys.length &&
    tagsKeys.every((key: string) => tags2[key] === tags[key])
  );
}

/**
 * Compares two topology versions.
 *
 * @returns A negative number if `lhs` is older than `rhs`; positive if `lhs` is newer than `rhs`; 0 if they are equivalent.
 */
export function compareTopologyVersion(lhs?: TopologyVersion, rhs?: TopologyVersion): number {
  if (lhs == null || rhs == null) {
    return -1;
  }

  if (lhs.processId.equals(rhs.processId)) {
    // tests mock counter as just number, but in a real situation counter should always be a Long
    const lhsCounter = Long.isLong(lhs.counter) ? lhs.counter : Long.fromNumber(lhs.counter);
    const rhsCounter = Long.isLong(rhs.counter) ? lhs.counter : Long.fromNumber(rhs.counter);
    return lhsCounter.compare(rhsCounter);
  }

  return -1;
}
