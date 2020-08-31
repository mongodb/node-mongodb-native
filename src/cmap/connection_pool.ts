import Denque = require('denque');
import { EventEmitter } from 'events';
import { Logger } from '../logger';
import { Connection, ConnectionOptions } from './connection';
import { connect } from './connect';
import { eachAsync, relayEvents, makeCounter, Callback } from '../utils';
import { MongoError } from '../error';
import { PoolClosedError, WaitQueueTimeoutError } from './errors';
import {
  ConnectionPoolCreatedEvent,
  ConnectionPoolClosedEvent,
  ConnectionCreatedEvent,
  ConnectionReadyEvent,
  ConnectionClosedEvent,
  ConnectionCheckOutStartedEvent,
  ConnectionCheckOutFailedEvent,
  ConnectionCheckedOutEvent,
  ConnectionCheckedInEvent,
  ConnectionPoolClearedEvent
} from './events';
import type { CommandOptions } from './wire_protocol/command';
import type { Document } from '../bson';

const kLogger = Symbol('logger');
const kConnections = Symbol('connections');
const kPermits = Symbol('permits');
const kMinPoolSizeTimer = Symbol('minPoolSizeTimer');
const kGeneration = Symbol('generation');
const kConnectionCounter = Symbol('connectionCounter');
const kCancellationToken = Symbol('cancellationToken');
const kWaitQueue = Symbol('waitQueue');
const kCancelled = Symbol('cancelled');

const VALID_POOL_OPTION_NAMES = [
  // `connect` options
  'ssl',
  'connectionType',
  'monitorCommands',
  'socketTimeout',
  'credentials',
  'compression',

  // node Net options
  'host',
  'port',
  'localAddress',
  'localPort',
  'family',
  'hints',
  'lookup',
  'path',

  // node TLS options
  'ca',
  'cert',
  'sigalgs',
  'ciphers',
  'clientCertEngine',
  'crl',
  'dhparam',
  'ecdhCurve',
  'honorCipherOrder',
  'key',
  'privateKeyEngine',
  'privateKeyIdentifier',
  'maxVersion',
  'minVersion',
  'passphrase',
  'pfx',
  'secureOptions',
  'secureProtocol',
  'sessionIdContext',
  'allowHalfOpen',
  'rejectUnauthorized',
  'pskCallback',
  'ALPNProtocols',
  'servername',
  'checkServerIdentity',
  'session',
  'minDHSize',
  'secureContext',

  // spec options
  'maxPoolSize',
  'minPoolSize',
  'maxIdleTimeMS',
  'waitQueueTimeoutMS'
] as const;

const VALID_POOL_OPTIONS = new Set(VALID_POOL_OPTION_NAMES);

function resolveOptions(
  options: Partial<ConnectionPoolOptions>,
  defaults: Partial<ConnectionPoolOptions>
): Readonly<ConnectionPoolOptions> {
  const newOptions = {};
  for (const key of VALID_POOL_OPTIONS) {
    if (key in options) {
      (newOptions as { [key: string]: unknown })[key] = options[key];
    }
  }

  return Object.freeze(Object.assign({}, defaults, newOptions)) as ConnectionPoolOptions;
}

/** @public */
export interface ConnectionPoolOptions extends ConnectionOptions {
  /** The maximum number of connections that may be associated with a pool at a given time. This includes in use and available connections. */
  maxPoolSize: number;
  /** The minimum number of connections that MUST exist at any moment in a single connection pool. */
  minPoolSize: number;
  /** The maximum amount of time a connection should remain idle in the connection pool before being marked idle. */
  maxIdleTimeMS: number;
  /** The maximum amount of time operation execution should wait for a connection to become available. The default is 0 which means there is no limit. */
  waitQueueTimeoutMS: number;
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

/** @public NOTE: to be removed as part of NODE-2745 */
export interface ConnectionPool {
  isConnected(): boolean;
  write(
    message: any,
    commandOptions: CommandOptions,
    callback: (err: MongoError, ...args: Document[]) => void
  ): void;
}

/** @public A pool of connections which dynamically resizes, and emit events related to pool activity */
export class ConnectionPool extends EventEmitter {
  closed: boolean;
  options: Readonly<ConnectionPoolOptions>;
  [kLogger]: Logger;
  [kConnections]: Denque<Connection>;
  /** An integer expressing how many total connections are permitted */
  [kPermits]: number;
  [kMinPoolSizeTimer]?: NodeJS.Timeout;
  /** An integer representing the SDAM generation of the pool */
  [kGeneration]: number;
  [kConnectionCounter]: Generator<number>;
  [kCancellationToken]: EventEmitter;
  [kWaitQueue]: Denque<WaitQueueMember>;

  /**
   * Emitted when the connection pool is created.
   * @event
   */
  static readonly CONNECTION_POOL_CREATED = 'connectionPoolCreated' as const;
  /**
   * Emitted once when the connection pool is closed
   * @event
   */
  static readonly CONNECTION_POOL_CLOSED = 'connectionPoolClosed' as const;
  /**
   * Emitted when a connection is created.
   * @event
   */
  static readonly CONNECTION_CREATED = 'connectionCreated' as const;
  /**
   * Emitted when a connection becomes established, and is ready to use
   * @event
   */
  static readonly CONNECTION_READY = 'connectionReady' as const;
  /**
   * Emitted when a connection is closed
   * @event
   */
  static readonly CONNECTION_CLOSED = 'connectionClosed' as const;
  /**
   * Emitted when an attempt to check out a connection begins
   * @event
   */
  static readonly CONNECTION_CHECK_OUT_STARTED = 'connectionCheckOutStarted' as const;
  /**
   * Emitted when an attempt to check out a connection fails
   * @event
   */
  static readonly CONNECTION_CHECK_OUT_FAILED = 'connectionCheckOutFailed' as const;
  /**
   * Emitted each time a connection is successfully checked out of the connection pool
   * @event
   */
  static readonly CONNECTION_CHECKED_OUT = 'connectionCheckedOut' as const;
  /**
   * Emitted each time a connection is successfully checked into the connection pool
   * @event
   */
  static readonly CONNECTION_CHECKED_IN = 'connectionCheckedIn' as const;
  /**
   * Emitted each time the connection pool is cleared and it's generation incremented
   * @event
   */
  static readonly CONNECTION_POOL_CLEARED = 'connectionPoolCleared' as const;

  constructor(options: Partial<ConnectionPoolOptions>) {
    super();

    this.closed = false;
    this.options = resolveOptions(options, {
      connectionType: Connection,
      maxPoolSize: options.maxPoolSize ?? 100,
      minPoolSize: options.minPoolSize ?? 0,
      maxIdleTimeMS: options.maxIdleTimeMS ?? 0,
      waitQueueTimeoutMS: options.waitQueueTimeoutMS ?? 0,
      autoEncrypter: options.autoEncrypter,
      metadata: options.metadata
    });

    if (this.options.minPoolSize > this.options.maxPoolSize) {
      throw new TypeError(
        'Connection pool minimum size must not be greater than maximum pool size'
      );
    }

    this[kLogger] = new Logger('ConnectionPool', options);
    this[kConnections] = new Denque();
    this[kPermits] = this.options.maxPoolSize;
    this[kMinPoolSizeTimer] = undefined;
    this[kGeneration] = 0;
    this[kConnectionCounter] = makeCounter(1);
    this[kCancellationToken] = new EventEmitter();
    this[kCancellationToken].setMaxListeners(Infinity);
    this[kWaitQueue] = new Denque();

    process.nextTick(() => {
      this.emit(ConnectionPool.CONNECTION_POOL_CREATED, new ConnectionPoolCreatedEvent(this));
      ensureMinPoolSize(this);
    });
  }

  /** The address of the endpoint the pool is connected to */
  get address(): string {
    return `${this.options.host}:${this.options.port}`;
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

    // add this request to the wait queue
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
        waitQueueMember.callback(new WaitQueueTimeoutError(this));
      }, waitQueueTimeoutMS);
    }

    // place the member at the end of the wait queue
    this[kWaitQueue].push(waitQueueMember);

    // process the wait queue
    processWaitQueue(this);
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

    // Properly adjust state of connection
    if (!willDestroy) {
      connection.markAvailable();
      this[kConnections].push(connection);
    }

    this.emit(ConnectionPool.CONNECTION_CHECKED_IN, new ConnectionCheckedInEvent(this, connection));

    if (willDestroy) {
      const reason = connection.closed ? 'error' : poolClosed ? 'poolClosed' : 'stale';
      destroyConnection(this, connection, reason);
    }

    processWaitQueue(this);
  }

  /**
   * Clear the pool
   *
   * Pool reset is handled by incrementing the pool's generation count. Any existing connection of a
   * previous generation will eventually be pruned during subsequent checkouts.
   */
  clear(): void {
    this[kGeneration] += 1;
    this.emit('connectionPoolCleared', new ConnectionPoolClearedEvent(this));
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
          waitQueueMember.callback(new MongoError('connection pool closed'));
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
   * @param fn - A function which operates on a managed connection
   * @param callback - The original callback
   */
  withConnection(fn: WithConnectionCallback, callback?: Callback<Connection>): void {
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
  return connection.generation !== pool[kGeneration];
}

function connectionIsIdle(pool: ConnectionPool, connection: Connection) {
  return !!(pool.options.maxIdleTimeMS && connection.idleTime > pool.options.maxIdleTimeMS);
}

function createConnection(pool: ConnectionPool, callback?: Callback<Connection>) {
  const connectOptions = Object.assign(
    {
      id: pool[kConnectionCounter].next().value,
      generation: pool[kGeneration]
    },
    pool.options
  );

  pool[kPermits]--;
  connect(connectOptions, pool[kCancellationToken], (err, connection) => {
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
    relayEvents(connection, pool, [
      Connection.COMMAND_STARTED,
      Connection.COMMAND_FAILED,
      Connection.COMMAND_SUCCEEDED,
      Connection.CLUSTER_TIME_RECEIVED
    ]);

    pool.emit(ConnectionPool.CONNECTION_POOL_CREATED, new ConnectionCreatedEvent(pool, connection));

    connection.markAvailable();
    pool.emit(ConnectionPool.CONNECTION_READY, new ConnectionReadyEvent(pool, connection));

    // if a callback has been provided, check out the connection immediately
    if (typeof callback === 'function') {
      callback(undefined, connection);
      return;
    }

    // otherwise add it to the pool for later acquisition, and try to process the wait queue
    pool[kConnections].push(connection);
    processWaitQueue(pool);
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
  if (pool.closed) {
    return;
  }

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
      return waitQueueMember.callback(undefined, connection);
    }

    const reason = connection.closed ? 'error' : isStale ? 'stale' : 'idle';
    destroyConnection(pool, connection, reason);
  }

  const maxPoolSize = pool.options.maxPoolSize;
  if (pool.waitQueueSize && (maxPoolSize <= 0 || pool.totalConnectionCount < maxPoolSize)) {
    createConnection(pool, (err, connection) => {
      const waitQueueMember = pool[kWaitQueue].shift();
      if (!waitQueueMember) {
        if (!err && connection) {
          pool[kConnections].push(connection);
        }

        return;
      }

      if (waitQueueMember[kCancelled]) {
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
    });

    return;
  }
}

/**
 * A callback provided to `withConnection`
 * @public
 *
 * @param error - An error instance representing the error during the execution.
 * @param connection - The managed connection which was checked out of the pool.
 * @param callback - A function to call back after connection management is complete
 */
export type WithConnectionCallback = (
  error: MongoError,
  connection: Connection | undefined,
  callback: Callback<Connection>
) => void;
