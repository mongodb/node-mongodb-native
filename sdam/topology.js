'use strict';
const EventEmitter = require('events');
const ServerDescription = require('./server_description').ServerDescription;
const TopologyDescription = require('./topology_description').TopologyDescription;
const TopologyType = require('./topology_description').TopologyType;
const monitoring = require('./monitoring');

// Global state
let globalTopologyCounter = 0;

/**
 * A container of server instances representing a connection to a MongoDB topology.
 *
 * @fires Topology#serverOpening
 * @fires Topology#serverClosed
 * @fires Topology#serverDescriptionChanged
 * @fires Topology#topologyOpening
 * @fires Topology#topologyClosed
 * @fires Topology#topologyDescriptionChanged
 * @fires Topology#serverHeartbeatStarted
 * @fires Topology#serverHeartbeatSucceeded
 * @fires Topology#serverHeartbeatFailed
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

    const topologyId = globalTopologyCounter++;
    const serverDescriptions = seedlist.reduce((result, seed) => {
      const address = seed.port ? `${seed.host}:${seed.port}` : `${seed.host}:27017`;
      result[address] = new ServerDescription(address);
      return result;
    }, {});

    this.s = {
      // the id of this topology
      id: topologyId,
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
   *
   * @param {Object} [options] Optional settings
   * @param {Array} [options.auth=null] Array of auth options to apply on connect
   */
  connect(/* options */) {
    // emit SDAM monitoring events
    this.emit('topologyOpening', new monitoring.TopologyOpeningEvent(this.s.id));

    // emit an event for the topology change
    this.emit(
      'topologyDescriptionChanged',
      new monitoring.TopologyDescriptionChangedEvent(
        this.s.id,
        new TopologyDescription(TopologyType.Unknown), // initial is always Unknown
        this.s.description
      )
    );

    // emit ServerOpeningEvents for each server in our topology
    Object.keys(this.s.description.servers).forEach(serverAddress => {
      // publish an open event for each ServerDescription created
      this.emit('serverOpening', new monitoring.ServerOpeningEvent(this.s.id, serverAddress));
    });
  }

  /**
   * Close this topology
   */
  close() {
    // emit an event for close
    this.emit('topologyClosed', new monitoring.TopologyClosedEvent(this.s.id));
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
    // these will be used for monitoring events later
    const previousTopologyDescription = this.s.description;
    const previousServerDescription = this.s.description.servers[serverDescription.address];

    // first update the TopologyDescription
    this.s.description = this.s.description.update(serverDescription);

    // emit monitoring events for this change
    this.emit(
      'serverDescriptionChanged',
      new monitoring.ServerDescriptionChangedEvent(
        this.s.id,
        serverDescription.address,
        previousServerDescription,
        this.s.description.servers[serverDescription.address]
      )
    );

    this.emit(
      'topologyDescriptionChanged',
      new monitoring.TopologyDescriptionChangedEvent(
        this.s.id,
        previousTopologyDescription,
        this.s.description
      )
    );
  }
}

/**
 * A server opening SDAM monitoring event
 *
 * @event Topology#serverOpening
 * @type {ServerOpeningEvent}
 */

/**
 * A server closed SDAM monitoring event
 *
 * @event Topology#serverClosed
 * @type {ServerClosedEvent}
 */

/**
 * A server description SDAM change monitoring event
 *
 * @event Topology#serverDescriptionChanged
 * @type {ServerDescriptionChangedEvent}
 */

/**
 * A topology open SDAM event
 *
 * @event Topology#topologyOpening
 * @type {TopologyOpeningEvent}
 */

/**
 * A topology closed SDAM event
 *
 * @event Topology#topologyClosed
 * @type {TopologyClosedEvent}
 */

/**
 * A topology structure SDAM change event
 *
 * @event Topology#topologyDescriptionChanged
 * @type {TopologyDescriptionChangedEvent}
 */

/**
 * A topology serverHeartbeatStarted SDAM event
 *
 * @event Topology#serverHeartbeatStarted
 * @type {ServerHeartbeatStartedEvent}
 */

/**
 * A topology serverHeartbeatFailed SDAM event
 *
 * @event Topology#serverHeartbeatFailed
 * @type {ServerHearbeatFailedEvent}
 */

/**
 * A topology serverHeartbeatSucceeded SDAM change event
 *
 * @event Topology#serverHeartbeatSucceeded
 * @type {ServerHeartbeatSucceededEvent}
 */

module.exports = {
  Topology,
  ServerDescription
};
