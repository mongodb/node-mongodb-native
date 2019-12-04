'use strict';

const topologyType = require('../../../../lib/core/topologies/shared').topologyType;
const TopologyType = require('../../../../lib/core/sdam/common').TopologyType;

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
