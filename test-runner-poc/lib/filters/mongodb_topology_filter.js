'use strict';
const MongoClient = require('mongodb').MongoClient;

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
  initializeFilter(callback) {
    const mongoClient = new MongoClient(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017');
    mongoClient.connect((err, client) => {
      if (err) throw new Error(err);
      let topologyType = mongoClient.topology.type;
      switch (topologyType) {
        case 'server':
          this.runtimeTopology = 'single';
          break;
        case 'replset':
          this.runtimeTopology = 'replicaset';
          break;
        case 'mongos':
          this.runtimeTopology = 'sharded';
          break;
        default:
          console.warn('Topology type is not recognized.');
          break;
      }
      client.close(callback);
    });
  }
  constructor() {
    this.runtimeTopology = 'single';
  }

  filter(test) {
    if (!(test.metadata && test.metadata.requires && test.metadata.requires.topology)) {
      return true;
    }

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

    // Check if we have an allowed topology for this test
    for (let i = 0; i < topologies.length; i++) {
      if (topologies[i] === this.runtimeTopology) return true;
    }

    // Do not execute the test
    return false;
  }
}

module.exports = MongoDBTopologyFilter;
