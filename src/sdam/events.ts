import type { ServerDescription } from './server_description';
import type { TopologyDescription } from './topology_description';
import type { Document } from '../bson';

/**
 * Published when server description changes, but does NOT include changes to the RTT.
 *
 * @property {object} topologyId A unique identifier for the topology
 * @property {ServerAddress} address The address (host/port pair) of the server
 * @property {ServerDescription} previousDescription The previous server description
 * @property {ServerDescription} newDescription The new server description
 */
export class ServerDescriptionChangedEvent {
  topologyId: number;
  address: string;
  previousDescription: ServerDescription;
  newDescription: ServerDescription;

  constructor(
    topologyId: number,
    address: string,
    previousDescription: ServerDescription,
    newDescription: ServerDescription
  ) {
    this.topologyId = topologyId;
    this.address = address;
    this.previousDescription = previousDescription;
    this.newDescription = newDescription;
  }
}

/**
 * Published when server is initialized.
 *
 * @property {object} topologyId A unique identifier for the topology
 * @property {ServerAddress} address The address (host/port pair) of the server
 */
export class ServerOpeningEvent {
  topologyId: number;
  address: string;

  constructor(topologyId: number, address: string) {
    this.topologyId = topologyId;
    this.address = address;
  }
}

/**
 * Published when server is closed.
 *
 * @property {ServerAddress} address The address (host/port pair) of the server
 * @property {object} topologyId A unique identifier for the topology
 */
export class ServerClosedEvent {
  topologyId: number;
  address: string;

  constructor(topologyId: number, address: string) {
    this.topologyId = topologyId;
    this.address = address;
  }
}

/**
 * Published when topology description changes.
 *
 * @property {object} topologyId A unique identifier for the topology
 * @property {TopologyDescription} previousDescription The old topology description
 * @property {TopologyDescription} newDescription The new topology description
 */
export class TopologyDescriptionChangedEvent {
  topologyId: number;
  previousDescription: TopologyDescription;
  newDescription: TopologyDescription;

  constructor(
    topologyId: number,
    previousDescription: TopologyDescription,
    newDescription: TopologyDescription
  ) {
    this.topologyId = topologyId;
    this.previousDescription = previousDescription;
    this.newDescription = newDescription;
  }
}

/**
 * Published when topology is initialized.
 *
 * @param {object} topologyId A unique identifier for the topology
 */
export class TopologyOpeningEvent {
  topologyId: number;

  constructor(topologyId: number) {
    this.topologyId = topologyId;
  }
}

/**
 * Published when topology is closed.
 *
 * @param {object} topologyId A unique identifier for the topology
 */
export class TopologyClosedEvent {
  topologyId: number;

  constructor(topologyId: number) {
    this.topologyId = topologyId;
  }
}

/**
 * Fired when the server monitor’s ismaster command is started - immediately before
 * the ismaster command is serialized into raw BSON and written to the socket.
 *
 * @property {object} connectionId The connection id for the command
 */
export class ServerHeartbeatStartedEvent {
  connectionId: string;

  constructor(connectionId: string) {
    this.connectionId = connectionId;
  }
}

/**
 * Fired when the server monitor’s ismaster succeeds.
 *
 * @param {number} duration The execution time of the event in ms
 * @param {object} reply The command reply
 * @param {object} connectionId The connection id for the command
 */
export class ServerHeartbeatSucceededEvent {
  connectionId: string;
  duration: number;
  reply: Document;

  constructor(connectionId: string, duration: number, reply: Document) {
    this.connectionId = connectionId;
    this.duration = duration;
    this.reply = reply;
  }
}

/**
 * Fired when the server monitor’s ismaster fails, either with an “ok: 0” or a socket exception.
 *
 * @param {number} duration The execution time of the event in ms
 * @param {MongoError|object} failure The command failure
 * @param {object} connectionId The connection id for the command
 */
export class ServerHeartbeatFailedEvent {
  connectionId: string;
  duration: number;
  failure: Error;

  constructor(connectionId: string, duration: number, failure: Error) {
    this.connectionId = connectionId;
    this.duration = duration;
    this.failure = failure;
  }
}
