"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Server = void 0;
const connection_1 = require("../cmap/connection");
const connection_pool_1 = require("../cmap/connection_pool");
const constants_1 = require("../constants");
const error_1 = require("../error");
const logger_1 = require("../logger");
const mongo_types_1 = require("../mongo_types");
const transactions_1 = require("../transactions");
const utils_1 = require("../utils");
const common_1 = require("./common");
const monitor_1 = require("./monitor");
const server_description_1 = require("./server_description");
const stateTransition = (0, utils_1.makeStateMachine)({
    [common_1.STATE_CLOSED]: [common_1.STATE_CLOSED, common_1.STATE_CONNECTING],
    [common_1.STATE_CONNECTING]: [common_1.STATE_CONNECTING, common_1.STATE_CLOSING, common_1.STATE_CONNECTED, common_1.STATE_CLOSED],
    [common_1.STATE_CONNECTED]: [common_1.STATE_CONNECTED, common_1.STATE_CLOSING, common_1.STATE_CLOSED],
    [common_1.STATE_CLOSING]: [common_1.STATE_CLOSING, common_1.STATE_CLOSED]
});
/** @internal */
const kMonitor = Symbol('monitor');
/** @internal */
class Server extends mongo_types_1.TypedEventEmitter {
    /**
     * Create a server
     */
    constructor(topology, description, options) {
        super();
        this.serverApi = options.serverApi;
        const poolOptions = { hostAddress: description.hostAddress, ...options };
        this.s = {
            description,
            options,
            logger: new logger_1.Logger('Server'),
            state: common_1.STATE_CLOSED,
            topology,
            pool: new connection_pool_1.ConnectionPool(poolOptions)
        };
        for (const event of [...constants_1.CMAP_EVENTS, ...constants_1.APM_EVENTS]) {
            this.s.pool.on(event, (e) => this.emit(event, e));
        }
        this.s.pool.on(connection_1.Connection.CLUSTER_TIME_RECEIVED, (clusterTime) => {
            this.clusterTime = clusterTime;
        });
        // monitoring is disabled in load balancing mode
        if (this.loadBalanced)
            return;
        // create the monitor
        this[kMonitor] = new monitor_1.Monitor(this, this.s.options);
        for (const event of constants_1.HEARTBEAT_EVENTS) {
            this[kMonitor].on(event, (e) => this.emit(event, e));
        }
        this[kMonitor].on('resetConnectionPool', () => {
            this.s.pool.clear();
        });
        this[kMonitor].on('resetServer', (error) => markServerUnknown(this, error));
        this[kMonitor].on(Server.SERVER_HEARTBEAT_SUCCEEDED, (event) => {
            this.emit(Server.DESCRIPTION_RECEIVED, new server_description_1.ServerDescription(this.description.hostAddress, event.reply, {
                roundTripTime: calculateRoundTripTime(this.description.roundTripTime, event.duration)
            }));
            if (this.s.state === common_1.STATE_CONNECTING) {
                stateTransition(this, common_1.STATE_CONNECTED);
                this.emit(Server.CONNECT, this);
            }
        });
    }
    get clusterTime() {
        return this.s.topology.clusterTime;
    }
    set clusterTime(clusterTime) {
        this.s.topology.clusterTime = clusterTime;
    }
    get description() {
        return this.s.description;
    }
    get name() {
        return this.s.description.address;
    }
    get autoEncrypter() {
        if (this.s.options && this.s.options.autoEncrypter) {
            return this.s.options.autoEncrypter;
        }
        return;
    }
    get loadBalanced() {
        return this.s.topology.description.type === common_1.TopologyType.LoadBalanced;
    }
    /**
     * Initiate server connect
     */
    connect() {
        if (this.s.state !== common_1.STATE_CLOSED) {
            return;
        }
        stateTransition(this, common_1.STATE_CONNECTING);
        // If in load balancer mode we automatically set the server to
        // a load balancer. It never transitions out of this state and
        // has no monitor.
        if (!this.loadBalanced) {
            this[kMonitor].connect();
        }
        else {
            stateTransition(this, common_1.STATE_CONNECTED);
            this.emit(Server.CONNECT, this);
        }
    }
    /** Destroy the server connection */
    destroy(options, callback) {
        if (typeof options === 'function')
            (callback = options), (options = {});
        options = Object.assign({}, { force: false }, options);
        if (this.s.state === common_1.STATE_CLOSED) {
            if (typeof callback === 'function') {
                callback();
            }
            return;
        }
        stateTransition(this, common_1.STATE_CLOSING);
        if (!this.loadBalanced) {
            this[kMonitor].close();
        }
        this.s.pool.close(options, err => {
            stateTransition(this, common_1.STATE_CLOSED);
            this.emit('closed');
            if (typeof callback === 'function') {
                callback(err);
            }
        });
    }
    /**
     * Immediately schedule monitoring of this server. If there already an attempt being made
     * this will be a no-op.
     */
    requestCheck() {
        if (!this.loadBalanced) {
            this[kMonitor].requestCheck();
        }
    }
    /**
     * Execute a command
     * @internal
     */
    command(ns, cmd, options, callback) {
        if (callback == null) {
            throw new error_1.MongoInvalidArgumentError('Callback must be provided');
        }
        if (ns.db == null || typeof ns === 'string') {
            throw new error_1.MongoInvalidArgumentError('Namespace must not be a string');
        }
        if (this.s.state === common_1.STATE_CLOSING || this.s.state === common_1.STATE_CLOSED) {
            callback(new error_1.MongoServerClosedError());
            return;
        }
        // Clone the options
        const finalOptions = Object.assign({}, options, { wireProtocolCommand: false });
        // There are cases where we need to flag the read preference not to get sent in
        // the command, such as pre-5.0 servers attempting to perform an aggregate write
        // with a non-primary read preference. In this case the effective read preference
        // (primary) is not the same as the provided and must be removed completely.
        if (finalOptions.omitReadPreference) {
            delete finalOptions.readPreference;
        }
        // error if collation not supported
        if ((0, utils_1.collationNotSupported)(this, cmd)) {
            callback(new error_1.MongoCompatibilityError(`Server ${this.name} does not support collation`));
            return;
        }
        const session = finalOptions.session;
        const conn = session === null || session === void 0 ? void 0 : session.pinnedConnection;
        // NOTE: This is a hack! We can't retrieve the connections used for executing an operation
        //       (and prevent them from being checked back in) at the point of operation execution.
        //       This should be considered as part of the work for NODE-2882
        if (this.loadBalanced && session && conn == null && isPinnableCommand(cmd, session)) {
            this.s.pool.checkOut((err, checkedOut) => {
                if (err || checkedOut == null) {
                    if (callback)
                        return callback(err);
                    return;
                }
                session.pin(checkedOut);
                this.command(ns, cmd, finalOptions, callback);
            });
            return;
        }
        this.s.pool.withConnection(conn, (err, conn, cb) => {
            if (err || !conn) {
                markServerUnknown(this, err);
                return cb(err);
            }
            conn.command(ns, cmd, finalOptions, makeOperationHandler(this, conn, cmd, finalOptions, cb));
        }, callback);
    }
    /**
     * Execute a query against the server
     * @internal
     */
    query(ns, cmd, options, callback) {
        if (this.s.state === common_1.STATE_CLOSING || this.s.state === common_1.STATE_CLOSED) {
            callback(new error_1.MongoServerClosedError());
            return;
        }
        this.s.pool.withConnection(undefined, (err, conn, cb) => {
            if (err || !conn) {
                markServerUnknown(this, err);
                return cb(err);
            }
            conn.query(ns, cmd, options, makeOperationHandler(this, conn, cmd, options, cb));
        }, callback);
    }
    /**
     * Execute a `getMore` against the server
     * @internal
     */
    getMore(ns, cursorId, options, callback) {
        var _a;
        if (this.s.state === common_1.STATE_CLOSING || this.s.state === common_1.STATE_CLOSED) {
            callback(new error_1.MongoServerClosedError());
            return;
        }
        this.s.pool.withConnection((_a = options.session) === null || _a === void 0 ? void 0 : _a.pinnedConnection, (err, conn, cb) => {
            if (err || !conn) {
                markServerUnknown(this, err);
                return cb(err);
            }
            conn.getMore(ns, cursorId, options, makeOperationHandler(this, conn, {}, options, cb));
        }, callback);
    }
    /**
     * Execute a `killCursors` command against the server
     * @internal
     */
    killCursors(ns, cursorIds, options, callback) {
        var _a;
        if (this.s.state === common_1.STATE_CLOSING || this.s.state === common_1.STATE_CLOSED) {
            if (typeof callback === 'function') {
                callback(new error_1.MongoServerClosedError());
            }
            return;
        }
        this.s.pool.withConnection((_a = options.session) === null || _a === void 0 ? void 0 : _a.pinnedConnection, (err, conn, cb) => {
            if (err || !conn) {
                markServerUnknown(this, err);
                return cb(err);
            }
            conn.killCursors(ns, cursorIds, options, makeOperationHandler(this, conn, {}, undefined, cb));
        }, callback);
    }
}
exports.Server = Server;
/** @event */
Server.SERVER_HEARTBEAT_STARTED = constants_1.SERVER_HEARTBEAT_STARTED;
/** @event */
Server.SERVER_HEARTBEAT_SUCCEEDED = constants_1.SERVER_HEARTBEAT_SUCCEEDED;
/** @event */
Server.SERVER_HEARTBEAT_FAILED = constants_1.SERVER_HEARTBEAT_FAILED;
/** @event */
Server.CONNECT = constants_1.CONNECT;
/** @event */
Server.DESCRIPTION_RECEIVED = constants_1.DESCRIPTION_RECEIVED;
/** @event */
Server.CLOSED = constants_1.CLOSED;
/** @event */
Server.ENDED = constants_1.ENDED;
function calculateRoundTripTime(oldRtt, duration) {
    if (oldRtt === -1) {
        return duration;
    }
    const alpha = 0.2;
    return alpha * duration + (1 - alpha) * oldRtt;
}
function markServerUnknown(server, error) {
    // Load balancer servers can never be marked unknown.
    if (server.loadBalanced) {
        return;
    }
    if (error instanceof error_1.MongoNetworkError && !(error instanceof error_1.MongoNetworkTimeoutError)) {
        server[kMonitor].reset();
    }
    server.emit(Server.DESCRIPTION_RECEIVED, new server_description_1.ServerDescription(server.description.hostAddress, undefined, {
        error,
        topologyVersion: error && error.topologyVersion ? error.topologyVersion : server.description.topologyVersion
    }));
}
function isPinnableCommand(cmd, session) {
    if (session) {
        return (session.inTransaction() ||
            'aggregate' in cmd ||
            'find' in cmd ||
            'getMore' in cmd ||
            'listCollections' in cmd ||
            'listIndexes' in cmd);
    }
    return false;
}
function connectionIsStale(pool, connection) {
    if (connection.serviceId) {
        return (connection.generation !== pool.serviceGenerations.get(connection.serviceId.toHexString()));
    }
    return connection.generation !== pool.generation;
}
function shouldHandleStateChangeError(server, err) {
    const etv = err.topologyVersion;
    const stv = server.description.topologyVersion;
    return (0, server_description_1.compareTopologyVersion)(stv, etv) < 0;
}
function inActiveTransaction(session, cmd) {
    return session && session.inTransaction() && !(0, transactions_1.isTransactionCommand)(cmd);
}
/** this checks the retryWrites option passed down from the client options, it
 * does not check if the server supports retryable writes */
function isRetryableWritesEnabled(topology) {
    return topology.s.options.retryWrites !== false;
}
function makeOperationHandler(server, connection, cmd, options, callback) {
    const session = options === null || options === void 0 ? void 0 : options.session;
    return function handleOperationResult(error, result) {
        if (result != null) {
            return callback(undefined, result);
        }
        if (!error) {
            return callback(new error_1.MongoUnexpectedServerResponseError('Empty response with no error'));
        }
        if (!(error instanceof error_1.MongoError)) {
            // Node.js or some other error we have not special handling for
            return callback(error);
        }
        if (connectionIsStale(server.s.pool, connection)) {
            return callback(error);
        }
        if (error instanceof error_1.MongoNetworkError) {
            if (session && !session.hasEnded && session.serverSession) {
                session.serverSession.isDirty = true;
            }
            // inActiveTransaction check handles commit and abort.
            if (inActiveTransaction(session, cmd) &&
                !error.hasErrorLabel(error_1.MongoErrorLabel.TransientTransactionError)) {
                error.addErrorLabel(error_1.MongoErrorLabel.TransientTransactionError);
            }
            if ((isRetryableWritesEnabled(server.s.topology) || (0, transactions_1.isTransactionCommand)(cmd)) &&
                (0, utils_1.supportsRetryableWrites)(server) &&
                !inActiveTransaction(session, cmd)) {
                error.addErrorLabel(error_1.MongoErrorLabel.RetryableWriteError);
            }
            if (!(error instanceof error_1.MongoNetworkTimeoutError) || (0, error_1.isNetworkErrorBeforeHandshake)(error)) {
                // In load balanced mode we never mark the server as unknown and always
                // clear for the specific service id.
                server.s.pool.clear(connection.serviceId);
                if (!server.loadBalanced) {
                    markServerUnknown(server, error);
                }
            }
        }
        else {
            if ((isRetryableWritesEnabled(server.s.topology) || (0, transactions_1.isTransactionCommand)(cmd)) &&
                (0, error_1.needsRetryableWriteLabel)(error, (0, utils_1.maxWireVersion)(server)) &&
                !inActiveTransaction(session, cmd)) {
                error.addErrorLabel(error_1.MongoErrorLabel.RetryableWriteError);
            }
            if ((0, error_1.isSDAMUnrecoverableError)(error)) {
                if (shouldHandleStateChangeError(server, error)) {
                    if ((0, utils_1.maxWireVersion)(server) <= 7 || (0, error_1.isNodeShuttingDownError)(error)) {
                        server.s.pool.clear(connection.serviceId);
                    }
                    if (!server.loadBalanced) {
                        markServerUnknown(server, error);
                        process.nextTick(() => server.requestCheck());
                    }
                }
            }
        }
        if (session &&
            session.isPinned &&
            error.hasErrorLabel(error_1.MongoErrorLabel.TransientTransactionError)) {
            session.unpin({ force: true });
        }
        return callback(error);
    };
}
//# sourceMappingURL=server.js.map