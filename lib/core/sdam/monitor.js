'use strict';

const ServerType = require('./common').ServerType;
const calculateDurationInMs = require('../utils').calculateDurationInMs;
const EventEmitter = require('events');
const connect = require('../connection/connect');
const Connection = require('../../cmap/connection').Connection;
const common = require('./common');
const makeStateMachine = require('../utils').makeStateMachine;
const MongoError = require('../error').MongoError;

const sdamEvents = require('./events');
const ServerHeartbeatStartedEvent = sdamEvents.ServerHeartbeatStartedEvent;
const ServerHeartbeatSucceededEvent = sdamEvents.ServerHeartbeatSucceededEvent;
const ServerHeartbeatFailedEvent = sdamEvents.ServerHeartbeatFailedEvent;

const kServer = Symbol('server');
const kMonitorId = Symbol('monitorId');
const kConnection = Symbol('connection');
const kCancellationToken = Symbol('cancellationToken');
const kLastCheckTime = Symbol('lastCheckTime');

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

class Monitor extends EventEmitter {
  constructor(server, options) {
    super(options);

    this[kServer] = server;
    this[kConnection] = undefined;
    this[kCancellationToken] = new EventEmitter();
    this[kCancellationToken].setMaxListeners(Infinity);
    this.s = {
      state: STATE_CLOSED
    };

    this.address = server.description.address;
    this.options = Object.freeze({
      connectTimeoutMS:
        typeof options.connectionTimeout === 'number' ? options.connectionTimeout : 10000,
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
          host: addressParts[0],
          port: parseInt(addressParts[1], 10),
          bson: server.s.bson,
          connectionType: Connection
        },
        server.s.options,

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

    monitorServer(this);
  }

  requestCheck() {
    if (INVALID_REQUEST_CHECK_STATES.has(this.s.state)) {
      return;
    }

    const heartbeatFrequencyMS = this.options.heartbeatFrequencyMS;
    const minHeartbeatFrequencyMS = this.options.minHeartbeatFrequencyMS;
    const remainingTime = heartbeatFrequencyMS - calculateDurationInMs(this[kLastCheckTime]);
    if (remainingTime > minHeartbeatFrequencyMS && this[kMonitorId]) {
      clearTimeout(this[kMonitorId]);
      rescheduleMonitoring(this, minHeartbeatFrequencyMS);
      return;
    }

    if (this[kMonitorId]) {
      clearTimeout(this[kMonitorId]);
    }

    monitorServer(this);
  }

  close() {
    if (this.s.state === STATE_CLOSED || this.s.state === STATE_CLOSING) {
      return;
    }

    stateTransition(this, STATE_CLOSING);
    this[kCancellationToken].emit('cancel');
    if (this[kMonitorId]) {
      clearTimeout(this[kMonitorId]);
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

  monitor.emit('serverHeartbeatStarted', new ServerHeartbeatStartedEvent(monitor.address));

  if (monitor[kConnection] != null) {
    const connectTimeoutMS = monitor.options.connectTimeoutMS;
    monitor[kConnection].command(
      'admin.$cmd',
      { ismaster: true },
      { socketTimeout: connectTimeoutMS },
      (err, isMaster) => {
        if (err) {
          return callback(err);
        }

        return callback(undefined, isMaster);
      }
    );

    return;
  }

  // connecting does an implicit `ismaster`
  connect(monitor.connectOptions, monitor[kCancellationToken], (err, conn) => {
    if (err) {
      monitor[kConnection] = undefined;
      callback(err);
      return;
    }

    if (monitor.s.state === STATE_CLOSING || monitor.s.state === STATE_CLOSED) {
      conn.destroy({ force: true });
      callback(new MongoError('monitor was destroyed'));
      return;
    }

    monitor[kConnection] = conn;
    callback(undefined, conn.description);
  });
}

function monitorServer(monitor) {
  const start = process.hrtime();
  stateTransition(monitor, STATE_MONITORING);

  // TODO: the next line is a legacy event, remove in v4
  process.nextTick(() => monitor.emit('monitoring', monitor[kServer]));

  checkServer(monitor, (err, isMaster) => {
    if (isMaster) {
      successHandler(monitor, start, isMaster);
      return;
    }

    // otherwise an error occured on initial discovery, also bail
    if (monitor[kServer].description.type === ServerType.Unknown) {
      failureHandler(monitor, start, err);
      return;
    }

    // According to the SDAM specification's "Network error during server check" section, if
    // an ismaster call fails we reset the server's pool. If a server was once connected,
    // change its type to `Unknown` only after retrying once.
    monitor.emit('resetConnectionPool');

    checkServer(monitor, (error, isMaster) => {
      if (error) {
        // NOTE: using the _first_ error encountered here
        failureHandler(monitor, start, err);
        return;
      }

      successHandler(monitor, start, isMaster);
    });
  });
}

function rescheduleMonitoring(monitor, ms) {
  const heartbeatFrequencyMS = monitor.options.heartbeatFrequencyMS;
  if (monitor.s.state === STATE_CLOSING || monitor.s.state === STATE_CLOSED) {
    return;
  }

  monitor[kLastCheckTime] = process.hrtime();
  monitor[kMonitorId] = setTimeout(() => {
    monitor[kMonitorId] = undefined;
    monitor.requestCheck();
  }, ms || heartbeatFrequencyMS);

  stateTransition(monitor, STATE_IDLE);
}

function successHandler(monitor, start, isMaster) {
  process.nextTick(() =>
    monitor.emit(
      'serverHeartbeatSucceeded',
      new ServerHeartbeatSucceededEvent(calculateDurationInMs(start), isMaster, monitor.address)
    )
  );

  rescheduleMonitoring(monitor);
}

function failureHandler(monitor, start, err) {
  monitor.emit(
    'serverHeartbeatFailed',
    new ServerHeartbeatFailedEvent(calculateDurationInMs(start), err, monitor.address)
  );

  rescheduleMonitoring(monitor);
}

module.exports = {
  Monitor
};
