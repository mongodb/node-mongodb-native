'use strict';

const ServerType = require('./common').ServerType;
const EventEmitter = require('events');
const connect = require('../connection/connect');
const Connection = require('../../cmap/connection').Connection;
const common = require('./common');
const makeStateMachine = require('../utils').makeStateMachine;
const MongoError = require('../error').MongoError;
const makeInterruptableAsyncInterval = require('../../utils').makeInterruptableAsyncInterval;
const calculateDurationInMs = require('../../utils').calculateDurationInMs;
const now = require('../../utils').now;

const sdamEvents = require('./events');
const ServerHeartbeatStartedEvent = sdamEvents.ServerHeartbeatStartedEvent;
const ServerHeartbeatSucceededEvent = sdamEvents.ServerHeartbeatSucceededEvent;
const ServerHeartbeatFailedEvent = sdamEvents.ServerHeartbeatFailedEvent;

const kServer = Symbol('server');
const kMonitorId = Symbol('monitorId');
const kConnection = Symbol('connection');
const kCancellationToken = Symbol('cancellationToken');

const STATE_CLOSED = common.STATE_CLOSED;
const STATE_CLOSING = common.STATE_CLOSING;
const STATE_IDLE = 'idle';
const STATE_MONITORING = 'monitoring';
const stateTransition = makeStateMachine({
  [STATE_CLOSING]: [STATE_CLOSING, STATE_CLOSED],
  [STATE_CLOSED]: [STATE_CLOSED, STATE_MONITORING],
  [STATE_IDLE]: [STATE_IDLE, STATE_MONITORING, STATE_CLOSING],
  [STATE_MONITORING]: [STATE_MONITORING, STATE_IDLE, STATE_CLOSING]
});

const INVALID_REQUEST_CHECK_STATES = new Set([STATE_CLOSING, STATE_CLOSED, STATE_MONITORING]);

function isInCloseState(monitor) {
  return monitor.s.state === STATE_CLOSED || monitor.s.state === STATE_CLOSING;
}

class Monitor extends EventEmitter {
  constructor(server, options) {
    super(options);

    this[kServer] = server;
    this[kConnection] = undefined;
    this[kCancellationToken] = new EventEmitter();
    this[kCancellationToken].setMaxListeners(Infinity);
    this[kMonitorId] = null;
    this.s = {
      state: STATE_CLOSED
    };

    this.address = server.description.address;
    this.options = Object.freeze({
      connectTimeoutMS:
        typeof options.connectionTimeout === 'number'
          ? options.connectionTimeout
          : typeof options.connectTimeoutMS === 'number'
          ? options.connectTimeoutMS
          : 10000,
      heartbeatFrequencyMS:
        typeof options.heartbeatFrequencyMS === 'number' ? options.heartbeatFrequencyMS : 10000,
      minHeartbeatFrequencyMS:
        typeof options.minHeartbeatFrequencyMS === 'number' ? options.minHeartbeatFrequencyMS : 500
    });

    // TODO: refactor this to pull it directly from the pool, requires new ConnectionPool integration
    const addressParts = server.description.address.split(':');
    this.connectOptions = Object.freeze(
      Object.assign(
        {
          id: '<monitor>',
          host: addressParts[0],
          port: parseInt(addressParts[1], 10),
          bson: server.s.bson,
          connectionType: Connection
        },
        server.s.options,
        this.options,

        // force BSON serialization options
        {
          raw: false,
          promoteLongs: true,
          promoteValues: true,
          promoteBuffers: true
        }
      )
    );
  }

  connect() {
    if (this.s.state !== STATE_CLOSED) {
      return;
    }

    // start
    const heartbeatFrequencyMS = this.options.heartbeatFrequencyMS;
    const minHeartbeatFrequencyMS = this.options.minHeartbeatFrequencyMS;
    this[kMonitorId] = makeInterruptableAsyncInterval(monitorServer(this), {
      interval: heartbeatFrequencyMS,
      minInterval: minHeartbeatFrequencyMS,
      immediate: true
    });
  }

  requestCheck() {
    if (INVALID_REQUEST_CHECK_STATES.has(this.s.state)) {
      return;
    }

    this[kMonitorId].wake();
  }

  close() {
    if (isInCloseState(this)) {
      return;
    }

    stateTransition(this, STATE_CLOSING);
    this[kCancellationToken].emit('cancel');
    if (this[kMonitorId]) {
      this[kMonitorId].stop();
      this[kMonitorId] = null;
    }

    if (this[kConnection]) {
      this[kConnection].destroy({ force: true });
    }

    this.emit('close');
    stateTransition(this, STATE_CLOSED);
  }
}

function checkServer(monitor, callback) {
  if (monitor[kConnection] && monitor[kConnection].closed) {
    monitor[kConnection] = undefined;
  }

  const start = now();
  monitor.emit('serverHeartbeatStarted', new ServerHeartbeatStartedEvent(monitor.address));

  function failureHandler(err) {
    monitor.emit(
      'serverHeartbeatFailed',
      new ServerHeartbeatFailedEvent(calculateDurationInMs(start), err, monitor.address)
    );

    callback(err);
  }

  function successHandler(isMaster) {
    monitor.emit(
      'serverHeartbeatSucceeded',
      new ServerHeartbeatSucceededEvent(calculateDurationInMs(start), isMaster, monitor.address)
    );

    return callback(undefined, isMaster);
  }

  if (monitor[kConnection] != null) {
    const connectTimeoutMS = monitor.options.connectTimeoutMS;
    monitor[kConnection].command(
      'admin.$cmd',
      { ismaster: true },
      { socketTimeout: connectTimeoutMS },
      (err, result) => {
        if (err) {
          failureHandler(err);
          return;
        }

        successHandler(result.result);
      }
    );

    return;
  }

  // connecting does an implicit `ismaster`
  connect(monitor.connectOptions, monitor[kCancellationToken], (err, conn) => {
    if (err) {
      monitor[kConnection] = undefined;
      failureHandler(err);
      return;
    }

    if (isInCloseState(monitor)) {
      conn.destroy({ force: true });
      failureHandler(new MongoError('monitor was destroyed'));
      return;
    }

    monitor[kConnection] = conn;
    successHandler(conn.ismaster);
  });
}

function monitorServer(monitor) {
  return callback => {
    stateTransition(monitor, STATE_MONITORING);
    function done() {
      if (!isInCloseState(monitor)) {
        stateTransition(monitor, STATE_IDLE);
      }

      callback();
    }

    // TODO: the next line is a legacy event, remove in v4
    process.nextTick(() => monitor.emit('monitoring', monitor[kServer]));

    checkServer(monitor, e0 => {
      if (e0 == null) {
        return done();
      }

      // otherwise an error occured on initial discovery, also bail
      if (monitor[kServer].description.type === ServerType.Unknown) {
        monitor.emit('resetServer', e0);
        return done();
      }

      // According to the SDAM specification's "Network error during server check" section, if
      // an ismaster call fails we reset the server's pool. If a server was once connected,
      // change its type to `Unknown` only after retrying once.
      monitor.emit('resetConnectionPool');

      checkServer(monitor, e1 => {
        if (e1) {
          monitor.emit('resetServer', e1);
        }

        done();
      });
    });
  };
}

module.exports = {
  Monitor
};
