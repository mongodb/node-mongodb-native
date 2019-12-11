'use strict';

const EventEmitter = require('events').EventEmitter;
const makeCounter = require('../utils').makeCounter;
const Connection = require('./connection').CMAPConnection;
const calculateDurationInMs = require('../core/utils').calculateDurationInMs;

const common = require('../core/sdam/common');
const drainTimerQueue = common.drainTimerQueue;
const clearAndRemoveTimerFrom = common.clearAndRemoveTimerFrom;

const errors = require('./errors');
const PoolClosedError = errors.PoolClosedError;
const WaitQueueTimeoutError = errors.WaitQueueTimeoutError;
const PoolReleaseForeignConnectionError = errors.PoolReleaseForeignConnectionError;

const events = require('./events');
const PoolCreatedEvent = events.PoolCreatedEvent;
const PoolClosedEvent = events.PoolClosedEvent;
const ConnectionCreatedEvent = events.ConnectionCreatedEvent;
const ConnectionReadyEvent = events.ConnectionReadyEvent;
const ConnectionClosedEvent = events.ConnectionClosedEvent;
const ConnectionCheckOutStarted = events.ConnectionCheckOutStarted;
const ConnectionCheckOutFailed = events.ConnectionCheckOutFailed;
const ConnectionCheckedOutEvent = events.ConnectionCheckedOutEvent;
const ConnectionCheckedInEvent = events.ConnectionCheckedInEvent;
const PoolClearedEvent = events.PoolClearedEvent;

const kAvailable = Symbol('available');
const kConnections = Symbol('connections');
const kMinPoolSizeTimer = Symbol('minPoolSizeTimer');
const kAcquireTimers = Symbol('acquireTimers');

const VALID_POOL_OPTIONS = new Set([
  'maxPoolSize',
  'minPoolSize',
  'maxIdleTimeMS',
  'waitQueueTimeoutMS',
  'enableConnectionMonitoring'
]);

function take(set) {
  const connection = set.values().next().value;
  set.delete(connection);
  return connection;
}

function pluckSpecOptions(options) {
  const newOptions = Array.from(VALID_POOL_OPTIONS).reduce((obj, key) => {
    if (options.hasOwnProperty(key)) {
      obj[key] = options[key];
    }

    return obj;
  }, {});

  return Object.freeze(newOptions);
}

class ConnectionPool extends EventEmitter {
  constructor(options) {
    super();
    options = options || {};

    this.options = pluckSpecOptions(options);

    const counter = makeCounter(1);
    this[kConnections] = new Set();
    this[kAvailable] = new Set();
    this[kMinPoolSizeTimer] = undefined;
    this[kAcquireTimers] = new Set();
    this.closed = false;

    this.s = {
      // Counter that increments for each new connection.
      counter,

      // Spec mandated fields
      maxPoolSize: typeof options.maxPoolSize === 'number' ? options.maxPoolSize : 100,
      minPoolSize: typeof options.minPoolSize === 'number' ? options.minPoolSize : 0,
      maxIdleTimeMS: typeof options.maxIdleTimeMS === 'number' ? options.maxIdleTimeMS : 0,
      waitQueueTimeoutMS:
        typeof options.waitQueueTimeoutMS === 'number' ? options.waitQueueTimeoutMS : 10000,

      // Allows us to override the Connection constructor for testing purposes
      Connection: options.Connection || Connection,

      // State variables that do not fall into any other category
      pid: process.pid,
      generation: 0,
      address: options.address
    };

    process.nextTick(() => {
      this.emit('connectionPoolCreated', new PoolCreatedEvent(this));
      ensureMinPoolSize(this);
    });
  }

  // Public API
  checkOut(callback) {
    this.emit('connectionCheckOutStarted', new ConnectionCheckOutStarted(this));

    if (this.closed) {
      this.emit('connectionCheckOutFailed', new ConnectionCheckOutFailed(this, 'poolClosed'));
      callback(new PoolClosedError(this));
      return;
    }

    const pool = this;
    const maxPoolSize = this.s.maxPoolSize;
    const waitQueueTimeoutMS = this.s.waitQueueTimeoutMS;

    function attemptAcquire(start) {
      const duration = calculateDurationInMs(start);
      if (duration >= waitQueueTimeoutMS) {
        callback(new WaitQueueTimeoutError(pool));
        return;
      }

      while (pool.availableConnectionCount > 0) {
        const connection = take(pool[kAvailable]);
        const isStale = connectionIsStale(pool, connection);
        const isIdle = connectionIsIdle(pool, connection);
        if (!isStale && !isIdle) {
          pool.emit('connectionCheckedOut', new ConnectionCheckedOutEvent(pool, connection));
          callback(null, connection);
          return;
        }

        destroyConnection(pool, connection, isStale ? 'stale' : 'idle');
      }

      if (maxPoolSize <= 0 || pool.totalConnectionCount < maxPoolSize) {
        createConnection(pool);
      }

      const retryAcquire = () => {
        pool.removeListener('connectionReady', retryAcquire);
        pool.removeListener('connectionCheckedIn', retryAcquire);

        clearAndRemoveTimerFrom(acquireTimer, pool[kAcquireTimers]);
        attemptAcquire(start);
      };

      const acquireTimer = setTimeout(() => {
        pool.removeListener('connectionReady', retryAcquire);
        pool.removeListener('connectionCheckedIn', retryAcquire);

        pool.emit('connectionCheckOutFailed', new ConnectionCheckOutFailed(pool, 'timeout'));
        callback(new WaitQueueTimeoutError(pool));
      }, waitQueueTimeoutMS - duration);

      pool[kAcquireTimers].add(acquireTimer);
      pool.once('connectionReady', retryAcquire);
      pool.once('connectionCheckedIn', retryAcquire);
    }

    attemptAcquire(process.hrtime());
  }

  checkIn(connection, force, callback) {
    if (typeof force === 'function' && typeof callback !== 'function') {
      callback = force;
      force = false;
    }

    if (!this[kConnections].has(connection)) {
      return callback(new PoolReleaseForeignConnectionError(this, connection));
    }

    const closed = this.closed;
    const stale = connectionIsStale(this, connection);
    const willDestroy = !!(force || closed || stale);

    // Properly adjust state of connection
    if (!willDestroy) {
      connection.makeReadyToUse();
      this[kAvailable].add(connection);
    }

    this.emit('connectionCheckedIn', new ConnectionCheckedInEvent(this, connection));

    if (willDestroy) {
      const reason = force ? 'force' : closed ? 'poolClosed' : 'stale';
      destroyConnection(this, connection, reason);
    }

    callback(null);
  }

  clear(callback) {
    this.s.generation += 1;
    this.emit('connectionPoolCleared', new PoolClearedEvent(this));
    callback();
  }

  close(callback) {
    if (this.closed) {
      return callback();
    }

    drainTimerQueue(this[kAcquireTimers]);
    if (this[kMinPoolSizeTimer]) {
      clearTimeout(this[kMinPoolSizeTimer]);
    }

    this.closed = true;
    this[kAvailable].forEach(conn => {
      destroyConnection(this, conn, 'poolClosed');
    });
    this[kAvailable].clear();

    this.emit('connectionPoolClosed', new PoolClosedEvent(this));
    callback();
  }

  destroy(callback) {
    this.close(() => {
      if (typeof this.s.counter.return === 'function') {
        this.s.counter.return();
      }

      callback();
    });
  }

  // Accessors required by spec
  get totalConnectionCount() {
    return this[kConnections].size;
  }

  get availableConnectionCount() {
    return this[kAvailable].size;
  }

  get address() {
    return this.s.address;
  }

  // Private Helpers
  _propagateError() {
    return;
  }
}

function ensureMinPoolSize(pool) {
  const minPoolSize = pool.s.minPoolSize;
  for (let i = pool.totalConnectionCount; i < minPoolSize; ++i) {
    createConnection(pool);
  }

  pool[kMinPoolSizeTimer] = setTimeout(() => ensureMinPoolSize(pool), 10);
}

function connectionIsStale(pool, connection) {
  return connection.generation !== pool.s.generation;
}

function connectionIsIdle(pool, connection) {
  return !!(pool.s.maxIdleTimeMS && connection.timeIdle() > pool.s.maxIdleTimeMS);
}

function createConnection(pool, callback) {
  const connection = new pool.s.Connection({
    id: pool.s.counter.next().value,
    generation: pool.s.generation,
    maxIdleTimeMS: pool.s.maxIdleTimeMS,
    address: pool.s.address
  });

  pool[kConnections].add(connection);
  pool[kAvailable].add(connection);
  pool.emit('connectionCreated', new ConnectionCreatedEvent(pool, connection));

  connection.connect(err => {
    if (err) {
      pool[kConnections].delete(connection);
      return pool._propagateError(err);
    }

    connection.makeReadyToUse();
    pool.emit('connectionReady', new ConnectionReadyEvent(pool, connection));
  });

  if (callback) {
    callback(null, connection);
  }
}

function destroyConnection(pool, connection, reason) {
  pool[kConnections].delete(connection);
  pool.emit('connectionClosed', new ConnectionClosedEvent(pool, connection, reason));

  process.nextTick(() => connection.destroy());
}

module.exports = {
  ConnectionPool
};
