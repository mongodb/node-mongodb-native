import { type Document, Long, type ObjectId } from '../bson';
import { type MongoError, MongoRuntimeError } from '../error';
import {
  arrayStrictEqual,
  compareObjectId,
  errorStrictEqual,
  HostAddress,
  List,
  now
} from '../utils';
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
  address: string;
  type: ServerType;
  hosts: string[];
  passives: string[];
  arbiters: string[];
  tags: TagSet;
  error: MongoError | null;
  topologyVersion: TopologyVersion | null;
  minWireVersion: number;
  maxWireVersion: number;
  /** @internal */
  _rttSamples: List<number>;
  lastUpdateTime: number;
  lastWriteDate: number;
  me: string | null;
  primary: string | null;
  setName: string | null;
  setVersion: number | null;
  electionId: ObjectId | null;
  logicalSessionTimeoutMinutes: number | null;

  // NOTE: does this belong here? It seems we should gossip the cluster time at the CMAP level
  $clusterTime?: ClusterTime;

  /**
   * Create a ServerDescription
   * @internal
   *
   * @param address - The address of the server
   * @param hello - An optional hello response for this server
   */
  constructor(
    address: HostAddress | string,
    hello?: Document,
    options: ServerDescriptionOptions = {}
  ) {
    if (address == null || address === '') {
      throw new MongoRuntimeError('ServerDescription must be provided with a non-empty address');
    }

    this.address =
      typeof address === 'string'
        ? HostAddress.fromString(address).toString() // Use HostAddress to normalize
        : address.toString();
    this.type = parseServerType(hello, options);
    this.hosts = hello?.hosts?.map((host: string) => host.toLowerCase()) ?? [];
    this.passives = hello?.passives?.map((host: string) => host.toLowerCase()) ?? [];
    this.arbiters = hello?.arbiters?.map((host: string) => host.toLowerCase()) ?? [];
    this.tags = hello?.tags ?? {};
    this.minWireVersion = hello?.minWireVersion ?? 0;
    this.maxWireVersion = hello?.maxWireVersion ?? 0;
    // TODO: maybe use a List for this for quicker insertions and deletions
    this._rttSamples = new List();
    if (options?.roundTripTime != null) {
      this._rttSamples.push(options.roundTripTime);
    }
    this.lastUpdateTime = now();
    this.lastWriteDate = hello?.lastWrite?.lastWriteDate ?? 0;
    this.error = options.error ?? null;
    // TODO(NODE-2674): Preserve int64 sent from MongoDB
    this.topologyVersion = this.error?.topologyVersion ?? hello?.topologyVersion ?? null;
    this.setName = hello?.setName ?? null;
    this.setVersion = hello?.setVersion ?? null;
    this.electionId = hello?.electionId ?? null;
    this.logicalSessionTimeoutMinutes = hello?.logicalSessionTimeoutMinutes ?? null;
    this.primary = hello?.primary ?? null;
    this.me = hello?.me?.toLowerCase() ?? null;
    this.$clusterTime = hello?.$clusterTime ?? null;
  }

  get hostAddress(): HostAddress {
    return HostAddress.fromString(this.address);
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

  get roundTripTime(): number {
    if (this._rttSamples.length > 0) {
      let avg = 0;
      for (const v of this._rttSamples) {
        avg += v;
      }
      return avg / this._rttSamples.length;
    }
    return -1;
  }

  get minRoundTripTime(): number {
    if (this._rttSamples.length >= 2) {
      let minRTT = Infinity;
      for (const v of this._rttSamples) {
        if (v < minRTT) minRTT = v;
      }
      return minRTT;
    }

    return 0;
  }

  addRTTSample(rtt: number) {
    if (this._rttSamples.length === 10) {
      this._rttSamples.shift();
    }
    this._rttSamples.push(rtt);
  }

  updateWithHelloResponse(response: Document, options: ServerDescriptionOptions = {}) {
    this.type = parseServerType(response, options);
    this.hosts = response?.hosts?.map((host: string) => host.toLowerCase()) ?? this.hosts;
    this.passives = response?.passives?.map((host: string) => host.toLowerCase()) ?? this.passives;
    this.arbiters = response?.arbiters?.map((host: string) => host.toLowerCase()) ?? this.arbiters;
    this.tags = response?.tags ?? this.tags;
    this.minWireVersion = response?.minWireVersion ?? this.minWireVersion;
    this.maxWireVersion = response?.maxWireVersion ?? this.maxWireVersion;
    this.lastWriteDate = response?.lastWrite?.lastWriteDate ?? this.lastWriteDate;
    this.topologyVersion =
      this.error?.topologyVersion ?? response?.topologyVersion ?? this.topologyVersion;
    this.setName = response?.setName ?? this.setName;
    this.setVersion = response?.setVersion ?? this.setVersion;
    this.electionId = response?.electionId ?? this.electionId;
    this.logicalSessionTimeoutMinutes =
      response?.logicalSessionTimeoutMinutes ?? this.logicalSessionTimeoutMinutes;
    this.primary = response?.primary ?? this.primary;
    this.me = response?.me?.toLowerCase() ?? this.me;
    this.$clusterTime = response?.$clusterTime ?? this.$clusterTime;
  }

  /**
   * Determines if another `ServerDescription` is equal to this one per the rules defined
   * in the {@link https://github.com/mongodb/specifications/blob/master/source/server-discovery-and-monitoring/server-discovery-and-monitoring.rst#serverdescription|SDAM spec}
   */
  equals(other?: ServerDescription | null): boolean {
    // Despite using the comparator that would determine a nullish topologyVersion as greater than
    // for equality we should only always perform direct equality comparison
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
  currentTv?: TopologyVersion | null,
  newTv?: TopologyVersion | null
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
