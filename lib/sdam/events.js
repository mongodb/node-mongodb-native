'use strict';

// type imports
/** @typedef {InstanceType<import('../error')['MongoError']>} MongoError */

/**
 * Published when server description changes, but does NOT include changes to the RTT.
 *
 * @property {object} topologyId A unique identifier for the topology
 * @property {ServerAddress} address The address (host/port pair) of the server
 * @property {ServerDescription} previousDescription The previous server description
 * @property {ServerDescription} newDescription The new server description
 */
class ServerDescriptionChangedEvent {
  constructor(topologyId, address, previousDescription, newDescription) {
    Object.assign(this, { topologyId, address, previousDescription, newDescription });
  }
}

/**
 * Published when server is initialized.
 *
 * @property {object} topologyId A unique identifier for the topology
 * @property {ServerAddress} address The address (host/port pair) of the server
 */
class ServerOpeningEvent {
  constructor(topologyId, address) {
    Object.assign(this, { topologyId, address });
  }
}

/**
 * Published when server is closed.
 *
 * @property {ServerAddress} address The address (host/port pair) of the server
 * @property {object} topologyId A unique identifier for the topology
 */
class ServerClosedEvent {
  constructor(topologyId, address) {
    Object.assign(this, { topologyId, address });
  }
}

/**
 * Published when topology description changes.
 *
 * @property {object} topologyId A unique identifier for the topology
 * @property {TopologyDescription} previousDescription The old topology description
 * @property {TopologyDescription} newDescription The new topology description
 */
class TopologyDescriptionChangedEvent {
  constructor(topologyId, previousDescription, newDescription) {
    Object.assign(this, { topologyId, previousDescription, newDescription });
  }
}

/**
 * Published when topology is initialized.
 *
 * @param {object} topologyId A unique identifier for the topology
 */
class TopologyOpeningEvent {
  constructor(topologyId) {
    Object.assign(this, { topologyId });
  }
}

/**
 * Published when topology is closed.
 *
 * @param {object} topologyId A unique identifier for the topology
 */
class TopologyClosedEvent {
  constructor(topologyId) {
    Object.assign(this, { topologyId });
  }
}

/**
 * Fired when the server monitor’s ismaster command is started - immediately before
 * the ismaster command is serialized into raw BSON and written to the socket.
 *
 * @property {object} connectionId The connection id for the command
 */
class ServerHeartbeatStartedEvent {
  constructor(connectionId) {
    Object.assign(this, { connectionId });
  }
}

/**
 * Fired when the server monitor’s ismaster succeeds.
 *
 * @param {number} duration The execution time of the event in ms
 * @param {object} reply The command reply
 * @param {object} connectionId The connection id for the command
 */
class ServerHeartbeatSucceededEvent {
  constructor(duration, reply, connectionId) {
    Object.assign(this, { connectionId, duration, reply });
  }
}

/**
 * Fired when the server monitor’s ismaster fails, either with an “ok: 0” or a socket exception.
 *
 * @param {number} duration The execution time of the event in ms
 * @param {MongoError|object} failure The command failure
 * @param {object} connectionId The connection id for the command
 */
class ServerHeartbeatFailedEvent {
  constructor(duration, failure, connectionId) {
    Object.assign(this, { connectionId, duration, failure });
  }
}

module.exports = {
  ServerDescriptionChangedEvent,
  ServerOpeningEvent,
  ServerClosedEvent,
  TopologyDescriptionChangedEvent,
  TopologyOpeningEvent,
  TopologyClosedEvent,
  ServerHeartbeatStartedEvent,
  ServerHeartbeatSucceededEvent,
  ServerHeartbeatFailedEvent
};
