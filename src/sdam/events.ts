import type { Document } from '../bson';
import type { ServerDescription } from './server_description';
import type { TopologyDescription } from './topology_description';

/**
 * Emitted when server description changes, but does NOT include changes to the RTT.
 * @public
 * @category Event
 */
export class ServerDescriptionChangedEvent {
  /** A unique identifier for the topology */
  topologyId: number;
  /** The address (host/port pair) of the server */
  address: string;
  /** The previous server description */
  previousDescription: ServerDescription;
  /** The new server description */
  newDescription: ServerDescription;

  /** @internal */
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
 * Emitted when server is initialized.
 * @public
 * @category Event
 */
export class ServerOpeningEvent {
  /** A unique identifier for the topology */
  topologyId: number;
  /** The address (host/port pair) of the server */
  address: string;

  /** @internal */
  constructor(topologyId: number, address: string) {
    this.topologyId = topologyId;
    this.address = address;
  }
}

/**
 * Emitted when server is closed.
 * @public
 * @category Event
 */
export class ServerClosedEvent {
  /** A unique identifier for the topology */
  topologyId: number;
  /** The address (host/port pair) of the server */
  address: string;

  /** @internal */
  constructor(topologyId: number, address: string) {
    this.topologyId = topologyId;
    this.address = address;
  }
}

/**
 * Emitted when topology description changes.
 * @public
 * @category Event
 */
export class TopologyDescriptionChangedEvent {
  /** A unique identifier for the topology */
  topologyId: number;
  /** The old topology description */
  previousDescription: TopologyDescription;
  /** The new topology description */
  newDescription: TopologyDescription;

  /** @internal */
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
 * Emitted when topology is initialized.
 * @public
 * @category Event
 */
export class TopologyOpeningEvent {
  /** A unique identifier for the topology */
  topologyId: number;

  /** @internal */
  constructor(topologyId: number) {
    this.topologyId = topologyId;
  }
}

/**
 * Emitted when topology is closed.
 * @public
 * @category Event
 */
export class TopologyClosedEvent {
  /** A unique identifier for the topology */
  topologyId: number;

  /** @internal */
  constructor(topologyId: number) {
    this.topologyId = topologyId;
  }
}

/**
 * Emitted when the server monitor’s hello command is started - immediately before
 * the hello command is serialized into raw BSON and written to the socket.
 *
 * @public
 * @category Event
 */
export class ServerHeartbeatStartedEvent {
  /** The connection id for the command */
  connectionId: string;

  /** @internal */
  constructor(connectionId: string) {
    this.connectionId = connectionId;
  }
}

/**
 * Emitted when the server monitor’s hello succeeds.
 * @public
 * @category Event
 */
export class ServerHeartbeatSucceededEvent {
  /** The connection id for the command */
  connectionId: string;
  /** The execution time of the event in ms */
  duration: number;
  /** The command reply */
  reply: Document;

  /** @internal */
  constructor(connectionId: string, duration: number, reply: Document) {
    this.connectionId = connectionId;
    this.duration = duration;
    this.reply = reply;
  }
}

/**
 * Emitted when the server monitor’s hello fails, either with an “ok: 0” or a socket exception.
 * @public
 * @category Event
 */
export class ServerHeartbeatFailedEvent {
  /** The connection id for the command */
  connectionId: string;
  /** The execution time of the event in ms */
  duration: number;
  /** The command failure */
  failure: Error;

  /** @internal */
  constructor(connectionId: string, duration: number, failure: Error) {
    this.connectionId = connectionId;
    this.duration = duration;
    this.failure = failure;
  }
}
