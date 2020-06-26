'use strict';

/**
 * Published when server description changes, but does NOT include changes to the RTT.
 *
 * @property {object} topologyId A unique identifier for the topology
 * @property {ServerAddress} address The address (host/port pair) of the server
 * @property {ServerDescription} previousDescription The previous server description
 * @property {ServerDescription} newDescription The new server description
 */
class ServerDescriptionChangedEvent {
  constructor(topologyId: any, address: any, previousDescription: any, newDescription: any) {
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
  constructor(topologyId: any, address: any) {
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
  constructor(topologyId: any, address: any) {
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
  constructor(topologyId: any, previousDescription: any, newDescription: any) {
    Object.assign(this, { topologyId, previousDescription, newDescription });
  }
}

/**
 * Published when topology is initialized.
 *
 * @param {object} topologyId A unique identifier for the topology
 */
class TopologyOpeningEvent {
  constructor(topologyId: any) {
    Object.assign(this, { topologyId });
  }
}

/**
 * Published when topology is closed.
 *
 * @param {object} topologyId A unique identifier for the topology
 */
class TopologyClosedEvent {
  constructor(topologyId: any) {
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
  constructor(connectionId: any) {
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
  constructor(duration: any, reply: any, connectionId: any) {
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
  constructor(duration: any, failure: any, connectionId: any) {
    Object.assign(this, { connectionId, duration, failure });
  }
}

export {
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
