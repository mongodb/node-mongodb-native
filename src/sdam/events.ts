import type { Document } from '../bson';
import {
  SERVER_SELECTION_FAILED,
  SERVER_SELECTION_STARTED,
  SERVER_SELECTION_SUCCEEDED,
  WAITING_FOR_SUITABLE_SERVER
} from '../constants';
import { type ReadPreference } from '../read_preference';
import type { ServerDescription } from './server_description';
import { type ServerSelector } from './server_selection';
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
  /** Is true when using the streaming protocol. */
  awaited: boolean;

  /** @internal */
  constructor(connectionId: string, awaited: boolean) {
    this.connectionId = connectionId;
    this.awaited = awaited;
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
  /** Is true when using the streaming protocol. */
  awaited: boolean;

  /** @internal */
  constructor(connectionId: string, duration: number, reply: Document | null, awaited: boolean) {
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
export class ServerHeartbeatFailedEvent {
  /** The connection id for the command */
  connectionId: string;
  /** The execution time of the event in ms */
  duration: number;
  /** The command failure */
  failure: Error;
  /** Is true when using the streaming protocol. */
  awaited: boolean;

  /** @internal */
  constructor(connectionId: string, duration: number, failure: Error, awaited: boolean) {
    this.connectionId = connectionId;
    this.duration = duration;
    this.failure = failure;
    this.awaited = awaited;
  }
}

/**
 * The base export class for all monitoring events published from server selection
 * @public
 * @category Event
 */
export abstract class ServerSelectionEvent {
  /** String representation of the selector being used to select the server.
   *  Defaults to 'custom selector' for application-provided custom selector case.
   */
  selector: string;
  /** The name of the operation for which a server is being selected.  */
  operation: string;
  /** 	String representation of the current topology description.  */
  topologyDescription: string;

  /** @internal */
  abstract name:
    | typeof SERVER_SELECTION_STARTED
    | typeof SERVER_SELECTION_SUCCEEDED
    | typeof SERVER_SELECTION_FAILED
    | typeof WAITING_FOR_SUITABLE_SERVER;

  /** @internal */
  constructor(
    selector: string | ReadPreference | ServerSelector,
    operation: string | undefined,
    topologyDescription: TopologyDescription
  ) {
    this.selector =
      typeof selector === 'string'
        ? selector
        : typeof selector === 'function'
        ? 'custom selector'
        : JSON.stringify(selector.toJSON(), null, 2);
    this.operation = operation ?? 'custom operation';
    this.topologyDescription = topologyDescription.toString();
  }
}

/**
 * An event published when server selection starts
 * @public
 * @category Event
 */
export class ServerSelectionStartedEvent extends ServerSelectionEvent {
  /** @internal */
  name = SERVER_SELECTION_STARTED;
  message = 'Server selection started';

  /** @internal */
  constructor(
    selector: string | ReadPreference | ServerSelector,
    operation: string | undefined,
    topologyDescription: TopologyDescription
  ) {
    super(selector, operation, topologyDescription);
  }
}

/**
 * An event published when a server selection fails
 * @public
 * @category Event
 */
export class ServerSelectionFailedEvent extends ServerSelectionEvent {
  /** @internal */
  name = SERVER_SELECTION_FAILED;
  message = 'Server selection failed';
  /** Representation of the error the driver will throw regarding server selection failing. */
  failure: string;

  /** @internal */
  constructor(
    selector: string | ReadPreference | ServerSelector,
    operation: string | undefined,
    topologyDescription: TopologyDescription,
    errMsg: string
  ) {
    super(selector, operation, topologyDescription);
    this.failure = errMsg;
  }
}

/**
 * An event published when server selection succeeds
 * @public
 * @category Event
 */
export class ServerSelectionSuccessEvent extends ServerSelectionEvent {
  /** @internal */
  name = SERVER_SELECTION_SUCCEEDED;
  message = 'Server selection succeeded';
  /**  The hostname, IP address, or Unix domain socket path for the selected server.*/
  serverHost: string;
  /** The port for the selected server. Optional; not present for Unix domain sockets.
   * When the user does not specify a port and the default (27017) is used
   * */
  serverPort: number;

  /** @internal */
  constructor(
    selector: string | ReadPreference | ServerSelector,
    operation: string | undefined,
    topologyDescription: TopologyDescription,
    serverHost: string,
    serverPort: number
  ) {
    super(selector, operation, topologyDescription);
    this.serverHost = serverHost;
    this.serverPort = serverPort;
  }
}

/**
 * An event published when server selection is waiting for a suitable server to become available
 * @public
 * @category Event
 */
export class WaitingForSuitableServerEvent extends ServerSelectionEvent {
  /** @internal */
  name = WAITING_FOR_SUITABLE_SERVER;
  message = 'Waiting for suitable server to become available';
  /** The remaining time left until server selection will time out. */
  remainingTimeMS?: number;

  /** @internal */
  constructor(
    selector: string | ReadPreference | ServerSelector,
    operation: string | undefined,
    topologyDescription: TopologyDescription,
    remainingTimeMS: number | undefined
  ) {
    super(selector, operation, topologyDescription);
    if (remainingTimeMS) {
      this.remainingTimeMS = remainingTimeMS;
    }
  }
}
