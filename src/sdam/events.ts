import type { Document } from '../bson';
import {
  SERVER_CLOSED,
  SERVER_DESCRIPTION_CHANGED,
  SERVER_HEARTBEAT_FAILED,
  SERVER_HEARTBEAT_STARTED,
  SERVER_HEARTBEAT_SUCCEEDED,
  SERVER_OPENING,
  TOPOLOGY_CLOSED,
  TOPOLOGY_DESCRIPTION_CHANGED,
  TOPOLOGY_OPENING
} from '../constants';
import type { ServerDescription } from './server_description';
import type { TopologyDescription } from './topology_description';

/**
 * The base export class for all monitoring events published from server discovery and monitoring.
 * @public
 * @category Event
 */
export abstract class ServerDiscoveryAndMonitoringEvent {
  /** A unique identifier for the topology  */
  topologyId: number;

  /** @internal */
  abstract name:
    | typeof TOPOLOGY_CLOSED
    | typeof TOPOLOGY_DESCRIPTION_CHANGED
    | typeof TOPOLOGY_OPENING
    | typeof SERVER_OPENING
    | typeof SERVER_CLOSED
    | typeof SERVER_DESCRIPTION_CHANGED
    | typeof SERVER_HEARTBEAT_FAILED
    | typeof SERVER_HEARTBEAT_STARTED
    | typeof SERVER_HEARTBEAT_SUCCEEDED;

  /** @internal */
  constructor(topologyId: number) {
    this.topologyId = topologyId;
  }
}

/**
 * Emitted when server description changes, but does NOT include changes to the RTT.
 * @public
 * @category Event
 */
export class ServerDescriptionChangedEvent extends ServerDiscoveryAndMonitoringEvent {
  /** The address (host/port pair) of the server */
  address: string;
  /** The previous server description */
  previousDescription: ServerDescription;
  /** The new server description */
  newDescription: ServerDescription;
  name = SERVER_DESCRIPTION_CHANGED;

  /** @internal */
  constructor(
    topologyId: number,
    address: string,
    previousDescription: ServerDescription,
    newDescription: ServerDescription
  ) {
    super(topologyId);
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
export class ServerOpeningEvent extends ServerDiscoveryAndMonitoringEvent {
  /** The address (host/port pair) of the server */
  address: string;
  /** @internal */
  name = SERVER_OPENING;

  /** @internal */
  constructor(topologyId: number, address: string) {
    super(topologyId);
    this.address = address;
  }
}

/**
 * Emitted when server is closed.
 * @public
 * @category Event
 */
export class ServerClosedEvent extends ServerDiscoveryAndMonitoringEvent {
  /** The address (host/port pair) of the server */
  address: string;
  /** @internal */
  name = SERVER_CLOSED;

  /** @internal */
  constructor(topologyId: number, address: string) {
    super(topologyId);
    this.address = address;
  }
}

/**
 * Emitted when topology description changes.
 * @public
 * @category Event
 */
export class TopologyDescriptionChangedEvent extends ServerDiscoveryAndMonitoringEvent {
  /** The old topology description */
  previousDescription: TopologyDescription;
  /** The new topology description */
  newDescription: TopologyDescription;
  /** @internal */
  name = TOPOLOGY_DESCRIPTION_CHANGED;

  /** @internal */
  constructor(
    topologyId: number,
    previousDescription: TopologyDescription,
    newDescription: TopologyDescription
  ) {
    super(topologyId);
    this.previousDescription = previousDescription;
    this.newDescription = newDescription;
  }
}

/**
 * Emitted when topology is initialized.
 * @public
 * @category Event
 */
export class TopologyOpeningEvent extends ServerDiscoveryAndMonitoringEvent {
  /** @internal */
  name = TOPOLOGY_OPENING;

  /** @internal */
  constructor(topologyId: number) {
    super(topologyId);
  }
}

/**
 * Emitted when topology is closed.
 * @public
 * @category Event
 */
export class TopologyClosedEvent extends ServerDiscoveryAndMonitoringEvent {
  /** @internal */
  name = TOPOLOGY_CLOSED;

  /** @internal */
  constructor(topologyId: number) {
    super(topologyId);
  }
}

/**
 * Emitted when the server monitor’s hello command is started - immediately before
 * the hello command is serialized into raw BSON and written to the socket.
 *
 * @public
 * @category Event
 */
export class ServerHeartbeatStartedEvent extends ServerDiscoveryAndMonitoringEvent {
  /** The connection id for the command */
  connectionId: string;
  /** Is true when using the streaming protocol */
  awaited: boolean;
  /** @internal */
  name = SERVER_HEARTBEAT_STARTED;

  /** @internal */
  constructor(connectionId: string, awaited: boolean, topologyId: number) {
    super(topologyId);
    this.connectionId = connectionId;
    this.awaited = awaited;
  }
}

/**
 * Emitted when the server monitor’s hello succeeds.
 * @public
 * @category Event
 */
export class ServerHeartbeatSucceededEvent extends ServerDiscoveryAndMonitoringEvent {
  /** The connection id for the command */
  connectionId: string;
  /** The execution time of the event in ms */
  duration: number;
  /** The command reply */
  reply: Document;
  /** Is true when using the streaming protocol */
  awaited: boolean;
  /** @internal */
  name = SERVER_HEARTBEAT_SUCCEEDED;

  /** @internal */
  constructor(
    connectionId: string,
    duration: number,
    reply: Document | null,
    awaited: boolean,
    topologyId: number
  ) {
    super(topologyId);
    this.connectionId = connectionId;
    this.duration = duration;
    this.reply = reply ?? {};
    this.awaited = awaited;
  }
}

/**
 * Emitted when the server monitor’s hello fails, either with an “ok: 0” or a socket exception.
 * @public
 * @category Event
 */
export class ServerHeartbeatFailedEvent extends ServerDiscoveryAndMonitoringEvent {
  /** The connection id for the command */
  connectionId: string;
  /** The execution time of the event in ms */
  duration: number;
  /** The command failure */
  failure: Error;
  /** Is true when using the streaming protocol */
  awaited: boolean;
  /** @internal */
  name = SERVER_HEARTBEAT_FAILED;

  /** @internal */
  constructor(
    connectionId: string,
    duration: number,
    failure: Error,
    awaited: boolean,
    topologyId: number
  ) {
    super(topologyId);
    this.connectionId = connectionId;
    this.duration = duration;
    this.failure = failure;
    this.awaited = awaited;
  }
}
