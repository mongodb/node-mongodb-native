import Denque = require('denque');
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
  CONNECTION_READY
} from '../constants';
import { MongoError, MongoInvalidArgumentError, MongoRuntimeError } from '../error';
import { Logger } from '../logger';
import { CancellationToken, TypedEventEmitter } from '../mongo_types';
import { Callback, eachAsync, makeCounter } from '../utils';
import { connect } from './connect';
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
  ConnectionReadyEvent
} from './connection_pool_events';
import { PoolClosedError, WaitQueueTimeoutError } from './errors';
import { ConnectionPoolMetrics } from './metrics';

/** @internal */
const kLogger = Symbol('logger');
/** @internal */
const kConnections = Symbol('connections');
/** @internal */
const kPermits = Symbol('permits');
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
const kCheckedOut = Symbol('checkedOut');
/** @internal */
const kProcessingWaitQueue = Symbol('processingWaitQueue');

/** @public */
export interface ConnectionPoolOptions extends Omit<ConnectionOptions, 'id' | 'generation'> {
  /** The maximum number of connections that may be associated with a pool at a given time. This includes in use and available connections. */
  maxPoolSize: number;
  /** The minimum number of connections that MUST exist at any moment in a single connection pool. */
  minPoolSize: number;
  /** The maximum amount of time a connection should remain idle in the connection pool before being marked idle. */
  maxIdleTimeMS: number;
  /** The maximum amount of time operation execution should wait for a connection to become available. The default is 0 which means there is no limit. */
  waitQueueTimeoutMS: number;
  /** If we are in load balancer mode. */
  loadBalanced: boolean;
}

/** @internal */
export interface WaitQueueMember {
  callback: Callback<Connection>;
  timer?: NodeJS.Timeout;
  [kCancelled]?: boolean;
}

/** @public */
export interface CloseOptions {
  force?: boolean;
}

/** @public */
export type ConnectionPoolEvents = {
  connectionPoolCreated(event: ConnectionPoolCreatedEvent): void;
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
  closed: boolean;
  options: Readonly<ConnectionPoolOptions>;
  /** @internal */
  [kLogger]: Logger;
  /** @internal */
  [kConnections]: Denque<Connection>;
  /**
   * An integer expressing how many total connections are permitted
   * @internal
   */
  [kPermits]: number;
  /** @internal */
  [kMinPoolSizeTimer]?: NodeJS.Timeout;
  /**
   * An integer representing the SDAM generation of the pool
   * @internal
   */
  [kGeneration]: number;
  /** A map of generations to service ids
   * @internal
   */
  [kServiceGenerations]: Map<string, number>;
  /** @internal */
  [kConnectionCounter]: Generator<number>;
  /** @internal */
  [kCancellationToken]: CancellationToken;
  /** @internal */
  [kWaitQueue]: Denque<WaitQueueMember>;
  /** @internal */
  [kMetrics]: ConnectionPoolMetrics;
  /** @internal */
  [kCheckedOut]: number;
  /** @internal */
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

  /** @internal */
  constructor(options: ConnectionPoolOptions) {
    super();

    this.closed = false;
    this.options = Object.freeze({
      ...options,
      connectionType: Connection,
      maxPoolSize: options.maxPoolSize ?? 100,
      minPoolSize: options.minPoolSize ?? 0,
      maxIdleTimeMS: options.maxIdleTimeMS ?? 0,
      waitQueueTimeoutMS: options.waitQueueTimeoutMS ?? 0,
      autoEncrypter: options.autoEncrypter,
      metadata: options.metadata
    });

    if (this.options.minPoolSize > this.options.maxPoolSize) {
      throw new MongoInvalidArgumentError(
        'Connection pool minimum size must not be greater than maximum pool size'
      );
    }

    this[kLogger] = new Logger('ConnectionPool');
    this[kConnections] = new Denque();
    this[kPermits] = this.options.maxPoolSize;
    this[kMinPoolSizeTimer] = undefined;
    this[kGeneration] = 0;
    this[kServiceGenerations] = new Map();
    this[kConnectionCounter] = makeCounter(1);
    this[kCancellationToken] = new CancellationToken();
    this[kCancellationToken].setMaxListeners(Infinity);
    this[kWaitQueue] = new Denque();
    this[kMetrics] = new ConnectionPoolMetrics();
    this[kCheckedOut] = 0;
    this[kProcessingWaitQueue] = false;

    process.nextTick(() => {
      this.emit(ConnectionPool.CONNECTION_POOL_CREATED, new ConnectionPoolCreatedEvent(this));
      ensureMinPoolSize(this);
    });
  }

  /** The address of the endpoint the pool is connected to */
  get address(): string {
    return this.options.hostAddress.toString();
  }

  /** An integer representing the SDAM generation of the pool */
  get generation(): number {
    return this[kGeneration];
  }

  /** An integer expressing how many total connections (active + in use) the pool currently has */
  get totalConnectionCount(): number {
    return this[kConnections].length + (this.options.maxPoolSize - this[kPermits]);
  }

  /** An integer expressing how many connections are currently available in the pool. */
  get availableConnectionCount(): number {
    return this[kConnections].length;
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

  get currentCheckedOutCount(): number {
    return this[kCheckedOut];
  }

  /**
   * Get the metrics information for the pool when a wait queue timeout occurs.
   */
  private waitQueueErrorMetrics(): string {
    return this[kMetrics].info(this.options.maxPoolSize);
  }

  /**
   * Check a connection out of this pool. The connection will continue to be tracked, but no reference to it
   * will be held by the pool. This means that if a connection is checked out it MUST be checked back in or
   * explicitly destroyed by the new owner.
   */
  checkOut(callback: Callback<Connection>): void {
    this.emit(
      ConnectionPool.CONNECTION_CHECK_OUT_STARTED,
      new ConnectionCheckOutStartedEvent(this)
    );

    if (this.closed) {
      this.emit(
        ConnectionPool.CONNECTION_CHECK_OUT_FAILED,
        new ConnectionCheckOutFailedEvent(this, 'poolClosed')
      );
      callback(new PoolClosedError(this));
      return;
    }

    const waitQueueMember: WaitQueueMember = { callback };
    const waitQueueTimeoutMS = this.options.waitQueueTimeoutMS;
    if (waitQueueTimeoutMS) {
      waitQueueMember.timer = setTimeout(() => {
        waitQueueMember[kCancelled] = true;
        waitQueueMember.timer = undefined;

        this.emit(
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

    this[kCheckedOut] = this[kCheckedOut] + 1;
    this[kWaitQueue].push(waitQueueMember);
    process.nextTick(processWaitQueue, this);
  }

  /**
   * Check a connection into the pool.
   *
   * @param connection - The connection to check in
   */
  checkIn(connection: Connection): void {
    const poolClosed = this.closed;
    const stale = connectionIsStale(this, connection);
    const willDestroy = !!(poolClosed || stale || connection.closed);

    if (!willDestroy) {
      connection.markAvailable();
      this[kConnections].unshift(connection);
    }

    this[kCheckedOut] = this[kCheckedOut] - 1;
    this.emit(ConnectionPool.CONNECTION_CHECKED_IN, new ConnectionCheckedInEvent(this, connection));

    if (willDestroy) {
      const reason = connection.closed ? 'error' : poolClosed ? 'poolClosed' : 'stale';
      destroyConnection(this, connection, reason);
    }

    process.nextTick(processWaitQueue, this);
  }

  /**
   * Clear the pool
   *
   * Pool reset is handled by incrementing the pool's generation count. Any existing connection of a
   * previous generation will eventually be pruned during subsequent checkouts.
   */
  clear(serviceId?: ObjectId): void {
    if (this.loadBalanced && serviceId) {
      const sid = serviceId.toHexString();
      const generation = this.serviceGenerations.get(sid);
      // Only need to worry if the generation exists, since it should
      // always be there but typescript needs the check.
      if (generation == null) {
        // TODO(NODE-3483)
        throw new MongoRuntimeError('Service generations are required in load balancer mode.');
      } else {
        // Increment the generation for the service id.
        this.serviceGenerations.set(sid, generation + 1);
      }
    } else {
      this[kGeneration] += 1;
    }

    this.emit('connectionPoolCleared', new ConnectionPoolClearedEvent(this, serviceId));
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

    // drain the wait queue
    while (this.waitQueueSize) {
      const waitQueueMember = this[kWaitQueue].pop();
      if (waitQueueMember) {
        if (waitQueueMember.timer) {
          clearTimeout(waitQueueMember.timer);
        }
        if (!waitQueueMember[kCancelled]) {
          // TODO(NODE-3483): Replace with MongoConnectionPoolClosedError
          waitQueueMember.callback(new MongoRuntimeError('Connection pool closed'));
        }
      }
    }

    // clear the min pool size timer
    const minPoolSizeTimer = this[kMinPoolSizeTimer];
    if (minPoolSizeTimer) {
      clearTimeout(minPoolSizeTimer);
    }

    // end the connection counter
    if (typeof this[kConnectionCounter].return === 'function') {
      this[kConnectionCounter].return(undefined);
    }

    // mark the pool as closed immediately
    this.closed = true;
    eachAsync<Connection>(
      this[kConnections].toArray(),
      (conn, cb) => {
        this.emit(
          ConnectionPool.CONNECTION_CLOSED,
          new ConnectionClosedEvent(this, conn, 'poolClosed')
        );
        conn.destroy(options, cb);
      },
      err => {
        this[kConnections].clear();
        this.emit(ConnectionPool.CONNECTION_POOL_CLOSED, new ConnectionPoolClosedEvent(this));
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
    callback?: Callback<Connection>
  ): void {
    if (conn) {
      // use the provided connection, and do _not_ check it in after execution
      fn(undefined, conn, (fnErr, result) => {
        if (typeof callback === 'function') {
          if (fnErr) {
            callback(fnErr);
          } else {
            callback(undefined, result);
          }
        }
      });

      return;
    }

    this.checkOut((err, conn) => {
      // don't callback with `err` here, we might want to act upon it inside `fn`
      fn(err as MongoError, conn, (fnErr, result) => {
        if (typeof callback === 'function') {
          if (fnErr) {
            callback(fnErr);
          } else {
            callback(undefined, result);
          }
        }

        if (conn) {
          this.checkIn(conn);
        }
      });
    });
  }
}

function ensureMinPoolSize(pool: ConnectionPool) {
  if (pool.closed || pool.options.minPoolSize === 0) {
    return;
  }

  const minPoolSize = pool.options.minPoolSize;
  for (let i = pool.totalConnectionCount; i < minPoolSize; ++i) {
    createConnection(pool);
  }

  pool[kMinPoolSizeTimer] = setTimeout(() => ensureMinPoolSize(pool), 10);
}

function connectionIsStale(pool: ConnectionPool, connection: Connection) {
  const serviceId = connection.serviceId;
  if (pool.loadBalanced && serviceId) {
    const sid = serviceId.toHexString();
    const generation = pool.serviceGenerations.get(sid);
    return connection.generation !== generation;
  }

  return connection.generation !== pool[kGeneration];
}

function connectionIsIdle(pool: ConnectionPool, connection: Connection) {
  return !!(pool.options.maxIdleTimeMS && connection.idleTime > pool.options.maxIdleTimeMS);
}

function createConnection(pool: ConnectionPool, callback?: Callback<Connection>) {
  const connectOptions: ConnectionOptions = {
    ...pool.options,
    id: pool[kConnectionCounter].next().value,
    generation: pool[kGeneration],
    cancellationToken: pool[kCancellationToken]
  };

  pool[kPermits]--;
  connect(connectOptions, (err, connection) => {
    if (err || !connection) {
      pool[kPermits]++;
      pool[kLogger].debug(`connection attempt failed with error [${JSON.stringify(err)}]`);
      if (typeof callback === 'function') {
        callback(err);
      }

      return;
    }

    // The pool might have closed since we started trying to create a connection
    if (pool.closed) {
      connection.destroy({ force: true });
      return;
    }

    // forward all events from the connection to the pool
    for (const event of [...APM_EVENTS, Connection.CLUSTER_TIME_RECEIVED]) {
      connection.on(event, (e: any) => pool.emit(event, e));
    }

    pool.emit(ConnectionPool.CONNECTION_CREATED, new ConnectionCreatedEvent(pool, connection));

    if (pool.loadBalanced) {
      connection.on(Connection.PINNED, pinType => pool[kMetrics].markPinned(pinType));
      connection.on(Connection.UNPINNED, pinType => pool[kMetrics].markUnpinned(pinType));

      const serviceId = connection.serviceId;
      if (serviceId) {
        let generation;
        const sid = serviceId.toHexString();
        if ((generation = pool.serviceGenerations.get(sid))) {
          connection.generation = generation;
        } else {
          pool.serviceGenerations.set(sid, 0);
          connection.generation = 0;
        }
      }
    }

    connection.markAvailable();
    pool.emit(ConnectionPool.CONNECTION_READY, new ConnectionReadyEvent(pool, connection));

    // if a callback has been provided, check out the connection immediately
    if (typeof callback === 'function') {
      callback(undefined, connection);
      return;
    }

    // otherwise add it to the pool for later acquisition, and try to process the wait queue
    pool[kConnections].push(connection);
    process.nextTick(processWaitQueue, pool);
  });
}

function destroyConnection(pool: ConnectionPool, connection: Connection, reason: string) {
  pool.emit(ConnectionPool.CONNECTION_CLOSED, new ConnectionClosedEvent(pool, connection, reason));

  // allow more connections to be created
  pool[kPermits]++;

  // destroy the connection
  process.nextTick(() => connection.destroy());
}

function processWaitQueue(pool: ConnectionPool) {
  if (pool.closed || pool[kProcessingWaitQueue]) {
    return;
  }

  pool[kProcessingWaitQueue] = true;
  while (pool.waitQueueSize) {
    const waitQueueMember = pool[kWaitQueue].peekFront();
    if (!waitQueueMember) {
      pool[kWaitQueue].shift();
      continue;
    }

    if (waitQueueMember[kCancelled]) {
      pool[kWaitQueue].shift();
      continue;
    }

    if (!pool.availableConnectionCount) {
      break;
    }

    const connection = pool[kConnections].shift();
    if (!connection) {
      break;
    }

    const isStale = connectionIsStale(pool, connection);
    const isIdle = connectionIsIdle(pool, connection);
    if (!isStale && !isIdle && !connection.closed) {
      pool.emit(
        ConnectionPool.CONNECTION_CHECKED_OUT,
        new ConnectionCheckedOutEvent(pool, connection)
      );
      if (waitQueueMember.timer) {
        clearTimeout(waitQueueMember.timer);
      }

      pool[kWaitQueue].shift();
      waitQueueMember.callback(undefined, connection);
    } else {
      const reason = connection.closed ? 'error' : isStale ? 'stale' : 'idle';
      destroyConnection(pool, connection, reason);
    }
  }

  const maxPoolSize = pool.options.maxPoolSize;
  if (pool.waitQueueSize && (maxPoolSize <= 0 || pool.totalConnectionCount < maxPoolSize)) {
    createConnection(pool, (err, connection) => {
      const waitQueueMember = pool[kWaitQueue].shift();
      if (!waitQueueMember || waitQueueMember[kCancelled]) {
        if (!err && connection) {
          pool[kConnections].push(connection);
        }

        pool[kProcessingWaitQueue] = false;
        return;
      }

      if (err) {
        pool.emit(
          ConnectionPool.CONNECTION_CHECK_OUT_FAILED,
          new ConnectionCheckOutFailedEvent(pool, err)
        );
      } else if (connection) {
        pool.emit(
          ConnectionPool.CONNECTION_CHECKED_OUT,
          new ConnectionCheckedOutEvent(pool, connection)
        );
      }

      if (waitQueueMember.timer) {
        clearTimeout(waitQueueMember.timer);
      }
      waitQueueMember.callback(err, connection);
      pool[kProcessingWaitQueue] = false;
      process.nextTick(() => processWaitQueue(pool));
    });
  } else {
    pool[kProcessingWaitQueue] = false;
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
