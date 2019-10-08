'use strict';

const topologyType = require('../../../lib/core/topologies/shared').topologyType;
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
    let type = topologyType(client.topology);
    context.topologyType = type;
    this.runtimeTopology = topologyTypeToString(type);
    console.log(`[ topology type: ${this.runtimeTopology} ]`);
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
    return 'sharded';
  }

  return 'single';
}

module.exports = MongoDBTopologyFilter;
