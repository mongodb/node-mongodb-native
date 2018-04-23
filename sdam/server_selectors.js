'use strict';
const ServerType = require('./server_description').ServerType;
const TopologyType = require('./topology_description').TopologyType;
const ReadPreference = require('../topologies/read_preference');

function writableServerSelector() {
  return function(topologyDescription, servers) {
    if (topologyDescription === TopologyType.ReplicaSetNoPrimary) return [];
    if (
      topologyDescription.type === TopologyType.Sharded ||
      topologyDescription.type === TopologyType.Single
    ) {
      return latencyWindowReducer(topologyDescription, servers);
    }

    return latencyWindowReducer(topologyDescription, servers.filter(s => s.isWritable));
  };
}

// reducers
function maxStalenessReducer(readPreference, topologyDescription, servers) {
  if (readPreference.maxStalenessSeconds == null || readPreference.maxStalenessSeconds < 0) {
    return servers;
  }

  if (topologyDescription.type === TopologyType.ReplicaSetWithPrimary) {
    const primary = servers.filter(primaryFilter);
    return servers.reduce((result, server) => {
      const staleness =
        server.lastUpdateTime -
        server.lastWriteDate -
        (primary.lastUpdateTime - primary.lastWriteDate) +
        topologyDescription.heartbeatFrequencyMS;

      if (staleness <= readPreference.maxStalenessSeconds) result.push(server);
      return result;
    }, []);
  } else if (topologyDescription.type === TopologyType.ReplicaSetNoPrimary) {
    const sMax = servers.reduce((max, s) => (s.lastWriteDate > max.lastWriteDate ? s : max));
    return servers.reduce((result, server) => {
      const staleness =
        sMax.lastWriteDate - server.lastWriteDate + topologyDescription.heartbeatFrequencyMS;
      if (staleness <= readPreference.maxStalenessSeconds) result.push(server);
      return result;
    }, []);
  }

  return servers;
}

function tagSetMatch(tagSet, serverTags) {
  const keys = Object.keys(tagSet);
  const serverTagKeys = Object.keys(serverTags);
  for (let i = 0; i < keys.length; ++i) {
    const key = keys[i];
    if (serverTagKeys.indexOf(key) === -1 || serverTags[key] !== tagSet[key]) {
      return false;
    }
  }

  return true;
}

function tagSetReducer(readPreference, servers) {
  if (
    readPreference.tags == null ||
    (Array.isArray(readPreference.tags) && readPreference.tags.length === 0)
  ) {
    return servers;
  }

  for (let i = 0; i < readPreference.tags.length; ++i) {
    const tagSet = readPreference.tags[i];
    const serversMatchingTagset = servers.reduce((matched, server) => {
      if (tagSetMatch(tagSet, server.tags)) matched.push(server);
      return matched;
    }, []);

    if (serversMatchingTagset.length) {
      return serversMatchingTagset;
    }
  }

  return [];
}

function latencyWindowReducer(topologyDescription, servers) {
  const low = servers.reduce(
    (min, server) =>
      min === -1 ? server.roundTripTime : server.roundTripTime < min ? server.roundTripTime : min,
    -1
  );
  const high = low + topologyDescription.localThresholdMS;

  return servers.reduce((result, server) => {
    if (server.roundTripTime <= high && server.roundTripTime >= low) result.push(server);
    return result;
  }, []);
}

// filters
function primaryFilter(server) {
  return server.type === ServerType.RSPrimary;
}

function secondaryFilter(server) {
  return server.type === ServerType.RSSecondary;
}

function nearestFilter(server) {
  return server.type === ServerType.RSSecondary || server.type === ServerType.RSPrimary;
}

function readPreferenceServerSelector(readPreference) {
  if (!readPreference.isValid()) {
    throw new TypeError('Invalid read preference specified');
  }

  return function(topologyDescription, servers) {
    if (
      topologyDescription.type === TopologyType.Single ||
      topologyDescription.type === TopologyType.Sharded ||
      topologyDescription.type === TopologyType.Unknown
    ) {
      return latencyWindowReducer(topologyDescription, servers);
    }

    if (readPreference.mode === ReadPreference.PRIMARY) {
      return servers.filter(s => s.type === ServerType.RSPrimary);
    }

    if (readPreference.mode === ReadPreference.SECONDARY) {
      return latencyWindowReducer(
        topologyDescription,
        tagSetReducer(
          readPreference,
          maxStalenessReducer(readPreference, topologyDescription, servers.filter(secondaryFilter))
        )
      );
    } else if (readPreference.mode === ReadPreference.NEAREST) {
      return latencyWindowReducer(
        topologyDescription,
        tagSetReducer(
          readPreference,
          maxStalenessReducer(readPreference, topologyDescription, servers.filter(nearestFilter))
        )
      );
    } else if (readPreference.mode === ReadPreference.SECONDARY_PREFERRED) {
      const result = latencyWindowReducer(
        topologyDescription,
        tagSetReducer(
          readPreference,
          maxStalenessReducer(readPreference, topologyDescription, servers.filter(secondaryFilter))
        )
      );

      return result.length === 0 ? servers.filter(primaryFilter) : result;
    } else if (readPreference.mode === ReadPreference.PRIMARY_PREFERRED) {
      const result = servers.filter(primaryFilter);
      if (result.length) {
        return result;
      }

      return latencyWindowReducer(
        topologyDescription,
        tagSetReducer(
          readPreference,
          maxStalenessReducer(readPreference, topologyDescription, servers.filter(secondaryFilter))
        )
      );
    }
  };
}

module.exports = {
  writableServerSelector,
  readPreferenceServerSelector
};
