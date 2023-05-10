import { clearTimeout, setTimeout } from 'timers';

import type { ObjectId } from '../bson';
import {
  APM_EVENTS,
  CONNECTION_CHECK_OUT_FAILED,
  CONNECTION_CHECK_OUT_STARTED,
  CONNECTION_CHECKED_IN,
  CONNECTION_CHECKED_OUT,
  CONNECTION_CLOSED,
  CONNECTION_CREATED,
  CONNECTION_POOL_CLEARED,
  CONNECTION_POOL_CLOSED,
  CONNECTION_POOL_CREATED,
  CONNECTION_POOL_READY,
  CONNECTION_READY
} from '../constants';
import {
  AnyError,
  MONGODB_ERROR_CODES,
  MongoError,
  MongoInvalidArgumentError,
  MongoMissingCredentialsError,
  MongoNetworkError,
  MongoRuntimeError,
  MongoServerError
} from '../error';
import { CancellationToken, TypedEventEmitter } from '../mongo_types';
import type { Server } from '../sdam/server';
import { Callback, eachAsync, List, makeCounter } from '../utils';
import { AUTH_PROVIDERS, connect } from './connect';
import { Connection, ConnectionEvents, ConnectionOptions } from './connection';
import {
  ConnectionCheckedInEvent,
  ConnectionCheckedOutEvent,
  ConnectionCheckOutFailedEvent,
  ConnectionCheckOutStartedEvent,
  ConnectionClosedEvent,
  ConnectionCreatedEvent,
  ConnectionPoolClearedEvent,
  ConnectionPoolClosedEvent,
  ConnectionPoolCreatedEvent,
  ConnectionPoolReadyEvent,
  ConnectionReadyEvent
} from './connection_pool_events';
import {
  PoolClearedError,
  PoolClearedOnNetworkError,
  PoolClosedError,
  WaitQueueTimeoutError
} from './errors';
import { ConnectionPoolMetrics } from './metrics';

/** @internal */
const kServer = Symbol('server');
/** @internal */
const kConnections = Symbol('connections');
/** @internal */
const kPending = Symbol('pending');
/** @internal */
const kCheckedOut = Symbol('checkedOut');
/** @internal */
const kMinPoolSizeTimer = Symbol('minPoolSizeTimer');
/** @internal */
const kGeneration = Symbol('generation');
/** @internal */
const kServiceGenerations = Symbol('serviceGenerations');
/** @internal */
const kConnectionCounter = Symbol('connectionCounter');
/** @internal */
const kCancellationToken = Symbol('cancellationToken');
/** @internal */
const kWaitQueue = Symbol('waitQueue');
/** @internal */
const kCancelled = Symbol('cancelled');
/** @internal */
const kMetrics = Symbol('metrics');
/** @internal */
const kProcessingWaitQueue = Symbol('processingWaitQueue');
/** @internal */
const kPoolState = Symbol('poolState');

/** @public */
export interface ConnectionPoolOptions extends Omit<ConnectionOptions, 'id' | 'generation'> {
  /** The maximum number of connections that may be associated with a pool at a given time. This includes in use and available connections. */
  maxPoolSize: number;
  /** The minimum number of connections that MUST exist at any moment in a single connection pool. */
  minPoolSize: number;
  /** The maximum number of connections that may be in the process of being established concurrently by the connection pool. */
  maxConnecting: number;
  /** The maximum amount of time a connection should remain idle in the connection pool before being marked idle. */
  maxIdleTimeMS: number;
  /** The maximum amount of time operation execution should wait for a connection to become available. The default is 0 which means there is no limit. */
  waitQueueTimeoutMS: number;
  /** If we are in load balancer mode. */
  loadBalanced: boolean;
  /** @internal */
  minPoolSizeCheckFrequencyMS?: number;
}

/** @internal */
export interface WaitQueueMember {
  callback: Callback<Connection>;
  timer?: NodeJS.Timeout;
  [kCancelled]?: boolean;
}

/** @internal */
export const PoolState = Object.freeze({
  paused: 'paused',
  ready: 'ready',
  closed: 'closed'
} as const);

/** @public */
export interface CloseOptions {
  force?: boolean;
}

/** @public */
export type ConnectionPoolEvents = {
  connectionPoolCreated(event: ConnectionPoolCreatedEvent): void;
  connectionPoolReady(event: ConnectionPoolReadyEvent): void;
  connectionPoolClosed(event: ConnectionPoolClosedEvent): void;
  connectionPoolCleared(event: ConnectionPoolClearedEvent): void;
  connectionCreated(event: ConnectionCreatedEvent): void;
  connectionReady(event: ConnectionReadyEvent): void;
  connectionClosed(event: ConnectionClosedEvent): void;
  connectionCheckOutStarted(event: ConnectionCheckOutStartedEvent): void;
  connectionCheckOutFailed(event: ConnectionCheckOutFailedEvent): void;
  connectionCheckedOut(event: ConnectionCheckedOutEvent): void;
  connectionCheckedIn(event: ConnectionCheckedInEvent): void;
} & Omit<ConnectionEvents, 'close' | 'message'>;

/**
 * A pool of connections which dynamically resizes, and emit events related to pool activity
 * @internal
 */
export class ConnectionPool extends TypedEventEmitter<ConnectionPoolEvents> {
  options: Readonly<ConnectionPoolOptions>;
  [kPoolState]: (typeof PoolState)[keyof typeof PoolState];
  [kServer]: Server;
  [kConnections]: List<Connection>;
  [kPending]: number;
  [kCheckedOut]: Set<Connection>;
  [kMinPoolSizeTimer]?: NodeJS.Timeout;
  /**
   * An integer representing the SDAM generation of the pool
   */
  [kGeneration]: number;
  /**
   * A map of generations to service ids
   */
  [kServiceGenerations]: Map<string, number>;
  [kConnectionCounter]: Generator<number>;
  [kCancellationToken]: CancellationToken;
  [kWaitQueue]: List<WaitQueueMember>;
  [kMetrics]: ConnectionPoolMetrics;
  [kProcessingWaitQueue]: boolean;

  /**
   * Emitted when the connection pool is created.
   * @event
   */
  static readonly CONNECTION_POOL_CREATED = CONNECTION_POOL_CREATED;
  /**
   * Emitted once when the connection pool is closed
   * @event
   */
  static readonly CONNECTION_POOL_CLOSED = CONNECTION_POOL_CLOSED;
  /**
   * Emitted each time the connection pool is cleared and it's generation incremented
   * @event
   */
  static readonly CONNECTION_POOL_CLEARED = CONNECTION_POOL_CLEARED;
  /**
   * Emitted each time the connection pool is marked ready
   * @event
   */
  static readonly CONNECTION_POOL_READY = CONNECTION_POOL_READY;
  /**
   * Emitted when a connection is created.
   * @event
   */
  static readonly CONNECTION_CREATED = CONNECTION_CREATED;
  /**
   * Emitted when a connection becomes established, and is ready to use
   * @event
   */
  static readonly CONNECTION_READY = CONNECTION_READY;
  /**
   * Emitted when a connection is closed
   * @event
   */
  static readonly CONNECTION_CLOSED = CONNECTION_CLOSED;
  /**
   * Emitted when an attempt to check out a connection begins
   * @event
   */
  static readonly CONNECTION_CHECK_OUT_STARTED = CONNECTION_CHECK_OUT_STARTED;
  /**
   * Emitted when an attempt to check out a connection fails
   * @event
   */
  static readonly CONNECTION_CHECK_OUT_FAILED = CONNECTION_CHECK_OUT_FAILED;
  /**
   * Emitted each time a connection is successfully checked out of the connection pool
   * @event
   */
  static readonly CONNECTION_CHECKED_OUT = CONNECTION_CHECKED_OUT;
  /**
   * Emitted each time a connection is successfully checked into the connection pool
   * @event
   */
  static readonly CONNECTION_CHECKED_IN = CONNECTION_CHECKED_IN;

  constructor(server: Server, options: ConnectionPoolOptions) {
    super();

    this.options = Object.freeze({
      ...options,
      connectionType: Connection,
      maxPoolSize: options.maxPoolSize ?? 100,
      minPoolSize: options.minPoolSize ?? 0,
      maxConnecting: options.maxConnecting ?? 2,
      maxIdleTimeMS: options.maxIdleTimeMS ?? 0,
      waitQueueTimeoutMS: options.waitQueueTimeoutMS ?? 0,
      minPoolSizeCheckFrequencyMS: options.minPoolSizeCheckFrequencyMS ?? 100,
      autoEncrypter: options.autoEncrypter,
      metadata: options.metadata
    });

    if (this.options.minPoolSize > this.options.maxPoolSize) {
      throw new MongoInvalidArgumentError(
        'Connection pool minimum size must not be greater than maximum pool size'
      );
    }

    this[kPoolState] = PoolState.paused;
    this[kServer] = server;
    this[kConnections] = new List();
    this[kPending] = 0;
    this[kCheckedOut] = new Set();
    this[kMinPoolSizeTimer] = undefined;
    this[kGeneration] = 0;
    this[kServiceGenerations] = new Map();
    this[kConnectionCounter] = makeCounter(1);
    this[kCancellationToken] = new CancellationToken();
    this[kCancellationToken].setMaxListeners(Infinity);
    this[kWaitQueue] = new List();
    this[kMetrics] = new ConnectionPoolMetrics();
    this[kProcessingWaitQueue] = false;

    this.mongoLogger = this[kServer].topology.client.mongoLogger;
    this.component = 'connection';

    process.nextTick(() => {
      this.emitAndLog(ConnectionPool.CONNECTION_POOL_CREATED, new ConnectionPoolCreatedEvent(this));
    });
  }

  /** The address of the endpoint the pool is connected to */
  get address(): string {
    return this.options.hostAddress.toString();
  }

  /**
   * Check if the pool has been closed
   *
   * TODO(NODE-3263): We can remove this property once shell no longer needs it
   */
  get closed(): boolean {
    return this[kPoolState] === PoolState.closed;
  }

  /** An integer representing the SDAM generation of the pool */
  get generation(): number {
    return this[kGeneration];
  }

  /** An integer expressing how many total connections (available + pending + in use) the pool currently has */
  get totalConnectionCount(): number {
    return (
      this.availableConnectionCount + this.pendingConnectionCount + this.currentCheckedOutCount
    );
  }

  /** An integer expressing how many connections are currently available in the pool. */
  get availableConnectionCount(): number {
    return this[kConnections].length;
  }

  get pendingConnectionCount(): number {
    return this[kPending];
  }

  get currentCheckedOutCount(): number {
    return this[kCheckedOut].size;
  }

  get waitQueueSize(): number {
    return this[kWaitQueue].length;
  }

  get loadBalanced(): boolean {
    return this.options.loadBalanced;
  }

  get serviceGenerations(): Map<string, number> {
    return this[kServiceGenerations];
  }

  get serverError() {
    return this[kServer].description.error;
  }

  /**
   * This is exposed ONLY for use in mongosh, to enable
   * killing all connections if a user quits the shell with
   * operations in progress.
   *
   * This property may be removed as a part of NODE-3263.
   */
  get checkedOutConnections() {
    return this[kCheckedOut];
  }

  /**
   * Get the metrics information for the pool when a wait queue timeout occurs.
   */
  private waitQueueErrorMetrics(): string {
    return this[kMetrics].info(this.options.maxPoolSize);
  }

  /**
   * Set the pool state to "ready"
   */
  ready(): void {
    if (this[kPoolState] !== PoolState.paused) {
      return;
    }
    this[kPoolState] = PoolState.ready;
    this.emitAndLog(ConnectionPool.CONNECTION_POOL_READY, new ConnectionPoolReadyEvent(this));
    clearTimeout(this[kMinPoolSizeTimer]);
    this.ensureMinPoolSize();
  }

  /**
   * Check a connection out of this pool. The connection will continue to be tracked, but no reference to it
   * will be held by the pool. This means that if a connection is checked out it MUST be checked back in or
   * explicitly destroyed by the new owner.
   */
  checkOut(callback: Callback<Connection>): void {
    this.emitAndLog(
      ConnectionPool.CONNECTION_CHECK_OUT_STARTED,
      new ConnectionCheckOutStartedEvent(this)
    );

    const waitQueueMember: WaitQueueMember = { callback };
    const waitQueueTimeoutMS = this.options.waitQueueTimeoutMS;
    if (waitQueueTimeoutMS) {
      waitQueueMember.timer = setTimeout(() => {
        waitQueueMember[kCancelled] = true;
        waitQueueMember.timer = undefined;

        this.emitAndLog(
          ConnectionPool.CONNECTION_CHECK_OUT_FAILED,
          new ConnectionCheckOutFailedEvent(this, 'timeout')
        );
        waitQueueMember.callback(
          new WaitQueueTimeoutError(
            this.loadBalanced
              ? this.waitQueueErrorMetrics()
              : 'Timed out while checking out a connection from connection pool',
            this.address
          )
        );
      }, waitQueueTimeoutMS);
    }

    this[kWaitQueue].push(waitQueueMember);
    process.nextTick(() => this.processWaitQueue());
  }

  /**
   * Check a connection into the pool.
   *
   * @param connection - The connection to check in
   */
  checkIn(connection: Connection): void {
    if (!this[kCheckedOut].has(connection)) {
      return;
    }
    const poolClosed = this.closed;
    const stale = this.connectionIsStale(connection);
    const willDestroy = !!(poolClosed || stale || connection.closed);

    if (!willDestroy) {
      connection.markAvailable();
      this[kConnections].unshift(connection);
    }

    this[kCheckedOut].delete(connection);
    this.emitAndLog(
      ConnectionPool.CONNECTION_CHECKED_IN,
      new ConnectionCheckedInEvent(this, connection)
    );

    if (willDestroy) {
      const reason = connection.closed ? 'error' : poolClosed ? 'poolClosed' : 'stale';
      this.destroyConnection(connection, reason);
    }

    process.nextTick(() => this.processWaitQueue());
  }

  /**
   * Clear the pool
   *
   * Pool reset is handled by incrementing the pool's generation count. Any existing connection of a
   * previous generation will eventually be pruned during subsequent checkouts.
   */
  clear(options: { serviceId?: ObjectId; interruptInUseConnections?: boolean } = {}): void {
    if (this.closed) {
      return;
    }

    // handle load balanced case
    if (this.loadBalanced) {
      const { serviceId } = options;
      if (!serviceId) {
        throw new MongoRuntimeError(
          'ConnectionPool.clear() called in load balanced mode with no serviceId.'
        );
      }
      const sid = serviceId.toHexString();
      const generation = this.serviceGenerations.get(sid);
      // Only need to worry if the generation exists, since it should
      // always be there but typescript needs the check.
      if (generation == null) {
        throw new MongoRuntimeError('Service generations are required in load balancer mode.');
      } else {
        // Increment the generation for the service id.
        this.serviceGenerations.set(sid, generation + 1);
      }
      this.emitAndLog(
        ConnectionPool.CONNECTION_POOL_CLEARED,
        new ConnectionPoolClearedEvent(this, { serviceId })
      );
      return;
    }
    // handle non load-balanced case
    const interruptInUseConnections = options.interruptInUseConnections ?? false;
    const oldGeneration = this[kGeneration];
    this[kGeneration] += 1;
    const alreadyPaused = this[kPoolState] === PoolState.paused;
    this[kPoolState] = PoolState.paused;

    this.clearMinPoolSizeTimer();
    if (!alreadyPaused) {
      this.emitAndLog(
        ConnectionPool.CONNECTION_POOL_CLEARED,
        new ConnectionPoolClearedEvent(this, {
          interruptInUseConnections
        })
      );
    }

    if (interruptInUseConnections) {
      process.nextTick(() => this.interruptInUseConnections(oldGeneration));
    }

    this.processWaitQueue();
  }

  /**
   * Closes all stale in-use connections in the pool with a resumable PoolClearedOnNetworkError.
   *
   * Only connections where `connection.generation <= minGeneration` are killed.
   */
  private interruptInUseConnections(minGeneration: number) {
    for (const connection of this[kCheckedOut]) {
      if (connection.generation <= minGeneration) {
        this.checkIn(connection);
        connection.onError(new PoolClearedOnNetworkError(this));
      }
    }
  }

  /** Close the pool */
  close(callback: Callback<void>): void;
  close(options: CloseOptions, callback: Callback<void>): void;
  close(_options?: CloseOptions | Callback<void>, _cb?: Callback<void>): void {
    let options = _options as CloseOptions;
    const callback = (_cb ?? _options) as Callback<void>;
    if (typeof options === 'function') {
      options = {};
    }

    options = Object.assign({ force: false }, options);
    if (this.closed) {
      return callback();
    }

    // immediately cancel any in-flight connections
    this[kCancellationToken].emit('cancel');

    // end the connection counter
    if (typeof this[kConnectionCounter].return === 'function') {
      this[kConnectionCounter].return(undefined);
    }

    this[kPoolState] = PoolState.closed;
    this.clearMinPoolSizeTimer();
    this.processWaitQueue();

    eachAsync<Connection>(
      this[kConnections].toArray(),
      (conn, cb) => {
        this.emitAndLog(
          ConnectionPool.CONNECTION_CLOSED,
          new ConnectionClosedEvent(this, conn, 'poolClosed')
        );
        conn.destroy({ force: !!options.force }, cb);
      },
      err => {
        this[kConnections].clear();
        this.emitAndLog(ConnectionPool.CONNECTION_POOL_CLOSED, new ConnectionPoolClosedEvent(this));
        callback(err);
      }
    );
  }

  /**
   * Runs a lambda with an implicitly checked out connection, checking that connection back in when the lambda
   * has completed by calling back.
   *
   * NOTE: please note the required signature of `fn`
   *
   * @remarks When in load balancer mode, connections can be pinned to cursors or transactions.
   *   In these cases we pass the connection in to this method to ensure it is used and a new
   *   connection is not checked out.
   *
   * @param conn - A pinned connection for use in load balancing mode.
   * @param fn - A function which operates on a managed connection
   * @param callback - The original callback
   */
  withConnection(
    conn: Connection | undefined,
    fn: WithConnectionCallback,
    callback: Callback<Connection>
  ): void {
    if (conn) {
      // use the provided connection, and do _not_ check it in after execution
      fn(undefined, conn, (fnErr, result) => {
        if (fnErr) {
          return this.withReauthentication(fnErr, conn, fn, callback);
        }
        callback(undefined, result);
      });
      return;
    }

    this.checkOut((err, conn) => {
      // don't callback with `err` here, we might want to act upon it inside `fn`
      fn(err as MongoError, conn, (fnErr, result) => {
        if (fnErr) {
          if (conn) {
            this.withReauthentication(fnErr, conn, fn, callback);
          } else {
            callback(fnErr);
          }
        } else {
          callback(undefined, result);
        }

        if (conn) {
          this.checkIn(conn);
        }
      });
    });
  }

  private withReauthentication(
    fnErr: AnyError,
    conn: Connection,
    fn: WithConnectionCallback,
    callback: Callback<Connection>
  ) {
    if (fnErr instanceof MongoError && fnErr.code === MONGODB_ERROR_CODES.Reauthenticate) {
      this.reauthenticate(conn, fn, (error, res) => {
        if (error) {
          return callback(error);
        }
        callback(undefined, res);
      });
    } else {
      callback(fnErr);
    }
  }

  /**
   * Reauthenticate on the same connection and then retry the operation.
   */
  private reauthenticate(
    connection: Connection,
    fn: WithConnectionCallback,
    callback: Callback
  ): void {
    const authContext = connection.authContext;
    if (!authContext) {
      return callback(new MongoRuntimeError('No auth context found on connection.'));
    }
    const credentials = authContext.credentials;
    if (!credentials) {
      return callback(
        new MongoMissingCredentialsError(
          'Connection is missing credentials when asked to reauthenticate'
        )
      );
    }
    const resolvedCredentials = credentials.resolveAuthMechanism(connection.hello || undefined);
    const provider = AUTH_PROVIDERS.get(resolvedCredentials.mechanism);
    if (!provider) {
      return callback(
        new MongoMissingCredentialsError(
          `Reauthenticate failed due to no auth provider for ${credentials.mechanism}`
        )
      );
    }
    provider.reauth(authContext).then(
      () => {
        fn(undefined, connection, (fnErr, fnResult) => {
          if (fnErr) {
            return callback(fnErr);
          }
          callback(undefined, fnResult);
        });
      },
      error => callback(error)
    );
  }

  /** Clear the min pool size timer */
  private clearMinPoolSizeTimer(): void {
    const minPoolSizeTimer = this[kMinPoolSizeTimer];
    if (minPoolSizeTimer) {
      clearTimeout(minPoolSizeTimer);
    }
  }

  private destroyConnection(
    connection: Connection,
    reason: 'error' | 'idle' | 'stale' | 'poolClosed'
  ) {
    this.emitAndLog(
      ConnectionPool.CONNECTION_CLOSED,
      new ConnectionClosedEvent(this, connection, reason)
    );
    // destroy the connection
    process.nextTick(() => connection.destroy({ force: false }));
  }

  private connectionIsStale(connection: Connection) {
    const serviceId = connection.serviceId;
    if (this.loadBalanced && serviceId) {
      const sid = serviceId.toHexString();
      const generation = this.serviceGenerations.get(sid);
      return connection.generation !== generation;
    }

    return connection.generation !== this[kGeneration];
  }

  private connectionIsIdle(connection: Connection) {
    return !!(this.options.maxIdleTimeMS && connection.idleTime > this.options.maxIdleTimeMS);
  }

  /**
   * Destroys a connection if the connection is perished.
   *
   * @returns `true` if the connection was destroyed, `false` otherwise.
   */
  private destroyConnectionIfPerished(connection: Connection): boolean {
    const isStale = this.connectionIsStale(connection);
    const isIdle = this.connectionIsIdle(connection);
    if (!isStale && !isIdle && !connection.closed) {
      return false;
    }
    const reason = connection.closed ? 'error' : isStale ? 'stale' : 'idle';
    this.destroyConnection(connection, reason);
    return true;
  }

  private createConnection(callback: Callback<Connection>) {
    const connectOptions: ConnectionOptions = {
      ...this.options,
      id: this[kConnectionCounter].next().value,
      generation: this[kGeneration],
      cancellationToken: this[kCancellationToken]
    };

    this[kPending]++;
    // This is our version of a "virtual" no-I/O connection as the spec requires
    this.emitAndLog(
      ConnectionPool.CONNECTION_CREATED,
      new ConnectionCreatedEvent(this, { id: connectOptions.id })
    );

    connect(connectOptions, (err, connection) => {
      if (err || !connection) {
        this[kPending]--;
        this.emitAndLog(
          ConnectionPool.CONNECTION_CLOSED,
          new ConnectionClosedEvent(
            this,
            { id: connectOptions.id, serviceId: undefined },
            'error',
            // TODO(NODE-5192): Remove this cast
            err as MongoError
          )
        );
        if (err instanceof MongoNetworkError || err instanceof MongoServerError) {
          err.connectionGeneration = connectOptions.generation;
        }
        callback(err ?? new MongoRuntimeError('Connection creation failed without error'));
        return;
      }

      // The pool might have closed since we started trying to create a connection
      if (this[kPoolState] !== PoolState.ready) {
        this[kPending]--;
        connection.destroy({ force: true });
        callback(this.closed ? new PoolClosedError(this) : new PoolClearedError(this));
        return;
      }

      // forward all events from the connection to the pool
      for (const event of [...APM_EVENTS, Connection.CLUSTER_TIME_RECEIVED]) {
        connection.on(event, (e: any) => this.emit(event, e));
      }

      if (this.loadBalanced) {
        connection.on(Connection.PINNED, pinType => this[kMetrics].markPinned(pinType));
        connection.on(Connection.UNPINNED, pinType => this[kMetrics].markUnpinned(pinType));

        const serviceId = connection.serviceId;
        if (serviceId) {
          let generation;
          const sid = serviceId.toHexString();
          if ((generation = this.serviceGenerations.get(sid))) {
            connection.generation = generation;
          } else {
            this.serviceGenerations.set(sid, 0);
            connection.generation = 0;
          }
        }
      }

      connection.markAvailable();
      this.emitAndLog(ConnectionPool.CONNECTION_READY, new ConnectionReadyEvent(this, connection));

      this[kPending]--;
      callback(undefined, connection);
      return;
    });
  }

  private ensureMinPoolSize() {
    const minPoolSize = this.options.minPoolSize;
    if (this[kPoolState] !== PoolState.ready || minPoolSize === 0) {
      return;
    }

    this[kConnections].prune(connection => this.destroyConnectionIfPerished(connection));

    if (
      this.totalConnectionCount < minPoolSize &&
      this.pendingConnectionCount < this.options.maxConnecting
    ) {
      // NOTE: ensureMinPoolSize should not try to get all the pending
      // connection permits because that potentially delays the availability of
      // the connection to a checkout request
      this.createConnection((err, connection) => {
        if (err) {
          this[kServer].handleError(err);
        }
        if (!err && connection) {
          this[kConnections].push(connection);
          process.nextTick(() => this.processWaitQueue());
        }
        if (this[kPoolState] === PoolState.ready) {
          clearTimeout(this[kMinPoolSizeTimer]);
          this[kMinPoolSizeTimer] = setTimeout(
            () => this.ensureMinPoolSize(),
            this.options.minPoolSizeCheckFrequencyMS
          );
        }
      });
    } else {
      clearTimeout(this[kMinPoolSizeTimer]);
      this[kMinPoolSizeTimer] = setTimeout(
        () => this.ensureMinPoolSize(),
        this.options.minPoolSizeCheckFrequencyMS
      );
    }
  }

  private processWaitQueue() {
    if (this[kProcessingWaitQueue]) {
      return;
    }
    this[kProcessingWaitQueue] = true;

    while (this.waitQueueSize) {
      const waitQueueMember = this[kWaitQueue].first();
      if (!waitQueueMember) {
        this[kWaitQueue].shift();
        continue;
      }

      if (waitQueueMember[kCancelled]) {
        this[kWaitQueue].shift();
        continue;
      }

      if (this[kPoolState] !== PoolState.ready) {
        const reason = this.closed ? 'poolClosed' : 'connectionError';
        const error = this.closed ? new PoolClosedError(this) : new PoolClearedError(this);
        this.emitAndLog(
          ConnectionPool.CONNECTION_CHECK_OUT_FAILED,
          new ConnectionCheckOutFailedEvent(this, reason, error)
        );
        if (waitQueueMember.timer) {
          clearTimeout(waitQueueMember.timer);
        }
        this[kWaitQueue].shift();
        waitQueueMember.callback(error);
        continue;
      }

      if (!this.availableConnectionCount) {
        break;
      }

      const connection = this[kConnections].shift();
      if (!connection) {
        break;
      }

      if (!this.destroyConnectionIfPerished(connection)) {
        this[kCheckedOut].add(connection);
        this.emitAndLog(
          ConnectionPool.CONNECTION_CHECKED_OUT,
          new ConnectionCheckedOutEvent(this, connection)
        );
        if (waitQueueMember.timer) {
          clearTimeout(waitQueueMember.timer);
        }

        this[kWaitQueue].shift();
        waitQueueMember.callback(undefined, connection);
      }
    }

    const { maxPoolSize, maxConnecting } = this.options;
    while (
      this.waitQueueSize > 0 &&
      this.pendingConnectionCount < maxConnecting &&
      (maxPoolSize === 0 || this.totalConnectionCount < maxPoolSize)
    ) {
      const waitQueueMember = this[kWaitQueue].shift();
      if (!waitQueueMember || waitQueueMember[kCancelled]) {
        continue;
      }
      this.createConnection((err, connection) => {
        if (waitQueueMember[kCancelled]) {
          if (!err && connection) {
            this[kConnections].push(connection);
          }
        } else {
          if (err) {
            this.emitAndLog(
              ConnectionPool.CONNECTION_CHECK_OUT_FAILED,
              // TODO(NODE-5192): Remove this cast
              new ConnectionCheckOutFailedEvent(this, 'connectionError', err as MongoError)
            );
          } else if (connection) {
            this[kCheckedOut].add(connection);
            this.emitAndLog(
              ConnectionPool.CONNECTION_CHECKED_OUT,
              new ConnectionCheckedOutEvent(this, connection)
            );
          }

          if (waitQueueMember.timer) {
            clearTimeout(waitQueueMember.timer);
          }
          waitQueueMember.callback(err, connection);
        }
        process.nextTick(() => this.processWaitQueue());
      });
    }
    this[kProcessingWaitQueue] = false;
  }
}

/**
 * A callback provided to `withConnection`
 * @internal
 *
 * @param error - An error instance representing the error during the execution.
 * @param connection - The managed connection which was checked out of the pool.
 * @param callback - A function to call back after connection management is complete
 */
export type WithConnectionCallback = (
  error: MongoError | undefined,
  connection: Connection | undefined,
  callback: Callback<Connection>
) => void;
