'use strict';
const { TopologyType } = require('../../../mongodb');

/**
 * Filter for the MongoDB topology required for the test
 *
 * example:
 * metadata: {
 *    requires: {
 *      topology: 'single' | 'replicaset' | 'sharded'
 *    }
 * }
 */
class MongoDBTopologyFilter {
  initializeFilter(client, context, callback) {
    let type = client.topology.description.type;
    context.topologyType = type;
    this.runtimeTopology = topologyTypeToString(type);
    callback();
  }

  filter(test) {
    if (!test.metadata) return true;
    if (!test.metadata.requires) return true;
    if (!test.metadata.requires.topology) return true;

    const requiredTopology =
      test.metadata && test.metadata.requires && test.metadata.requires.topology;
    if (!requiredTopology) return true;

    let topologies;
    if (typeof requiredTopology === 'string') {
      topologies = [requiredTopology];
    } else if (Array.isArray(requiredTopology)) {
      topologies = requiredTopology;
    } else {
      throw new TypeError(
        'MongoDBTopologyFilter only supports single string topology or an array of string topologies'
      );
    }

    const isExclusion = topologies[0][0] === '!';
    if (isExclusion) {
      if (!topologies.every(topology => topology.startsWith('!'))) {
        // Not every topology starts with !
        throw new Error('Cannot combine inclusion with exclusion of topologies');
      }

      // Every excluded topology does not equal the current (prefix !)
      return topologies.every(topology => topology !== `!${this.runtimeTopology}`);
    } else {
      // inclusion list
      if (topologies.some(topology => topology.startsWith('!'))) {
        // Some topologies start with !
        throw new Error('Cannot combine exclusion with inclusion of topologies');
      }

      // At least some (one) of the included topologies equals the current
      return topologies.some(topology => topology === this.runtimeTopology);
    }
  }
}

function topologyTypeToString(topologyType) {
  if (topologyType === TopologyType.ReplicaSetWithPrimary) {
    return 'replicaset';
  } else if (topologyType === TopologyType.Sharded) {
    return 'sharded';
  } else if (topologyType === TopologyType.LoadBalanced) {
    return 'load-balanced';
  }

  return 'single';
}

module.exports = MongoDBTopologyFilter;
