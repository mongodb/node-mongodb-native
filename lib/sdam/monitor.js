"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MonitorInterval = exports.RTTPinger = exports.Monitor = void 0;
const timers_1 = require("timers");
const bson_1 = require("../bson");
const connect_1 = require("../cmap/connect");
const connection_1 = require("../cmap/connection");
const constants_1 = require("../constants");
const error_1 = require("../error");
const mongo_types_1 = require("../mongo_types");
const utils_1 = require("../utils");
const common_1 = require("./common");
const events_1 = require("./events");
const server_1 = require("./server");
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
const stateTransition = (0, utils_1.makeStateMachine)({
    [common_1.STATE_CLOSING]: [common_1.STATE_CLOSING, STATE_IDLE, common_1.STATE_CLOSED],
    [common_1.STATE_CLOSED]: [common_1.STATE_CLOSED, STATE_MONITORING],
    [STATE_IDLE]: [STATE_IDLE, STATE_MONITORING, common_1.STATE_CLOSING],
    [STATE_MONITORING]: [STATE_MONITORING, STATE_IDLE, common_1.STATE_CLOSING]
});
const INVALID_REQUEST_CHECK_STATES = new Set([common_1.STATE_CLOSING, common_1.STATE_CLOSED, STATE_MONITORING]);
function isInCloseState(monitor) {
    return monitor.s.state === common_1.STATE_CLOSED || monitor.s.state === common_1.STATE_CLOSING;
}
/** @internal */
class Monitor extends mongo_types_1.TypedEventEmitter {
    constructor(server, options) {
        var _a, _b, _c;
        super();
        this[kServer] = server;
        this[kConnection] = undefined;
        this[kCancellationToken] = new mongo_types_1.CancellationToken();
        this[kCancellationToken].setMaxListeners(Infinity);
        this[kMonitorId] = undefined;
        this.s = {
            state: common_1.STATE_CLOSED
        };
        this.address = server.description.address;
        this.options = Object.freeze({
            connectTimeoutMS: (_a = options.connectTimeoutMS) !== null && _a !== void 0 ? _a : 10000,
            heartbeatFrequencyMS: (_b = options.heartbeatFrequencyMS) !== null && _b !== void 0 ? _b : 10000,
            minHeartbeatFrequencyMS: (_c = options.minHeartbeatFrequencyMS) !== null && _c !== void 0 ? _c : 500
        });
        const cancellationToken = this[kCancellationToken];
        // TODO: refactor this to pull it directly from the pool, requires new ConnectionPool integration
        const connectOptions = Object.assign({
            id: '<monitor>',
            generation: server.s.pool.generation,
            connectionType: connection_1.Connection,
            cancellationToken,
            hostAddress: server.description.hostAddress
        }, options, 
        // force BSON serialization options
        {
            raw: false,
            promoteLongs: true,
            promoteValues: true,
            promoteBuffers: true
        });
        // ensure no authentication is used for monitoring
        delete connectOptions.credentials;
        if (connectOptions.autoEncrypter) {
            delete connectOptions.autoEncrypter;
        }
        this.connectOptions = Object.freeze(connectOptions);
    }
    get connection() {
        return this[kConnection];
    }
    connect() {
        if (this.s.state !== common_1.STATE_CLOSED) {
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
    requestCheck() {
        var _a;
        if (INVALID_REQUEST_CHECK_STATES.has(this.s.state)) {
            return;
        }
        (_a = this[kMonitorId]) === null || _a === void 0 ? void 0 : _a.wake();
    }
    reset() {
        const topologyVersion = this[kServer].description.topologyVersion;
        if (isInCloseState(this) || topologyVersion == null) {
            return;
        }
        stateTransition(this, common_1.STATE_CLOSING);
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
    close() {
        if (isInCloseState(this)) {
            return;
        }
        stateTransition(this, common_1.STATE_CLOSING);
        resetMonitorState(this);
        // close monitor
        this.emit('close');
        stateTransition(this, common_1.STATE_CLOSED);
    }
}
exports.Monitor = Monitor;
function resetMonitorState(monitor) {
    var _a, _b, _c;
    (_a = monitor[kMonitorId]) === null || _a === void 0 ? void 0 : _a.stop();
    monitor[kMonitorId] = undefined;
    (_b = monitor[kRTTPinger]) === null || _b === void 0 ? void 0 : _b.close();
    monitor[kRTTPinger] = undefined;
    monitor[kCancellationToken].emit('cancel');
    (_c = monitor[kConnection]) === null || _c === void 0 ? void 0 : _c.destroy({ force: true });
    monitor[kConnection] = undefined;
}
function checkServer(monitor, callback) {
    let start = (0, utils_1.now)();
    monitor.emit(server_1.Server.SERVER_HEARTBEAT_STARTED, new events_1.ServerHeartbeatStartedEvent(monitor.address));
    function failureHandler(err) {
        var _a;
        (_a = monitor[kConnection]) === null || _a === void 0 ? void 0 : _a.destroy({ force: true });
        monitor[kConnection] = undefined;
        monitor.emit(server_1.Server.SERVER_HEARTBEAT_FAILED, new events_1.ServerHeartbeatFailedEvent(monitor.address, (0, utils_1.calculateDurationInMs)(start), err));
        const error = !(err instanceof error_1.MongoError) ? new error_1.MongoError(err) : err;
        error.addErrorLabel(error_1.MongoErrorLabel.ResetPool);
        if (error instanceof error_1.MongoNetworkTimeoutError) {
            error.addErrorLabel(error_1.MongoErrorLabel.InterruptInUseConnections);
        }
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
            [(serverApi === null || serverApi === void 0 ? void 0 : serverApi.version) || helloOk ? 'hello' : constants_1.LEGACY_HELLO_COMMAND]: true,
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
            monitor[kRTTPinger] = new RTTPinger(monitor[kCancellationToken], Object.assign({ heartbeatFrequencyMS: monitor.options.heartbeatFrequencyMS }, monitor.connectOptions));
        }
        connection.command((0, utils_1.ns)('admin.$cmd'), cmd, options, (err, hello) => {
            var _a;
            if (err) {
                return failureHandler(err);
            }
            if (!('isWritablePrimary' in hello)) {
                // Provide hello-style response document.
                hello.isWritablePrimary = hello[constants_1.LEGACY_HELLO_COMMAND];
            }
            const rttPinger = monitor[kRTTPinger];
            const duration = isAwaitable && rttPinger ? rttPinger.roundTripTime : (0, utils_1.calculateDurationInMs)(start);
            monitor.emit(server_1.Server.SERVER_HEARTBEAT_SUCCEEDED, new events_1.ServerHeartbeatSucceededEvent(monitor.address, duration, hello));
            // if we are using the streaming protocol then we immediately issue another `started`
            // event, otherwise the "check" is complete and return to the main monitor loop
            if (isAwaitable && hello.topologyVersion) {
                monitor.emit(server_1.Server.SERVER_HEARTBEAT_STARTED, new events_1.ServerHeartbeatStartedEvent(monitor.address));
                start = (0, utils_1.now)();
            }
            else {
                (_a = monitor[kRTTPinger]) === null || _a === void 0 ? void 0 : _a.close();
                monitor[kRTTPinger] = undefined;
                callback(undefined, hello);
            }
        });
        return;
    }
    // connecting does an implicit `hello`
    (0, connect_1.connect)(monitor.connectOptions, (err, conn) => {
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
            monitor.emit(server_1.Server.SERVER_HEARTBEAT_SUCCEEDED, new events_1.ServerHeartbeatSucceededEvent(monitor.address, (0, utils_1.calculateDurationInMs)(start), conn.hello));
            callback(undefined, conn.hello);
        }
    });
}
function monitorServer(monitor) {
    return (callback) => {
        if (monitor.s.state === STATE_MONITORING) {
            process.nextTick(callback);
            return;
        }
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
                if (monitor[kServer].description.type === common_1.ServerType.Unknown) {
                    return done();
                }
            }
            // if the check indicates streaming is supported, immediately reschedule monitoring
            if (hello && hello.topologyVersion) {
                (0, timers_1.setTimeout)(() => {
                    var _a;
                    if (!isInCloseState(monitor)) {
                        (_a = monitor[kMonitorId]) === null || _a === void 0 ? void 0 : _a.wake();
                    }
                }, 0);
            }
            done();
        });
    };
}
function makeTopologyVersion(tv) {
    return {
        processId: tv.processId,
        // tests mock counter as just number, but in a real situation counter should always be a Long
        // TODO(NODE-2674): Preserve int64 sent from MongoDB
        counter: bson_1.Long.isLong(tv.counter) ? tv.counter : bson_1.Long.fromNumber(tv.counter)
    };
}
/** @internal */
class RTTPinger {
    constructor(cancellationToken, options) {
        this[kConnection] = undefined;
        this[kCancellationToken] = cancellationToken;
        this[kRoundTripTime] = 0;
        this.closed = false;
        const heartbeatFrequencyMS = options.heartbeatFrequencyMS;
        this[kMonitorId] = (0, timers_1.setTimeout)(() => measureRoundTripTime(this, options), heartbeatFrequencyMS);
    }
    get roundTripTime() {
        return this[kRoundTripTime];
    }
    close() {
        var _a;
        this.closed = true;
        (0, timers_1.clearTimeout)(this[kMonitorId]);
        (_a = this[kConnection]) === null || _a === void 0 ? void 0 : _a.destroy({ force: true });
        this[kConnection] = undefined;
    }
}
exports.RTTPinger = RTTPinger;
function measureRoundTripTime(rttPinger, options) {
    const start = (0, utils_1.now)();
    options.cancellationToken = rttPinger[kCancellationToken];
    const heartbeatFrequencyMS = options.heartbeatFrequencyMS;
    if (rttPinger.closed) {
        return;
    }
    function measureAndReschedule(conn) {
        if (rttPinger.closed) {
            conn === null || conn === void 0 ? void 0 : conn.destroy({ force: true });
            return;
        }
        if (rttPinger[kConnection] == null) {
            rttPinger[kConnection] = conn;
        }
        rttPinger[kRoundTripTime] = (0, utils_1.calculateDurationInMs)(start);
        rttPinger[kMonitorId] = (0, timers_1.setTimeout)(() => measureRoundTripTime(rttPinger, options), heartbeatFrequencyMS);
    }
    const connection = rttPinger[kConnection];
    if (connection == null) {
        (0, connect_1.connect)(options, (err, conn) => {
            if (err) {
                rttPinger[kConnection] = undefined;
                rttPinger[kRoundTripTime] = 0;
                return;
            }
            measureAndReschedule(conn);
        });
        return;
    }
    connection.command((0, utils_1.ns)('admin.$cmd'), { [constants_1.LEGACY_HELLO_COMMAND]: 1 }, undefined, err => {
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
class MonitorInterval {
    constructor(fn, options = {}) {
        var _a, _b;
        this.isExpeditedCallToFnScheduled = false;
        this.stopped = false;
        this.isExecutionInProgress = false;
        this.hasExecutedOnce = false;
        this._executeAndReschedule = () => {
            if (this.stopped)
                return;
            if (this.timerId) {
                (0, timers_1.clearTimeout)(this.timerId);
            }
            this.isExpeditedCallToFnScheduled = false;
            this.isExecutionInProgress = true;
            this.fn(() => {
                this.lastExecutionEnded = (0, utils_1.now)();
                this.isExecutionInProgress = false;
                this._reschedule(this.heartbeatFrequencyMS);
            });
        };
        this.fn = fn;
        this.lastExecutionEnded = -Infinity;
        this.heartbeatFrequencyMS = (_a = options.heartbeatFrequencyMS) !== null && _a !== void 0 ? _a : 1000;
        this.minHeartbeatFrequencyMS = (_b = options.minHeartbeatFrequencyMS) !== null && _b !== void 0 ? _b : 500;
        if (options.immediate) {
            this._executeAndReschedule();
        }
        else {
            this._reschedule(undefined);
        }
    }
    wake() {
        const currentTime = (0, utils_1.now)();
        const timeSinceLastCall = currentTime - this.lastExecutionEnded;
        // TODO(NODE-4674): Add error handling and logging to the monitor
        if (timeSinceLastCall < 0) {
            return this._executeAndReschedule();
        }
        if (this.isExecutionInProgress) {
            return;
        }
        // debounce multiple calls to wake within the `minInterval`
        if (this.isExpeditedCallToFnScheduled) {
            return;
        }
        // reschedule a call as soon as possible, ensuring the call never happens
        // faster than the `minInterval`
        if (timeSinceLastCall < this.minHeartbeatFrequencyMS) {
            this.isExpeditedCallToFnScheduled = true;
            this._reschedule(this.minHeartbeatFrequencyMS - timeSinceLastCall);
            return;
        }
        this._executeAndReschedule();
    }
    stop() {
        this.stopped = true;
        if (this.timerId) {
            (0, timers_1.clearTimeout)(this.timerId);
            this.timerId = undefined;
        }
        this.lastExecutionEnded = -Infinity;
        this.isExpeditedCallToFnScheduled = false;
    }
    toString() {
        return JSON.stringify(this);
    }
    toJSON() {
        const currentTime = (0, utils_1.now)();
        const timeSinceLastCall = currentTime - this.lastExecutionEnded;
        return {
            timerId: this.timerId != null ? 'set' : 'cleared',
            lastCallTime: this.lastExecutionEnded,
            isExpeditedCheckScheduled: this.isExpeditedCallToFnScheduled,
            stopped: this.stopped,
            heartbeatFrequencyMS: this.heartbeatFrequencyMS,
            minHeartbeatFrequencyMS: this.minHeartbeatFrequencyMS,
            currentTime,
            timeSinceLastCall
        };
    }
    _reschedule(ms) {
        if (this.stopped)
            return;
        if (this.timerId) {
            (0, timers_1.clearTimeout)(this.timerId);
        }
        this.timerId = (0, timers_1.setTimeout)(this._executeAndReschedule, ms || this.heartbeatFrequencyMS);
    }
}
exports.MonitorInterval = MonitorInterval;
//# sourceMappingURL=monitor.js.map