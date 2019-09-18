'use strict';

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
  constructor() {
    this.runtimeTopology = 'single';
  }

  initializeFilter(client, context, callback) {
    const topologyType = client.topology.type;
    switch (topologyType) {
      case 'server':
        if (client.topology.s.coreTopology.ismaster.hosts) {
          this.runtimeTopology = 'replicaset';
        } else {
          this.runtimeTopology = 'single';
        }

        break;
      case 'mongos':
        this.runtimeTopology = 'sharded';
        break;

      default:
        console.warn(`topology type is not recognized: ${topologyType}`);
        break;
    }

    context.environmentName = this.runtimeTopology;
    callback();
  }

  filter(test) {
    if (!test.metadata) return true;
    if (!test.metadata.requires) return true;
    if (!test.metadata.requires.topology) return true;

    // If we have a single topology convert to single item array
    let topologies = null;

    if (typeof test.metadata.requires.topology === 'string') {
      topologies = [test.metadata.requires.topology];
    } else if (Array.isArray(test.metadata.requires.topology)) {
      topologies = test.metadata.requires.topology;
    } else {
      throw new Error(
        'MongoDBTopologyFilter only supports single string topology or an array of string topologies'
      );
    }

    return topologies.some(topology => topology === this.runtimeTopology);
  }
}

module.exports = MongoDBTopologyFilter;
