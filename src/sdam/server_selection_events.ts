import {
  SERVER_SELECTION_FAILED,
  SERVER_SELECTION_STARTED,
  SERVER_SELECTION_SUCCEEDED,
  WAITING_FOR_SUITABLE_SERVER
} from '../constants';
import { type ReadPreference } from '../read_preference';
import { type ServerSelector } from './server_selection';
import type { TopologyDescription } from './topology_description';

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
