'use strict';

const ServerType = require('./common').ServerType;
const EventEmitter = require('events');
const connect = require('../connection/connect');
const Connection = require('../../cmap/connection').Connection;
const common = require('./common');
const makeStateMachine = require('../utils').makeStateMachine;
const MongoNetworkError = require('../error').MongoNetworkError;
const BSON = require('../connection/utils').retrieveBSON();
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
    const connectOptions = Object.assign(
      {
        id: '<monitor>',
        host: server.description.host,
        port: server.description.port,
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

    // ensure encryption is not requested for monitoring
    delete connectOptions.autoEncrypter;

    this.connectOptions = Object.freeze(connectOptions);
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

  reset() {
    const topologyVersion = this[kServer].description.topologyVersion;
    if (isInCloseState(this) || topologyVersion == null) {
      return;
    }

    stateTransition(this, STATE_CLOSING);
    resetMonitorState(this);

    // restart monitor
    stateTransition(this, STATE_IDLE);

    // restart monitoring
    const heartbeatFrequencyMS = this.options.heartbeatFrequencyMS;
    const minHeartbeatFrequencyMS = this.options.minHeartbeatFrequencyMS;
    this[kMonitorId] = makeInterruptableAsyncInterval(monitorServer(this), {
      interval: heartbeatFrequencyMS,
      minInterval: minHeartbeatFrequencyMS
    });
  }

  close() {
    if (isInCloseState(this)) {
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
  if (monitor[kMonitorId]) {
    monitor[kMonitorId].stop();
    monitor[kMonitorId] = null;
  }

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
  let start = now();
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

    const cmd = { ismaster: true };
    const options = { socketTimeout: connectTimeoutMS };

    if (isAwaitable) {
      cmd.maxAwaitTimeMS = maxAwaitTimeMS;
      cmd.topologyVersion = makeTopologyVersion(topologyVersion);
      if (connectTimeoutMS) {
        options.socketTimeout = connectTimeoutMS + maxAwaitTimeMS;
      }
      options.exhaustAllowed = true;
      if (monitor[kRTTPinger] == null) {
        monitor[kRTTPinger] = new RTTPinger(monitor[kCancellationToken], monitor.connectOptions);
      }
    }

    monitor[kConnection].command('admin.$cmd', cmd, options, (err, result) => {
      if (err) {
        failureHandler(err);
        return;
      }

      const isMaster = result.result;
      const rttPinger = monitor[kRTTPinger];

      const duration =
        isAwaitable && rttPinger ? rttPinger.roundTripTime : calculateDurationInMs(start);

      monitor.emit(
        'serverHeartbeatSucceeded',
        new ServerHeartbeatSucceededEvent(duration, isMaster, monitor.address)
      );

      // if we are using the streaming protocol then we immediately issue another `started`
      // event, otherwise the "check" is complete and return to the main monitor loop
      if (isAwaitable && isMaster.topologyVersion) {
        monitor.emit('serverHeartbeatStarted', new ServerHeartbeatStartedEvent(monitor.address));
        start = now();
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
    if (conn && isInCloseState(monitor)) {
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

    checkServer(monitor, (err, isMaster) => {
      if (err) {
        // otherwise an error occured on initial discovery, also bail
        if (monitor[kServer].description.type === ServerType.Unknown) {
          monitor.emit('resetServer', err);
          return done();
        }
      }

      // if the check indicates streaming is supported, immediately reschedule monitoring
      if (isMaster && isMaster.topologyVersion) {
        setTimeout(() => {
          if (!isInCloseState(monitor)) {
            monitor[kMonitorId].wake();
          }
        });
      }

      done();
    });
  };
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
  const start = now();
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
