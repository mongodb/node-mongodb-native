import { ServerDescription } from './server_description';
import * as WIRE_CONSTANTS from '../cmap/wire_protocol/constants';
import { TopologyType, ServerType } from './common';
import type { ObjectId, Document } from '../bson';
import type { SrvPollingEvent } from './srv_polling';
import { MongoError, MongoRuntimeError } from '../error';

// constants related to compatibility checks
const MIN_SUPPORTED_SERVER_VERSION = WIRE_CONSTANTS.MIN_SUPPORTED_SERVER_VERSION;
const MAX_SUPPORTED_SERVER_VERSION = WIRE_CONSTANTS.MAX_SUPPORTED_SERVER_VERSION;
const MIN_SUPPORTED_WIRE_VERSION = WIRE_CONSTANTS.MIN_SUPPORTED_WIRE_VERSION;
const MAX_SUPPORTED_WIRE_VERSION = WIRE_CONSTANTS.MAX_SUPPORTED_WIRE_VERSION;

const MONGOS_OR_UNKNOWN = new Set<ServerType>([ServerType.Mongos, ServerType.Unknown]);
const MONGOS_OR_STANDALONE = new Set<ServerType>([ServerType.Mongos, ServerType.Standalone]);
const NON_PRIMARY_RS_MEMBERS = new Set<ServerType>([
  ServerType.RSSecondary,
  ServerType.RSArbiter,
  ServerType.RSOther
]);

/** @public */
export interface TopologyDescriptionOptions {
  heartbeatFrequencyMS?: number;
  localThresholdMS?: number;
}

/**
 * Representation of a deployment of servers
 * @public
 */
export class TopologyDescription {
  type: TopologyType;
  setName?: string;
  maxSetVersion?: number;
  maxElectionId?: ObjectId;
  servers: Map<string, ServerDescription>;
  stale: boolean;
  compatible: boolean;
  compatibilityError?: string;
  logicalSessionTimeoutMinutes?: number;
  heartbeatFrequencyMS: number;
  localThresholdMS: number;
  commonWireVersion?: number;

  /**
   * Create a TopologyDescription
   */
  constructor(
    topologyType: TopologyType,
    serverDescriptions?: Map<string, ServerDescription>,
    setName?: string,
    maxSetVersion?: number,
    maxElectionId?: ObjectId,
    commonWireVersion?: number,
    options?: TopologyDescriptionOptions
  ) {
    options = options ?? {};

    // TODO: consider assigning all these values to a temporary value `s` which
    //       we use `Object.freeze` on, ensuring the internal state of this type
    //       is immutable.
    this.type = topologyType ?? TopologyType.Unknown;
    this.servers = serverDescriptions ?? new Map();
    this.stale = false;
    this.compatible = true;
    this.heartbeatFrequencyMS = options.heartbeatFrequencyMS ?? 0;
    this.localThresholdMS = options.localThresholdMS ?? 0;

    if (setName) {
      this.setName = setName;
    }

    if (maxSetVersion) {
      this.maxSetVersion = maxSetVersion;
    }

    if (maxElectionId) {
      this.maxElectionId = maxElectionId;
    }

    if (commonWireVersion) {
      this.commonWireVersion = commonWireVersion;
    }

    // determine server compatibility
    for (const serverDescription of this.servers.values()) {
      // Load balancer mode is always compatible.
      if (
        serverDescription.type === ServerType.Unknown ||
        serverDescription.type === ServerType.LoadBalancer
      ) {
        continue;
      }

      if (serverDescription.minWireVersion > MAX_SUPPORTED_WIRE_VERSION) {
        this.compatible = false;
        this.compatibilityError = `Server at ${serverDescription.address} requires wire version ${serverDescription.minWireVersion}, but this version of the driver only supports up to ${MAX_SUPPORTED_WIRE_VERSION} (MongoDB ${MAX_SUPPORTED_SERVER_VERSION})`;
      }

      if (serverDescription.maxWireVersion < MIN_SUPPORTED_WIRE_VERSION) {
        this.compatible = false;
        this.compatibilityError = `Server at ${serverDescription.address} reports wire version ${serverDescription.maxWireVersion}, but this version of the driver requires at least ${MIN_SUPPORTED_WIRE_VERSION} (MongoDB ${MIN_SUPPORTED_SERVER_VERSION}).`;
        break;
      }
    }

    // Whenever a client updates the TopologyDescription from an ismaster response, it MUST set
    // TopologyDescription.logicalSessionTimeoutMinutes to the smallest logicalSessionTimeoutMinutes
    // value among ServerDescriptions of all data-bearing server types. If any have a null
    // logicalSessionTimeoutMinutes, then TopologyDescription.logicalSessionTimeoutMinutes MUST be
    // set to null.
    this.logicalSessionTimeoutMinutes = undefined;
    for (const [, server] of this.servers) {
      if (server.isReadable) {
        if (server.logicalSessionTimeoutMinutes == null) {
          // If any of the servers have a null logicalSessionsTimeout, then the whole topology does
          this.logicalSessionTimeoutMinutes = undefined;
          break;
        }

        if (this.logicalSessionTimeoutMinutes == null) {
          // First server with a non null logicalSessionsTimeout
          this.logicalSessionTimeoutMinutes = server.logicalSessionTimeoutMinutes;
          continue;
        }

        // Always select the smaller of the:
        // current server logicalSessionsTimeout and the topologies logicalSessionsTimeout
        this.logicalSessionTimeoutMinutes = Math.min(
          this.logicalSessionTimeoutMinutes,
          server.logicalSessionTimeoutMinutes
        );
      }
    }
  }

  /**
   * Returns a new TopologyDescription based on the SrvPollingEvent
   * @internal
   */
  updateFromSrvPollingEvent(ev: SrvPollingEvent): TopologyDescription {
    const newAddresses = ev.addresses();
    const serverDescriptions = new Map(this.servers);
    for (const address of this.servers.keys()) {
      if (newAddresses.has(address)) {
        newAddresses.delete(address);
      } else {
        serverDescriptions.delete(address);
      }
    }

    if (serverDescriptions.size === this.servers.size && newAddresses.size === 0) {
      return this;
    }

    for (const [address, host] of newAddresses) {
      serverDescriptions.set(address, new ServerDescription(host));
    }

    return new TopologyDescription(
      this.type,
      serverDescriptions,
      this.setName,
      this.maxSetVersion,
      this.maxElectionId,
      this.commonWireVersion,
      { heartbeatFrequencyMS: this.heartbeatFrequencyMS, localThresholdMS: this.localThresholdMS }
    );
  }

  /**
   * Returns a copy of this description updated with a given ServerDescription
   * @internal
   */
  update(serverDescription: ServerDescription): TopologyDescription {
    const address = serverDescription.address;

    // potentially mutated values
    let { type: topologyType, setName, maxSetVersion, maxElectionId, commonWireVersion } = this;

    if (serverDescription.setName && setName && serverDescription.setName !== setName) {
      serverDescription = new ServerDescription(address, undefined);
    }

    const serverType = serverDescription.type;
    const serverDescriptions = new Map(this.servers);

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
        { heartbeatFrequencyMS: this.heartbeatFrequencyMS, localThresholdMS: this.localThresholdMS }
      );
    }

    if (topologyType === TopologyType.Unknown) {
      if (serverType === ServerType.Standalone && this.servers.size !== 1) {
        serverDescriptions.delete(address);
      } else {
        topologyType = topologyTypeForServerType(serverType);
      }
    }

    if (topologyType === TopologyType.Sharded) {
      if (!MONGOS_OR_UNKNOWN.has(serverType)) {
        serverDescriptions.delete(address);
      }
    }

    if (topologyType === TopologyType.ReplicaSetNoPrimary) {
      if (MONGOS_OR_STANDALONE.has(serverType)) {
        serverDescriptions.delete(address);
      }

      if (serverType === ServerType.RSPrimary) {
        const result = updateRsFromPrimary(
          serverDescriptions,
          serverDescription,
          setName,
          maxSetVersion,
          maxElectionId
        );

        topologyType = result[0];
        setName = result[1];
        maxSetVersion = result[2];
        maxElectionId = result[3];
      } else if (NON_PRIMARY_RS_MEMBERS.has(serverType)) {
        const result = updateRsNoPrimaryFromMember(serverDescriptions, serverDescription, setName);
        topologyType = result[0];
        setName = result[1];
      }
    }

    if (topologyType === TopologyType.ReplicaSetWithPrimary) {
      if (MONGOS_OR_STANDALONE.has(serverType)) {
        serverDescriptions.delete(address);
        topologyType = checkHasPrimary(serverDescriptions);
      } else if (serverType === ServerType.RSPrimary) {
        const result = updateRsFromPrimary(
          serverDescriptions,
          serverDescription,
          setName,
          maxSetVersion,
          maxElectionId
        );

        topologyType = result[0];
        setName = result[1];
        maxSetVersion = result[2];
        maxElectionId = result[3];
      } else if (NON_PRIMARY_RS_MEMBERS.has(serverType)) {
        topologyType = updateRsWithPrimaryFromMember(
          serverDescriptions,
          serverDescription,
          setName
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
      { heartbeatFrequencyMS: this.heartbeatFrequencyMS, localThresholdMS: this.localThresholdMS }
    );
  }

  get error(): MongoError | undefined {
    const descriptionsWithError = Array.from(this.servers.values()).filter(
      (sd: ServerDescription) => sd.error
    );

    if (descriptionsWithError.length > 0) {
      return descriptionsWithError[0].error;
    }
  }

  /**
   * Determines if the topology description has any known servers
   */
  get hasKnownServers(): boolean {
    return Array.from(this.servers.values()).some(
      (sd: ServerDescription) => sd.type !== ServerType.Unknown
    );
  }

  /**
   * Determines if this topology description has a data-bearing server available.
   */
  get hasDataBearingServers(): boolean {
    return Array.from(this.servers.values()).some((sd: ServerDescription) => sd.isDataBearing);
  }

  /**
   * Determines if the topology has a definition for the provided address
   * @internal
   */
  hasServer(address: string): boolean {
    return this.servers.has(address);
  }
}

function topologyTypeForServerType(serverType: ServerType): TopologyType {
  switch (serverType) {
    case ServerType.Standalone:
      return TopologyType.Single;
    case ServerType.Mongos:
      return TopologyType.Sharded;
    case ServerType.RSPrimary:
      return TopologyType.ReplicaSetWithPrimary;
    case ServerType.RSOther:
    case ServerType.RSSecondary:
      return TopologyType.ReplicaSetNoPrimary;
    default:
      return TopologyType.Unknown;
  }
}

// TODO: improve these docs when ObjectId is properly typed
function compareObjectId(oid1: Document, oid2: Document): number {
  if (oid1 == null) {
    return -1;
  }

  if (oid2 == null) {
    return 1;
  }

  if (oid1.id instanceof Buffer && oid2.id instanceof Buffer) {
    const oid1Buffer = oid1.id;
    const oid2Buffer = oid2.id;
    return oid1Buffer.compare(oid2Buffer);
  }

  const oid1String = oid1.toString();
  const oid2String = oid2.toString();
  return oid1String.localeCompare(oid2String);
}

function updateRsFromPrimary(
  serverDescriptions: Map<string, ServerDescription>,
  serverDescription: ServerDescription,
  setName?: string,
  maxSetVersion?: number,
  maxElectionId?: ObjectId
): [TopologyType, string?, number?, ObjectId?] {
  setName = setName || serverDescription.setName;
  if (setName !== serverDescription.setName) {
    serverDescriptions.delete(serverDescription.address);
    return [checkHasPrimary(serverDescriptions), setName, maxSetVersion, maxElectionId];
  }

  const electionId = serverDescription.electionId ? serverDescription.electionId : null;
  if (serverDescription.setVersion && electionId) {
    if (maxSetVersion && maxElectionId) {
      if (
        maxSetVersion > serverDescription.setVersion ||
        compareObjectId(maxElectionId, electionId) > 0
      ) {
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
  for (const [address, server] of serverDescriptions) {
    if (server.type === ServerType.RSPrimary && server.address !== serverDescription.address) {
      // Reset old primary's type to Unknown.
      serverDescriptions.set(address, new ServerDescription(server.address));

      // There can only be one primary
      break;
    }
  }

  // Discover new hosts from this primary's response.
  serverDescription.allHosts.forEach((address: string) => {
    if (!serverDescriptions.has(address)) {
      serverDescriptions.set(address, new ServerDescription(address));
    }
  });

  // Remove hosts not in the response.
  const currentAddresses = Array.from(serverDescriptions.keys());
  const responseAddresses = serverDescription.allHosts;
  currentAddresses
    .filter((addr: string) => responseAddresses.indexOf(addr) === -1)
    .forEach((address: string) => {
      serverDescriptions.delete(address);
    });

  return [checkHasPrimary(serverDescriptions), setName, maxSetVersion, maxElectionId];
}

function updateRsWithPrimaryFromMember(
  serverDescriptions: Map<string, ServerDescription>,
  serverDescription: ServerDescription,
  setName?: string
): TopologyType {
  if (setName == null) {
    // TODO(NODE-3483): should be an appropriate runtime error
    throw new MongoRuntimeError('Argument "setName" is required if connected to a replica set');
  }

  if (
    setName !== serverDescription.setName ||
    (serverDescription.me && serverDescription.address !== serverDescription.me)
  ) {
    serverDescriptions.delete(serverDescription.address);
  }

  return checkHasPrimary(serverDescriptions);
}

function updateRsNoPrimaryFromMember(
  serverDescriptions: Map<string, ServerDescription>,
  serverDescription: ServerDescription,
  setName?: string
): [TopologyType, string?] {
  const topologyType = TopologyType.ReplicaSetNoPrimary;
  setName = setName || serverDescription.setName;
  if (setName !== serverDescription.setName) {
    serverDescriptions.delete(serverDescription.address);
    return [topologyType, setName];
  }

  serverDescription.allHosts.forEach((address: string) => {
    if (!serverDescriptions.has(address)) {
      serverDescriptions.set(address, new ServerDescription(address));
    }
  });

  if (serverDescription.me && serverDescription.address !== serverDescription.me) {
    serverDescriptions.delete(serverDescription.address);
  }

  return [topologyType, setName];
}

function checkHasPrimary(serverDescriptions: Map<string, ServerDescription>): TopologyType {
  for (const serverDescription of serverDescriptions.values()) {
    if (serverDescription.type === ServerType.RSPrimary) {
      return TopologyType.ReplicaSetWithPrimary;
    }
  }

  return TopologyType.ReplicaSetNoPrimary;
}
