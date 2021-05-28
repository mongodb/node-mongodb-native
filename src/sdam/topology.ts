import Denque = require('denque');
import { ReadPreference, ReadPreferenceLike } from '../read_preference';
import { compareTopologyVersion, ServerDescription } from './server_description';
import { TopologyDescription } from './topology_description';
import { Server, ServerEvents, ServerOptions } from './server';
import {
  ClientSession,
  ServerSessionPool,
  ServerSessionId,
  ClientSessionOptions
} from '../sessions';
import { SrvPoller, SrvPollingEvent } from './srv_polling';
import { CMAP_EVENTS, ConnectionPoolEvents } from '../cmap/connection_pool';
import { MongoServerSelectionError, MongoCompatibilityError, MongoDriverError } from '../error';
import { readPreferenceServerSelector, ServerSelector } from './server_selection';
import {
  makeStateMachine,
  eachAsync,
  ClientMetadata,
  Callback,
  HostAddress,
  ns,
  emitWarning,
  EventEmitterWithState
} from '../utils';
import {
  TopologyType,
  ServerType,
  ClusterTime,
  TimerQueue,
  _advanceClusterTime,
  drainTimerQueue,
  clearAndRemoveTimerFrom,
  STATE_CLOSED,
  STATE_CLOSING,
  STATE_CONNECTING,
  STATE_CONNECTED
} from './common';
import {
  ServerOpeningEvent,
  ServerClosedEvent,
  ServerDescriptionChangedEvent,
  TopologyOpeningEvent,
  TopologyClosedEvent,
  TopologyDescriptionChangedEvent
} from './events';
import type { Document, BSONSerializeOptions } from '../bson';
import type { MongoCredentials } from '../cmap/auth/mongo_credentials';
import type { Transaction } from '../transactions';
import type { CloseOptions } from '../cmap/connection_pool';
import { DestroyOptions, Connection, ConnectionEvents } from '../cmap/connection';
import type { MongoOptions, ServerApi } from '../mongo_client';
import { DEFAULT_OPTIONS } from '../connection_string';
import { serialize, deserialize } from '../bson';
import { TypedEventEmitter } from '../mongo_types';

// Global state
let globalTopologyCounter = 0;

// events that we relay to the `Topology`
const SERVER_RELAY_EVENTS = [
  Server.SERVER_HEARTBEAT_STARTED,
  Server.SERVER_HEARTBEAT_SUCCEEDED,
  Server.SERVER_HEARTBEAT_FAILED,
  Connection.COMMAND_STARTED,
  Connection.COMMAND_SUCCEEDED,
  Connection.COMMAND_FAILED,
  ...CMAP_EVENTS
];

// all events we listen to from `Server` instances
const LOCAL_SERVER_EVENTS = [
  Server.CONNECT,
  Server.DESCRIPTION_RECEIVED,
  Server.CLOSED,
  Server.ENDED
];

const stateTransition = makeStateMachine({
  [STATE_CLOSED]: [STATE_CLOSED, STATE_CONNECTING],
  [STATE_CONNECTING]: [STATE_CONNECTING, STATE_CLOSING, STATE_CONNECTED, STATE_CLOSED],
  [STATE_CONNECTED]: [STATE_CONNECTED, STATE_CLOSING, STATE_CLOSED],
  [STATE_CLOSING]: [STATE_CLOSING, STATE_CLOSED]
});

/** @internal */
const kCancelled = Symbol('cancelled');
/** @internal */
const kWaitQueue = Symbol('waitQueue');

/** @internal */
export type ServerSelectionCallback = Callback<Server>;

/** @internal */
export interface ServerSelectionRequest {
  serverSelector: ServerSelector;
  transaction?: Transaction;
  callback: ServerSelectionCallback;
  timer?: NodeJS.Timeout;
  [kCancelled]?: boolean;
}

/** @internal */
export interface TopologyPrivate {
  /** the id of this topology */
  id: number;
  /** passed in options */
  options: TopologyOptions;
  /** initial seedlist of servers to connect to */
  seedlist: HostAddress[];
  /** initial state */
  state: string;
  /** the topology description */
  description: TopologyDescription;
  serverSelectionTimeoutMS: number;
  heartbeatFrequencyMS: number;
  minHeartbeatFrequencyMS: number;
  /** A map of server instances to normalized addresses */
  servers: Map<string, Server>;
  /** Server Session Pool */
  sessionPool: ServerSessionPool;
  /** Active client sessions */
  sessions: Set<ClientSession>;
  credentials?: MongoCredentials;
  clusterTime?: ClusterTime;
  /** timers created for the initial connect to a server */
  connectionTimers: TimerQueue;

  /** related to srv polling */
  srvPoller?: SrvPoller;
  detectShardedTopology: (event: TopologyDescriptionChangedEvent) => void;
  detectSrvRecords: (event: SrvPollingEvent) => void;
}

/** @public */
export interface TopologyOptions extends BSONSerializeOptions, ServerOptions {
  hosts: HostAddress[];
  retryWrites: boolean;
  retryReads: boolean;
  /** How long to block for server selection before throwing an error */
  serverSelectionTimeoutMS: number;
  /** The name of the replica set to connect to */
  replicaSet?: string;
  srvHost?: string;
  /** @internal */
  srvPoller?: SrvPoller;
  /** Indicates that a client should directly connect to a node without attempting to discover its topology type */
  directConnection: boolean;
  loadBalanced: boolean;
  metadata: ClientMetadata;
  /** MongoDB server API version */
  serverApi?: ServerApi;
}

/** @public */
export interface ConnectOptions {
  readPreference?: ReadPreference;
}

/** @public */
export interface SelectServerOptions {
  readPreference?: ReadPreferenceLike;
  /** How long to block for server selection before throwing an error */
  serverSelectionTimeoutMS?: number;
  session?: ClientSession;
}

/** @public */
export type TopologyEvents = {
  /** Top level MongoClient doesn't emit this so it is marked: @internal */
  connect(topology: Topology): void;
  serverOpening(event: ServerOpeningEvent): void;
  serverClosed(event: ServerClosedEvent): void;
  serverDescriptionChanged(event: ServerDescriptionChangedEvent): void;
  topologyClosed(event: TopologyClosedEvent): void;
  topologyOpening(event: TopologyOpeningEvent): void;
  topologyDescriptionChanged(event: TopologyDescriptionChangedEvent): void;
  error(error: Error): void;
  /** TODO(NODE-3273) - remove error @internal */
  open(error: undefined, topology: Topology): void;
  close(): void;
  timeout(): void;
} & Omit<ServerEvents, 'connect'> &
  ConnectionPoolEvents &
  ConnectionEvents &
  EventEmitterWithState;
/**
 * A container of server instances representing a connection to a MongoDB topology.
 * @internal
 */
export class Topology extends TypedEventEmitter<TopologyEvents> {
  /** @internal */
  s: TopologyPrivate;
  /** @internal */
  [kWaitQueue]: Denque<ServerSelectionRequest>;
  /** @internal */
  ismaster?: Document;
  /** @internal */
  _type?: string;

  /** @event */
  static readonly SERVER_OPENING = 'serverOpening' as const;
  /** @event */
  static readonly SERVER_CLOSED = 'serverClosed' as const;
  /** @event */
  static readonly SERVER_DESCRIPTION_CHANGED = 'serverDescriptionChanged' as const;
  /** @event */
  static readonly TOPOLOGY_OPENING = 'topologyOpening' as const;
  /** @event */
  static readonly TOPOLOGY_CLOSED = 'topologyClosed' as const;
  /** @event */
  static readonly TOPOLOGY_DESCRIPTION_CHANGED = 'topologyDescriptionChanged' as const;
  /** @event */
  static readonly ERROR = 'error' as const;
  /** @event */
  static readonly OPEN = 'open' as const;
  /** @event */
  static readonly CONNECT = 'connect' as const;
  /** @event */
  static readonly CLOSE = 'close' as const;
  /** @event */
  static readonly TIMEOUT = 'timeout' as const;

  /**
   * @internal
   *
   * @privateRemarks
   * mongodb-client-encryption's class ClientEncryption falls back to finding the bson lib
   * defined on client.topology.bson, in order to maintain compatibility with any version
   * of mongodb-client-encryption we keep a reference to serialize and deserialize here.
   */
  bson: { serialize: typeof serialize; deserialize: typeof deserialize };

  /**
   * @param seedlist - a list of HostAddress instances to connect to
   */
  constructor(seeds: string | string[] | HostAddress | HostAddress[], options: TopologyOptions) {
    super();

    // Legacy CSFLE support
    this.bson = Object.create(null);
    this.bson.serialize = serialize;
    this.bson.deserialize = deserialize;

    // Options should only be undefined in tests, MongoClient will always have defined options
    options = options ?? {
      hosts: [HostAddress.fromString('localhost:27017')],
      retryReads: DEFAULT_OPTIONS.get('retryReads'),
      retryWrites: DEFAULT_OPTIONS.get('retryWrites'),
      serverSelectionTimeoutMS: DEFAULT_OPTIONS.get('serverSelectionTimeoutMS'),
      directConnection: DEFAULT_OPTIONS.get('directConnection'),
      loadBalanced: DEFAULT_OPTIONS.get('loadBalanced'),
      metadata: DEFAULT_OPTIONS.get('metadata'),
      monitorCommands: DEFAULT_OPTIONS.get('monitorCommands'),
      tls: DEFAULT_OPTIONS.get('tls'),
      maxPoolSize: DEFAULT_OPTIONS.get('maxPoolSize'),
      minPoolSize: DEFAULT_OPTIONS.get('minPoolSize'),
      waitQueueTimeoutMS: DEFAULT_OPTIONS.get('waitQueueTimeoutMS'),
      connectionType: DEFAULT_OPTIONS.get('connectionType'),
      connectTimeoutMS: DEFAULT_OPTIONS.get('connectTimeoutMS'),
      maxIdleTimeMS: DEFAULT_OPTIONS.get('maxIdleTimeMS'),
      heartbeatFrequencyMS: DEFAULT_OPTIONS.get('heartbeatFrequencyMS'),
      minHeartbeatFrequencyMS: DEFAULT_OPTIONS.get('minHeartbeatFrequencyMS')
    };

    if (typeof seeds === 'string') {
      seeds = [HostAddress.fromString(seeds)];
    } else if (!Array.isArray(seeds)) {
      seeds = [seeds];
    }

    const seedlist: HostAddress[] = [];
    for (const seed of seeds) {
      if (typeof seed === 'string') {
        seedlist.push(HostAddress.fromString(seed));
      } else if (seed instanceof HostAddress) {
        seedlist.push(seed);
      } else {
        // FIXME(NODE-3484): May need to be a MongoParseError
        throw new MongoDriverError(`Topology cannot be constructed from ${JSON.stringify(seed)}`);
      }
    }

    const topologyType = topologyTypeFromOptions(options);
    const topologyId = globalTopologyCounter++;

    const serverDescriptions = new Map();
    for (const hostAddress of seedlist) {
      serverDescriptions.set(hostAddress.toString(), new ServerDescription(hostAddress));
    }

    this[kWaitQueue] = new Denque();
    this.s = {
      // the id of this topology
      id: topologyId,
      // passed in options
      options,
      // initial seedlist of servers to connect to
      seedlist,
      // initial state
      state: STATE_CLOSED,
      // the topology description
      description: new TopologyDescription(
        topologyType,
        serverDescriptions,
        options.replicaSet,
        undefined,
        undefined,
        undefined,
        options
      ),
      serverSelectionTimeoutMS: options.serverSelectionTimeoutMS,
      heartbeatFrequencyMS: options.heartbeatFrequencyMS,
      minHeartbeatFrequencyMS: options.minHeartbeatFrequencyMS,
      // a map of server instances to normalized addresses
      servers: new Map(),
      // Server Session Pool
      sessionPool: new ServerSessionPool(this),
      // Active client sessions
      sessions: new Set(),
      credentials: options?.credentials,
      clusterTime: undefined,

      // timer management
      connectionTimers: new Set<NodeJS.Timeout>(),

      detectShardedTopology: ev => this.detectShardedTopology(ev),
      detectSrvRecords: ev => this.detectSrvRecords(ev)
    };

    if (options.srvHost && !options.loadBalanced) {
      this.s.srvPoller =
        options.srvPoller ??
        new SrvPoller({
          heartbeatFrequencyMS: this.s.heartbeatFrequencyMS,
          srvHost: options.srvHost
        });

      this.on(Topology.TOPOLOGY_DESCRIPTION_CHANGED, this.s.detectShardedTopology);
    }
  }

  private detectShardedTopology(event: TopologyDescriptionChangedEvent) {
    const previousType = event.previousDescription.type;
    const newType = event.newDescription.type;

    const transitionToSharded =
      previousType !== TopologyType.Sharded && newType === TopologyType.Sharded;
    const srvListeners = this.s.srvPoller?.listeners(SrvPoller.SRV_RECORD_DISCOVERY);
    const listeningToSrvPolling = !!srvListeners?.includes(this.s.detectSrvRecords);

    if (transitionToSharded && !listeningToSrvPolling) {
      this.s.srvPoller?.on(SrvPoller.SRV_RECORD_DISCOVERY, this.s.detectSrvRecords);
      this.s.srvPoller?.start();
    }
  }

  private detectSrvRecords(ev: SrvPollingEvent) {
    const previousTopologyDescription = this.s.description;
    this.s.description = this.s.description.updateFromSrvPollingEvent(ev);
    if (this.s.description === previousTopologyDescription) {
      // Nothing changed, so return
      return;
    }

    updateServers(this);

    this.emit(
      Topology.TOPOLOGY_DESCRIPTION_CHANGED,
      new TopologyDescriptionChangedEvent(
        this.s.id,
        previousTopologyDescription,
        this.s.description
      )
    );
  }

  /**
   * @returns A `TopologyDescription` for this topology
   */
  get description(): TopologyDescription {
    return this.s.description;
  }

  get loadBalanced(): boolean {
    return this.s.options.loadBalanced;
  }

  get capabilities(): ServerCapabilities {
    return new ServerCapabilities(this.lastIsMaster());
  }

  /** Initiate server connect */
  connect(options?: ConnectOptions, callback?: Callback): void {
    if (typeof options === 'function') (callback = options), (options = {});
    options = options ?? {};
    if (this.s.state === STATE_CONNECTED) {
      if (typeof callback === 'function') {
        callback();
      }

      return;
    }

    stateTransition(this, STATE_CONNECTING);

    // emit SDAM monitoring events
    this.emit(Topology.TOPOLOGY_OPENING, new TopologyOpeningEvent(this.s.id));

    // emit an event for the topology change
    this.emit(
      Topology.TOPOLOGY_DESCRIPTION_CHANGED,
      new TopologyDescriptionChangedEvent(
        this.s.id,
        new TopologyDescription(TopologyType.Unknown), // initial is always Unknown
        this.s.description
      )
    );

    // connect all known servers, then attempt server selection to connect
    const serverDescriptions = Array.from(this.s.description.servers.values());
    connectServers(this, serverDescriptions);

    // In load balancer mode we need to fake a server description getting
    // emitted from the monitor, since the monitor doesn't exist.
    if (this.s.options.loadBalanced) {
      for (const description of serverDescriptions) {
        const newDescription = new ServerDescription(description.hostAddress, undefined, {
          loadBalanced: this.s.options.loadBalanced
        });
        this.serverUpdateHandler(newDescription);
      }
    }

    const readPreference = options.readPreference ?? ReadPreference.primary;
    this.selectServer(readPreferenceServerSelector(readPreference), options, (err, server) => {
      if (err) {
        this.close();

        typeof callback === 'function' ? callback(err) : this.emit(Topology.ERROR, err);
        return;
      }

      // TODO: NODE-2471
      if (server && this.s.credentials) {
        server.command(ns('admin.$cmd'), { ping: 1 }, err => {
          if (err) {
            typeof callback === 'function' ? callback(err) : this.emit(Topology.ERROR, err);
            return;
          }

          stateTransition(this, STATE_CONNECTED);
          // TODO(NODE-3273) - remove err
          this.emit(Topology.OPEN, err, this);
          this.emit(Topology.CONNECT, this);

          if (typeof callback === 'function') callback(undefined, this);
        });

        return;
      }

      stateTransition(this, STATE_CONNECTED);
      // TODO(NODE-3273) - remove err
      this.emit(Topology.OPEN, err, this);
      this.emit(Topology.CONNECT, this);

      if (typeof callback === 'function') callback(undefined, this);
    });
  }

  /** Close this topology */
  close(options?: CloseOptions, callback?: Callback): void {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }

    if (typeof options === 'boolean') {
      options = { force: options };
    }

    options = options ?? {};
    if (this.s.state === STATE_CLOSED || this.s.state === STATE_CLOSING) {
      if (typeof callback === 'function') {
        callback();
      }

      return;
    }

    stateTransition(this, STATE_CLOSING);

    drainWaitQueue(this[kWaitQueue], new MongoDriverError('Topology closed'));
    drainTimerQueue(this.s.connectionTimers);

    if (this.s.srvPoller) {
      this.s.srvPoller.stop();
      this.s.srvPoller.removeListener(SrvPoller.SRV_RECORD_DISCOVERY, this.s.detectSrvRecords);
    }

    this.removeListener(Topology.TOPOLOGY_DESCRIPTION_CHANGED, this.s.detectShardedTopology);

    eachAsync(
      Array.from(this.s.sessions.values()),
      (session, cb) => session.endSession(cb),
      () => {
        this.s.sessionPool.endAllPooledSessions(() => {
          eachAsync(
            Array.from(this.s.servers.values()),
            (server, cb) => destroyServer(server, this, options, cb),
            err => {
              this.s.servers.clear();

              // emit an event for close
              this.emit(Topology.TOPOLOGY_CLOSED, new TopologyClosedEvent(this.s.id));

              stateTransition(this, STATE_CLOSED);

              if (typeof callback === 'function') {
                callback(err);
              }
            }
          );
        });
      }
    );
  }

  /**
   * Selects a server according to the selection predicate provided
   *
   * @param selector - An optional selector to select servers by, defaults to a random selection within a latency window
   * @param options - Optional settings related to server selection
   * @param callback - The callback used to indicate success or failure
   * @returns An instance of a `Server` meeting the criteria of the predicate provided
   */
  selectServer(options: SelectServerOptions, callback: Callback<Server>): void;
  selectServer(
    selector: string | ReadPreference | ServerSelector,
    callback: Callback<Server>
  ): void;
  selectServer(
    selector: string | ReadPreference | ServerSelector,
    options: SelectServerOptions,
    callback: Callback<Server>
  ): void;
  selectServer(
    selector: string | ReadPreference | ServerSelector | SelectServerOptions,
    _options?: SelectServerOptions | Callback<Server>,
    _callback?: Callback<Server>
  ): void {
    let options = _options as SelectServerOptions;
    const callback = (_callback ?? _options) as Callback<Server>;
    if (typeof options === 'function') {
      options = {};
    }

    let serverSelector;
    if (typeof selector !== 'function') {
      if (typeof selector === 'string') {
        serverSelector = readPreferenceServerSelector(ReadPreference.fromString(selector));
      } else {
        let readPreference;
        if (selector instanceof ReadPreference) {
          readPreference = selector;
        } else {
          ReadPreference.translate(options);
          readPreference = options.readPreference || ReadPreference.primary;
        }

        serverSelector = readPreferenceServerSelector(readPreference as ReadPreference);
      }
    } else {
      serverSelector = selector;
    }

    options = Object.assign(
      {},
      { serverSelectionTimeoutMS: this.s.serverSelectionTimeoutMS },
      options
    );

    const isSharded = this.description.type === TopologyType.Sharded;
    const session = options.session;
    const transaction = session && session.transaction;

    if (isSharded && transaction && transaction.server) {
      callback(undefined, transaction.server);
      return;
    }

    const waitQueueMember: ServerSelectionRequest = {
      serverSelector,
      transaction,
      callback
    };

    const serverSelectionTimeoutMS = options.serverSelectionTimeoutMS;
    if (serverSelectionTimeoutMS) {
      waitQueueMember.timer = setTimeout(() => {
        waitQueueMember[kCancelled] = true;
        waitQueueMember.timer = undefined;
        const timeoutError = new MongoServerSelectionError(
          `Server selection timed out after ${serverSelectionTimeoutMS} ms`,
          this.description
        );

        waitQueueMember.callback(timeoutError);
      }, serverSelectionTimeoutMS);
    }

    this[kWaitQueue].push(waitQueueMember);
    processWaitQueue(this);
  }

  // Sessions related methods

  /**
   * @returns Whether the topology should initiate selection to determine session support
   */
  shouldCheckForSessionSupport(): boolean {
    if (this.description.type === TopologyType.Single) {
      return !this.description.hasKnownServers;
    }

    return !this.description.hasDataBearingServers;
  }

  /**
   * @returns Whether sessions are supported on the current topology
   */
  hasSessionSupport(): boolean {
    return this.loadBalanced || this.description.logicalSessionTimeoutMinutes != null;
  }

  /** Start a logical session */
  startSession(options: ClientSessionOptions, clientOptions?: MongoOptions): ClientSession {
    const session = new ClientSession(this, this.s.sessionPool, options, clientOptions);
    session.once('ended', () => {
      this.s.sessions.delete(session);
    });

    this.s.sessions.add(session);
    return session;
  }

  /** Send endSessions command(s) with the given session ids */
  endSessions(sessions: ServerSessionId[], callback?: Callback<Document>): void {
    if (!Array.isArray(sessions)) {
      sessions = [sessions];
    }

    this.selectServer(
      readPreferenceServerSelector(ReadPreference.primaryPreferred),
      (err, server) => {
        if (err || !server) {
          if (typeof callback === 'function') callback(err);
          return;
        }

        server.command(
          ns('admin.$cmd'),
          { endSessions: sessions },
          { noResponse: true },
          (err, result) => {
            if (typeof callback === 'function') callback(err, result);
          }
        );
      }
    );
  }

  /**
   * Update the internal TopologyDescription with a ServerDescription
   *
   * @param serverDescription - The server to update in the internal list of server descriptions
   */
  serverUpdateHandler(serverDescription: ServerDescription): void {
    if (!this.s.description.hasServer(serverDescription.address)) {
      return;
    }

    // ignore this server update if its from an outdated topologyVersion
    if (isStaleServerDescription(this.s.description, serverDescription)) {
      return;
    }

    // these will be used for monitoring events later
    const previousTopologyDescription = this.s.description;
    const previousServerDescription = this.s.description.servers.get(serverDescription.address);
    if (!previousServerDescription) {
      return;
    }

    // Driver Sessions Spec: "Whenever a driver receives a cluster time from
    // a server it MUST compare it to the current highest seen cluster time
    // for the deployment. If the new cluster time is higher than the
    // highest seen cluster time it MUST become the new highest seen cluster
    // time. Two cluster times are compared using only the BsonTimestamp
    // value of the clusterTime embedded field."
    const clusterTime = serverDescription.$clusterTime;
    if (clusterTime) {
      _advanceClusterTime(this, clusterTime);
    }

    // If we already know all the information contained in this updated description, then
    // we don't need to emit SDAM events, but still need to update the description, in order
    // to keep client-tracked attributes like last update time and round trip time up to date
    const equalDescriptions =
      previousServerDescription && previousServerDescription.equals(serverDescription);

    // first update the TopologyDescription
    this.s.description = this.s.description.update(serverDescription);
    if (this.s.description.compatibilityError) {
      this.emit(Topology.ERROR, new MongoCompatibilityError(this.s.description.compatibilityError));
      return;
    }

    // emit monitoring events for this change
    if (!equalDescriptions) {
      const newDescription = this.s.description.servers.get(serverDescription.address);
      if (newDescription) {
        this.emit(
          Topology.SERVER_DESCRIPTION_CHANGED,
          new ServerDescriptionChangedEvent(
            this.s.id,
            serverDescription.address,
            previousServerDescription,
            newDescription
          )
        );
      }
    }

    // update server list from updated descriptions
    updateServers(this, serverDescription);

    // attempt to resolve any outstanding server selection attempts
    if (this[kWaitQueue].length > 0) {
      processWaitQueue(this);
    }

    if (!equalDescriptions) {
      this.emit(
        Topology.TOPOLOGY_DESCRIPTION_CHANGED,
        new TopologyDescriptionChangedEvent(
          this.s.id,
          previousTopologyDescription,
          this.s.description
        )
      );
    }
  }

  auth(credentials?: MongoCredentials, callback?: Callback): void {
    if (typeof credentials === 'function') (callback = credentials), (credentials = undefined);
    if (typeof callback === 'function') callback(undefined, true);
  }

  get clientMetadata(): ClientMetadata {
    return this.s.options.metadata;
  }

  isConnected(): boolean {
    return this.s.state === STATE_CONNECTED;
  }

  isDestroyed(): boolean {
    return this.s.state === STATE_CLOSED;
  }

  unref(): void {
    emitWarning('not implemented: `unref`');
  }

  // NOTE: There are many places in code where we explicitly check the last isMaster
  //       to do feature support detection. This should be done any other way, but for
  //       now we will just return the first isMaster seen, which should suffice.
  lastIsMaster(): Document {
    const serverDescriptions = Array.from(this.description.servers.values());
    if (serverDescriptions.length === 0) return {};
    const sd = serverDescriptions.filter(
      (sd: ServerDescription) => sd.type !== ServerType.Unknown
    )[0];

    const result = sd || { maxWireVersion: this.description.commonWireVersion };
    return result;
  }

  get logicalSessionTimeoutMinutes(): number | undefined {
    return this.description.logicalSessionTimeoutMinutes;
  }

  get clusterTime(): ClusterTime | undefined {
    return this.s.clusterTime;
  }

  set clusterTime(clusterTime: ClusterTime | undefined) {
    this.s.clusterTime = clusterTime;
  }
}

/** @public */
export const TOPOLOGY_EVENTS = [
  Topology.SERVER_OPENING,
  Topology.SERVER_CLOSED,
  Topology.SERVER_DESCRIPTION_CHANGED,
  Topology.TOPOLOGY_OPENING,
  Topology.TOPOLOGY_CLOSED,
  Topology.TOPOLOGY_DESCRIPTION_CHANGED,
  Topology.ERROR,
  Topology.TIMEOUT,
  Topology.CLOSE
];

/** Destroys a server, and removes all event listeners from the instance */
function destroyServer(
  server: Server,
  topology: Topology,
  options?: DestroyOptions,
  callback?: Callback
) {
  options = options ?? {};
  for (const event of LOCAL_SERVER_EVENTS) {
    server.removeAllListeners(event);
  }

  server.destroy(options, () => {
    topology.emit(
      Topology.SERVER_CLOSED,
      new ServerClosedEvent(topology.s.id, server.description.address)
    );

    for (const event of SERVER_RELAY_EVENTS) {
      server.removeAllListeners(event);
    }
    if (typeof callback === 'function') {
      callback();
    }
  });
}

/** Predicts the TopologyType from options */
function topologyTypeFromOptions(options?: TopologyOptions) {
  if (options?.directConnection) {
    return TopologyType.Single;
  }

  if (options?.replicaSet) {
    return TopologyType.ReplicaSetNoPrimary;
  }

  if (options?.loadBalanced) {
    return TopologyType.LoadBalanced;
  }

  return TopologyType.Unknown;
}

function randomSelection(array: ServerDescription[]): ServerDescription {
  return array[Math.floor(Math.random() * array.length)];
}

/**
 * Creates new server instances and attempts to connect them
 *
 * @param topology - The topology that this server belongs to
 * @param serverDescription - The description for the server to initialize and connect to
 * @param connectDelay - Time to wait before attempting initial connection
 */
function createAndConnectServer(
  topology: Topology,
  serverDescription: ServerDescription,
  connectDelay?: number
) {
  topology.emit(
    Topology.SERVER_OPENING,
    new ServerOpeningEvent(topology.s.id, serverDescription.address)
  );

  const server = new Server(topology, serverDescription, topology.s.options);
  for (const event of SERVER_RELAY_EVENTS) {
    server.on(event, (e: any) => topology.emit(event, e));
  }

  server.on(Server.DESCRIPTION_RECEIVED, description => topology.serverUpdateHandler(description));

  if (connectDelay) {
    const connectTimer = setTimeout(() => {
      clearAndRemoveTimerFrom(connectTimer, topology.s.connectionTimers);
      server.connect();
    }, connectDelay);

    topology.s.connectionTimers.add(connectTimer);
    return server;
  }

  server.connect();
  return server;
}

/**
 * Create `Server` instances for all initially known servers, connect them, and assign
 * them to the passed in `Topology`.
 *
 * @param topology - The topology responsible for the servers
 * @param serverDescriptions - A list of server descriptions to connect
 */
function connectServers(topology: Topology, serverDescriptions: ServerDescription[]) {
  topology.s.servers = serverDescriptions.reduce(
    (servers: Map<string, Server>, serverDescription: ServerDescription) => {
      const server = createAndConnectServer(topology, serverDescription);
      servers.set(serverDescription.address, server);
      return servers;
    },
    new Map<string, Server>()
  );
}

/**
 * @param topology - Topology to update.
 * @param incomingServerDescription - New server description.
 */
function updateServers(topology: Topology, incomingServerDescription?: ServerDescription) {
  // update the internal server's description
  if (incomingServerDescription && topology.s.servers.has(incomingServerDescription.address)) {
    const server = topology.s.servers.get(incomingServerDescription.address);
    if (server) {
      server.s.description = incomingServerDescription;
    }
  }

  // add new servers for all descriptions we currently don't know about locally
  for (const serverDescription of topology.description.servers.values()) {
    if (!topology.s.servers.has(serverDescription.address)) {
      const server = createAndConnectServer(topology, serverDescription);
      topology.s.servers.set(serverDescription.address, server);
    }
  }

  // for all servers no longer known, remove their descriptions and destroy their instances
  for (const entry of topology.s.servers) {
    const serverAddress = entry[0];
    if (topology.description.hasServer(serverAddress)) {
      continue;
    }

    if (!topology.s.servers.has(serverAddress)) {
      continue;
    }

    const server = topology.s.servers.get(serverAddress);
    topology.s.servers.delete(serverAddress);

    // prepare server for garbage collection
    if (server) {
      destroyServer(server, topology);
    }
  }
}

function drainWaitQueue(queue: Denque<ServerSelectionRequest>, err?: MongoDriverError) {
  while (queue.length) {
    const waitQueueMember = queue.shift();
    if (!waitQueueMember) {
      continue;
    }

    if (waitQueueMember.timer) {
      clearTimeout(waitQueueMember.timer);
    }

    if (!waitQueueMember[kCancelled]) {
      waitQueueMember.callback(err);
    }
  }
}

function processWaitQueue(topology: Topology) {
  if (topology.s.state === STATE_CLOSED) {
    drainWaitQueue(
      topology[kWaitQueue],
      new MongoDriverError('Topology is closed, please connect')
    );
    return;
  }

  const isSharded = topology.description.type === TopologyType.Sharded;
  const serverDescriptions = Array.from(topology.description.servers.values());
  const membersToProcess = topology[kWaitQueue].length;
  for (let i = 0; i < membersToProcess; ++i) {
    const waitQueueMember = topology[kWaitQueue].shift();
    if (!waitQueueMember) {
      continue;
    }

    if (waitQueueMember[kCancelled]) {
      continue;
    }

    let selectedDescriptions;
    try {
      const serverSelector = waitQueueMember.serverSelector;
      selectedDescriptions = serverSelector
        ? serverSelector(topology.description, serverDescriptions)
        : serverDescriptions;
    } catch (e) {
      if (waitQueueMember.timer) {
        clearTimeout(waitQueueMember.timer);
      }

      waitQueueMember.callback(e);
      continue;
    }

    if (selectedDescriptions.length === 0) {
      topology[kWaitQueue].push(waitQueueMember);
      continue;
    }

    const selectedServerDescription = randomSelection(selectedDescriptions);
    const selectedServer = topology.s.servers.get(selectedServerDescription.address);
    const transaction = waitQueueMember.transaction;
    if (isSharded && transaction && transaction.isActive && selectedServer) {
      transaction.pinServer(selectedServer);
    }

    if (waitQueueMember.timer) {
      clearTimeout(waitQueueMember.timer);
    }

    waitQueueMember.callback(undefined, selectedServer);
  }

  if (topology[kWaitQueue].length > 0) {
    // ensure all server monitors attempt monitoring soon
    for (const [, server] of topology.s.servers) {
      process.nextTick(function scheduleServerCheck() {
        return server.requestCheck();
      });
    }
  }
}

function isStaleServerDescription(
  topologyDescription: TopologyDescription,
  incomingServerDescription: ServerDescription
) {
  const currentServerDescription = topologyDescription.servers.get(
    incomingServerDescription.address
  );
  const currentTopologyVersion = currentServerDescription?.topologyVersion;
  return (
    compareTopologyVersion(currentTopologyVersion, incomingServerDescription.topologyVersion) > 0
  );
}

/** @public */
export class ServerCapabilities {
  maxWireVersion: number;
  minWireVersion: number;

  constructor(ismaster: Document) {
    this.minWireVersion = ismaster.minWireVersion || 0;
    this.maxWireVersion = ismaster.maxWireVersion || 0;
  }

  get hasAggregationCursor(): boolean {
    return this.maxWireVersion >= 1;
  }

  get hasWriteCommands(): boolean {
    return this.maxWireVersion >= 2;
  }
  get hasTextSearch(): boolean {
    return this.minWireVersion >= 0;
  }

  get hasAuthCommands(): boolean {
    return this.maxWireVersion >= 1;
  }

  get hasListCollectionsCommand(): boolean {
    return this.maxWireVersion >= 3;
  }

  get hasListIndexesCommand(): boolean {
    return this.maxWireVersion >= 3;
  }

  get supportsSnapshotReads(): boolean {
    return this.maxWireVersion >= 13;
  }

  get commandsTakeWriteConcern(): boolean {
    return this.maxWireVersion >= 5;
  }

  get commandsTakeCollation(): boolean {
    return this.maxWireVersion >= 5;
  }
}
