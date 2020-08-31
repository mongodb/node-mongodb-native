import { ServerType, STATE_CLOSED, STATE_CLOSING } from './common';
import {
  now,
  makeStateMachine,
  calculateDurationInMs,
  makeInterruptableAsyncInterval
} from '../utils';
import { EventEmitter } from 'events';
import { connect } from '../cmap/connect';
import { Connection } from '../cmap/connection';
import { MongoNetworkError, AnyError } from '../error';
import { Long, Document } from '../bson';
import {
  ServerHeartbeatStartedEvent,
  ServerHeartbeatSucceededEvent,
  ServerHeartbeatFailedEvent
} from './events';

import { Server } from './server';
import type { InterruptableAsyncInterval, Callback } from '../utils';
import type { TopologyVersion } from './server_description';
import type { ConnectionOptions } from '../cmap/connection';

const kServer = Symbol('server');
const kMonitorId = Symbol('monitorId');
const kConnection = Symbol('connection');
const kCancellationToken = Symbol('cancellationToken');
const kRTTPinger = Symbol('rttPinger');
const kRoundTripTime = Symbol('roundTripTime');

const STATE_IDLE = 'idle';
const STATE_MONITORING = 'monitoring';
const stateTransition = makeStateMachine({
  [STATE_CLOSING]: [STATE_CLOSING, STATE_IDLE, STATE_CLOSED],
  [STATE_CLOSED]: [STATE_CLOSED, STATE_MONITORING],
  [STATE_IDLE]: [STATE_IDLE, STATE_MONITORING, STATE_CLOSING],
  [STATE_MONITORING]: [STATE_MONITORING, STATE_IDLE, STATE_CLOSING]
});

const INVALID_REQUEST_CHECK_STATES = new Set([STATE_CLOSING, STATE_CLOSED, STATE_MONITORING]);
function isInCloseState(monitor: Monitor) {
  return monitor.s.state === STATE_CLOSED || monitor.s.state === STATE_CLOSING;
}

/** @internal */
export interface MonitorPrivate {
  state: string;
}

/** @public */
export interface MonitorOptions {
  connectTimeoutMS: number;
  heartbeatFrequencyMS: number;
  minHeartbeatFrequencyMS: number;
}

/** @public */
export class Monitor extends EventEmitter {
  /** @internal */
  s: MonitorPrivate;
  address: string;
  options: MonitorOptions;
  connectOptions: ConnectionOptions;
  [kServer]: Server;
  [kConnection]?: Connection;
  [kCancellationToken]: EventEmitter;
  [kMonitorId]?: InterruptableAsyncInterval;
  [kRTTPinger]?: RTTPinger;

  constructor(server: Server, options?: Partial<MonitorOptions>) {
    super();

    this[kServer] = server;
    this[kConnection] = undefined;
    this[kCancellationToken] = new EventEmitter();
    this[kCancellationToken].setMaxListeners(Infinity);
    this[kMonitorId] = undefined;
    this.s = {
      state: STATE_CLOSED
    };

    this.address = server.description.address;
    this.options = Object.freeze({
      connectTimeoutMS:
        typeof options?.connectTimeoutMS === 'number' ? options.connectTimeoutMS : 10000,
      heartbeatFrequencyMS:
        typeof options?.heartbeatFrequencyMS === 'number' ? options.heartbeatFrequencyMS : 10000,
      minHeartbeatFrequencyMS:
        typeof options?.minHeartbeatFrequencyMS === 'number' ? options.minHeartbeatFrequencyMS : 500
    });

    // TODO: refactor this to pull it directly from the pool, requires new ConnectionPool integration
    const connectOptions = Object.assign(
      {
        id: '<monitor>',
        host: server.description.host,
        port: server.description.port,
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

  connect(): void {
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

  requestCheck(): void {
    if (INVALID_REQUEST_CHECK_STATES.has(this.s.state)) {
      return;
    }

    this[kMonitorId]?.wake();
  }

  reset(): void {
    if (isInCloseState(this)) {
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

  close(): void {
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

function resetMonitorState(monitor: Monitor) {
  stateTransition(monitor, STATE_CLOSING);
  monitor[kMonitorId]?.stop();
  monitor[kMonitorId] = undefined;

  monitor[kRTTPinger]?.close();
  monitor[kRTTPinger] = undefined;

  monitor[kCancellationToken].emit('cancel');

  monitor[kConnection]?.destroy({ force: true });
  monitor[kConnection] = undefined;
}

function checkServer(monitor: Monitor, callback: Callback<Document>) {
  let start = now();
  monitor.emit(Server.SERVER_HEARTBEAT_STARTED, new ServerHeartbeatStartedEvent(monitor.address));

  function failureHandler(err: AnyError) {
    monitor[kConnection]?.destroy({ force: true });
    monitor[kConnection] = undefined;

    monitor.emit(
      Server.SERVER_HEARTBEAT_FAILED,
      new ServerHeartbeatFailedEvent(monitor.address, calculateDurationInMs(start), err)
    );

    monitor.emit('resetServer', err);
    monitor.emit('resetConnectionPool');
    callback(err);
  }

  const connection = monitor[kConnection];
  if (connection && !connection.closed) {
    const connectTimeoutMS = monitor.options.connectTimeoutMS;
    const maxAwaitTimeMS = monitor.options.heartbeatFrequencyMS;
    const topologyVersion = monitor[kServer].description.topologyVersion;
    const isAwaitable = topologyVersion != null;

    const cmd =
      isAwaitable && topologyVersion
        ? { ismaster: true, maxAwaitTimeMS, topologyVersion: makeTopologyVersion(topologyVersion) }
        : { ismaster: true };

    const options = isAwaitable
      ? { socketTimeout: connectTimeoutMS + maxAwaitTimeMS, exhaustAllowed: true }
      : { socketTimeout: connectTimeoutMS };

    if (isAwaitable && monitor[kRTTPinger] == null) {
      monitor[kRTTPinger] = new RTTPinger(
        monitor[kCancellationToken],
        Object.assign(
          { heartbeatFrequencyMS: monitor.options.heartbeatFrequencyMS },
          monitor.connectOptions
        )
      );
    }

    connection.command('admin.$cmd', cmd, options, (err, isMaster) => {
      if (err) {
        failureHandler(err);
        return;
      }

      const rttPinger = monitor[kRTTPinger];
      const duration =
        isAwaitable && rttPinger ? rttPinger.roundTripTime : calculateDurationInMs(start);

      monitor.emit(
        Server.SERVER_HEARTBEAT_SUCCEEDED,
        new ServerHeartbeatSucceededEvent(monitor.address, duration, isMaster)
      );

      // if we are using the streaming protocol then we immediately issue another `started`
      // event, otherwise the "check" is complete and return to the main monitor loop
      if (isAwaitable && isMaster.topologyVersion) {
        monitor.emit(
          Server.SERVER_HEARTBEAT_STARTED,
          new ServerHeartbeatStartedEvent(monitor.address)
        );
        start = now();
      } else {
        monitor[kRTTPinger]?.close();
        monitor[kRTTPinger] = undefined;

        callback(undefined, isMaster);
      }
    });

    return;
  }

  // connecting does an implicit `ismaster`
  connect(monitor.connectOptions, monitor[kCancellationToken], (err, conn) => {
    if (err) {
      monitor[kConnection] = undefined;

      // we already reset the connection pool on network errors in all cases
      if (!(err instanceof MongoNetworkError)) {
        monitor.emit('resetConnectionPool');
      }

      failureHandler(err);
      return;
    }

    if (conn) {
      if (isInCloseState(monitor)) {
        conn.destroy({ force: true });
        return;
      }

      monitor[kConnection] = conn;
      monitor.emit(
        Server.SERVER_HEARTBEAT_SUCCEEDED,
        new ServerHeartbeatSucceededEvent(
          monitor.address,
          calculateDurationInMs(start),
          conn.ismaster
        )
      );

      callback(undefined, conn.ismaster);
    }
  });
}

function monitorServer(monitor: Monitor) {
  return (callback: Callback) => {
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
        // otherwise an error occurred on initial discovery, also bail
        if (monitor[kServer].description.type === ServerType.Unknown) {
          monitor.emit('resetServer', err);
          return done();
        }
      }

      // if the check indicates streaming is supported, immediately reschedule monitoring
      if (isMaster && isMaster.topologyVersion) {
        setTimeout(() => {
          if (!isInCloseState(monitor)) {
            monitor[kMonitorId]?.wake();
          }
        }, 0);
      }

      done();
    });
  };
}

function makeTopologyVersion(tv: TopologyVersion) {
  return {
    processId: tv.processId,

    // NOTE: The casting here is a bug, `counter` should always be a `Long`
    //       but it was not at the time of typing. Further investigation needed
    counter: Long.fromNumber((tv.counter as unknown) as number)
  };
}

/** @public */
export interface RTTPingerOptions extends ConnectionOptions {
  heartbeatFrequencyMS: number;
}

/** @public */
export class RTTPinger {
  /** @internal */
  [kConnection]?: Connection;
  /** @internal */
  [kCancellationToken]: EventEmitter;
  /** @internal */
  [kRoundTripTime]: number;
  /** @internal */
  [kMonitorId]: NodeJS.Timeout;
  closed: boolean;

  constructor(cancellationToken: EventEmitter, options: RTTPingerOptions) {
    this[kConnection] = undefined;
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

    this[kConnection]?.destroy({ force: true });
    this[kConnection] = undefined;
  }
}

function measureRoundTripTime(rttPinger: RTTPinger, options: RTTPingerOptions) {
  const start = now();
  const cancellationToken = rttPinger[kCancellationToken];
  const heartbeatFrequencyMS = options.heartbeatFrequencyMS;

  if (rttPinger.closed) {
    return;
  }

  function measureAndReschedule(conn?: Connection) {
    if (rttPinger.closed) {
      conn?.destroy({ force: true });
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

  const connection = rttPinger[kConnection];
  if (connection == null) {
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

  connection.command('admin.$cmd', { ismaster: 1 }, err => {
    if (err) {
      rttPinger[kConnection] = undefined;
      rttPinger[kRoundTripTime] = 0;
      return;
    }

    measureAndReschedule();
  });
}
