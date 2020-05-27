'use strict';

const ServerType = require('./common').ServerType;
const calculateDurationInMs = require('../utils').calculateDurationInMs;
const EventEmitter = require('events');
const connect = require('../connection/connect');
const Connection = require('../../cmap/connection').Connection;
const common = require('./common');
const makeStateMachine = require('../utils').makeStateMachine;
const MongoNetworkError = require('../error').MongoNetworkError;
const BSON = require('../connection/utils').retrieveBSON();

const sdamEvents = require('./events');
const ServerHeartbeatStartedEvent = sdamEvents.ServerHeartbeatStartedEvent;
const ServerHeartbeatSucceededEvent = sdamEvents.ServerHeartbeatSucceededEvent;
const ServerHeartbeatFailedEvent = sdamEvents.ServerHeartbeatFailedEvent;

const kServer = Symbol('server');
const kMonitorId = Symbol('monitorId');
const kConnection = Symbol('connection');
const kCancellationToken = Symbol('cancellationToken');
const kLastCheckTime = Symbol('lastCheckTime');
const kRTTPinger = Symbol('rttPinger');
const kRoundTripTime = Symbol('roundTripTime');

const STATE_CLOSED = common.STATE_CLOSED;
const STATE_CLOSING = common.STATE_CLOSING;
const STATE_IDLE = 'idle';
const STATE_MONITORING = 'monitoring';
const stateTransition = makeStateMachine({
  [STATE_CLOSING]: [STATE_CLOSING, STATE_IDLE, STATE_CLOSED],
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
    const connectOptions = Object.assign(
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
    );

    // ensure no authentication is used for monitoring
    delete connectOptions.credentials;
    this.connectOptions = Object.freeze(connectOptions);
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
      this[kMonitorId] = undefined;

      rescheduleMonitoring(this, minHeartbeatFrequencyMS);
      return;
    }

    clearTimeout(this[kMonitorId]);
    this[kMonitorId] = undefined;

    monitorServer(this);
  }

  reset() {
    if (this.s.state === STATE_CLOSED || this.s.state === STATE_CLOSING) {
      return;
    }

    stateTransition(this, STATE_CLOSING);
    resetMonitorState(this);

    // restart monitor
    stateTransition(this, STATE_IDLE);
    const heartbeatFrequencyMS = this.options.heartbeatFrequencyMS;
    this[kMonitorId] = setTimeout(() => this.requestCheck(), heartbeatFrequencyMS);
  }

  close() {
    if (this.s.state === STATE_CLOSED || this.s.state === STATE_CLOSING) {
      return;
    }

    stateTransition(this, STATE_CLOSING);
    resetMonitorState(this);

    // close monitor
    this.emit('close');
    stateTransition(this, STATE_CLOSED);
  }
}

function resetMonitorState(monitor) {
  stateTransition(monitor, STATE_CLOSING);
  if (monitor[kRTTPinger]) {
    monitor[kRTTPinger].close();
    monitor[kRTTPinger] = undefined;
  }

  monitor[kCancellationToken].emit('cancel');
  if (monitor[kMonitorId]) {
    clearTimeout(monitor[kMonitorId]);
    monitor[kMonitorId] = undefined;
  }

  if (monitor[kConnection]) {
    monitor[kConnection].destroy({ force: true });
  }
}

function checkServer(monitor, callback) {
  let start = process.hrtime();
  monitor.emit('serverHeartbeatStarted', new ServerHeartbeatStartedEvent(monitor.address));

  function failureHandler(err) {
    if (monitor[kConnection]) {
      monitor[kConnection].destroy({ force: true });
      monitor[kConnection] = undefined;
    }

    monitor.emit(
      'serverHeartbeatFailed',
      new ServerHeartbeatFailedEvent(calculateDurationInMs(start), err, monitor.address)
    );

    monitor.emit('resetServer', err);
    monitor.emit('resetConnectionPool');
    callback(err);
  }

  if (monitor[kConnection] != null && !monitor[kConnection].closed) {
    const connectTimeoutMS = monitor.options.connectTimeoutMS;
    const maxAwaitTimeMS = monitor.options.heartbeatFrequencyMS;
    const topologyVersion = monitor[kServer].description.topologyVersion;
    const isAwaitable = topologyVersion != null;

    const cmd = isAwaitable
      ? { ismaster: true, maxAwaitTimeMS, topologyVersion: makeTopologyVersion(topologyVersion) }
      : { ismaster: true };

    const options = isAwaitable
      ? { socketTimeout: connectTimeoutMS + maxAwaitTimeMS, exhaustAllowed: true }
      : { socketTimeout: connectTimeoutMS };

    if (isAwaitable && monitor[kRTTPinger] == null) {
      monitor[kRTTPinger] = new RTTPinger(monitor[kCancellationToken], monitor.connectOptions);
    }

    monitor[kConnection].command('admin.$cmd', cmd, options, (err, result) => {
      if (err) {
        failureHandler(err);
        return;
      }

      const isMaster = result.result;
      const duration = isAwaitable
        ? monitor[kRTTPinger].roundTripTime
        : calculateDurationInMs(start);

      monitor.emit(
        'serverHeartbeatSucceeded',
        new ServerHeartbeatSucceededEvent(duration, isMaster, monitor.address)
      );

      // if we are streaming ismaster responses then we immediately issue another started
      // event, otherwise the "check" is complete and return to the main monitor loop
      if (isAwaitable && isMaster.topologyVersion) {
        monitor.emit('serverHeartbeatStarted', new ServerHeartbeatStartedEvent(monitor.address));
        start = process.hrtime();
      } else {
        if (monitor[kRTTPinger]) {
          monitor[kRTTPinger].close();
          monitor[kRTTPinger] = undefined;
        }

        callback(undefined, isMaster);
      }
    });

    return;
  }

  // connecting does an implicit `ismaster`
  connect(monitor.connectOptions, monitor[kCancellationToken], (err, conn) => {
    if (conn && (monitor.s.state === STATE_CLOSED || monitor.s.state === STATE_CLOSING)) {
      conn.destroy({ force: true });
      return;
    }

    if (err) {
      monitor[kConnection] = undefined;

      // we already reset the connection pool on network errors in all cases
      if (!(err instanceof MongoNetworkError)) {
        monitor.emit('resetConnectionPool');
      }

      failureHandler(err);
      return;
    }

    monitor[kConnection] = conn;
    monitor.emit(
      'serverHeartbeatSucceeded',
      new ServerHeartbeatSucceededEvent(
        calculateDurationInMs(start),
        conn.ismaster,
        monitor.address
      )
    );

    callback(undefined, conn.ismaster);
  });
}

function monitorServer(monitor) {
  stateTransition(monitor, STATE_MONITORING);

  // TODO: the next line is a legacy event, remove in v4
  process.nextTick(() => monitor.emit('monitoring', monitor[kServer]));

  const heartbeatFrequencyMS = monitor.options.heartbeatFrequencyMS;
  checkServer(monitor, (err, isMaster) => {
    if (err) {
      if (monitor[kServer].description.type !== ServerType.Unknown) {
        rescheduleMonitoring(monitor);
        return;
      }
    }

    // if the check indicates streaming is supported, immediately reschedule monitoring
    if (isMaster && isMaster.topologyVersion) {
      rescheduleMonitoring(monitor);
      return;
    }

    rescheduleMonitoring(monitor, heartbeatFrequencyMS);
  });
}

function rescheduleMonitoring(monitor, ms) {
  if (monitor.s.state === STATE_CLOSING || monitor.s.state === STATE_CLOSED) {
    return;
  }

  stateTransition(monitor, STATE_IDLE);
  if (monitor[kMonitorId]) {
    clearTimeout(monitor[kMonitorId]);
    monitor[kMonitorId] = undefined;
  }

  monitor[kLastCheckTime] = process.hrtime();
  monitor[kMonitorId] = setTimeout(() => {
    monitor[kMonitorId] = undefined;
    monitor.requestCheck();
  }, ms);
}

function makeTopologyVersion(tv) {
  return {
    processId: tv.processId,
    counter: BSON.Long.fromNumber(tv.counter)
  };
}

class RTTPinger {
  constructor(cancellationToken, options) {
    this[kConnection] = null;
    this[kCancellationToken] = cancellationToken;
    this[kRoundTripTime] = 0;
    this.closed = false;

    const heartbeatFrequencyMS = options.heartbeatFrequencyMS;
    this[kMonitorId] = setTimeout(() => measureRoundTripTime(this, options), heartbeatFrequencyMS);
  }

  get roundTripTime() {
    return this[kRoundTripTime];
  }

  close() {
    this.closed = true;

    clearTimeout(this[kMonitorId]);
    this[kMonitorId] = undefined;

    if (this[kConnection]) {
      this[kConnection].destroy({ force: true });
    }
  }
}

function measureRoundTripTime(rttPinger, options) {
  const start = process.hrtime();
  const cancellationToken = rttPinger[kCancellationToken];
  const heartbeatFrequencyMS = options.heartbeatFrequencyMS;
  if (rttPinger.closed) {
    return;
  }

  function measureAndReschedule(conn) {
    if (rttPinger.closed) {
      conn.destroy({ force: true });
      return;
    }

    if (rttPinger[kConnection] == null) {
      rttPinger[kConnection] = conn;
    }

    rttPinger[kRoundTripTime] = calculateDurationInMs(start);
    rttPinger[kMonitorId] = setTimeout(
      () => measureRoundTripTime(rttPinger, options),
      heartbeatFrequencyMS
    );
  }

  if (rttPinger[kConnection] == null) {
    connect(options, cancellationToken, (err, conn) => {
      if (err) {
        rttPinger[kConnection] = undefined;
        rttPinger[kRoundTripTime] = 0;
        return;
      }

      measureAndReschedule(conn);
    });

    return;
  }

  rttPinger[kConnection].command('admin.$cmd', { ismaster: 1 }, err => {
    if (err) {
      rttPinger[kConnection] = undefined;
      rttPinger[kRoundTripTime] = 0;
      return;
    }

    measureAndReschedule();
  });
}

module.exports = {
  Monitor
};
