'use strict';

const TopologyType = require('../../../lib/core/sdam/topology_description').TopologyType;

/**
 * Filter for the MongoDB toopology required for the test
 *
 * example:
 * metadata: {
 *    requires: {
 *      topology: 'single' | 'replicaset' | 'sharded' | 'auth' | 'ssl'
 *    }
 * }
 */
class MongoDBTopologyFilter {
  initializeFilter(client, context, callback) {
    let topologyType = client.topology.type;
    if (typeof topologyType === 'string') {
      if (topologyType === 'server') {
        if (client.topology.s.coreTopology.ismaster.hosts) {
          topologyType = TopologyType.ReplicaSetWithPrimary;
        } else {
          topologyType = TopologyType.Single;
        }
      } else if (topologyType === 'mongos') {
        topologyType = TopologyType.Sharded;
      } else {
        callback(new TypeError(`unknown topology type detected: ${topologyType}`));
      }
    }

    context.topologyType = topologyType;
    this.runtimeTopology = topologyTypeToString(topologyType);
    callback();
  }

  filter(test) {
    if (!test.metadata) return true;
    if (!test.metadata.requires) return true;
    if (!test.metadata.requires.topology) return true;

    let topologies = null;
    if (typeof test.metadata.requires.topology === 'string') {
      topologies = [test.metadata.requires.topology];
    } else if (Array.isArray(test.metadata.requires.topology)) {
      topologies = test.metadata.requires.topology;
    } else {
      throw new TypeError(
        'MongoDBTopologyFilter only supports single string topology or an array of string topologies'
      );
    }

    return topologies.some(topology => topology === this.runtimeTopology);
  }
}

function topologyTypeToString(topologyType) {
  if (topologyType === TopologyType.ReplicaSetWithPrimary) {
    return 'replicaset';
  } else if (topologyType === TopologyType.Sharded) {
    return 'mongos';
  }

  return 'single';
}

module.exports = MongoDBTopologyFilter;
