import { emitDeprecatedOptionWarning, ClientMetadata } from '../utils';
import Denque = require('denque');
import { EventEmitter } from 'events';
import { ReadPreference } from '../read_preference';
import { TopologyType, ServerType, ClusterTime, TimerQueue } from './common';
import { ServerDescription } from './server_description';
import { TopologyDescription } from './topology_description';
import { Server, ServerOptions } from './server';
import { Cursor } from '../cursor';
import { ClientSession, ServerSessionPool } from '../sessions';
import { SrvPoller, SrvPollingEvent } from './srv_polling';
import { CMAP_EVENT_NAMES } from '../cmap/events';
import { MongoError, MongoServerSelectionError } from '../error';
import { readPreferenceServerSelector, ServerSelector } from './server_selection';
import { deprecate } from 'util';
import { relayEvents, makeStateMachine, eachAsync, makeClientMetadata } from '../utils';
import {
  resolveClusterTime,
  drainTimerQueue,
  clearAndRemoveTimerFrom,
  STATE_CLOSED,
  STATE_CLOSING,
  STATE_CONNECTING,
  STATE_CONNECTED,
  TOPOLOGY_DEFAULTS
} from './common';
import {
  ServerOpeningEvent,
  ServerClosedEvent,
  ServerDescriptionChangedEvent,
  TopologyOpeningEvent,
  TopologyClosedEvent,
  TopologyDescriptionChangedEvent
} from './events';
import type { Document, Callback, AnyError } from '../types';
import type { MongoCredentials } from '../cmap/auth/mongo_credentials';
import type { Transaction } from '../transactions';
import type { CloseOptions } from '../cmap/connection_pool';
import type { Logger } from '..';
import type { DestroyOptions } from '../cmap/connection';
import type { CommandOptions } from '../cmap/wire_protocol/command';

// Global state
let globalTopologyCounter = 0;

// events that we relay to the `Topology`
const SERVER_RELAY_EVENTS = [
  'serverHeartbeatStarted',
  'serverHeartbeatSucceeded',
  'serverHeartbeatFailed',
  'commandStarted',
  'commandSucceeded',
  'commandFailed',

  // NOTE: Legacy events
  'monitoring'
].concat(CMAP_EVENT_NAMES);

// all events we listen to from `Server` instances
const LOCAL_SERVER_EVENTS = ['connect', 'descriptionReceived', 'close', 'ended'];

const stateTransition = makeStateMachine({
  [STATE_CLOSED]: [STATE_CLOSED, STATE_CONNECTING],
  [STATE_CONNECTING]: [STATE_CONNECTING, STATE_CLOSING, STATE_CONNECTED, STATE_CLOSED],
  [STATE_CONNECTED]: [STATE_CONNECTED, STATE_CLOSING, STATE_CLOSED],
  [STATE_CLOSING]: [STATE_CLOSING, STATE_CLOSED]
});

const kCancelled = Symbol('cancelled');
const kWaitQueue = Symbol('waitQueue');

type ServerSelectionCallback = Callback<Server>;
interface ServerSelectionRequest {
  serverSelector: ServerSelector;
  transaction: Transaction;
  callback: ServerSelectionCallback;
  timer?: NodeJS.Timeout;
  [kCancelled]?: boolean;
}

export interface Topology {
  destroy(): void;
}

interface TopologyPrivate {
  /** the id of this topology */
  id: number;
  /** passed in options */
  options: TopologyOptions;
  /** initial seedlist of servers to connect to */
  seedlist: ServerAddress[];
  /** initial state */
  state: string;
  /** the topology description */
  description: TopologyDescription;
  serverSelectionTimeoutMS: number;
  heartbeatFrequencyMS: number;
  minHeartbeatFrequencyMS: number;
  /** allow users to override the cursor factory */
  Cursor: typeof Cursor;
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
  detectTopologyDescriptionChange?: (event: TopologyDescriptionChangedEvent) => void;
  handleSrvPolling?: (event: SrvPollingEvent) => void;
}

interface ServerAddress {
  host: string;
  port: number;
  domain_socket?: string;
}

interface TopologyOptions extends ServerOptions {
  host: string;
  port?: number;
  credentials?: MongoCredentials;
  serverSelectionTimeoutMS: number;
  heartbeatFrequencyMS: number;
  minHeartbeatFrequencyMS: number;
  replicaSet?: string;
  cursorFactory: typeof Cursor;
  srvHost?: string;
  srvPoller?: SrvPoller;
  logger?: Logger;
  loggerLevel?: string;
  directConnection: boolean;

  metadata: ClientMetadata;
}

interface CursorOptions {
  topology?: typeof Topology;
  maxTimeMS?: number;
  cursorFactory?: typeof Cursor;
}

interface ConnectOptions {
  readPreference?: ReadPreference;
}

interface SelectServerOptions {
  readPreference?: ReadPreference;
  serverSelectionTimeoutMS?: number;
  session?: ClientSession;
}
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
export class Topology extends EventEmitter {
  s: TopologyPrivate;
  [kWaitQueue]: Denque<ServerSelectionRequest>;
  ismaster?: Document;
  clusterTime?: ClusterTime;

  /**
   * Create a topology
   *
   * @param {Array|string} [seedlist] a string list, or array of Server instances to connect to
   * @param {object} [options] Optional settings
   * @param {number} [options.localThresholdMS=15] The size of the latency window for selecting among multiple suitable servers
   * @param {number} [options.serverSelectionTimeoutMS=30000] How long to block for server selection before throwing an error
   * @param {number} [options.heartbeatFrequencyMS=10000] The frequency with which topology updates are scheduled
   * @param {boolean} [options.directConnection] Indicates that a client should directly connect to a node without attempting to discover its topology type
   * @param {string} [options.replicaSet] The name of the replica set to connect to
   */
  constructor(seedlist: string | ServerAddress[], options?: TopologyOptions) {
    super();
    emitDeprecatedOptionWarning(options, ['promiseLibrary']);

    seedlist = seedlist || [];
    if (typeof seedlist === 'string') {
      seedlist = parseStringSeedlist(seedlist);
    } else if (!Array.isArray(seedlist)) {
      seedlist = [seedlist];
    }

    options = Object.assign({}, TOPOLOGY_DEFAULTS, options);
    options = Object.freeze(
      Object.assign(options, {
        metadata: makeClientMetadata(options),
        compression: { compressors: makeCompressionInfo(options) }
      })
    );

    const topologyType = topologyTypeFromOptions(options);
    const topologyId = globalTopologyCounter++;
    const serverDescriptions = seedlist.reduce(
      (result: Map<string, ServerDescription>, seed: ServerAddress) => {
        if (seed.domain_socket) seed.host = seed.domain_socket;
        const address = seed.port ? `${seed.host}:${seed.port}` : `${seed.host}:27017`;
        result.set(address, new ServerDescription(address));
        return result;
      },
      new Map()
    );

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
      // allow users to override the cursor factory
      Cursor: options.cursorFactory || Cursor,
      // a map of server instances to normalized addresses
      servers: new Map(),
      // Server Session Pool
      sessionPool: new ServerSessionPool(this),
      // Active client sessions
      sessions: new Set(),
      credentials: options?.credentials,
      clusterTime: undefined,

      // timer management
      connectionTimers: new Set<NodeJS.Timeout>()
    };

    if (options.srvHost) {
      this.s.srvPoller =
        options.srvPoller ||
        new SrvPoller({
          heartbeatFrequencyMS: this.s.heartbeatFrequencyMS,
          srvHost: options.srvHost
        });

      this.s.detectTopologyDescriptionChange = (ev: TopologyDescriptionChangedEvent) => {
        const previousType = ev.previousDescription.type;
        const newType = ev.newDescription.type;

        if (previousType !== TopologyType.Sharded && newType === TopologyType.Sharded) {
          this.s.handleSrvPolling = srvPollingHandler(this);
          if (this.s.srvPoller) {
            // TODO: it looks like there is a bug here, what if this happens twice?
            this.s.srvPoller.on('srvRecordDiscovery', this.s.handleSrvPolling);
            this.s.srvPoller.start();
          }
        }
      };

      this.on('topologyDescriptionChanged', this.s.detectTopologyDescriptionChange);
    }

    // NOTE: remove this when NODE-1709 is resolved
    this.setMaxListeners(Infinity);
  }

  /**
   * @returns A `TopologyDescription` for this topology
   */
  get description(): TopologyDescription {
    return this.s.description;
  }

  capabilities(): ServerCapabilities {
    return new ServerCapabilities(this.lastIsMaster());
  }

  /** Initiate server connect */
  connect(options?: ConnectOptions, callback?: Callback): void {
    if (typeof options === 'function') (callback = options), (options = {});
    options = options || {};
    if (this.s.state === STATE_CONNECTED) {
      if (typeof callback === 'function') {
        callback();
      }

      return;
    }

    stateTransition(this, STATE_CONNECTING);

    // emit SDAM monitoring events
    this.emit('topologyOpening', new TopologyOpeningEvent(this.s.id));

    // emit an event for the topology change
    this.emit(
      'topologyDescriptionChanged',
      new TopologyDescriptionChangedEvent(
        this.s.id,
        new TopologyDescription(TopologyType.Unknown), // initial is always Unknown
        this.s.description
      )
    );

    // connect all known servers, then attempt server selection to connect
    connectServers(this, Array.from(this.s.description.servers.values()));

    ReadPreference.translate(options);
    const readPreference = options.readPreference || ReadPreference.primary;
    const connectHandler = (err: Error | MongoError | undefined) => {
      if (err) {
        this.close();

        if (typeof callback === 'function') {
          callback(err);
        } else {
          this.emit('error', err);
        }

        return;
      }

      stateTransition(this, STATE_CONNECTED);
      this.emit('open', err, this);
      this.emit('connect', this);

      if (typeof callback === 'function') callback(err, this);
    };

    // TODO: NODE-2471
    if (this.s.credentials) {
      this.command('admin.$cmd', { ping: 1 }, { readPreference }, connectHandler);
      return;
    }

    this.selectServer(readPreferenceServerSelector(readPreference), options, connectHandler);
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

    options = options || {};
    if (this.s.state === STATE_CLOSED || this.s.state === STATE_CLOSING) {
      if (typeof callback === 'function') {
        callback();
      }

      return;
    }

    stateTransition(this, STATE_CLOSING);

    drainWaitQueue(this[kWaitQueue], new MongoError('Topology closed'));
    drainTimerQueue(this.s.connectionTimers);

    if (this.s.srvPoller) {
      this.s.srvPoller.stop();
      if (this.s.handleSrvPolling) {
        this.s.srvPoller.removeListener('srvRecordDiscovery', this.s.handleSrvPolling);
        delete this.s.handleSrvPolling;
      }
    }

    if (this.s.detectTopologyDescriptionChange) {
      this.removeListener('topologyDescriptionChanged', this.s.detectTopologyDescriptionChange);
      delete this.s.detectTopologyDescriptionChange;
    }

    this.s.sessions.forEach((session: ClientSession) => session.endSession());
    this.s.sessionPool.endAllPooledSessions(() => {
      eachAsync(
        Array.from(this.s.servers.values()),
        (server: Server, cb: Callback) => destroyServer(server, this, options, cb),
        err => {
          this.s.servers.clear();

          // emit an event for close
          this.emit('topologyClosed', new TopologyClosedEvent(this.s.id));

          stateTransition(this, STATE_CLOSED);
          this.emit('close');

          if (typeof callback === 'function') {
            callback(err);
          }
        }
      );
    });
  }

  /**
   * Selects a server according to the selection predicate provided
   *
   * @param selector An optional selector to select servers by, defaults to a random selection within a latency window
   * @param {object} [options] Optional settings related to server selection
   * @param {number} [options.serverSelectionTimeoutMS] How long to block for server selection before throwing an error
   * @param {(error: Error, server: Server) => void} callback The callback used to indicate success or failure
   * @returns {void} An instance of a `Server` meeting the criteria of the predicate provided
   */
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
    selector: string | ReadPreference | ServerSelector,
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
        serverSelector = readPreferenceServerSelector(new ReadPreference(selector));
      } else {
        options = selector as SelectServerOptions;

        let readPreference;
        if (selector instanceof ReadPreference) {
          readPreference = selector;
        } else {
          ReadPreference.translate(options);
          readPreference = options.readPreference || ReadPreference.primary;
        }

        serverSelector = readPreferenceServerSelector(readPreference);
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
    return this.description.logicalSessionTimeoutMinutes != null;
  }

  /** Start a logical session */
  startSession(options: unknown, clientOptions?: Record<string, unknown>): ClientSession {
    const session = new ClientSession(this, this.s.sessionPool, options, clientOptions);
    session.once('ended', () => {
      this.s.sessions.delete(session);
    });

    this.s.sessions.add(session);
    return session;
  }

  /** Send endSessions command(s) with the given session ids */
  endSessions(sessions: ClientSession[], callback?: Callback): void {
    if (!Array.isArray(sessions)) {
      sessions = [sessions];
    }

    this.command(
      'admin.$cmd',
      { endSessions: sessions },
      { readPreference: ReadPreference.primaryPreferred, noResponse: true },
      () => {
        // intentionally ignored, per spec
        if (typeof callback === 'function') callback();
      }
    );
  }

  /**
   * Update the internal TopologyDescription with a ServerDescription
   *
   * @param {ServerDescription} serverDescription The server to update in the internal list of server descriptions
   */
  serverUpdateHandler(serverDescription: ServerDescription): void {
    if (!this.s.description.hasServer(serverDescription.address)) {
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
      resolveClusterTime(this, clusterTime);
    }

    // If we already know all the information contained in this updated description, then
    // we don't need to emit SDAM events, but still need to update the description, in order
    // to keep client-tracked attributes like last update time and round trip time up to date
    const equalDescriptions =
      previousServerDescription && previousServerDescription.equals(serverDescription);

    // first update the TopologyDescription
    this.s.description = this.s.description.update(serverDescription);
    if (this.s.description.compatibilityError) {
      this.emit('error', new MongoError(this.s.description.compatibilityError));
      return;
    }

    // emit monitoring events for this change
    if (!equalDescriptions) {
      const newDescription = this.s.description.servers.get(serverDescription.address);
      if (newDescription) {
        this.emit(
          'serverDescriptionChanged',
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
        'topologyDescriptionChanged',
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

  logout(callback: Callback): void {
    if (typeof callback === 'function') callback(undefined, true);
  }

  /**
   * Execute a command
   *
   * @function
   * @param {string} ns The MongoDB fully qualified namespace (ex: db1.collection1)
   * @param {object} cmd The command hash
   * @param {object} options
   * @param {ReadPreference} [options.readPreference] Specify read preference if command supports it
   * @param {Connection} [options.connection] Specify connection object to execute command against
   * @param {boolean} [options.serializeFunctions=false] Specify if functions on an object should be serialized.
   * @param {boolean} [options.ignoreUndefined=false] Specify if the BSON serializer should ignore undefined fields.
   * @param {ClientSession} [options.session=null] Session to use for the operation
   * @param {opResultCallback} callback A callback function
   */
  command(ns: string, cmd: Document, options: CommandOptions, callback: Callback): void {
    if (typeof options === 'function') {
      (callback = options), (options = {}), (options = options || {});
    }

    ReadPreference.translate(options);
    const readPreference = options.readPreference || ReadPreference.primary;

    this.selectServer(readPreferenceServerSelector(readPreference), options, (err, server) => {
      if (err || !server) {
        callback(err);
        return;
      }

      const willRetryWrite =
        !options.retrying &&
        !!options.retryWrites &&
        options.session &&
        isRetryableWritesSupported(this) &&
        !options.session.inTransaction() &&
        isWriteCommand(cmd);

      // increment and assign txnNumber
      if (willRetryWrite) {
        options.session?.incrementTransactionNumber();
        options.willRetryWrite = willRetryWrite;
      }

      server.command(ns, cmd, options, (err, result) => {
        if (!err) return callback(undefined, result);
        if (!shouldRetryOperation(err)) {
          return callback(err);
        }

        if (willRetryWrite) {
          const newOptions = Object.assign({}, options, { retrying: true });
          return this.command(ns, cmd, newOptions, callback);
        }

        return callback(err);
      });
    });
  }

  /**
   * Create a new cursor
   *
   * @function
   * @param {string} ns The MongoDB fully qualified namespace (ex: db1.collection1)
   * @param {object|Long} cmd Can be either a command returning a cursor or a cursorId
   * @param {object} [options] Options for the cursor
   * @param {object} [options.batchSize=0] Batchsize for the operation
   * @param {Array} [options.documents=[]] Initial documents list for cursor
   * @param {ReadPreference} [options.readPreference] Specify read preference if command supports it
   * @param {boolean} [options.serializeFunctions=false] Specify if functions on an object should be serialized.
   * @param {boolean} [options.ignoreUndefined=false] Specify if the BSON serializer should ignore undefined fields.
   * @param {ClientSession} [options.session=null] Session to use for the operation
   * @param {object} [options.topology] The internal topology of the created cursor
   * @returns {Cursor}
   */
  cursor(ns: string, cmd: Document, options?: CursorOptions): Cursor {
    options = options || {};
    const topology = options.topology || this;
    const CursorClass = options.cursorFactory ?? this.s.Cursor;
    ReadPreference.translate(options);

    return new CursorClass(topology, ns, cmd, options);
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
    console.log('not implemented: `unref`');
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
}

Object.defineProperty(Topology.prototype, 'clusterTime', {
  enumerable: true,
  get() {
    return this.s.clusterTime;
  },
  set(clusterTime: ClusterTime) {
    this.s.clusterTime = clusterTime;
  }
});

// legacy aliases
Topology.prototype.destroy = deprecate(
  Topology.prototype.close,
  'destroy() is deprecated, please use close() instead'
);

const RETRYABLE_WRITE_OPERATIONS = ['findAndModify', 'insert', 'update', 'delete'];
function isWriteCommand(command: Document) {
  return RETRYABLE_WRITE_OPERATIONS.some((op: string) => command[op]);
}

/** Destroys a server, and removes all event listeners from the instance */
function destroyServer(
  server: Server,
  topology: Topology,
  options?: DestroyOptions,
  callback?: Callback
) {
  options = options || {};
  LOCAL_SERVER_EVENTS.forEach((event: string) => server.removeAllListeners(event));

  server.destroy(options, () => {
    topology.emit('serverClosed', new ServerClosedEvent(topology.s.id, server.description.address));

    SERVER_RELAY_EVENTS.forEach((event: string) => server.removeAllListeners(event));
    if (typeof callback === 'function') {
      callback();
    }
  });
}

/**
 * Parses a basic seedlist in string form
 *
 * @param {string} seedlist The seedlist to parse
 */
function parseStringSeedlist(seedlist: string): ServerAddress[] {
  return seedlist.split(',').map((seed: string) => ({
    host: seed.split(':')[0],
    port: parseInt(seed.split(':')[1], 10) || 27017
  }));
}

/**
 * Gets the TopologyType from the client options
 *
 * @param {object} options mongo client options
 * @param {boolean} [options.directConnection] Indicates that a client should directly connect to a node without attempting to discover its topology type
 * @param {string} [options.replicaSet] The name of the replica set to connect to
 * @returns TopologyType
 */
function topologyTypeFromOptions(options: TopologyOptions) {
  if (options.directConnection) {
    return TopologyType.Single;
  }

  if (options.replicaSet) {
    return TopologyType.ReplicaSetNoPrimary;
  }

  return TopologyType.Unknown;
}

function randomSelection(array: ServerDescription[]): ServerDescription {
  return array[Math.floor(Math.random() * array.length)];
}

/**
 * Creates new server instances and attempts to connect them
 *
 * @param {Topology} topology The topology that this server belongs to
 * @param {ServerDescription} serverDescription The description for the server to initialize and connect to
 * @param {number} [connectDelay] Time to wait before attempting initial connection
 */
function createAndConnectServer(
  topology: Topology,
  serverDescription: ServerDescription,
  connectDelay?: number
) {
  topology.emit('serverOpening', new ServerOpeningEvent(topology.s.id, serverDescription.address));

  const server = new Server(topology, serverDescription, topology.s.options);
  relayEvents(server, topology, SERVER_RELAY_EVENTS);

  server.on('descriptionReceived', topology.serverUpdateHandler.bind(topology));

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
 * @param {Topology} topology The topology responsible for the servers
 * @param {ServerDescription[]} serverDescriptions A list of server descriptions to connect
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
 * @param {Topology} topology
 * @param {ServerDescription[]} [incomingServerDescription]
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

function shouldRetryOperation(err: AnyError) {
  return err instanceof MongoError && err.hasErrorLabel('RetryableWriteError');
}

function srvPollingHandler(topology: Topology) {
  return function handleSrvPolling(ev: SrvPollingEvent) {
    const previousTopologyDescription = topology.s.description;
    topology.s.description = topology.s.description.updateFromSrvPollingEvent(ev);
    if (topology.s.description === previousTopologyDescription) {
      // Nothing changed, so return
      return;
    }

    updateServers(topology);

    topology.emit(
      'topologyDescriptionChanged',
      new TopologyDescriptionChangedEvent(
        topology.s.id,
        previousTopologyDescription,
        topology.s.description
      )
    );
  };
}

function drainWaitQueue(queue: Denque<ServerSelectionRequest>, err?: AnyError) {
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
    drainWaitQueue(topology[kWaitQueue], new MongoError('Topology is closed, please connect'));
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
    if (isSharded && transaction && transaction.isActive) {
      transaction.pinServer(selectedServer);
    }

    if (waitQueueMember.timer) {
      clearTimeout(waitQueueMember.timer);
    }

    waitQueueMember.callback(undefined, selectedServer);
  }

  if (topology[kWaitQueue].length > 0) {
    // ensure all server monitors attempt monitoring soon
    topology.s.servers.forEach((server: Server) => process.nextTick(() => server.requestCheck()));
  }
}

function makeCompressionInfo(options: TopologyOptions) {
  if (!options.compression || !options.compression.compressors) {
    return [];
  }

  // Check that all supplied compressors are valid
  options.compression.compressors.forEach((compressor: string) => {
    if (compressor !== 'snappy' && compressor !== 'zlib') {
      throw new Error('compressors must be at least one of snappy or zlib');
    }
  });

  return options.compression.compressors;
}

const RETRYABLE_WIRE_VERSION = 6;

/** Determines whether the provided topology supports retryable writes */
function isRetryableWritesSupported(topology: Topology) {
  const maxWireVersion = topology.lastIsMaster().maxWireVersion;
  if (maxWireVersion < RETRYABLE_WIRE_VERSION) {
    return false;
  }

  if (!topology.logicalSessionTimeoutMinutes) {
    return false;
  }

  if (topology.description.type === TopologyType.Single) {
    return false;
  }

  return true;
}

class ServerCapabilities {
  constructor(ismaster: Document) {
    // Capabilities
    let aggregationCursor = false;
    let writeCommands = false;
    let textSearch = false;
    let authCommands = false;
    let listCollections = false;
    let listIndexes = false;
    const maxNumberOfDocsInBatch = ismaster.maxWriteBatchSize || 1000;
    let commandsTakeWriteConcern = false;
    let commandsTakeCollation = false;

    if (ismaster.minWireVersion >= 0) {
      textSearch = true;
    }

    if (ismaster.maxWireVersion >= 1) {
      aggregationCursor = true;
      authCommands = true;
    }

    if (ismaster.maxWireVersion >= 2) {
      writeCommands = true;
    }

    if (ismaster.maxWireVersion >= 3) {
      listCollections = true;
      listIndexes = true;
    }

    if (ismaster.maxWireVersion >= 5) {
      commandsTakeWriteConcern = true;
      commandsTakeCollation = true;
    }

    // If no min or max wire version set to 0
    if (ismaster.minWireVersion == null) {
      ismaster.minWireVersion = 0;
    }

    if (ismaster.maxWireVersion == null) {
      ismaster.maxWireVersion = 0;
    }

    function setup_get_property(
      object: ServerCapabilities,
      name: string,
      value: string | boolean | number
    ) {
      Object.defineProperty(object, name, {
        enumerable: true,
        get() {
          return value;
        }
      });
    }

    // Map up read only parameters
    setup_get_property(this, 'hasAggregationCursor', aggregationCursor);
    setup_get_property(this, 'hasWriteCommands', writeCommands);
    setup_get_property(this, 'hasTextSearch', textSearch);
    setup_get_property(this, 'hasAuthCommands', authCommands);
    setup_get_property(this, 'hasListCollectionsCommand', listCollections);
    setup_get_property(this, 'hasListIndexesCommand', listIndexes);
    setup_get_property(this, 'minWireVersion', ismaster.minWireVersion);
    setup_get_property(this, 'maxWireVersion', ismaster.maxWireVersion);
    setup_get_property(this, 'maxNumberOfDocsInBatch', maxNumberOfDocsInBatch);
    setup_get_property(this, 'commandsTakeWriteConcern', commandsTakeWriteConcern);
    setup_get_property(this, 'commandsTakeCollation', commandsTakeCollation);
  }
}
