'use strict';
const EventEmitter = require('events');
const ServerDescription = require('./server_description').ServerDescription;
const TopologyDescription = require('./topology_description').TopologyDescription;
const TopologyType = require('./topology_description').TopologyType;

/**
 * A container of server instances representing a connection to a MongoDB topology.
 */
class Topology extends EventEmitter {
  /**
   * Create a topology
   *
   * @param {Array|String} seedlist a string list, or array of Server instances to connect to
   * @param {Object} [options] Optional settings
   */
  constructor(seedlist, options) {
    super();
    seedlist = seedlist || [];
    options = options || {};

    const topologyType =
      seedlist.length === 1 && !options.replicaset
        ? TopologyType.Single
        : options.replicaset
          ? TopologyType.ReplicaSetNoPrimary
          : TopologyType.Unknown;

    const serverDescriptions = seedlist.reduce((result, seed) => {
      const address = seed.port ? `${seed.host}:${seed.port}` : `${seed.host}:27017`;
      result[address] = new ServerDescription(address);
      return result;
    }, {});

    this.s = {
      // passed in options
      options: Object.assign({}, options),
      // initial seedlist of servers to connect to
      seedlist: seedlist,
      // the topology description
      description: new TopologyDescription(
        topologyType,
        serverDescriptions,
        options.replicaset,
        null,
        null,
        options
      )
    };
  }

  /**
   * @return A `TopologyDescription` for this topology
   */
  get description() {
    return this.s.description;
  }

  /**
   * Initiate server connect
   * @method
   * @param {array} [options.auth=null] Array of auth options to apply on connect
   */
  connect(/* options */) {
    return;
  }

  /**
   * Selects a server according to the selection predicate provided
   *
   * @param {function} [predicate] An optional predicate to select servers by, defaults to a random selection within a latency window
   * @return {Server} An instance of a `Server` meeting the criteria of the predicate provided
   */
  selectServer(/* predicate */) {
    return;
  }

  /**
   * Update the topology with a ServerDescription
   *
   * @param {object} serverDescription the server to update
   */
  update(serverDescription) {
    // first update the TopologyDescription
    this.s.description = this.s.description.update(serverDescription);
  }
}

module.exports.Topology = Topology;
module.exports.ServerDescription = ServerDescription;
