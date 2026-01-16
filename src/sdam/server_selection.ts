import { MongoInvalidArgumentError, MongoRuntimeError } from '../error';
import { ReadPreference } from '../read_preference';
import { ServerType, TopologyType } from './common';
import type { ServerDescription, TagSet } from './server_description';
import type { TopologyDescription } from './topology_description';

// max staleness constants
const IDLE_WRITE_PERIOD = 10000;
const SMALLEST_MAX_STALENESS_SECONDS = 90;

//  Minimum version to try writes on secondaries.
export const MIN_SECONDARY_WRITE_WIRE_VERSION = 13;

/** @internal */
export type ServerSelector = (
  topologyDescription: TopologyDescription,
  servers: ServerDescription[],
  deprioritized: DeprioritizedServers
) => ServerDescription[];

/** @internal */
export class DeprioritizedServers {
  private deprioritized: Set<string> = new Set();

  constructor(descriptions?: Iterable<ServerDescription>) {
    for (const description of descriptions ?? []) {
      this.add(description);
    }
  }

  add({ address }: ServerDescription) {
    this.deprioritized.add(address);
  }

  has({ address }: ServerDescription): boolean {
    return this.deprioritized.has(address);
  }
}

function filterDeprioritized(
  candidates: ServerDescription[],
  deprioritized: DeprioritizedServers
): ServerDescription[] {
  const filtered = candidates.filter(candidate => !deprioritized.has(candidate));

  return filtered.length ? filtered : candidates;
}

/**
 * Returns a server selector that selects for writable servers
 */
export function writableServerSelector(): ServerSelector {
  return function writableServer(
    topologyDescription: TopologyDescription,
    servers: ServerDescription[],
    deprioritized: DeprioritizedServers
  ): ServerDescription[] {
    const eligibleServers = filterDeprioritized(
      servers.filter(({ isWritable }) => isWritable),
      deprioritized
    );

    return latencyWindowReducer(topologyDescription, eligibleServers);
  };
}

/**
 * The purpose of this selector is to select the same server, only
 * if it is in a state that it can have commands sent to it.
 */
export function sameServerSelector(description?: ServerDescription): ServerSelector {
  return function sameServerSelector(
    _topologyDescription: TopologyDescription,
    servers: ServerDescription[],
    _deprioritized: DeprioritizedServers
  ): ServerDescription[] {
    if (!description) return [];
    // Filter the servers to match the provided description only if
    // the type is not unknown.
    return servers.filter(sd => {
      return sd.address === description.address && sd.type !== ServerType.Unknown;
    });
  };
}

/**
 * Returns a server selector that uses a read preference to select a
 * server potentially for a write on a secondary.
 */
export function secondaryWritableServerSelector(
  wireVersion?: number,
  readPreference?: ReadPreference
): ServerSelector {
  // If server version < 5.0, read preference always primary.
  // If server version >= 5.0...
  // - If read preference is supplied, use that.
  // - If no read preference is supplied, use primary.
  if (
    !readPreference ||
    !wireVersion ||
    (wireVersion && wireVersion < MIN_SECONDARY_WRITE_WIRE_VERSION)
  ) {
    return readPreferenceServerSelector(ReadPreference.primary);
  }
  return readPreferenceServerSelector(readPreference);
}

/**
 * Reduces the passed in array of servers by the rules of the "Max Staleness" specification
 * found here:
 *
 * @see https://github.com/mongodb/specifications/blob/master/source/max-staleness/max-staleness.md
 *
 * @param readPreference - The read preference providing max staleness guidance
 * @param topologyDescription - The topology description
 * @param servers - The list of server descriptions to be reduced
 * @returns The list of servers that satisfy the requirements of max staleness
 */
function maxStalenessReducer(
  readPreference: ReadPreference,
  topologyDescription: TopologyDescription,
  servers: ServerDescription[]
): ServerDescription[] {
  if (readPreference.maxStalenessSeconds == null || readPreference.maxStalenessSeconds < 0) {
    return servers;
  }

  const maxStaleness = readPreference.maxStalenessSeconds;
  const maxStalenessVariance =
    (topologyDescription.heartbeatFrequencyMS + IDLE_WRITE_PERIOD) / 1000;
  if (maxStaleness < maxStalenessVariance) {
    throw new MongoInvalidArgumentError(
      `Option "maxStalenessSeconds" must be at least ${maxStalenessVariance} seconds`
    );
  }

  if (maxStaleness < SMALLEST_MAX_STALENESS_SECONDS) {
    throw new MongoInvalidArgumentError(
      `Option "maxStalenessSeconds" must be at least ${SMALLEST_MAX_STALENESS_SECONDS} seconds`
    );
  }

  if (topologyDescription.type === TopologyType.ReplicaSetWithPrimary) {
    const primary: ServerDescription = Array.from(topologyDescription.servers.values()).filter(
      primaryFilter
    )[0];

    return servers.filter((server: ServerDescription) => {
      const stalenessMS =
        server.lastUpdateTime -
        server.lastWriteDate -
        (primary.lastUpdateTime - primary.lastWriteDate) +
        topologyDescription.heartbeatFrequencyMS;

      const staleness = stalenessMS / 1000;
      const maxStalenessSeconds = readPreference.maxStalenessSeconds ?? 0;
      return staleness <= maxStalenessSeconds;
    });
  }

  if (topologyDescription.type === TopologyType.ReplicaSetNoPrimary) {
    if (servers.length === 0) {
      return servers;
    }

    const sMax = servers.reduce((max: ServerDescription, s: ServerDescription) =>
      s.lastWriteDate > max.lastWriteDate ? s : max
    );

    return servers.filter((server: ServerDescription) => {
      const stalenessMS =
        sMax.lastWriteDate - server.lastWriteDate + topologyDescription.heartbeatFrequencyMS;

      const staleness = stalenessMS / 1000;
      const maxStalenessSeconds = readPreference.maxStalenessSeconds ?? 0;
      return staleness <= maxStalenessSeconds;
    });
  }

  return servers;
}

/**
 * Determines whether a server's tags match a given set of tags.
 *
 * A tagset matches the server's tags if every k-v pair in the tagset
 * is also in the server's tagset.
 *
 * Note that this does not requires that every k-v pair in the server's tagset is also
 * in the client's tagset.  The server's tagset is required only to be a superset of the
 * client's tags.
 *
 * @see https://github.com/mongodb/specifications/blob/master/source/server-selection/server-selection.md#tag_sets
 *
 * @param tagSet - The requested tag set to match
 * @param serverTags - The server's tags
 */
function tagSetMatch(tagSet: TagSet, serverTags: TagSet) {
  return Object.entries(tagSet).every(
    ([key, value]) => serverTags[key] != null && serverTags[key] === value
  );
}

/**
 * Reduces a set of server descriptions based on tags requested by the read preference
 *
 * @param readPreference - The read preference providing the requested tags
 * @param servers - The list of server descriptions to reduce
 * @returns The list of servers matching the requested tags
 */
function tagSetReducer(
  { tags }: ReadPreference,
  servers: ServerDescription[]
): ServerDescription[] {
  if (tags == null || tags.length === 0) {
    // empty tag sets match all servers
    return servers;
  }

  for (const tagSet of tags) {
    const serversMatchingTagset = servers.filter((s: ServerDescription) =>
      tagSetMatch(tagSet, s.tags)
    );

    if (serversMatchingTagset.length) {
      return serversMatchingTagset;
    }
  }

  return [];
}

/**
 * Reduces a list of servers to ensure they fall within an acceptable latency window. This is
 * further specified in the "Server Selection" specification, found here:
 *
 * @see https://github.com/mongodb/specifications/blob/master/source/server-selection/server-selection.md
 *
 * @param topologyDescription - The topology description
 * @param servers - The list of servers to reduce
 * @returns The servers which fall within an acceptable latency window
 */
function latencyWindowReducer(
  topologyDescription: TopologyDescription,
  servers: ServerDescription[]
): ServerDescription[] {
  const low = servers.reduce(
    (min: number, server: ServerDescription) => Math.min(server.roundTripTime, min),
    Infinity
  );

  const high = low + topologyDescription.localThresholdMS;
  return servers.filter(server => server.roundTripTime <= high && server.roundTripTime >= low);
}

// filters
function primaryFilter(server: ServerDescription): boolean {
  return server.type === ServerType.RSPrimary;
}

function secondaryFilter(server: ServerDescription): boolean {
  return server.type === ServerType.RSSecondary;
}

function nearestFilter(server: ServerDescription): boolean {
  return server.type === ServerType.RSSecondary || server.type === ServerType.RSPrimary;
}

function knownFilter(server: ServerDescription): boolean {
  return server.type !== ServerType.Unknown;
}

function loadBalancerFilter(server: ServerDescription): boolean {
  return server.type === ServerType.LoadBalancer;
}

function isDeprioritizedFactory(
  deprioritized: DeprioritizedServers
): (server: ServerDescription) => boolean {
  return server =>
    // if any deprioritized servers equal the server, here we are.
    !deprioritized.has(server);
}

function secondarySelector(
  readPreference: ReadPreference,
  topologyDescription: TopologyDescription,
  servers: ServerDescription[],
  deprioritized: DeprioritizedServers
) {
  const mode = readPreference.mode;
  switch (mode) {
    case 'primary':
      // Note: no need to filter for deprioritized servers.  A replica set has only one primary; that means that
      // we are in one of two scenarios:
      // 1. deprioritized servers is empty - return the primary.
      // 2. deprioritized servers contains the primary - return the primary.
      return servers.filter(primaryFilter);
    case 'primaryPreferred': {
      const primary = servers.filter(primaryFilter);

      // If there is a primary and it is not deprioritized, use the primary.  Otherwise,
      // check for secondaries.
      const eligiblePrimary = primary.filter(isDeprioritizedFactory(deprioritized));
      if (eligiblePrimary.length) {
        return eligiblePrimary;
      }

      // If we make it here, we either have:
      // 1. a deprioritized primary
      // 2. no eligible primary
      // secondaries take precedence of deprioritized primaries.
      const secondaries = tagSetReducer(
        readPreference,
        maxStalenessReducer(readPreference, topologyDescription, servers.filter(secondaryFilter))
      );

      const eligibleSecondaries = secondaries.filter(isDeprioritizedFactory(deprioritized));
      if (eligibleSecondaries.length) {
        return latencyWindowReducer(topologyDescription, eligibleSecondaries);
      }

      // if we make it here, we have no primaries or secondaries that not deprioritized.
      // prefer the primary (which may not exist, if the topology has no primary).
      // otherwise, return the secondaries (which also may not exist, but there is nothing else to check here).
      return primary.length ? primary : latencyWindowReducer(topologyDescription, secondaries);
    }
    case 'nearest': {
      const eligible = filterDeprioritized(
        tagSetReducer(
          readPreference,
          maxStalenessReducer(readPreference, topologyDescription, servers.filter(nearestFilter))
        ),
        deprioritized
      );
      return latencyWindowReducer(topologyDescription, eligible);
    }
    case 'secondary':
    case 'secondaryPreferred': {
      const secondaries = tagSetReducer(
        readPreference,
        maxStalenessReducer(readPreference, topologyDescription, servers.filter(secondaryFilter))
      );
      const eligibleSecondaries = secondaries.filter(isDeprioritizedFactory(deprioritized));

      if (eligibleSecondaries.length) {
        return latencyWindowReducer(topologyDescription, eligibleSecondaries);
      }

      // we have no eligible secondaries, try for a primary if we can.
      if (mode === ReadPreference.SECONDARY_PREFERRED) {
        const primary = servers.filter(primaryFilter);

        // unlike readPreference=primary, here we do filter for deprioritized servers.
        // if the primary is deprioritized, deprioritized secondaries take precedence.
        const eligiblePrimary = primary.filter(isDeprioritizedFactory(deprioritized));
        if (eligiblePrimary.length) return eligiblePrimary;

        // we have no eligible primary nor secondaries that have not been deprioritized
        return secondaries.length
          ? latencyWindowReducer(topologyDescription, secondaries)
          : primary;
      }

      // return all secondaries in the latency window.
      return latencyWindowReducer(topologyDescription, secondaries);
    }

    default: {
      const _exhaustiveCheck: never = mode;
      throw new MongoRuntimeError(
        `unexpected readPreference=${mode} (should never happen).  Please report a bug in the Node driver Jira project.`
      );
    }
  }
}

/**
 * Returns a function which selects servers based on a provided read preference
 *
 * @param readPreference - The read preference to select with
 */
export function readPreferenceServerSelector(readPreference: ReadPreference): ServerSelector {
  if (!readPreference.isValid()) {
    throw new MongoInvalidArgumentError('Invalid read preference specified');
  }

  return function readPreferenceServers(
    topologyDescription: TopologyDescription,
    servers: ServerDescription[],
    deprioritized: DeprioritizedServers
  ): ServerDescription[] {
    switch (topologyDescription.type) {
      case 'Single':
        return latencyWindowReducer(topologyDescription, servers.filter(knownFilter));
      case 'ReplicaSetNoPrimary':
      case 'ReplicaSetWithPrimary':
        return secondarySelector(readPreference, topologyDescription, servers, deprioritized);
      case 'Sharded': {
        const selectable = filterDeprioritized(servers, deprioritized);
        return latencyWindowReducer(topologyDescription, selectable.filter(knownFilter));
      }
      case 'Unknown':
        return [];
      case 'LoadBalanced':
        return servers.filter(loadBalancerFilter);
      default: {
        const _exhaustiveCheck: never = topologyDescription.type;
        throw new MongoRuntimeError(
          `unexpected topology type: ${topologyDescription.type} (this should never happen).  Please file a bug in the Node driver Jira project.`
        );
      }
    }
  };
}
