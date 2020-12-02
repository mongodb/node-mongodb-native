import { EventEmitter } from 'events';
import { Logger } from '../logger';
import { ReadPreference } from '../read_preference';
import { ConnectionPool, ConnectionPoolOptions } from '../cmap/connection_pool';
import { CMAP_EVENT_NAMES } from '../cmap/events';
import { ServerDescription, compareTopologyVersion } from './server_description';
import { Monitor } from './monitor';
import { isTransactionCommand } from '../transactions';
import {
  relayEvents,
  collationNotSupported,
  debugOptions,
  makeStateMachine,
  maxWireVersion,
  ClientMetadataOptions,
  Callback,
  CallbackWithType,
  MongoDBNamespace
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
  isNetworkErrorBeforeHandshake
} from '../error';
import { Connection, DestroyOptions } from '../cmap/connection';
import type { Topology } from './topology';
import type { MongoCredentials } from '../cmap/auth/mongo_credentials';
import type { ServerHeartbeatSucceededEvent } from './events';
import type { ClientSession } from '../sessions';
import type { CommandOptions } from '../cmap/wire_protocol/command';
import type { GetMoreOptions } from '../cmap/wire_protocol/get_more';
import type { WriteCommandOptions } from '../cmap/wire_protocol/write_command';
import type { Document, Long } from '../bson';
import type { AutoEncrypter } from '../deps';
import type { QueryOptions } from '../cmap/wire_protocol/query';

// Used for filtering out fields for logging
const DEBUG_FIELDS = [
  'reconnect',
  'reconnectTries',
  'reconnectInterval',
  'emitError',
  'cursorFactory',
  'host',
  'port',
  'size',
  'keepAlive',
  'keepAliveInitialDelay',
  'noDelay',
  'connectionTimeout',
  'checkServerIdentity',
  'socketTimeout',
  'ssl',
  'ca',
  'crl',
  'cert',
  'key',
  'rejectUnauthorized',
  'promoteLongs',
  'promoteValues',
  'promoteBuffers',
  'servername'
];

const stateTransition = makeStateMachine({
  [STATE_CLOSED]: [STATE_CLOSED, STATE_CONNECTING],
  [STATE_CONNECTING]: [STATE_CONNECTING, STATE_CLOSING, STATE_CONNECTED, STATE_CLOSED],
  [STATE_CONNECTED]: [STATE_CONNECTED, STATE_CLOSING, STATE_CLOSED],
  [STATE_CLOSING]: [STATE_CLOSING, STATE_CLOSED]
});

const kMonitor = Symbol('monitor');

/** @public */
export interface ServerOptions extends ConnectionPoolOptions, ClientMetadataOptions {
  credentials?: MongoCredentials;
}

/** @internal */
export interface ServerPrivate {
  /** The server description for this server */
  description: ServerDescription;
  /** A copy of the options used to construct this instance */
  options?: ServerOptions;
  /** A logger instance */
  logger: Logger;
  /** The current state of the Server */
  state: string;
  /** The topology this server is a part of */
  topology: Topology;
  /** A connection pool for this server */
  pool: ConnectionPool;
}

/** @public */
export class Server extends EventEmitter {
  /** @internal */
  s: ServerPrivate;
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
  constructor(topology: Topology, description: ServerDescription, options?: ServerOptions) {
    super();

    this.s = {
      description,
      options,
      logger: new Logger('Server', options),
      state: STATE_CLOSED,
      topology,
      pool: new ConnectionPool({ host: description.host, port: description.port, ...options })
    };

    relayEvents(
      this.s.pool,
      this,
      ['commandStarted', 'commandSucceeded', 'commandFailed'].concat(CMAP_EVENT_NAMES)
    );

    this.s.pool.on(Connection.CLUSTER_TIME_RECEIVED, (clusterTime: ClusterTime) => {
      this.clusterTime = clusterTime;
    });

    // create the monitor
    this[kMonitor] = new Monitor(this, this.s.options);
    relayEvents(this[kMonitor], this, [
      Server.SERVER_HEARTBEAT_STARTED,
      Server.SERVER_HEARTBEAT_SUCCEEDED,
      Server.SERVER_HEARTBEAT_FAILED,

      // legacy events
      'monitoring'
    ]);

    this[kMonitor].on('resetConnectionPool', () => {
      this.s.pool.clear();
    });

    this[kMonitor].on('resetServer', (error: MongoError) => markServerUnknown(this, error));
    this[kMonitor].on(Server.SERVER_HEARTBEAT_SUCCEEDED, (event: ServerHeartbeatSucceededEvent) => {
      this.emit(
        Server.DESCRIPTION_RECEIVED,
        new ServerDescription(this.description.address, event.reply, {
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

  /** Execute a command */
  command(ns: string, cmd: Document, callback: Callback): void;
  command(ns: string, cmd: Document, options: CommandOptions, callback: Callback<Document>): void;
  command(
    ns: string,
    cmd: Document,
    options?: CommandOptions | Callback<Document>,
    callback?: Callback<Document>
  ): void {
    if (typeof options === 'function') {
      (callback = options), (options = {}), (options = options || {});
    }

    if (!callback) return;
    if (this.s.state === STATE_CLOSING || this.s.state === STATE_CLOSED) {
      callback(new MongoError('server is closed'));
      return;
    }

    const error = basicReadValidations(this, options);
    if (error) {
      return callback(error);
    }

    // Clone the options
    const finalOptions = Object.assign({}, options, { wireProtocolCommand: false });

    // Debug log
    if (this.s.logger.isDebug()) {
      this.s.logger.debug(
        `executing command [${JSON.stringify({
          ns,
          cmd,
          options: debugOptions(DEBUG_FIELDS, options)
        })}] against ${this.name}`
      );
    }

    // error if collation not supported
    if (collationNotSupported(this, cmd)) {
      callback(new MongoError(`server ${this.name} does not support collation`));
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

  /** Execute a query against the server */
  query(ns: MongoDBNamespace, cmd: Document, options: QueryOptions, callback: Callback): void {
    if (this.s.state === STATE_CLOSING || this.s.state === STATE_CLOSED) {
      callback(new MongoError('server is closed'));
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

  /** Execute a `getMore` against the server */
  getMore(ns: string, cursorId: Long, options: GetMoreOptions, callback: Callback<Document>): void {
    if (this.s.state === STATE_CLOSING || this.s.state === STATE_CLOSED) {
      callback(new MongoError('server is closed'));
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

  /** Execute a `killCursors` command against the server */
  killCursors(ns: string, cursorIds: Long[], options: CommandOptions, callback?: Callback): void {
    if (this.s.state === STATE_CLOSING || this.s.state === STATE_CLOSED) {
      if (typeof callback === 'function') {
        callback(new MongoError('server is closed'));
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

  /**
   * Insert one or more documents
   *
   * @param ns - The MongoDB fully qualified namespace (ex: db1.collection1)
   * @param ops - An array of documents to insert
   */
  insert(ns: string, ops: Document[], options: WriteCommandOptions, callback: Callback): void {
    executeWriteOperation({ server: this, op: 'insert', ns, ops }, options, callback);
  }

  /**
   * Perform one or more update operations
   *
   * @param ns - The MongoDB fully qualified namespace (ex: db1.collection1)
   * @param ops - An array of updates
   */
  update(ns: string, ops: Document[], options: WriteCommandOptions, callback: Callback): void {
    executeWriteOperation({ server: this, op: 'update', ns, ops }, options, callback);
  }

  /**
   * Perform one or more remove operations
   *
   * @param ns - The MongoDB fully qualified namespace (ex: db1.collection1)
   * @param ops - An array of removes
   * @param options - options for removal
   * @param callback - A callback function
   */
  remove(ns: string, ops: Document[], options: WriteCommandOptions, callback: Callback): void {
    executeWriteOperation({ server: this, op: 'remove', ns, ops }, options, callback);
  }
}

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

function basicReadValidations(server: Server, options?: CommandOptions) {
  if (options?.readPreference && !(options.readPreference instanceof ReadPreference)) {
    return new MongoError('readPreference must be an instance of ReadPreference');
  }
}

function executeWriteOperation(
  args: { server: Server; op: string; ns: string; ops: Document[] | Document },
  options: WriteCommandOptions,
  callback: Callback
) {
  options = options || {};

  const { server, op, ns } = args;
  const ops = Array.isArray(args.ops) ? args.ops : [args.ops];
  if (server.s.state === STATE_CLOSING || server.s.state === STATE_CLOSED) {
    callback(new MongoError('server is closed'));
    return;
  }

  if (collationNotSupported(server, options)) {
    callback(new MongoError(`server ${server.name} does not support collation`));
    return;
  }

  const unacknowledgedWrite = options.writeConcern && options.writeConcern.w === 0;
  if (unacknowledgedWrite || maxWireVersion(server) < 5) {
    if ((op === 'update' || op === 'remove') && ops.find((o: Document) => o.hint)) {
      callback(new MongoError(`servers < 3.4 do not support hint on ${op}`));
      return;
    }
  }

  server.s.pool.withConnection((err, conn, cb) => {
    if (err || !conn) {
      markServerUnknown(server, err);
      return cb(err);
    }

    if (op === 'insert') {
      conn.insert(
        ns,
        ops,
        options,
        makeOperationHandler(server, conn, ops, options, cb) as Callback
      );
    } else if (op === 'update') {
      conn.update(
        ns,
        ops,
        options,
        makeOperationHandler(server, conn, ops, options, cb) as Callback
      );
    } else {
      conn.remove(
        ns,
        ops,
        options,
        makeOperationHandler(server, conn, ops, options, cb) as Callback
      );
    }
  }, callback);
}

function markServerUnknown(server: Server, error?: MongoError) {
  if (error instanceof MongoNetworkError && !(error instanceof MongoNetworkTimeoutError)) {
    server[kMonitor].reset();
  }

  server.emit(
    Server.DESCRIPTION_RECEIVED,
    new ServerDescription(server.description.address, undefined, {
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
  options: CommandOptions | WriteCommandOptions | GetMoreOptions | undefined,
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
