'use strict';

const EventEmitter = require('events').EventEmitter;
const makeCounter = require('../util').makeCounter;
const Connection = require('./connection').CMAPConnection;
const WaitQueue = require('./wait_queue').WaitQueue;
const ConnectionManager = require('./connection_manager').ConnectionManager;

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

const VALID_OPTIONS = [
  'maxPoolSize',
  'minPoolSize',
  'maxIdleTimeMS',
  'waitQueueTimeoutMS',
  'enableConnectionMonitoring'
];

function getSpecOptions(options) {
  const newOptions = VALID_OPTIONS.reduce((obj, key) => {
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

    this.options = getSpecOptions(options);

    const counter = makeCounter(1);
    const connections = new ConnectionManager();
    const waitQueue = new WaitQueue({
      pool: this,
      waitQueueTimeoutMS:
        typeof options.waitQueueTimeoutMS === 'number' ? options.waitQueueTimeoutMS : 0
    });

    this.s = {
      // Wait queue that handles queueing for connections
      waitQueue,

      // Connection Manager that handles state of various connections
      connections,

      // Counter that increments for each new connection.
      counter,

      // Spec mandated fields
      maxPoolSize: typeof options.maxPoolSize === 'number' ? options.maxPoolSize : 100,
      minPoolSize: typeof options.minPoolSize === 'number' ? options.minPoolSize : 0,
      maxIdleTimeMS: typeof options.maxIdleTimeMS === 'number' ? options.maxIdleTimeMS : 0,

      // Allows us to override the Connection constructor for testing purposes
      Connection: options.Connection || Connection,

      // State variables that do not fall into any other category
      pid: process.pid,
      generation: 0,
      isClosed: false,
      address: options.address
    };

    process.nextTick(() => {
      this.emit('connectionPoolCreated', new PoolCreatedEvent(this));
      this._satisfyMinPoolSize();
    });
  }

  // Public API
  checkOut(callback) {
    this.emit('connectionCheckOutStarted', new ConnectionCheckOutStarted(this));

    if (this.s.isClosed) {
      this.emit('connectionCheckOutFailed', new ConnectionCheckOutFailed(this, 'poolClosed'));
      return callback(new PoolClosedError(this));
    }

    const self = this;

    this.s.waitQueue.enter(function() {
      const args = [callback].concat(Array.from(arguments));
      self._acquisitionHandler.apply(self, args);
    });
  }

  checkIn(connection, force, callback) {
    if (typeof force === 'function' && typeof callback !== 'function') {
      callback = force;
      force = false;
    }

    if (!this.s.connections.has(connection)) {
      return callback(new PoolReleaseForeignConnectionError(this, connection));
    }

    const closed = this.s.isClosed;
    const stale = this._connectionIsStale(connection);
    const willDestroy = !!(force || closed || stale);

    // Properly adjust state of connection
    if (!willDestroy) {
      connection.makeReadyToUse();
      this.s.connections.makeAvailable(connection);
    }

    this.emit('connectionCheckedIn', new ConnectionCheckedInEvent(this, connection));

    if (willDestroy) {
      const reason = force ? 'force' : closed ? 'poolClosed' : 'stale';
      this._destroyConnection(connection, reason);
    }

    callback(null);
  }

  clear(callback) {
    this.s.generation += 1;
    this.emit('connectionPoolCleared', new PoolClearedEvent(this));
    callback();
  }

  close(callback) {
    if (this.s.isClosed) {
      return callback();
    }

    this.s.isClosed = true;
    this.s.waitQueue.destroy();
    while (this.availableConnectionCount) {
      this._destroyConnection(this.s.connections.getAvailable(), 'poolClosed');
    }

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
    return this.s.connections.totalConnectionCount;
  }

  get availableConnectionCount() {
    return this.s.connections.availableConnectionCount;
  }

  get address() {
    return this.s.address;
  }

  // Private Helpers
  _acquisitionHandler(callback, err, connection) {
    if (!err) {
      this.s.connections.markInUse(connection);
      this.emit('connectionCheckedOut', new ConnectionCheckedOutEvent(this, connection));
      return callback(null, connection);
    }

    let reason = 'unknown';
    if (err instanceof WaitQueueTimeoutError) {
      reason = 'timeout';
    }

    this.emit('connectionCheckOutFailed', new ConnectionCheckOutFailed(this, reason));
    return callback(err, connection);
  }

  _satisfyMinPoolSize() {
    const minPoolSize = this.s.minPoolSize;
    if (this.totalConnectionCount < minPoolSize) {
      this._createConnection(() => this._satisfyMinPoolSize());
    }
  }

  _propagateError() {
    return;
  }

  _createConnection(callback) {
    const connection = new this.s.Connection({
      id: this.s.counter.next().value,
      generation: this.s.generation,
      maxIdleTimeMS: this.s.maxIdleTimeMS,
      address: this.s.address
    });

    this.s.connections.add(connection);
    this.s.connections.makeAvailable(connection);
    this.emit('connectionCreated', new ConnectionCreatedEvent(this, connection));

    connection.connect(err => {
      if (err) {
        this.s.connections.remove(connection);
        return this._propagateError(err);
      }

      connection.makeReadyToUse();
      this.emit('connectionReady', new ConnectionReadyEvent(this, connection));
    });

    if (callback) {
      callback(null, connection);
    }
  }

  _destroyConnection(connection, reason) {
    this.s.connections.remove(connection);
    this.emit('connectionClosed', new ConnectionClosedEvent(this, connection, reason));
    setTimeout(() => connection.destroy());
  }

  _tryToGetConnection(callback) {
    const maxPoolSize = this.s.maxPoolSize;
    if (this.availableConnectionCount) {
      const connection = this.s.connections.getAvailable();
      const isStale = this._connectionIsStale(connection);
      const isIdle = this._connectionIsIdle(connection);
      if (isStale || isIdle) {
        this._destroyConnection(connection, isStale ? 'stale' : 'idle');
        return setTimeout(() => this._tryToGetConnection(callback));
      }

      return callback(null, connection);
    }

    if (maxPoolSize <= 0 || this.totalConnectionCount < maxPoolSize) {
      return this._createConnection(() => this._tryToGetConnection(callback));
    }

    return callback(null, null);
  }

  _connectionIsStale(connection) {
    return connection.generation !== this.s.generation;
  }

  _connectionIsIdle(connection) {
    return !!(this.s.maxIdleTimeMS && connection.timeIdle() > this.s.maxIdleTimeMS);
  }
}

module.exports = {
  ConnectionPool
};
