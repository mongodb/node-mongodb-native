'use strict';

const Denque = require('denque');
const EventEmitter = require('events').EventEmitter;
const makeCounter = require('../utils').makeCounter;
const Connection = require('./connection').Connection;
const calculateDurationInMs = require('../core/utils').calculateDurationInMs;
const eachAsync = require('../core/utils').eachAsync;
const connect = require('../core/connection/connect');

const common = require('../core/sdam/common');
const drainTimerQueue = common.drainTimerQueue;
const clearAndRemoveTimerFrom = common.clearAndRemoveTimerFrom;

const errors = require('./errors');
const PoolClosedError = errors.PoolClosedError;
const WaitQueueTimeoutError = errors.WaitQueueTimeoutError;

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

const kConnections = Symbol('connections');
const kPermits = Symbol('permits');
const kMinPoolSizeTimer = Symbol('minPoolSizeTimer');
const kAcquireTimers = Symbol('acquireTimers');
const kGeneration = Symbol('generation');
const kConnectionCounter = Symbol('connectionCounter');

const VALID_POOL_OPTIONS = new Set([
  // `connect` options
  'host',
  'port',
  'bson',
  'connectionType',

  // spec options
  'maxPoolSize',
  'minPoolSize',
  'maxIdleTimeMS',
  'waitQueueTimeoutMS'
]);

function resolveOptions(options, defaults) {
  const newOptions = Array.from(VALID_POOL_OPTIONS).reduce((obj, key) => {
    if (options.hasOwnProperty(key)) {
      obj[key] = options[key];
    }

    return obj;
  }, {});

  return Object.freeze(Object.assign({}, defaults, newOptions));
}

class ConnectionPool extends EventEmitter {
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
        typeof options.waitQueueTimeoutMS === 'number' ? options.waitQueueTimeoutMS : 10000
    });

    this[kConnections] = new Denque();
    this[kPermits] = this.options.maxPoolSize;
    this[kMinPoolSizeTimer] = undefined;
    this[kAcquireTimers] = new Set();
    this[kGeneration] = 0;
    this[kConnectionCounter] = makeCounter(1);

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
    const maxPoolSize = this.options.maxPoolSize;
    const waitQueueTimeoutMS = this.options.waitQueueTimeoutMS;

    function attemptAcquire(start) {
      const duration = calculateDurationInMs(start);
      if (duration >= waitQueueTimeoutMS) {
        callback(new WaitQueueTimeoutError(pool));
        return;
      }

      while (pool.availableConnectionCount > 0) {
        const connection = pool[kConnections].pop();
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

    const closed = this.closed;
    const stale = connectionIsStale(this, connection);
    const willDestroy = !!(force || closed || stale);

    // Properly adjust state of connection
    if (!willDestroy) {
      connection.makeReadyToUse();
      this[kConnections].push(connection);
    }

    this.emit('connectionCheckedIn', new ConnectionCheckedInEvent(this, connection));

    if (willDestroy) {
      const reason = force ? 'force' : closed ? 'poolClosed' : 'stale';
      destroyConnection(this, connection, reason);
    }

    callback(null);
  }

  clear(callback) {
    this[kGeneration] += 1;
    this.emit('connectionPoolCleared', new PoolClearedEvent(this));
    callback();
  }

  close(options, callback) {
    if (typeof options === 'function') {
      callback = options;
    }

    options = Object.assign({ force: false }, options);
    if (this.closed) {
      return callback();
    }

    drainTimerQueue(this[kAcquireTimers]);
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
        this.emit('connectionPoolClosed', new PoolClosedEvent(this));
        callback(err);
      }
    );
  }

  get totalConnectionCount() {
    return this[kConnections].length + (this.options.maxPoolSize - this[kPermits]);
  }

  get availableConnectionCount() {
    return this[kConnections].length;
  }

  get address() {
    return `${this.options.host}:${this.options.port}`;
  }

  // Private Helpers
  _propagateError() {
    return;
  }
}

function ensureMinPoolSize(pool) {
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
  return !!(pool.options.maxIdleTimeMS && connection.timeIdle() > pool.options.maxIdleTimeMS);
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
  connect(connectOptions, (err, connection) => {
    if (err) {
      pool[kPermits]++;
      pool._propagateError(err);
      if (typeof callback === 'function') {
        callback(err);
      }

      return;
    }

    pool.emit('connectionCreated', new ConnectionCreatedEvent(pool, connection));

    pool[kConnections].push(connection);
    connection.makeReadyToUse();
    pool.emit('connectionReady', new ConnectionReadyEvent(pool, connection));

    if (typeof callback === 'function') {
      callback(null, connection);
    }
  });
}

function destroyConnection(pool, connection, reason) {
  pool.emit('connectionClosed', new ConnectionClosedEvent(pool, connection, reason));
  process.nextTick(() => connection.destroy());
}

module.exports = {
  ConnectionPool
};
