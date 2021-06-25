'use strict';

const Denque = require('denque');
const EventEmitter = require('events').EventEmitter;
const Logger = require('../core/connection/logger');
const makeCounter = require('../utils').makeCounter;
const MongoError = require('../core/error').MongoError;
const Connection = require('./connection').Connection;
const eachAsync = require('../core/utils').eachAsync;
const connect = require('../core/connection/connect');
const relayEvents = require('../core/utils').relayEvents;

const errors = require('./errors');
const PoolClosedError = errors.PoolClosedError;
const WaitQueueTimeoutError = errors.WaitQueueTimeoutError;

const events = require('./events');
const ConnectionPoolCreatedEvent = events.ConnectionPoolCreatedEvent;
const ConnectionPoolClosedEvent = events.ConnectionPoolClosedEvent;
const ConnectionCreatedEvent = events.ConnectionCreatedEvent;
const ConnectionReadyEvent = events.ConnectionReadyEvent;
const ConnectionClosedEvent = events.ConnectionClosedEvent;
const ConnectionCheckOutStartedEvent = events.ConnectionCheckOutStartedEvent;
const ConnectionCheckOutFailedEvent = events.ConnectionCheckOutFailedEvent;
const ConnectionCheckedOutEvent = events.ConnectionCheckedOutEvent;
const ConnectionCheckedInEvent = events.ConnectionCheckedInEvent;
const ConnectionPoolClearedEvent = events.ConnectionPoolClearedEvent;

const kLogger = Symbol('logger');
const kConnections = Symbol('connections');
const kPermits = Symbol('permits');
const kMinPoolSizeTimer = Symbol('minPoolSizeTimer');
const kGeneration = Symbol('generation');
const kConnectionCounter = Symbol('connectionCounter');
const kCancellationToken = Symbol('cancellationToken');
const kWaitQueue = Symbol('waitQueue');
const kCancelled = Symbol('cancelled');

const VALID_POOL_OPTIONS = new Set([
  // `connect` options
  'ssl',
  'bson',
  'connectionType',
  'serverApi',
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
]);

function resolveOptions(options, defaults) {
  const newOptions = Array.from(VALID_POOL_OPTIONS).reduce((obj, key) => {
    if (Object.prototype.hasOwnProperty.call(options, key)) {
      obj[key] = options[key];
    }

    return obj;
  }, {});

  return Object.freeze(Object.assign({}, defaults, newOptions));
}

/**
 * Configuration options for drivers wrapping the node driver.
 *
 * @typedef {Object} ConnectionPoolOptions
 * @property
 * @property {string} [host] The host to connect to
 * @property {number} [port] The port to connect to
 * @property {bson} [bson] The BSON instance to use for new connections
 * @property {number} [maxPoolSize=100] The maximum number of connections that may be associated with a pool at a given time. This includes in use and available connections.
 * @property {number} [minPoolSize=0] The minimum number of connections that MUST exist at any moment in a single connection pool.
 * @property {number} [maxIdleTimeMS] The maximum amount of time a connection should remain idle in the connection pool before being marked idle.
 * @property {number} [waitQueueTimeoutMS=0] The maximum amount of time operation execution should wait for a connection to become available. The default is 0 which means there is no limit.
 */

/**
 * A pool of connections which dynamically resizes, and emit events related to pool activity
 *
 * @property {number} generation An integer representing the SDAM generation of the pool
 * @property {number} totalConnectionCount An integer expressing how many total connections (active + in use) the pool currently has
 * @property {number} availableConnectionCount An integer expressing how many connections are currently available in the pool.
 * @property {string} address The address of the endpoint the pool is connected to
 *
 * @emits ConnectionPool#connectionPoolCreated
 * @emits ConnectionPool#connectionPoolClosed
 * @emits ConnectionPool#connectionCreated
 * @emits ConnectionPool#connectionReady
 * @emits ConnectionPool#connectionClosed
 * @emits ConnectionPool#connectionCheckOutStarted
 * @emits ConnectionPool#connectionCheckOutFailed
 * @emits ConnectionPool#connectionCheckedOut
 * @emits ConnectionPool#connectionCheckedIn
 * @emits ConnectionPool#connectionPoolCleared
 */
class ConnectionPool extends EventEmitter {
  /**
   * Create a new Connection Pool
   *
   * @param {ConnectionPoolOptions} options
   */
  constructor(options) {
    super();
    options = options || {};

    this.closed = false;
    this.options = resolveOptions(options, {
      connectionType: Connection,
      maxPoolSize: typeof options.maxPoolSize === 'number' ? options.maxPoolSize : 100,
      minPoolSize: typeof options.minPoolSize === 'number' ? options.minPoolSize : 0,
      maxIdleTimeMS: typeof options.maxIdleTimeMS === 'number' ? options.maxIdleTimeMS : 0,
      waitQueueTimeoutMS:
        typeof options.waitQueueTimeoutMS === 'number' ? options.waitQueueTimeoutMS : 0,
      autoEncrypter: options.autoEncrypter,
      metadata: options.metadata
    });

    if (options.minSize > options.maxSize) {
      throw new TypeError(
        'Connection pool minimum size must not be greater than maxiumum pool size'
      );
    }

    this[kLogger] = Logger('ConnectionPool', options);
    this[kConnections] = new Denque();
    this[kPermits] = this.options.maxPoolSize;
    this[kMinPoolSizeTimer] = undefined;
    this[kGeneration] = 0;
    this[kConnectionCounter] = makeCounter(1);
    this[kCancellationToken] = new EventEmitter();
    this[kCancellationToken].setMaxListeners(Infinity);
    this[kWaitQueue] = new Denque();

    process.nextTick(() => {
      this.emit('connectionPoolCreated', new ConnectionPoolCreatedEvent(this));
      ensureMinPoolSize(this);
    });
  }

  get address() {
    return `${this.options.host}:${this.options.port}`;
  }

  get generation() {
    return this[kGeneration];
  }

  get totalConnectionCount() {
    return this[kConnections].length + (this.options.maxPoolSize - this[kPermits]);
  }

  get availableConnectionCount() {
    return this[kConnections].length;
  }

  get waitQueueSize() {
    return this[kWaitQueue].length;
  }

  /**
   * Check a connection out of this pool. The connection will continue to be tracked, but no reference to it
   * will be held by the pool. This means that if a connection is checked out it MUST be checked back in or
   * explicitly destroyed by the new owner.
   *
   * @param {ConnectionPool~checkOutCallback} callback
   */
  checkOut(callback) {
    this.emit('connectionCheckOutStarted', new ConnectionCheckOutStartedEvent(this));

    if (this.closed) {
      this.emit('connectionCheckOutFailed', new ConnectionCheckOutFailedEvent(this, 'poolClosed'));
      callback(new PoolClosedError(this));
      return;
    }

    const waitQueueMember = { callback };

    const pool = this;
    const waitQueueTimeoutMS = this.options.waitQueueTimeoutMS;
    if (waitQueueTimeoutMS) {
      waitQueueMember.timer = setTimeout(() => {
        waitQueueMember[kCancelled] = true;
        waitQueueMember.timer = undefined;

        pool.emit('connectionCheckOutFailed', new ConnectionCheckOutFailedEvent(pool, 'timeout'));
        waitQueueMember.callback(new WaitQueueTimeoutError(pool));
      }, waitQueueTimeoutMS);
    }

    this[kWaitQueue].push(waitQueueMember);
    process.nextTick(() => processWaitQueue(this));
  }

  /**
   * Check a connection into the pool.
   *
   * @param {Connection} connection The connection to check in
   */
  checkIn(connection) {
    const poolClosed = this.closed;
    const stale = connectionIsStale(this, connection);
    const willDestroy = !!(poolClosed || stale || connection.closed);

    if (!willDestroy) {
      connection.markAvailable();
      this[kConnections].push(connection);
    }

    this.emit('connectionCheckedIn', new ConnectionCheckedInEvent(this, connection));

    if (willDestroy) {
      const reason = connection.closed ? 'error' : poolClosed ? 'poolClosed' : 'stale';
      destroyConnection(this, connection, reason);
    }

    process.nextTick(() => processWaitQueue(this));
  }

  /**
   * Clear the pool
   *
   * Pool reset is handled by incrementing the pool's generation count. Any existing connection of a
   * previous generation will eventually be pruned during subsequent checkouts.
   */
  clear() {
    this[kGeneration] += 1;
    this.emit('connectionPoolCleared', new ConnectionPoolClearedEvent(this));
  }

  /**
   * Close the pool
   *
   * @param {object} [options] Optional settings
   * @param {boolean} [options.force] Force close connections
   * @param {Function} callback
   */
  close(options, callback) {
    if (typeof options === 'function') {
      callback = options;
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
      clearTimeout(waitQueueMember.timer);
      if (!waitQueueMember[kCancelled]) {
        waitQueueMember.callback(new MongoError('connection pool closed'));
      }
    }

    // clear the min pool size timer
    if (this[kMinPoolSizeTimer]) {
      clearTimeout(this[kMinPoolSizeTimer]);
    }

    // end the connection counter
    if (typeof this[kConnectionCounter].return === 'function') {
      this[kConnectionCounter].return();
    }

    // mark the pool as closed immediately
    this.closed = true;

    eachAsync(
      this[kConnections].toArray(),
      (conn, cb) => {
        this.emit('connectionClosed', new ConnectionClosedEvent(this, conn, 'poolClosed'));
        conn.destroy(options, cb);
      },
      err => {
        this[kConnections].clear();
        this.emit('connectionPoolClosed', new ConnectionPoolClosedEvent(this));
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
   * @param {ConnectionPool~withConnectionCallback} fn A function which operates on a managed connection
   * @param {Function} callback The original callback
   * @return {Promise}
   */
  withConnection(fn, callback) {
    this.checkOut((err, conn) => {
      // don't callback with `err` here, we might want to act upon it inside `fn`

      fn(err, conn, (fnErr, result) => {
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

function ensureMinPoolSize(pool) {
  if (pool.closed || pool.options.minPoolSize === 0) {
    return;
  }

  const minPoolSize = pool.options.minPoolSize;
  for (let i = pool.totalConnectionCount; i < minPoolSize; ++i) {
    createConnection(pool);
  }

  pool[kMinPoolSizeTimer] = setTimeout(() => ensureMinPoolSize(pool), 10);
}

function connectionIsStale(pool, connection) {
  return connection.generation !== pool[kGeneration];
}

function connectionIsIdle(pool, connection) {
  return !!(pool.options.maxIdleTimeMS && connection.idleTime > pool.options.maxIdleTimeMS);
}

function createConnection(pool, callback) {
  const connectOptions = Object.assign(
    {
      id: pool[kConnectionCounter].next().value,
      generation: pool[kGeneration]
    },
    pool.options
  );

  pool[kPermits]--;
  connect(connectOptions, pool[kCancellationToken], (err, connection) => {
    if (err) {
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
      'commandStarted',
      'commandFailed',
      'commandSucceeded',
      'clusterTimeReceived'
    ]);

    pool.emit('connectionCreated', new ConnectionCreatedEvent(pool, connection));

    connection.markAvailable();
    pool.emit('connectionReady', new ConnectionReadyEvent(pool, connection));

    // if a callback has been provided, check out the connection immediately
    if (typeof callback === 'function') {
      callback(undefined, connection);
      return;
    }

    // otherwise add it to the pool for later acquisition, and try to process the wait queue
    pool[kConnections].push(connection);
    process.nextTick(() => processWaitQueue(pool));
  });
}

function destroyConnection(pool, connection, reason) {
  pool.emit('connectionClosed', new ConnectionClosedEvent(pool, connection, reason));

  // allow more connections to be created
  pool[kPermits]++;

  // destroy the connection
  process.nextTick(() => connection.destroy());
}

function processWaitQueue(pool) {
  if (pool.closed) {
    return;
  }

  while (pool.waitQueueSize) {
    const waitQueueMember = pool[kWaitQueue].peekFront();
    if (waitQueueMember[kCancelled]) {
      pool[kWaitQueue].shift();
      continue;
    }

    if (!pool.availableConnectionCount) {
      break;
    }

    const connection = pool[kConnections].shift();
    const isStale = connectionIsStale(pool, connection);
    const isIdle = connectionIsIdle(pool, connection);
    if (!isStale && !isIdle && !connection.closed) {
      pool.emit('connectionCheckedOut', new ConnectionCheckedOutEvent(pool, connection));
      clearTimeout(waitQueueMember.timer);
      pool[kWaitQueue].shift();
      waitQueueMember.callback(undefined, connection);
      return;
    }

    const reason = connection.closed ? 'error' : isStale ? 'stale' : 'idle';
    destroyConnection(pool, connection, reason);
  }

  const maxPoolSize = pool.options.maxPoolSize;
  if (pool.waitQueueSize && (maxPoolSize <= 0 || pool.totalConnectionCount < maxPoolSize)) {
    createConnection(pool, (err, connection) => {
      const waitQueueMember = pool[kWaitQueue].shift();
      if (waitQueueMember == null || waitQueueMember[kCancelled]) {
        if (err == null) {
          pool[kConnections].push(connection);
        }

        return;
      }

      if (err) {
        pool.emit('connectionCheckOutFailed', new ConnectionCheckOutFailedEvent(pool, err));
      } else {
        pool.emit('connectionCheckedOut', new ConnectionCheckedOutEvent(pool, connection));
      }

      clearTimeout(waitQueueMember.timer);
      waitQueueMember.callback(err, connection);
    });

    return;
  }
}

/**
 * A callback provided to `withConnection`
 *
 * @callback ConnectionPool~withConnectionCallback
 * @param {MongoError} error An error instance representing the error during the execution.
 * @param {Connection} connection The managed connection which was checked out of the pool.
 * @param {Function} callback A function to call back after connection management is complete
 */

/**
 * A callback provided to `checkOut`
 *
 * @callback ConnectionPool~checkOutCallback
 * @param {MongoError} error An error instance representing the error during checkout
 * @param {Connection} connection A connection from the pool
 */

/**
 * Emitted once when the connection pool is created
 *
 * @event ConnectionPool#connectionPoolCreated
 * @type {PoolCreatedEvent}
 */

/**
 * Emitted once when the connection pool is closed
 *
 * @event ConnectionPool#connectionPoolClosed
 * @type {PoolClosedEvent}
 */

/**
 * Emitted each time a connection is created
 *
 * @event ConnectionPool#connectionCreated
 * @type {ConnectionCreatedEvent}
 */

/**
 * Emitted when a connection becomes established, and is ready to use
 *
 * @event ConnectionPool#connectionReady
 * @type {ConnectionReadyEvent}
 */

/**
 * Emitted when a connection is closed
 *
 * @event ConnectionPool#connectionClosed
 * @type {ConnectionClosedEvent}
 */

/**
 * Emitted when an attempt to check out a connection begins
 *
 * @event ConnectionPool#connectionCheckOutStarted
 * @type {ConnectionCheckOutStartedEvent}
 */

/**
 * Emitted when an attempt to check out a connection fails
 *
 * @event ConnectionPool#connectionCheckOutFailed
 * @type {ConnectionCheckOutFailedEvent}
 */

/**
 * Emitted each time a connection is successfully checked out of the connection pool
 *
 * @event ConnectionPool#connectionCheckedOut
 * @type {ConnectionCheckedOutEvent}
 */

/**
 * Emitted each time a connection is successfully checked into the connection pool
 *
 * @event ConnectionPool#connectionCheckedIn
 * @type {ConnectionCheckedInEvent}
 */

/**
 * Emitted each time the connection pool is cleared and it's generation incremented
 *
 * @event ConnectionPool#connectionPoolCleared
 * @type {PoolClearedEvent}
 */

module.exports = {
  ConnectionPool
};
