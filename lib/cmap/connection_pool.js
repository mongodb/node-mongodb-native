"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConnectionPool = exports.PoolState = void 0;
const timers_1 = require("timers");
const constants_1 = require("../constants");
const error_1 = require("../error");
const logger_1 = require("../logger");
const mongo_types_1 = require("../mongo_types");
const utils_1 = require("../utils");
const connect_1 = require("./connect");
const connection_1 = require("./connection");
const connection_pool_events_1 = require("./connection_pool_events");
const errors_1 = require("./errors");
const metrics_1 = require("./metrics");
/** @internal */
const kServer = Symbol('server');
/** @internal */
const kLogger = Symbol('logger');
/** @internal */
const kConnections = Symbol('connections');
/** @internal */
const kPending = Symbol('pending');
/** @internal */
const kCheckedOut = Symbol('checkedOut');
/** @internal */
const kMinPoolSizeTimer = Symbol('minPoolSizeTimer');
/** @internal */
const kGeneration = Symbol('generation');
/** @internal */
const kServiceGenerations = Symbol('serviceGenerations');
/** @internal */
const kConnectionCounter = Symbol('connectionCounter');
/** @internal */
const kCancellationToken = Symbol('cancellationToken');
/** @internal */
const kWaitQueue = Symbol('waitQueue');
/** @internal */
const kCancelled = Symbol('cancelled');
/** @internal */
const kMetrics = Symbol('metrics');
/** @internal */
const kProcessingWaitQueue = Symbol('processingWaitQueue');
/** @internal */
const kPoolState = Symbol('poolState');
/** @internal */
exports.PoolState = Object.freeze({
    paused: 'paused',
    ready: 'ready',
    closed: 'closed'
});
/**
 * A pool of connections which dynamically resizes, and emit events related to pool activity
 * @internal
 */
class ConnectionPool extends mongo_types_1.TypedEventEmitter {
    constructor(server, options) {
        var _a, _b, _c, _d, _e, _f;
        super();
        this.options = Object.freeze({
            ...options,
            connectionType: connection_1.Connection,
            maxPoolSize: (_a = options.maxPoolSize) !== null && _a !== void 0 ? _a : 100,
            minPoolSize: (_b = options.minPoolSize) !== null && _b !== void 0 ? _b : 0,
            maxConnecting: (_c = options.maxConnecting) !== null && _c !== void 0 ? _c : 2,
            maxIdleTimeMS: (_d = options.maxIdleTimeMS) !== null && _d !== void 0 ? _d : 0,
            waitQueueTimeoutMS: (_e = options.waitQueueTimeoutMS) !== null && _e !== void 0 ? _e : 0,
            minPoolSizeCheckFrequencyMS: (_f = options.minPoolSizeCheckFrequencyMS) !== null && _f !== void 0 ? _f : 100,
            autoEncrypter: options.autoEncrypter,
            metadata: options.metadata
        });
        if (this.options.minPoolSize > this.options.maxPoolSize) {
            throw new error_1.MongoInvalidArgumentError('Connection pool minimum size must not be greater than maximum pool size');
        }
        this[kPoolState] = exports.PoolState.paused;
        this[kServer] = server;
        this[kLogger] = new logger_1.Logger('ConnectionPool');
        this[kConnections] = new utils_1.List();
        this[kPending] = 0;
        this[kCheckedOut] = new Set();
        this[kMinPoolSizeTimer] = undefined;
        this[kGeneration] = 0;
        this[kServiceGenerations] = new Map();
        this[kConnectionCounter] = (0, utils_1.makeCounter)(1);
        this[kCancellationToken] = new mongo_types_1.CancellationToken();
        this[kCancellationToken].setMaxListeners(Infinity);
        this[kWaitQueue] = new utils_1.List();
        this[kMetrics] = new metrics_1.ConnectionPoolMetrics();
        this[kProcessingWaitQueue] = false;
        process.nextTick(() => {
            this.emit(ConnectionPool.CONNECTION_POOL_CREATED, new connection_pool_events_1.ConnectionPoolCreatedEvent(this));
        });
    }
    /** The address of the endpoint the pool is connected to */
    get address() {
        return this.options.hostAddress.toString();
    }
    /**
     * Check if the pool has been closed
     *
     * TODO(NODE-3263): We can remove this property once shell no longer needs it
     */
    get closed() {
        return this[kPoolState] === exports.PoolState.closed;
    }
    /** An integer representing the SDAM generation of the pool */
    get generation() {
        return this[kGeneration];
    }
    /** An integer expressing how many total connections (available + pending + in use) the pool currently has */
    get totalConnectionCount() {
        return (this.availableConnectionCount + this.pendingConnectionCount + this.currentCheckedOutCount);
    }
    /** An integer expressing how many connections are currently available in the pool. */
    get availableConnectionCount() {
        return this[kConnections].length;
    }
    get pendingConnectionCount() {
        return this[kPending];
    }
    get currentCheckedOutCount() {
        return this[kCheckedOut].size;
    }
    get waitQueueSize() {
        return this[kWaitQueue].length;
    }
    get loadBalanced() {
        return this.options.loadBalanced;
    }
    get serviceGenerations() {
        return this[kServiceGenerations];
    }
    get serverError() {
        return this[kServer].description.error;
    }
    /**
     * This is exposed ONLY for use in mongosh, to enable
     * killing all connections if a user quits the shell with
     * operations in progress.
     *
     * This property may be removed as a part of NODE-3263.
     */
    get checkedOutConnections() {
        return this[kCheckedOut];
    }
    /**
     * Get the metrics information for the pool when a wait queue timeout occurs.
     */
    waitQueueErrorMetrics() {
        return this[kMetrics].info(this.options.maxPoolSize);
    }
    /**
     * Set the pool state to "ready"
     */
    ready() {
        if (this[kPoolState] !== exports.PoolState.paused) {
            return;
        }
        this[kPoolState] = exports.PoolState.ready;
        this.emit(ConnectionPool.CONNECTION_POOL_READY, new connection_pool_events_1.ConnectionPoolReadyEvent(this));
        (0, timers_1.clearTimeout)(this[kMinPoolSizeTimer]);
        this.ensureMinPoolSize();
    }
    /**
     * Check a connection out of this pool. The connection will continue to be tracked, but no reference to it
     * will be held by the pool. This means that if a connection is checked out it MUST be checked back in or
     * explicitly destroyed by the new owner.
     */
    checkOut(callback) {
        this.emit(ConnectionPool.CONNECTION_CHECK_OUT_STARTED, new connection_pool_events_1.ConnectionCheckOutStartedEvent(this));
        const waitQueueMember = { callback };
        const waitQueueTimeoutMS = this.options.waitQueueTimeoutMS;
        if (waitQueueTimeoutMS) {
            waitQueueMember.timer = (0, timers_1.setTimeout)(() => {
                waitQueueMember[kCancelled] = true;
                waitQueueMember.timer = undefined;
                this.emit(ConnectionPool.CONNECTION_CHECK_OUT_FAILED, new connection_pool_events_1.ConnectionCheckOutFailedEvent(this, 'timeout'));
                waitQueueMember.callback(new errors_1.WaitQueueTimeoutError(this.loadBalanced
                    ? this.waitQueueErrorMetrics()
                    : 'Timed out while checking out a connection from connection pool', this.address));
            }, waitQueueTimeoutMS);
        }
        this[kWaitQueue].push(waitQueueMember);
        process.nextTick(() => this.processWaitQueue());
    }
    /**
     * Check a connection into the pool.
     *
     * @param connection - The connection to check in
     */
    checkIn(connection) {
        if (!this[kCheckedOut].has(connection)) {
            return;
        }
        const poolClosed = this.closed;
        const stale = this.connectionIsStale(connection);
        const willDestroy = !!(poolClosed || stale || connection.closed);
        if (!willDestroy) {
            connection.markAvailable();
            this[kConnections].unshift(connection);
        }
        this[kCheckedOut].delete(connection);
        this.emit(ConnectionPool.CONNECTION_CHECKED_IN, new connection_pool_events_1.ConnectionCheckedInEvent(this, connection));
        if (willDestroy) {
            const reason = connection.closed ? 'error' : poolClosed ? 'poolClosed' : 'stale';
            this.destroyConnection(connection, reason);
        }
        process.nextTick(() => this.processWaitQueue());
    }
    /**
     * Clear the pool
     *
     * Pool reset is handled by incrementing the pool's generation count. Any existing connection of a
     * previous generation will eventually be pruned during subsequent checkouts.
     */
    clear(options = {}) {
        var _a;
        if (this.closed) {
            return;
        }
        // handle load balanced case
        if (this.loadBalanced) {
            const { serviceId } = options;
            if (!serviceId) {
                throw new error_1.MongoRuntimeError('ConnectionPool.clear() called in load balanced mode with no serviceId.');
            }
            const sid = serviceId.toHexString();
            const generation = this.serviceGenerations.get(sid);
            // Only need to worry if the generation exists, since it should
            // always be there but typescript needs the check.
            if (generation == null) {
                throw new error_1.MongoRuntimeError('Service generations are required in load balancer mode.');
            }
            else {
                // Increment the generation for the service id.
                this.serviceGenerations.set(sid, generation + 1);
            }
            this.emit(ConnectionPool.CONNECTION_POOL_CLEARED, new connection_pool_events_1.ConnectionPoolClearedEvent(this, { serviceId }));
            return;
        }
        // handle non load-balanced case
        const interruptInUseConnections = (_a = options.interruptInUseConnections) !== null && _a !== void 0 ? _a : false;
        const oldGeneration = this[kGeneration];
        this[kGeneration] += 1;
        const alreadyPaused = this[kPoolState] === exports.PoolState.paused;
        this[kPoolState] = exports.PoolState.paused;
        this.clearMinPoolSizeTimer();
        if (!alreadyPaused) {
            this.emit(ConnectionPool.CONNECTION_POOL_CLEARED, new connection_pool_events_1.ConnectionPoolClearedEvent(this, { interruptInUseConnections }));
        }
        if (interruptInUseConnections) {
            process.nextTick(() => this.interruptInUseConnections(oldGeneration));
        }
        this.processWaitQueue();
    }
    /**
     * Closes all stale in-use connections in the pool with a resumable PoolClearedOnNetworkError.
     *
     * Only connections where `connection.generation <= minGeneration` are killed.
     */
    interruptInUseConnections(minGeneration) {
        for (const connection of this[kCheckedOut]) {
            if (connection.generation <= minGeneration) {
                this.checkIn(connection);
                connection.onError(new errors_1.PoolClearedOnNetworkError(this));
            }
        }
    }
    close(_options, _cb) {
        let options = _options;
        const callback = (_cb !== null && _cb !== void 0 ? _cb : _options);
        if (typeof options === 'function') {
            options = {};
        }
        options = Object.assign({ force: false }, options);
        if (this.closed) {
            return callback();
        }
        // immediately cancel any in-flight connections
        this[kCancellationToken].emit('cancel');
        // end the connection counter
        if (typeof this[kConnectionCounter].return === 'function') {
            this[kConnectionCounter].return(undefined);
        }
        this[kPoolState] = exports.PoolState.closed;
        this.clearMinPoolSizeTimer();
        this.processWaitQueue();
        (0, utils_1.eachAsync)(this[kConnections].toArray(), (conn, cb) => {
            this.emit(ConnectionPool.CONNECTION_CLOSED, new connection_pool_events_1.ConnectionClosedEvent(this, conn, 'poolClosed'));
            conn.destroy({ force: !!options.force }, cb);
        }, err => {
            this[kConnections].clear();
            this.emit(ConnectionPool.CONNECTION_POOL_CLOSED, new connection_pool_events_1.ConnectionPoolClosedEvent(this));
            callback(err);
        });
    }
    /**
     * Runs a lambda with an implicitly checked out connection, checking that connection back in when the lambda
     * has completed by calling back.
     *
     * NOTE: please note the required signature of `fn`
     *
     * @remarks When in load balancer mode, connections can be pinned to cursors or transactions.
     *   In these cases we pass the connection in to this method to ensure it is used and a new
     *   connection is not checked out.
     *
     * @param conn - A pinned connection for use in load balancing mode.
     * @param fn - A function which operates on a managed connection
     * @param callback - The original callback
     */
    withConnection(conn, fn, callback) {
        if (conn) {
            // use the provided connection, and do _not_ check it in after execution
            fn(undefined, conn, (fnErr, result) => {
                if (typeof callback === 'function') {
                    if (fnErr) {
                        callback(fnErr);
                    }
                    else {
                        callback(undefined, result);
                    }
                }
            });
            return;
        }
        this.checkOut((err, conn) => {
            // don't callback with `err` here, we might want to act upon it inside `fn`
            fn(err, conn, (fnErr, result) => {
                if (typeof callback === 'function') {
                    if (fnErr) {
                        callback(fnErr);
                    }
                    else {
                        callback(undefined, result);
                    }
                }
                if (conn) {
                    this.checkIn(conn);
                }
            });
        });
    }
    /** Clear the min pool size timer */
    clearMinPoolSizeTimer() {
        const minPoolSizeTimer = this[kMinPoolSizeTimer];
        if (minPoolSizeTimer) {
            (0, timers_1.clearTimeout)(minPoolSizeTimer);
        }
    }
    destroyConnection(connection, reason) {
        this.emit(ConnectionPool.CONNECTION_CLOSED, new connection_pool_events_1.ConnectionClosedEvent(this, connection, reason));
        // destroy the connection
        process.nextTick(() => connection.destroy({ force: false }));
    }
    connectionIsStale(connection) {
        const serviceId = connection.serviceId;
        if (this.loadBalanced && serviceId) {
            const sid = serviceId.toHexString();
            const generation = this.serviceGenerations.get(sid);
            return connection.generation !== generation;
        }
        return connection.generation !== this[kGeneration];
    }
    connectionIsIdle(connection) {
        return !!(this.options.maxIdleTimeMS && connection.idleTime > this.options.maxIdleTimeMS);
    }
    /**
     * Destroys a connection if the connection is perished.
     *
     * @returns `true` if the connection was destroyed, `false` otherwise.
     */
    destroyConnectionIfPerished(connection) {
        const isStale = this.connectionIsStale(connection);
        const isIdle = this.connectionIsIdle(connection);
        if (!isStale && !isIdle && !connection.closed) {
            return false;
        }
        const reason = connection.closed ? 'error' : isStale ? 'stale' : 'idle';
        this.destroyConnection(connection, reason);
        return true;
    }
    createConnection(callback) {
        const connectOptions = {
            ...this.options,
            id: this[kConnectionCounter].next().value,
            generation: this[kGeneration],
            cancellationToken: this[kCancellationToken]
        };
        this[kPending]++;
        // This is our version of a "virtual" no-I/O connection as the spec requires
        this.emit(ConnectionPool.CONNECTION_CREATED, new connection_pool_events_1.ConnectionCreatedEvent(this, { id: connectOptions.id }));
        (0, connect_1.connect)(connectOptions, (err, connection) => {
            if (err || !connection) {
                this[kLogger].debug(`connection attempt failed with error [${JSON.stringify(err)}]`);
                this[kPending]--;
                this.emit(ConnectionPool.CONNECTION_CLOSED, new connection_pool_events_1.ConnectionClosedEvent(this, { id: connectOptions.id, serviceId: undefined }, 'error'));
                if (err instanceof error_1.MongoNetworkError || err instanceof error_1.MongoServerError) {
                    err.connectionGeneration = connectOptions.generation;
                }
                callback(err !== null && err !== void 0 ? err : new error_1.MongoRuntimeError('Connection creation failed without error'));
                return;
            }
            // The pool might have closed since we started trying to create a connection
            if (this[kPoolState] !== exports.PoolState.ready) {
                this[kPending]--;
                connection.destroy({ force: true });
                callback(this.closed ? new errors_1.PoolClosedError(this) : new errors_1.PoolClearedError(this));
                return;
            }
            // forward all events from the connection to the pool
            for (const event of [...constants_1.APM_EVENTS, connection_1.Connection.CLUSTER_TIME_RECEIVED]) {
                connection.on(event, (e) => this.emit(event, e));
            }
            if (this.loadBalanced) {
                connection.on(connection_1.Connection.PINNED, pinType => this[kMetrics].markPinned(pinType));
                connection.on(connection_1.Connection.UNPINNED, pinType => this[kMetrics].markUnpinned(pinType));
                const serviceId = connection.serviceId;
                if (serviceId) {
                    let generation;
                    const sid = serviceId.toHexString();
                    if ((generation = this.serviceGenerations.get(sid))) {
                        connection.generation = generation;
                    }
                    else {
                        this.serviceGenerations.set(sid, 0);
                        connection.generation = 0;
                    }
                }
            }
            connection.markAvailable();
            this.emit(ConnectionPool.CONNECTION_READY, new connection_pool_events_1.ConnectionReadyEvent(this, connection));
            this[kPending]--;
            callback(undefined, connection);
            return;
        });
    }
    ensureMinPoolSize() {
        const minPoolSize = this.options.minPoolSize;
        if (this[kPoolState] !== exports.PoolState.ready || minPoolSize === 0) {
            return;
        }
        this[kConnections].prune(connection => this.destroyConnectionIfPerished(connection));
        if (this.totalConnectionCount < minPoolSize &&
            this.pendingConnectionCount < this.options.maxConnecting) {
            // NOTE: ensureMinPoolSize should not try to get all the pending
            // connection permits because that potentially delays the availability of
            // the connection to a checkout request
            this.createConnection((err, connection) => {
                if (err) {
                    this[kServer].handleError(err);
                }
                if (!err && connection) {
                    this[kConnections].push(connection);
                    process.nextTick(() => this.processWaitQueue());
                }
                if (this[kPoolState] === exports.PoolState.ready) {
                    (0, timers_1.clearTimeout)(this[kMinPoolSizeTimer]);
                    this[kMinPoolSizeTimer] = (0, timers_1.setTimeout)(() => this.ensureMinPoolSize(), this.options.minPoolSizeCheckFrequencyMS);
                }
            });
        }
        else {
            (0, timers_1.clearTimeout)(this[kMinPoolSizeTimer]);
            this[kMinPoolSizeTimer] = (0, timers_1.setTimeout)(() => this.ensureMinPoolSize(), this.options.minPoolSizeCheckFrequencyMS);
        }
    }
    processWaitQueue() {
        if (this[kProcessingWaitQueue]) {
            return;
        }
        this[kProcessingWaitQueue] = true;
        while (this.waitQueueSize) {
            const waitQueueMember = this[kWaitQueue].first();
            if (!waitQueueMember) {
                this[kWaitQueue].shift();
                continue;
            }
            if (waitQueueMember[kCancelled]) {
                this[kWaitQueue].shift();
                continue;
            }
            if (this[kPoolState] !== exports.PoolState.ready) {
                const reason = this.closed ? 'poolClosed' : 'connectionError';
                const error = this.closed ? new errors_1.PoolClosedError(this) : new errors_1.PoolClearedError(this);
                this.emit(ConnectionPool.CONNECTION_CHECK_OUT_FAILED, new connection_pool_events_1.ConnectionCheckOutFailedEvent(this, reason));
                if (waitQueueMember.timer) {
                    (0, timers_1.clearTimeout)(waitQueueMember.timer);
                }
                this[kWaitQueue].shift();
                waitQueueMember.callback(error);
                continue;
            }
            if (!this.availableConnectionCount) {
                break;
            }
            const connection = this[kConnections].shift();
            if (!connection) {
                break;
            }
            if (!this.destroyConnectionIfPerished(connection)) {
                this[kCheckedOut].add(connection);
                this.emit(ConnectionPool.CONNECTION_CHECKED_OUT, new connection_pool_events_1.ConnectionCheckedOutEvent(this, connection));
                if (waitQueueMember.timer) {
                    (0, timers_1.clearTimeout)(waitQueueMember.timer);
                }
                this[kWaitQueue].shift();
                waitQueueMember.callback(undefined, connection);
            }
        }
        const { maxPoolSize, maxConnecting } = this.options;
        while (this.waitQueueSize > 0 &&
            this.pendingConnectionCount < maxConnecting &&
            (maxPoolSize === 0 || this.totalConnectionCount < maxPoolSize)) {
            const waitQueueMember = this[kWaitQueue].shift();
            if (!waitQueueMember || waitQueueMember[kCancelled]) {
                continue;
            }
            this.createConnection((err, connection) => {
                if (waitQueueMember[kCancelled]) {
                    if (!err && connection) {
                        this[kConnections].push(connection);
                    }
                }
                else {
                    if (err) {
                        this.emit(ConnectionPool.CONNECTION_CHECK_OUT_FAILED, new connection_pool_events_1.ConnectionCheckOutFailedEvent(this, 'connectionError'));
                    }
                    else if (connection) {
                        this[kCheckedOut].add(connection);
                        this.emit(ConnectionPool.CONNECTION_CHECKED_OUT, new connection_pool_events_1.ConnectionCheckedOutEvent(this, connection));
                    }
                    if (waitQueueMember.timer) {
                        (0, timers_1.clearTimeout)(waitQueueMember.timer);
                    }
                    waitQueueMember.callback(err, connection);
                }
                process.nextTick(() => this.processWaitQueue());
            });
        }
        this[kProcessingWaitQueue] = false;
    }
}
exports.ConnectionPool = ConnectionPool;
/**
 * Emitted when the connection pool is created.
 * @event
 */
ConnectionPool.CONNECTION_POOL_CREATED = constants_1.CONNECTION_POOL_CREATED;
/**
 * Emitted once when the connection pool is closed
 * @event
 */
ConnectionPool.CONNECTION_POOL_CLOSED = constants_1.CONNECTION_POOL_CLOSED;
/**
 * Emitted each time the connection pool is cleared and it's generation incremented
 * @event
 */
ConnectionPool.CONNECTION_POOL_CLEARED = constants_1.CONNECTION_POOL_CLEARED;
/**
 * Emitted each time the connection pool is marked ready
 * @event
 */
ConnectionPool.CONNECTION_POOL_READY = constants_1.CONNECTION_POOL_READY;
/**
 * Emitted when a connection is created.
 * @event
 */
ConnectionPool.CONNECTION_CREATED = constants_1.CONNECTION_CREATED;
/**
 * Emitted when a connection becomes established, and is ready to use
 * @event
 */
ConnectionPool.CONNECTION_READY = constants_1.CONNECTION_READY;
/**
 * Emitted when a connection is closed
 * @event
 */
ConnectionPool.CONNECTION_CLOSED = constants_1.CONNECTION_CLOSED;
/**
 * Emitted when an attempt to check out a connection begins
 * @event
 */
ConnectionPool.CONNECTION_CHECK_OUT_STARTED = constants_1.CONNECTION_CHECK_OUT_STARTED;
/**
 * Emitted when an attempt to check out a connection fails
 * @event
 */
ConnectionPool.CONNECTION_CHECK_OUT_FAILED = constants_1.CONNECTION_CHECK_OUT_FAILED;
/**
 * Emitted each time a connection is successfully checked out of the connection pool
 * @event
 */
ConnectionPool.CONNECTION_CHECKED_OUT = constants_1.CONNECTION_CHECKED_OUT;
/**
 * Emitted each time a connection is successfully checked into the connection pool
 * @event
 */
ConnectionPool.CONNECTION_CHECKED_IN = constants_1.CONNECTION_CHECKED_IN;
//# sourceMappingURL=connection_pool.js.map