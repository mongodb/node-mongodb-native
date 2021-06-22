import { Logger } from '../logger';
import {
  ConnectionPool,
  ConnectionPoolOptions,
  CMAP_EVENTS,
  ConnectionPoolEvents
} from '../cmap/connection_pool';
import { ServerDescription, compareTopologyVersion } from './server_description';
import { Monitor, MonitorOptions } from './monitor';
import { isTransactionCommand } from '../transactions';
import {
  collationNotSupported,
  makeStateMachine,
  maxWireVersion,
  Callback,
  CallbackWithType,
  MongoDBNamespace,
  EventEmitterWithState
} from '../utils';
import {
  ServerType,
  STATE_CLOSED,
  STATE_CLOSING,
  STATE_CONNECTING,
  STATE_CONNECTED,
  ClusterTime
} from './common';
import {
  MongoError,
  MongoNetworkError,
  MongoNetworkTimeoutError,
  isSDAMUnrecoverableError,
  isRetryableWriteError,
  isNodeShuttingDownError,
  isNetworkErrorBeforeHandshake,
  MongoDriverError
} from '../error';
import {
  Connection,
  DestroyOptions,
  QueryOptions,
  GetMoreOptions,
  CommandOptions,
  APM_EVENTS
} from '../cmap/connection';
import type { Topology } from './topology';
import type {
  ServerHeartbeatFailedEvent,
  ServerHeartbeatStartedEvent,
  ServerHeartbeatSucceededEvent
} from './events';
import type { ClientSession } from '../sessions';
import type { Document, Long } from '../bson';
import type { AutoEncrypter } from '../deps';
import type { ServerApi } from '../mongo_client';
import { TypedEventEmitter } from '../mongo_types';

const stateTransition = makeStateMachine({
  [STATE_CLOSED]: [STATE_CLOSED, STATE_CONNECTING],
  [STATE_CONNECTING]: [STATE_CONNECTING, STATE_CLOSING, STATE_CONNECTED, STATE_CLOSED],
  [STATE_CONNECTED]: [STATE_CONNECTED, STATE_CLOSING, STATE_CLOSED],
  [STATE_CLOSING]: [STATE_CLOSING, STATE_CLOSED]
});

/** @internal */
const kMonitor = Symbol('monitor');

/** @public */
export type ServerOptions = Omit<ConnectionPoolOptions, 'id' | 'generation' | 'hostAddress'> &
  MonitorOptions;

/** @internal */
export interface ServerPrivate {
  /** The server description for this server */
  description: ServerDescription;
  /** A copy of the options used to construct this instance */
  options: ServerOptions;
  /** A logger instance */
  logger: Logger;
  /** The current state of the Server */
  state: string;
  /** The topology this server is a part of */
  topology: Topology;
  /** A connection pool for this server */
  pool: ConnectionPool;
  /** MongoDB server API version */
  serverApi?: ServerApi;
}

/** @public */
export type ServerEvents = {
  serverHeartbeatStarted(event: ServerHeartbeatStartedEvent): void;
  serverHeartbeatSucceeded(event: ServerHeartbeatSucceededEvent): void;
  serverHeartbeatFailed(event: ServerHeartbeatFailedEvent): void;
  /** Top level MongoClient doesn't emit this so it is marked: @internal */
  connect(server: Server): void;
  descriptionReceived(description: ServerDescription): void;
  closed(): void;
  ended(): void;
} & ConnectionPoolEvents &
  EventEmitterWithState;

/** @internal */
export class Server extends TypedEventEmitter<ServerEvents> {
  /** @internal */
  s: ServerPrivate;
  serverApi?: ServerApi;
  clusterTime?: ClusterTime;
  ismaster?: Document;
  [kMonitor]: Monitor;

  /** @event */
  static readonly SERVER_HEARTBEAT_STARTED = 'serverHeartbeatStarted' as const;
  /** @event */
  static readonly SERVER_HEARTBEAT_SUCCEEDED = 'serverHeartbeatSucceeded' as const;
  /** @event */
  static readonly SERVER_HEARTBEAT_FAILED = 'serverHeartbeatFailed' as const;
  /** @event */
  static readonly CONNECT = 'connect' as const;
  /** @event */
  static readonly DESCRIPTION_RECEIVED = 'descriptionReceived' as const;
  /** @event */
  static readonly CLOSED = 'closed' as const;
  /** @event */
  static readonly ENDED = 'ended' as const;

  /**
   * Create a server
   */
  constructor(topology: Topology, description: ServerDescription, options: ServerOptions) {
    super();

    this.serverApi = options.serverApi;

    const poolOptions = { hostAddress: description.hostAddress, ...options };

    this.s = {
      description,
      options,
      logger: new Logger('Server'),
      state: STATE_CLOSED,
      topology,
      pool: new ConnectionPool(poolOptions)
    };

    for (const event of [...CMAP_EVENTS, ...APM_EVENTS]) {
      this.s.pool.on(event, (e: any) => this.emit(event, e));
    }

    this.s.pool.on(Connection.CLUSTER_TIME_RECEIVED, (clusterTime: ClusterTime) => {
      this.clusterTime = clusterTime;
    });

    // create the monitor
    this[kMonitor] = new Monitor(this, this.s.options);

    for (const event of HEARTBEAT_EVENTS) {
      this[kMonitor].on(event, (e: any) => this.emit(event, e));
    }

    this[kMonitor].on('resetConnectionPool', () => {
      this.s.pool.clear();
    });

    this[kMonitor].on('resetServer', (error: MongoError) => markServerUnknown(this, error));
    this[kMonitor].on(Server.SERVER_HEARTBEAT_SUCCEEDED, (event: ServerHeartbeatSucceededEvent) => {
      this.emit(
        Server.DESCRIPTION_RECEIVED,
        new ServerDescription(this.description.hostAddress, event.reply, {
          roundTripTime: calculateRoundTripTime(this.description.roundTripTime, event.duration)
        })
      );

      if (this.s.state === STATE_CONNECTING) {
        stateTransition(this, STATE_CONNECTED);
        this.emit(Server.CONNECT, this);
      }
    });
  }

  get description(): ServerDescription {
    return this.s.description;
  }

  get name(): string {
    return this.s.description.address;
  }

  get autoEncrypter(): AutoEncrypter | undefined {
    if (this.s.options && this.s.options.autoEncrypter) {
      return this.s.options.autoEncrypter;
    }
  }

  /**
   * Initiate server connect
   */
  connect(): void {
    if (this.s.state !== STATE_CLOSED) {
      return;
    }

    stateTransition(this, STATE_CONNECTING);
    this[kMonitor].connect();
  }

  /** Destroy the server connection */
  destroy(options?: DestroyOptions, callback?: Callback): void {
    if (typeof options === 'function') (callback = options), (options = {});
    options = Object.assign({}, { force: false }, options);

    if (this.s.state === STATE_CLOSED) {
      if (typeof callback === 'function') {
        callback();
      }

      return;
    }

    stateTransition(this, STATE_CLOSING);

    this[kMonitor].close();
    this.s.pool.close(options, err => {
      stateTransition(this, STATE_CLOSED);
      this.emit('closed');
      if (typeof callback === 'function') {
        callback(err);
      }
    });
  }

  /**
   * Immediately schedule monitoring of this server. If there already an attempt being made
   * this will be a no-op.
   */
  requestCheck(): void {
    this[kMonitor].requestCheck();
  }

  /**
   * Execute a command
   * @internal
   */
  command(ns: MongoDBNamespace, cmd: Document, callback: Callback): void;
  /** @internal */
  command(
    ns: MongoDBNamespace,
    cmd: Document,
    options: CommandOptions,
    callback: Callback<Document>
  ): void;
  command(
    ns: MongoDBNamespace,
    cmd: Document,
    options?: CommandOptions | Callback<Document>,
    callback?: Callback<Document>
  ): void {
    if (typeof options === 'function') {
      (callback = options), (options = {}), (options = options ?? {});
    }

    if (callback == null) {
      throw new MongoDriverError('callback must be provided');
    }

    if (ns.db == null || typeof ns === 'string') {
      throw new MongoDriverError('ns must not be a string');
    }

    if (this.s.state === STATE_CLOSING || this.s.state === STATE_CLOSED) {
      callback(new MongoDriverError('server is closed'));
      return;
    }

    // Clone the options
    const finalOptions = Object.assign({}, options, { wireProtocolCommand: false });

    // error if collation not supported
    if (collationNotSupported(this, cmd)) {
      callback(new MongoDriverError(`server ${this.name} does not support collation`));
      return;
    }

    this.s.pool.withConnection((err, conn, cb) => {
      if (err || !conn) {
        markServerUnknown(this, err);
        return cb(err);
      }

      conn.command(
        ns,
        cmd,
        finalOptions,
        makeOperationHandler(this, conn, cmd, finalOptions, cb) as Callback<Document>
      );
    }, callback);
  }

  /**
   * Execute a query against the server
   * @internal
   */
  query(ns: MongoDBNamespace, cmd: Document, options: QueryOptions, callback: Callback): void {
    if (this.s.state === STATE_CLOSING || this.s.state === STATE_CLOSED) {
      callback(new MongoDriverError('server is closed'));
      return;
    }

    this.s.pool.withConnection((err, conn, cb) => {
      if (err || !conn) {
        markServerUnknown(this, err);
        return cb(err);
      }

      conn.query(ns, cmd, options, makeOperationHandler(this, conn, cmd, options, cb) as Callback);
    }, callback);
  }

  /**
   * Execute a `getMore` against the server
   * @internal
   */
  getMore(
    ns: MongoDBNamespace,
    cursorId: Long,
    options: GetMoreOptions,
    callback: Callback<Document>
  ): void {
    if (this.s.state === STATE_CLOSING || this.s.state === STATE_CLOSED) {
      callback(new MongoDriverError('server is closed'));
      return;
    }

    this.s.pool.withConnection((err, conn, cb) => {
      if (err || !conn) {
        markServerUnknown(this, err);
        return cb(err);
      }

      conn.getMore(
        ns,
        cursorId,
        options,
        makeOperationHandler(this, conn, {}, options, cb) as Callback
      );
    }, callback);
  }

  /**
   * Execute a `killCursors` command against the server
   * @internal
   */
  killCursors(
    ns: MongoDBNamespace,
    cursorIds: Long[],
    options: CommandOptions,
    callback?: Callback
  ): void {
    if (this.s.state === STATE_CLOSING || this.s.state === STATE_CLOSED) {
      if (typeof callback === 'function') {
        callback(new MongoDriverError('server is closed'));
      }

      return;
    }

    this.s.pool.withConnection((err, conn, cb) => {
      if (err || !conn) {
        markServerUnknown(this, err);
        return cb(err);
      }

      conn.killCursors(
        ns,
        cursorIds,
        options,
        makeOperationHandler(this, conn, {}, undefined, cb) as Callback
      );
    }, callback);
  }
}

export const HEARTBEAT_EVENTS = [
  Server.SERVER_HEARTBEAT_STARTED,
  Server.SERVER_HEARTBEAT_SUCCEEDED,
  Server.SERVER_HEARTBEAT_FAILED
];

Object.defineProperty(Server.prototype, 'clusterTime', {
  get() {
    return this.s.topology.clusterTime;
  },
  set(clusterTime: ClusterTime) {
    this.s.topology.clusterTime = clusterTime;
  }
});

function supportsRetryableWrites(server: Server) {
  return (
    server.description.maxWireVersion >= 6 &&
    server.description.logicalSessionTimeoutMinutes &&
    server.description.type !== ServerType.Standalone
  );
}

function calculateRoundTripTime(oldRtt: number, duration: number): number {
  if (oldRtt === -1) {
    return duration;
  }

  const alpha = 0.2;
  return alpha * duration + (1 - alpha) * oldRtt;
}

function markServerUnknown(server: Server, error?: MongoError) {
  if (error instanceof MongoNetworkError && !(error instanceof MongoNetworkTimeoutError)) {
    server[kMonitor].reset();
  }

  server.emit(
    Server.DESCRIPTION_RECEIVED,
    new ServerDescription(server.description.hostAddress, undefined, {
      error,
      topologyVersion:
        error && error.topologyVersion ? error.topologyVersion : server.description.topologyVersion
    })
  );
}

function connectionIsStale(pool: ConnectionPool, connection: Connection) {
  return connection.generation !== pool.generation;
}

function shouldHandleStateChangeError(server: Server, err: MongoError) {
  const etv = err.topologyVersion;
  const stv = server.description.topologyVersion;
  return compareTopologyVersion(stv, etv) < 0;
}

function inActiveTransaction(session: ClientSession | undefined, cmd: Document) {
  return session && session.inTransaction() && !isTransactionCommand(cmd);
}

/** this checks the retryWrites option passed down from the client options, it
 * does not check if the server supports retryable writes */
function isRetryableWritesEnabled(topology: Topology) {
  return topology.s.options.retryWrites !== false;
}

function makeOperationHandler(
  server: Server,
  connection: Connection,
  cmd: Document,
  options: CommandOptions | GetMoreOptions | undefined,
  callback: Callback
): CallbackWithType<MongoError, Document> {
  const session = options?.session;
  return function handleOperationResult(err, result) {
    if (err && !connectionIsStale(server.s.pool, connection)) {
      if (err instanceof MongoNetworkError) {
        if (session && !session.hasEnded && session.serverSession) {
          session.serverSession.isDirty = true;
        }

        if (
          (isRetryableWritesEnabled(server.s.topology) || isTransactionCommand(cmd)) &&
          supportsRetryableWrites(server) &&
          !inActiveTransaction(session, cmd)
        ) {
          err.addErrorLabel('RetryableWriteError');
        }

        if (!(err instanceof MongoNetworkTimeoutError) || isNetworkErrorBeforeHandshake(err)) {
          markServerUnknown(server, err);
          server.s.pool.clear();
        }
      } else {
        // if pre-4.4 server, then add error label if its a retryable write error
        if (
          (isRetryableWritesEnabled(server.s.topology) || isTransactionCommand(cmd)) &&
          maxWireVersion(server) < 9 &&
          isRetryableWriteError(err) &&
          !inActiveTransaction(session, cmd)
        ) {
          err.addErrorLabel('RetryableWriteError');
        }

        if (isSDAMUnrecoverableError(err)) {
          if (shouldHandleStateChangeError(server, err)) {
            if (maxWireVersion(server) <= 7 || isNodeShuttingDownError(err)) {
              server.s.pool.clear();
            }

            markServerUnknown(server, err);
            process.nextTick(() => server.requestCheck());
          }
        }
      }
    }

    callback(err, result);
  };
}
