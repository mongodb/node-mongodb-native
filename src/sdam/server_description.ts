import { Document, Long, ObjectId } from '../bson';
import type { MongoError } from '../error';
import { arrayStrictEqual, compareObjectId, errorStrictEqual, HostAddress, now } from '../utils';
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
      // TODO(NODE-2674): Preserve int64 sent from MongoDB
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
  equals(other?: ServerDescription | null): boolean {
    // TODO(NODE-4510): Check ServerDescription equality logic for nullish topologyVersion meaning "greater than"
    const topologyVersionsEqual =
      this.topologyVersion === other?.topologyVersion ||
      compareTopologyVersion(this.topologyVersion, other?.topologyVersion) === 0;

    const electionIdsEqual =
      this.electionId != null && other?.electionId != null
        ? compareObjectId(this.electionId, other.electionId) === 0
        : this.electionId === other?.electionId;

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
 * 1. If the response topologyVersion is unset or the ServerDescription's
 *    topologyVersion is null, the client MUST assume the response is more recent.
 * 1. If the response's topologyVersion.processId is not equal to the
 *    ServerDescription's, the client MUST assume the response is more recent.
 * 1. If the response's topologyVersion.processId is equal to the
 *    ServerDescription's, the client MUST use the counter field to determine
 *    which topologyVersion is more recent.
 *
 * ```ts
 * currentTv <   newTv === -1
 * currentTv === newTv === 0
 * currentTv >   newTv === 1
 * ```
 */
export function compareTopologyVersion(
  currentTv?: TopologyVersion,
  newTv?: TopologyVersion
): 0 | -1 | 1 {
  if (currentTv == null || newTv == null) {
    return -1;
  }

  if (!currentTv.processId.equals(newTv.processId)) {
    return -1;
  }

  // TODO(NODE-2674): Preserve int64 sent from MongoDB
  const currentCounter = Long.isLong(currentTv.counter)
    ? currentTv.counter
    : Long.fromNumber(currentTv.counter);
  const newCounter = Long.isLong(newTv.counter) ? newTv.counter : Long.fromNumber(newTv.counter);

  return currentCounter.compare(newCounter);
}
