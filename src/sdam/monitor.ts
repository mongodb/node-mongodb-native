import { clearTimeout, setTimeout } from 'timers';

import { Document, Long } from '../bson';
import { connect } from '../cmap/connect';
import { Connection, ConnectionOptions } from '../cmap/connection';
import { LEGACY_HELLO_COMMAND } from '../constants';
import { MongoError, MongoErrorLabel } from '../error';
import { CancellationToken, TypedEventEmitter } from '../mongo_types';
import type { Callback } from '../utils';
import { calculateDurationInMs, EventEmitterWithState, makeStateMachine, now, ns } from '../utils';
import { ServerType, STATE_CLOSED, STATE_CLOSING } from './common';
import {
  ServerHeartbeatFailedEvent,
  ServerHeartbeatStartedEvent,
  ServerHeartbeatSucceededEvent
} from './events';
import { Server } from './server';
import type { TopologyVersion } from './server_description';

/** @internal */
const kServer = Symbol('server');
/** @internal */
const kMonitorId = Symbol('monitorId');
/** @internal */
const kConnection = Symbol('connection');
/** @internal */
const kCancellationToken = Symbol('cancellationToken');
/** @internal */
const kRTTPinger = Symbol('rttPinger');
/** @internal */
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
export interface MonitorOptions
  extends Omit<ConnectionOptions, 'id' | 'generation' | 'hostAddress'> {
  connectTimeoutMS: number;
  heartbeatFrequencyMS: number;
  minHeartbeatFrequencyMS: number;
}

/** @public */
export type MonitorEvents = {
  serverHeartbeatStarted(event: ServerHeartbeatStartedEvent): void;
  serverHeartbeatSucceeded(event: ServerHeartbeatSucceededEvent): void;
  serverHeartbeatFailed(event: ServerHeartbeatFailedEvent): void;
  resetServer(error?: MongoError): void;
  resetConnectionPool(): void;
  close(): void;
} & EventEmitterWithState;

/** @internal */
export class Monitor extends TypedEventEmitter<MonitorEvents> {
  /** @internal */
  s: MonitorPrivate;
  address: string;
  options: Readonly<
    Pick<MonitorOptions, 'connectTimeoutMS' | 'heartbeatFrequencyMS' | 'minHeartbeatFrequencyMS'>
  >;
  connectOptions: ConnectionOptions;
  [kServer]: Server;
  [kConnection]?: Connection;
  [kCancellationToken]: CancellationToken;
  /** @internal */
  [kMonitorId]?: MonitorInterval;
  [kRTTPinger]?: RTTPinger;

  get connection(): Connection | undefined {
    return this[kConnection];
  }

  constructor(server: Server, options: MonitorOptions) {
    super();

    this[kServer] = server;
    this[kConnection] = undefined;
    this[kCancellationToken] = new CancellationToken();
    this[kCancellationToken].setMaxListeners(Infinity);
    this[kMonitorId] = undefined;
    this.s = {
      state: STATE_CLOSED
    };

    this.address = server.description.address;
    this.options = Object.freeze({
      connectTimeoutMS: options.connectTimeoutMS ?? 10000,
      heartbeatFrequencyMS: options.heartbeatFrequencyMS ?? 10000,
      minHeartbeatFrequencyMS: options.minHeartbeatFrequencyMS ?? 500
    });

    const cancellationToken = this[kCancellationToken];
    // TODO: refactor this to pull it directly from the pool, requires new ConnectionPool integration
    const connectOptions = Object.assign(
      {
        id: '<monitor>' as const,
        generation: server.s.pool.generation,
        connectionType: Connection,
        cancellationToken,
        hostAddress: server.description.hostAddress
      },
      options,
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
    if (connectOptions.autoEncrypter) {
      delete connectOptions.autoEncrypter;
    }

    this.connectOptions = Object.freeze(connectOptions);
  }

  connect(): void {
    if (this.s.state !== STATE_CLOSED) {
      return;
    }

    // start
    const heartbeatFrequencyMS = this.options.heartbeatFrequencyMS;
    const minHeartbeatFrequencyMS = this.options.minHeartbeatFrequencyMS;
    this[kMonitorId] = new MonitorInterval(monitorServer(this), {
      heartbeatFrequencyMS: heartbeatFrequencyMS,
      minHeartbeatFrequencyMS: minHeartbeatFrequencyMS,
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
    this[kMonitorId] = new MonitorInterval(monitorServer(this), {
      heartbeatFrequencyMS: heartbeatFrequencyMS,
      minHeartbeatFrequencyMS: minHeartbeatFrequencyMS
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
  monitor[kMonitorId]?.stop();
  monitor[kMonitorId] = undefined;

  monitor[kRTTPinger]?.close();
  monitor[kRTTPinger] = undefined;

  monitor[kCancellationToken].emit('cancel');

  monitor[kConnection]?.destroy({ force: true });
  monitor[kConnection] = undefined;
}

function checkServer(monitor: Monitor, callback: Callback<Document | null>) {
  let start = now();
  monitor.emit(Server.SERVER_HEARTBEAT_STARTED, new ServerHeartbeatStartedEvent(monitor.address));

  function failureHandler(err: Error) {
    monitor[kConnection]?.destroy({ force: true });
    monitor[kConnection] = undefined;

    monitor.emit(
      Server.SERVER_HEARTBEAT_FAILED,
      new ServerHeartbeatFailedEvent(monitor.address, calculateDurationInMs(start), err)
    );

    const error = !(err instanceof MongoError) ? new MongoError(err) : err;
    error.addErrorLabel(MongoErrorLabel.ResetPool);

    monitor.emit('resetServer', error);
    callback(err);
  }

  const connection = monitor[kConnection];
  if (connection && !connection.closed) {
    const { serverApi, helloOk } = connection;
    const connectTimeoutMS = monitor.options.connectTimeoutMS;
    const maxAwaitTimeMS = monitor.options.heartbeatFrequencyMS;
    const topologyVersion = monitor[kServer].description.topologyVersion;
    const isAwaitable = topologyVersion != null;

    const cmd = {
      [serverApi?.version || helloOk ? 'hello' : LEGACY_HELLO_COMMAND]: true,
      ...(isAwaitable && topologyVersion
        ? { maxAwaitTimeMS, topologyVersion: makeTopologyVersion(topologyVersion) }
        : {})
    };

    const options = isAwaitable
      ? {
          socketTimeoutMS: connectTimeoutMS ? connectTimeoutMS + maxAwaitTimeMS : 0,
          exhaustAllowed: true
        }
      : { socketTimeoutMS: connectTimeoutMS };

    if (isAwaitable && monitor[kRTTPinger] == null) {
      monitor[kRTTPinger] = new RTTPinger(
        monitor[kCancellationToken],
        Object.assign(
          { heartbeatFrequencyMS: monitor.options.heartbeatFrequencyMS },
          monitor.connectOptions
        )
      );
    }

    connection.command(ns('admin.$cmd'), cmd, options, (err, hello) => {
      if (err) {
        return failureHandler(err);
      }

      if (!('isWritablePrimary' in hello)) {
        // Provide hello-style response document.
        hello.isWritablePrimary = hello[LEGACY_HELLO_COMMAND];
      }

      const rttPinger = monitor[kRTTPinger];
      const duration =
        isAwaitable && rttPinger ? rttPinger.roundTripTime : calculateDurationInMs(start);

      monitor.emit(
        Server.SERVER_HEARTBEAT_SUCCEEDED,
        new ServerHeartbeatSucceededEvent(monitor.address, duration, hello)
      );

      // if we are using the streaming protocol then we immediately issue another `started`
      // event, otherwise the "check" is complete and return to the main monitor loop
      if (isAwaitable && hello.topologyVersion) {
        monitor.emit(
          Server.SERVER_HEARTBEAT_STARTED,
          new ServerHeartbeatStartedEvent(monitor.address)
        );
        start = now();
      } else {
        monitor[kRTTPinger]?.close();
        monitor[kRTTPinger] = undefined;

        callback(undefined, hello);
      }
    });

    return;
  }

  // connecting does an implicit `hello`
  connect(monitor.connectOptions, (err, conn) => {
    if (err) {
      monitor[kConnection] = undefined;

      failureHandler(err);
      return;
    }

    if (conn) {
      // Tell the connection that we are using the streaming protocol so that the
      // connection's message stream will only read the last hello on the buffer.
      conn.isMonitoringConnection = true;

      if (isInCloseState(monitor)) {
        conn.destroy({ force: true });
        return;
      }

      monitor[kConnection] = conn;
      monitor.emit(
        Server.SERVER_HEARTBEAT_SUCCEEDED,
        new ServerHeartbeatSucceededEvent(monitor.address, calculateDurationInMs(start), conn.hello)
      );

      callback(undefined, conn.hello);
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

    checkServer(monitor, (err, hello) => {
      if (err) {
        // otherwise an error occurred on initial discovery, also bail
        if (monitor[kServer].description.type === ServerType.Unknown) {
          return done();
        }
      }

      // if the check indicates streaming is supported, immediately reschedule monitoring
      if (hello && hello.topologyVersion) {
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
    // tests mock counter as just number, but in a real situation counter should always be a Long
    // TODO(NODE-2674): Preserve int64 sent from MongoDB
    counter: Long.isLong(tv.counter) ? tv.counter : Long.fromNumber(tv.counter)
  };
}

/** @internal */
export interface RTTPingerOptions extends ConnectionOptions {
  heartbeatFrequencyMS: number;
}

/** @internal */
export class RTTPinger {
  /** @internal */
  [kConnection]?: Connection;
  /** @internal */
  [kCancellationToken]: CancellationToken;
  /** @internal */
  [kRoundTripTime]: number;
  /** @internal */
  [kMonitorId]: NodeJS.Timeout;
  closed: boolean;

  constructor(cancellationToken: CancellationToken, options: RTTPingerOptions) {
    this[kConnection] = undefined;
    this[kCancellationToken] = cancellationToken;
    this[kRoundTripTime] = 0;
    this.closed = false;

    const heartbeatFrequencyMS = options.heartbeatFrequencyMS;
    this[kMonitorId] = setTimeout(() => measureRoundTripTime(this, options), heartbeatFrequencyMS);
  }

  get roundTripTime(): number {
    return this[kRoundTripTime];
  }

  close(): void {
    this.closed = true;
    clearTimeout(this[kMonitorId]);

    this[kConnection]?.destroy({ force: true });
    this[kConnection] = undefined;
  }
}

function measureRoundTripTime(rttPinger: RTTPinger, options: RTTPingerOptions) {
  const start = now();
  options.cancellationToken = rttPinger[kCancellationToken];
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
    connect(options, (err, conn) => {
      if (err) {
        rttPinger[kConnection] = undefined;
        rttPinger[kRoundTripTime] = 0;
        return;
      }

      measureAndReschedule(conn);
    });

    return;
  }

  connection.command(ns('admin.$cmd'), { [LEGACY_HELLO_COMMAND]: 1 }, undefined, err => {
    if (err) {
      rttPinger[kConnection] = undefined;
      rttPinger[kRoundTripTime] = 0;
      return;
    }

    measureAndReschedule();
  });
}

/**
 * @internal
 */
export interface MonitorIntervalOptions {
  /** The interval to execute a method on */
  heartbeatFrequencyMS: number;
  /** A minimum interval that must elapse before the method is called */
  minHeartbeatFrequencyMS: number;
  /** Whether the method should be called immediately when the interval is started  */
  immediate: boolean;

  /**
   * Only used for testing unreliable timer environments
   * @internal
   */
  clock: () => number;
}

/**
 * @internal
 */
export class MonitorInterval {
  fn: (callback: Callback) => void;
  timerId: NodeJS.Timeout | undefined;
  lastCallTime: number;
  isExpeditedCheckScheduled = false;
  stopped = false;

  heartbeatFrequencyMS: number;
  minHeartbeatFrequencyMS: number;
  clock: () => number;

  constructor(fn: (callback: Callback) => void, options: Partial<MonitorIntervalOptions> = {}) {
    this.fn = fn;
    this.lastCallTime = 0;

    this.heartbeatFrequencyMS = options.heartbeatFrequencyMS ?? 1000;
    this.minHeartbeatFrequencyMS = options.minHeartbeatFrequencyMS ?? 500;
    this.clock = typeof options.clock === 'function' ? options.clock : now;

    if (options.immediate) {
      this._executeAndReschedule();
    } else {
      this.lastCallTime = this.clock();
      this._reschedule(undefined);
    }
  }

  wake() {
    const currentTime = this.clock();
    const nextScheduledCallTime = this.lastCallTime + this.heartbeatFrequencyMS;
    const timeUntilNextCall = nextScheduledCallTime - currentTime;

    // For the streaming protocol: there is nothing obviously stopping this
    // interval from being woken up again while we are waiting "infinitely"
    // for `fn` to be called again`. Since the function effectively
    // never completes, the `timeUntilNextCall` will continue to grow
    // negatively unbounded, so it will never trigger a reschedule here.

    // This is possible in virtualized environments like AWS Lambda where our
    // clock is unreliable. In these cases the timer is "running" but never
    // actually completes, so we want to execute immediately and then attempt
    // to reschedule.
    if (timeUntilNextCall < 0) {
      this._executeAndReschedule();
      return;
    }

    // debounce multiple calls to wake within the `minInterval`
    if (this.isExpeditedCheckScheduled) {
      return;
    }

    // reschedule a call as soon as possible, ensuring the call never happens
    // faster than the `minInterval`
    if (timeUntilNextCall > this.minHeartbeatFrequencyMS) {
      this._reschedule(this.minHeartbeatFrequencyMS);
      this.isExpeditedCheckScheduled = true;
    }
  }

  stop() {
    this.stopped = true;
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = undefined;
    }

    this.lastCallTime = 0;
    this.isExpeditedCheckScheduled = false;
  }

  toString() {
    return JSON.stringify(this);
  }

  toJSON() {
    return {
      timerId: this.timerId != null ? 'set' : 'cleared',
      lastCallTime: this.lastCallTime,
      isExpeditedCheckScheduled: this.isExpeditedCheckScheduled,
      stopped: this.stopped,
      heartbeatFrequencyMS: this.heartbeatFrequencyMS,
      minHeartbeatFrequencyMS: this.minHeartbeatFrequencyMS
    };
  }

  private _reschedule(ms?: number) {
    if (this.stopped) return;
    if (this.timerId) {
      clearTimeout(this.timerId);
    }

    this.timerId = setTimeout(this._executeAndReschedule, ms || this.heartbeatFrequencyMS);
  }

  private _executeAndReschedule = () => {
    this.isExpeditedCheckScheduled = false;
    this.lastCallTime = this.clock();

    this.fn(err => {
      if (err) throw err;
      this._reschedule(this.heartbeatFrequencyMS);
    });
  };
}
