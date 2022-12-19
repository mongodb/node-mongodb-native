"use strict";
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateSessionFromResponse = exports.applySession = exports.ServerSessionPool = exports.ServerSession = exports.maybeClearPinnedConnection = exports.ClientSession = void 0;
const util_1 = require("util");
const bson_1 = require("./bson");
const metrics_1 = require("./cmap/metrics");
const shared_1 = require("./cmap/wire_protocol/shared");
const constants_1 = require("./constants");
const error_1 = require("./error");
const mongo_types_1 = require("./mongo_types");
const execute_operation_1 = require("./operations/execute_operation");
const run_command_1 = require("./operations/run_command");
const promise_provider_1 = require("./promise_provider");
const read_concern_1 = require("./read_concern");
const read_preference_1 = require("./read_preference");
const common_1 = require("./sdam/common");
const transactions_1 = require("./transactions");
const utils_1 = require("./utils");
const minWireVersionForShardedTransactions = 8;
/** @internal */
const kServerSession = Symbol('serverSession');
/** @internal */
const kSnapshotTime = Symbol('snapshotTime');
/** @internal */
const kSnapshotEnabled = Symbol('snapshotEnabled');
/** @internal */
const kPinnedConnection = Symbol('pinnedConnection');
/** @internal Accumulates total number of increments to add to txnNumber when applying session to command */
const kTxnNumberIncrement = Symbol('txnNumberIncrement');
/**
 * A class representing a client session on the server
 *
 * NOTE: not meant to be instantiated directly.
 * @public
 */
class ClientSession extends mongo_types_1.TypedEventEmitter {
    /**
     * Create a client session.
     * @internal
     * @param client - The current client
     * @param sessionPool - The server session pool (Internal Class)
     * @param options - Optional settings
     * @param clientOptions - Optional settings provided when creating a MongoClient
     */
    constructor(client, sessionPool, options, clientOptions) {
        var _b;
        super();
        /** @internal */
        this[_a] = false;
        if (client == null) {
            // TODO(NODE-3483)
            throw new error_1.MongoRuntimeError('ClientSession requires a MongoClient');
        }
        if (sessionPool == null || !(sessionPool instanceof ServerSessionPool)) {
            // TODO(NODE-3483)
            throw new error_1.MongoRuntimeError('ClientSession requires a ServerSessionPool');
        }
        options = options !== null && options !== void 0 ? options : {};
        if (options.snapshot === true) {
            this[kSnapshotEnabled] = true;
            if (options.causalConsistency === true) {
                throw new error_1.MongoInvalidArgumentError('Properties "causalConsistency" and "snapshot" are mutually exclusive');
            }
        }
        this.client = client;
        this.sessionPool = sessionPool;
        this.hasEnded = false;
        this.clientOptions = clientOptions;
        this.explicit = !!options.explicit;
        this[kServerSession] = this.explicit ? this.sessionPool.acquire() : null;
        this[kTxnNumberIncrement] = 0;
        const defaultCausalConsistencyValue = this.explicit && options.snapshot !== true;
        this.supports = {
            // if we can enable causal consistency, do so by default
            causalConsistency: (_b = options.causalConsistency) !== null && _b !== void 0 ? _b : defaultCausalConsistencyValue
        };
        this.clusterTime = options.initialClusterTime;
        this.operationTime = undefined;
        this.owner = options.owner;
        this.defaultTransactionOptions = Object.assign({}, options.defaultTransactionOptions);
        this.transaction = new transactions_1.Transaction();
    }
    /** The server id associated with this session */
    get id() {
        var _b;
        return (_b = this[kServerSession]) === null || _b === void 0 ? void 0 : _b.id;
    }
    get serverSession() {
        let serverSession = this[kServerSession];
        if (serverSession == null) {
            if (this.explicit) {
                throw new error_1.MongoRuntimeError('Unexpected null serverSession for an explicit session');
            }
            if (this.hasEnded) {
                throw new error_1.MongoRuntimeError('Unexpected null serverSession for an ended implicit session');
            }
            serverSession = this.sessionPool.acquire();
            this[kServerSession] = serverSession;
        }
        return serverSession;
    }
    /** Whether or not this session is configured for snapshot reads */
    get snapshotEnabled() {
        return this[kSnapshotEnabled];
    }
    get loadBalanced() {
        var _b;
        return ((_b = this.client.topology) === null || _b === void 0 ? void 0 : _b.description.type) === common_1.TopologyType.LoadBalanced;
    }
    /** @internal */
    get pinnedConnection() {
        return this[kPinnedConnection];
    }
    /** @internal */
    pin(conn) {
        if (this[kPinnedConnection]) {
            throw TypeError('Cannot pin multiple connections to the same session');
        }
        this[kPinnedConnection] = conn;
        conn.emit(constants_1.PINNED, this.inTransaction() ? metrics_1.ConnectionPoolMetrics.TXN : metrics_1.ConnectionPoolMetrics.CURSOR);
    }
    /** @internal */
    unpin(options) {
        if (this.loadBalanced) {
            return maybeClearPinnedConnection(this, options);
        }
        this.transaction.unpinServer();
    }
    get isPinned() {
        return this.loadBalanced ? !!this[kPinnedConnection] : this.transaction.isPinned;
    }
    endSession(options, callback) {
        if (typeof options === 'function')
            (callback = options), (options = {});
        const finalOptions = { force: true, ...options };
        return (0, utils_1.maybeCallback)(async () => {
            try {
                if (this.inTransaction()) {
                    await this.abortTransaction();
                }
                if (!this.hasEnded) {
                    const serverSession = this[kServerSession];
                    if (serverSession != null) {
                        // release the server session back to the pool
                        this.sessionPool.release(serverSession);
                        // Make sure a new serverSession never makes it onto this ClientSession
                        Object.defineProperty(this, kServerSession, {
                            value: ServerSession.clone(serverSession),
                            writable: false
                        });
                    }
                    // mark the session as ended, and emit a signal
                    this.hasEnded = true;
                    this.emit('ended', this);
                }
            }
            catch {
                // spec indicates that we should ignore all errors for `endSessions`
            }
            finally {
                maybeClearPinnedConnection(this, finalOptions);
            }
        }, callback);
    }
    /**
     * Advances the operationTime for a ClientSession.
     *
     * @param operationTime - the `BSON.Timestamp` of the operation type it is desired to advance to
     */
    advanceOperationTime(operationTime) {
        if (this.operationTime == null) {
            this.operationTime = operationTime;
            return;
        }
        if (operationTime.greaterThan(this.operationTime)) {
            this.operationTime = operationTime;
        }
    }
    /**
     * Advances the clusterTime for a ClientSession to the provided clusterTime of another ClientSession
     *
     * @param clusterTime - the $clusterTime returned by the server from another session in the form of a document containing the `BSON.Timestamp` clusterTime and signature
     */
    advanceClusterTime(clusterTime) {
        var _b, _c;
        if (!clusterTime || typeof clusterTime !== 'object') {
            throw new error_1.MongoInvalidArgumentError('input cluster time must be an object');
        }
        if (!clusterTime.clusterTime || clusterTime.clusterTime._bsontype !== 'Timestamp') {
            throw new error_1.MongoInvalidArgumentError('input cluster time "clusterTime" property must be a valid BSON Timestamp');
        }
        if (!clusterTime.signature ||
            ((_b = clusterTime.signature.hash) === null || _b === void 0 ? void 0 : _b._bsontype) !== 'Binary' ||
            (typeof clusterTime.signature.keyId !== 'number' &&
                ((_c = clusterTime.signature.keyId) === null || _c === void 0 ? void 0 : _c._bsontype) !== 'Long') // apparently we decode the key to number?
        ) {
            throw new error_1.MongoInvalidArgumentError('input cluster time must have a valid "signature" property with BSON Binary hash and BSON Long keyId');
        }
        (0, common_1._advanceClusterTime)(this, clusterTime);
    }
    /**
     * Used to determine if this session equals another
     *
     * @param session - The session to compare to
     */
    equals(session) {
        if (!(session instanceof ClientSession)) {
            return false;
        }
        if (this.id == null || session.id == null) {
            return false;
        }
        return utils_1.ByteUtils.equals(this.id.id.buffer, session.id.id.buffer);
    }
    /**
     * Increment the transaction number on the internal ServerSession
     *
     * @privateRemarks
     * This helper increments a value stored on the client session that will be
     * added to the serverSession's txnNumber upon applying it to a command.
     * This is because the serverSession is lazily acquired after a connection is obtained
     */
    incrementTransactionNumber() {
        this[kTxnNumberIncrement] += 1;
    }
    /** @returns whether this session is currently in a transaction or not */
    inTransaction() {
        return this.transaction.isActive;
    }
    /**
     * Starts a new transaction with the given options.
     *
     * @param options - Options for the transaction
     */
    startTransaction(options) {
        var _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
        if (this[kSnapshotEnabled]) {
            throw new error_1.MongoCompatibilityError('Transactions are not supported in snapshot sessions');
        }
        if (this.inTransaction()) {
            throw new error_1.MongoTransactionError('Transaction already in progress');
        }
        if (this.isPinned && this.transaction.isCommitted) {
            this.unpin();
        }
        const topologyMaxWireVersion = (0, utils_1.maxWireVersion)(this.client.topology);
        if ((0, shared_1.isSharded)(this.client.topology) &&
            topologyMaxWireVersion != null &&
            topologyMaxWireVersion < minWireVersionForShardedTransactions) {
            throw new error_1.MongoCompatibilityError('Transactions are not supported on sharded clusters in MongoDB < 4.2.');
        }
        // increment txnNumber
        this.incrementTransactionNumber();
        // create transaction state
        this.transaction = new transactions_1.Transaction({
            readConcern: (_c = (_b = options === null || options === void 0 ? void 0 : options.readConcern) !== null && _b !== void 0 ? _b : this.defaultTransactionOptions.readConcern) !== null && _c !== void 0 ? _c : (_d = this.clientOptions) === null || _d === void 0 ? void 0 : _d.readConcern,
            writeConcern: (_f = (_e = options === null || options === void 0 ? void 0 : options.writeConcern) !== null && _e !== void 0 ? _e : this.defaultTransactionOptions.writeConcern) !== null && _f !== void 0 ? _f : (_g = this.clientOptions) === null || _g === void 0 ? void 0 : _g.writeConcern,
            readPreference: (_j = (_h = options === null || options === void 0 ? void 0 : options.readPreference) !== null && _h !== void 0 ? _h : this.defaultTransactionOptions.readPreference) !== null && _j !== void 0 ? _j : (_k = this.clientOptions) === null || _k === void 0 ? void 0 : _k.readPreference,
            maxCommitTimeMS: (_l = options === null || options === void 0 ? void 0 : options.maxCommitTimeMS) !== null && _l !== void 0 ? _l : this.defaultTransactionOptions.maxCommitTimeMS
        });
        this.transaction.transition(transactions_1.TxnState.STARTING_TRANSACTION);
    }
    commitTransaction(callback) {
        return (0, utils_1.maybeCallback)(async () => endTransactionAsync(this, 'commitTransaction'), callback);
    }
    abortTransaction(callback) {
        return (0, utils_1.maybeCallback)(async () => endTransactionAsync(this, 'abortTransaction'), callback);
    }
    /**
     * This is here to ensure that ClientSession is never serialized to BSON.
     */
    toBSON() {
        throw new error_1.MongoRuntimeError('ClientSession cannot be serialized to BSON.');
    }
    /**
     * Runs a provided callback within a transaction, retrying either the commitTransaction operation
     * or entire transaction as needed (and when the error permits) to better ensure that
     * the transaction can complete successfully.
     *
     * **IMPORTANT:** This method requires the user to return a Promise, and `await` all operations.
     * Any callbacks that do not return a Promise will result in undefined behavior.
     *
     * @remarks
     * This function:
     * - Will return the command response from the final commitTransaction if every operation is successful (can be used as a truthy object)
     * - Will return `undefined` if the transaction is explicitly aborted with `await session.abortTransaction()`
     * - Will throw if one of the operations throws or `throw` statement is used inside the `withTransaction` callback
     *
     * Checkout a descriptive example here:
     * @see https://www.mongodb.com/developer/quickstart/node-transactions/
     *
     * @param fn - callback to run within a transaction
     * @param options - optional settings for the transaction
     * @returns A raw command response or undefined
     */
    withTransaction(fn, options) {
        const startTime = (0, utils_1.now)();
        return attemptTransaction(this, startTime, fn, options);
    }
}
exports.ClientSession = ClientSession;
_a = kSnapshotEnabled;
const MAX_WITH_TRANSACTION_TIMEOUT = 120000;
const NON_DETERMINISTIC_WRITE_CONCERN_ERRORS = new Set([
    'CannotSatisfyWriteConcern',
    'UnknownReplWriteConcern',
    'UnsatisfiableWriteConcern'
]);
function hasNotTimedOut(startTime, max) {
    return (0, utils_1.calculateDurationInMs)(startTime) < max;
}
function isUnknownTransactionCommitResult(err) {
    const isNonDeterministicWriteConcernError = err instanceof error_1.MongoServerError &&
        err.codeName &&
        NON_DETERMINISTIC_WRITE_CONCERN_ERRORS.has(err.codeName);
    return (isMaxTimeMSExpiredError(err) ||
        (!isNonDeterministicWriteConcernError &&
            err.code !== error_1.MONGODB_ERROR_CODES.UnsatisfiableWriteConcern &&
            err.code !== error_1.MONGODB_ERROR_CODES.UnknownReplWriteConcern));
}
function maybeClearPinnedConnection(session, options) {
    // unpin a connection if it has been pinned
    const conn = session[kPinnedConnection];
    const error = options === null || options === void 0 ? void 0 : options.error;
    if (session.inTransaction() &&
        error &&
        error instanceof error_1.MongoError &&
        error.hasErrorLabel(error_1.MongoErrorLabel.TransientTransactionError)) {
        return;
    }
    const topology = session.client.topology;
    // NOTE: the spec talks about what to do on a network error only, but the tests seem to
    //       to validate that we don't unpin on _all_ errors?
    if (conn && topology != null) {
        const servers = Array.from(topology.s.servers.values());
        const loadBalancer = servers[0];
        if ((options === null || options === void 0 ? void 0 : options.error) == null || (options === null || options === void 0 ? void 0 : options.force)) {
            loadBalancer.s.pool.checkIn(conn);
            conn.emit(constants_1.UNPINNED, session.transaction.state !== transactions_1.TxnState.NO_TRANSACTION
                ? metrics_1.ConnectionPoolMetrics.TXN
                : metrics_1.ConnectionPoolMetrics.CURSOR);
            if (options === null || options === void 0 ? void 0 : options.forceClear) {
                loadBalancer.s.pool.clear({ serviceId: conn.serviceId });
            }
        }
        session[kPinnedConnection] = undefined;
    }
}
exports.maybeClearPinnedConnection = maybeClearPinnedConnection;
function isMaxTimeMSExpiredError(err) {
    if (err == null || !(err instanceof error_1.MongoServerError)) {
        return false;
    }
    return (err.code === error_1.MONGODB_ERROR_CODES.MaxTimeMSExpired ||
        (err.writeConcernError && err.writeConcernError.code === error_1.MONGODB_ERROR_CODES.MaxTimeMSExpired));
}
function attemptTransactionCommit(session, startTime, fn, options) {
    return session.commitTransaction().catch((err) => {
        if (err instanceof error_1.MongoError &&
            hasNotTimedOut(startTime, MAX_WITH_TRANSACTION_TIMEOUT) &&
            !isMaxTimeMSExpiredError(err)) {
            if (err.hasErrorLabel(error_1.MongoErrorLabel.UnknownTransactionCommitResult)) {
                return attemptTransactionCommit(session, startTime, fn, options);
            }
            if (err.hasErrorLabel(error_1.MongoErrorLabel.TransientTransactionError)) {
                return attemptTransaction(session, startTime, fn, options);
            }
        }
        throw err;
    });
}
const USER_EXPLICIT_TXN_END_STATES = new Set([
    transactions_1.TxnState.NO_TRANSACTION,
    transactions_1.TxnState.TRANSACTION_COMMITTED,
    transactions_1.TxnState.TRANSACTION_ABORTED
]);
function userExplicitlyEndedTransaction(session) {
    return USER_EXPLICIT_TXN_END_STATES.has(session.transaction.state);
}
function attemptTransaction(session, startTime, fn, options) {
    var _b;
    session.startTransaction(options);
    let promise;
    try {
        promise = fn(session);
    }
    catch (err) {
        const PromiseConstructor = (_b = promise_provider_1.PromiseProvider.get()) !== null && _b !== void 0 ? _b : Promise;
        promise = PromiseConstructor.reject(err);
    }
    if (!(0, utils_1.isPromiseLike)(promise)) {
        session.abortTransaction().catch(() => null);
        throw new error_1.MongoInvalidArgumentError('Function provided to `withTransaction` must return a Promise');
    }
    return promise.then(() => {
        if (userExplicitlyEndedTransaction(session)) {
            return;
        }
        return attemptTransactionCommit(session, startTime, fn, options);
    }, err => {
        function maybeRetryOrThrow(err) {
            if (err instanceof error_1.MongoError &&
                err.hasErrorLabel(error_1.MongoErrorLabel.TransientTransactionError) &&
                hasNotTimedOut(startTime, MAX_WITH_TRANSACTION_TIMEOUT)) {
                return attemptTransaction(session, startTime, fn, options);
            }
            if (isMaxTimeMSExpiredError(err)) {
                err.addErrorLabel(error_1.MongoErrorLabel.UnknownTransactionCommitResult);
            }
            throw err;
        }
        if (session.inTransaction()) {
            return session.abortTransaction().then(() => maybeRetryOrThrow(err));
        }
        return maybeRetryOrThrow(err);
    });
}
const endTransactionAsync = (0, util_1.promisify)(endTransaction);
function endTransaction(session, commandName, callback) {
    // handle any initial problematic cases
    const txnState = session.transaction.state;
    if (txnState === transactions_1.TxnState.NO_TRANSACTION) {
        callback(new error_1.MongoTransactionError('No transaction started'));
        return;
    }
    if (commandName === 'commitTransaction') {
        if (txnState === transactions_1.TxnState.STARTING_TRANSACTION ||
            txnState === transactions_1.TxnState.TRANSACTION_COMMITTED_EMPTY) {
            // the transaction was never started, we can safely exit here
            session.transaction.transition(transactions_1.TxnState.TRANSACTION_COMMITTED_EMPTY);
            callback();
            return;
        }
        if (txnState === transactions_1.TxnState.TRANSACTION_ABORTED) {
            callback(new error_1.MongoTransactionError('Cannot call commitTransaction after calling abortTransaction'));
            return;
        }
    }
    else {
        if (txnState === transactions_1.TxnState.STARTING_TRANSACTION) {
            // the transaction was never started, we can safely exit here
            session.transaction.transition(transactions_1.TxnState.TRANSACTION_ABORTED);
            callback();
            return;
        }
        if (txnState === transactions_1.TxnState.TRANSACTION_ABORTED) {
            callback(new error_1.MongoTransactionError('Cannot call abortTransaction twice'));
            return;
        }
        if (txnState === transactions_1.TxnState.TRANSACTION_COMMITTED ||
            txnState === transactions_1.TxnState.TRANSACTION_COMMITTED_EMPTY) {
            callback(new error_1.MongoTransactionError('Cannot call abortTransaction after calling commitTransaction'));
            return;
        }
    }
    // construct and send the command
    const command = { [commandName]: 1 };
    // apply a writeConcern if specified
    let writeConcern;
    if (session.transaction.options.writeConcern) {
        writeConcern = Object.assign({}, session.transaction.options.writeConcern);
    }
    else if (session.clientOptions && session.clientOptions.writeConcern) {
        writeConcern = { w: session.clientOptions.writeConcern.w };
    }
    if (txnState === transactions_1.TxnState.TRANSACTION_COMMITTED) {
        writeConcern = Object.assign({ wtimeout: 10000 }, writeConcern, { w: 'majority' });
    }
    if (writeConcern) {
        Object.assign(command, { writeConcern });
    }
    if (commandName === 'commitTransaction' && session.transaction.options.maxTimeMS) {
        Object.assign(command, { maxTimeMS: session.transaction.options.maxTimeMS });
    }
    function commandHandler(error, result) {
        if (commandName !== 'commitTransaction') {
            session.transaction.transition(transactions_1.TxnState.TRANSACTION_ABORTED);
            if (session.loadBalanced) {
                maybeClearPinnedConnection(session, { force: false });
            }
            // The spec indicates that we should ignore all errors on `abortTransaction`
            return callback();
        }
        session.transaction.transition(transactions_1.TxnState.TRANSACTION_COMMITTED);
        if (error instanceof error_1.MongoError) {
            if (error.hasErrorLabel(error_1.MongoErrorLabel.RetryableWriteError) ||
                error instanceof error_1.MongoWriteConcernError ||
                isMaxTimeMSExpiredError(error)) {
                if (isUnknownTransactionCommitResult(error)) {
                    error.addErrorLabel(error_1.MongoErrorLabel.UnknownTransactionCommitResult);
                    // per txns spec, must unpin session in this case
                    session.unpin({ error });
                }
            }
            else if (error.hasErrorLabel(error_1.MongoErrorLabel.TransientTransactionError)) {
                session.unpin({ error });
            }
        }
        callback(error, result);
    }
    if (session.transaction.recoveryToken) {
        command.recoveryToken = session.transaction.recoveryToken;
    }
    // send the command
    (0, execute_operation_1.executeOperation)(session.client, new run_command_1.RunAdminCommandOperation(undefined, command, {
        session,
        readPreference: read_preference_1.ReadPreference.primary,
        bypassPinningCheck: true
    }), (error, result) => {
        if (command.abortTransaction) {
            // always unpin on abort regardless of command outcome
            session.unpin();
        }
        if (error instanceof error_1.MongoError && error.hasErrorLabel(error_1.MongoErrorLabel.RetryableWriteError)) {
            // SPEC-1185: apply majority write concern when retrying commitTransaction
            if (command.commitTransaction) {
                // per txns spec, must unpin session in this case
                session.unpin({ force: true });
                command.writeConcern = Object.assign({ wtimeout: 10000 }, command.writeConcern, {
                    w: 'majority'
                });
            }
            return (0, execute_operation_1.executeOperation)(session.client, new run_command_1.RunAdminCommandOperation(undefined, command, {
                session,
                readPreference: read_preference_1.ReadPreference.primary,
                bypassPinningCheck: true
            }), commandHandler);
        }
        commandHandler(error, result);
    });
}
/**
 * Reflects the existence of a session on the server. Can be reused by the session pool.
 * WARNING: not meant to be instantiated directly. For internal use only.
 * @public
 */
class ServerSession {
    /** @internal */
    constructor() {
        this.id = { id: new bson_1.Binary((0, utils_1.uuidV4)(), bson_1.Binary.SUBTYPE_UUID) };
        this.lastUse = (0, utils_1.now)();
        this.txnNumber = 0;
        this.isDirty = false;
    }
    /**
     * Determines if the server session has timed out.
     *
     * @param sessionTimeoutMinutes - The server's "logicalSessionTimeoutMinutes"
     */
    hasTimedOut(sessionTimeoutMinutes) {
        // Take the difference of the lastUse timestamp and now, which will result in a value in
        // milliseconds, and then convert milliseconds to minutes to compare to `sessionTimeoutMinutes`
        const idleTimeMinutes = Math.round((((0, utils_1.calculateDurationInMs)(this.lastUse) % 86400000) % 3600000) / 60000);
        return idleTimeMinutes > sessionTimeoutMinutes - 1;
    }
    /**
     * @internal
     * Cloning meant to keep a readable reference to the server session data
     * after ClientSession has ended
     */
    static clone(serverSession) {
        const arrayBuffer = new ArrayBuffer(16);
        const idBytes = Buffer.from(arrayBuffer);
        idBytes.set(serverSession.id.id.buffer);
        const id = new bson_1.Binary(idBytes, serverSession.id.id.sub_type);
        // Manual prototype construction to avoid modifying the constructor of this class
        return Object.setPrototypeOf({
            id: { id },
            lastUse: serverSession.lastUse,
            txnNumber: serverSession.txnNumber,
            isDirty: serverSession.isDirty
        }, ServerSession.prototype);
    }
}
exports.ServerSession = ServerSession;
/**
 * Maintains a pool of Server Sessions.
 * For internal use only
 * @internal
 */
class ServerSessionPool {
    constructor(client) {
        if (client == null) {
            throw new error_1.MongoRuntimeError('ServerSessionPool requires a MongoClient');
        }
        this.client = client;
        this.sessions = new utils_1.List();
    }
    /**
     * Acquire a Server Session from the pool.
     * Iterates through each session in the pool, removing any stale sessions
     * along the way. The first non-stale session found is removed from the
     * pool and returned. If no non-stale session is found, a new ServerSession is created.
     */
    acquire() {
        var _b, _c, _d;
        const sessionTimeoutMinutes = (_c = (_b = this.client.topology) === null || _b === void 0 ? void 0 : _b.logicalSessionTimeoutMinutes) !== null && _c !== void 0 ? _c : 10;
        let session = null;
        // Try to obtain from session pool
        while (this.sessions.length > 0) {
            const potentialSession = this.sessions.shift();
            if (potentialSession != null &&
                (!!((_d = this.client.topology) === null || _d === void 0 ? void 0 : _d.loadBalanced) ||
                    !potentialSession.hasTimedOut(sessionTimeoutMinutes))) {
                session = potentialSession;
                break;
            }
        }
        // If nothing valid came from the pool make a new one
        if (session == null) {
            session = new ServerSession();
        }
        return session;
    }
    /**
     * Release a session to the session pool
     * Adds the session back to the session pool if the session has not timed out yet.
     * This method also removes any stale sessions from the pool.
     *
     * @param session - The session to release to the pool
     */
    release(session) {
        var _b, _c, _d;
        const sessionTimeoutMinutes = (_c = (_b = this.client.topology) === null || _b === void 0 ? void 0 : _b.logicalSessionTimeoutMinutes) !== null && _c !== void 0 ? _c : 10;
        if (((_d = this.client.topology) === null || _d === void 0 ? void 0 : _d.loadBalanced) && !sessionTimeoutMinutes) {
            this.sessions.unshift(session);
        }
        if (!sessionTimeoutMinutes) {
            return;
        }
        this.sessions.prune(session => session.hasTimedOut(sessionTimeoutMinutes));
        if (!session.hasTimedOut(sessionTimeoutMinutes)) {
            if (session.isDirty) {
                return;
            }
            // otherwise, readd this session to the session pool
            this.sessions.unshift(session);
        }
    }
}
exports.ServerSessionPool = ServerSessionPool;
/**
 * Optionally decorate a command with sessions specific keys
 *
 * @param session - the session tracking transaction state
 * @param command - the command to decorate
 * @param options - Optional settings passed to calling operation
 *
 * @internal
 */
function applySession(session, command, options) {
    var _b, _c;
    if (session.hasEnded) {
        return new error_1.MongoExpiredSessionError();
    }
    // May acquire serverSession here
    const serverSession = session.serverSession;
    if (serverSession == null) {
        return new error_1.MongoRuntimeError('Unable to acquire server session');
    }
    if (((_b = options.writeConcern) === null || _b === void 0 ? void 0 : _b.w) === 0) {
        if (session && session.explicit) {
            // Error if user provided an explicit session to an unacknowledged write (SPEC-1019)
            return new error_1.MongoAPIError('Cannot have explicit session with unacknowledged writes');
        }
        return;
    }
    // mark the last use of this session, and apply the `lsid`
    serverSession.lastUse = (0, utils_1.now)();
    command.lsid = serverSession.id;
    const inTxnOrTxnCommand = session.inTransaction() || (0, transactions_1.isTransactionCommand)(command);
    const isRetryableWrite = !!options.willRetryWrite;
    if (isRetryableWrite || inTxnOrTxnCommand) {
        serverSession.txnNumber += session[kTxnNumberIncrement];
        session[kTxnNumberIncrement] = 0;
        // TODO(NODE-2674): Preserve int64 sent from MongoDB
        command.txnNumber = bson_1.Long.fromNumber(serverSession.txnNumber);
    }
    if (!inTxnOrTxnCommand) {
        if (session.transaction.state !== transactions_1.TxnState.NO_TRANSACTION) {
            session.transaction.transition(transactions_1.TxnState.NO_TRANSACTION);
        }
        if (session.supports.causalConsistency &&
            session.operationTime &&
            (0, utils_1.commandSupportsReadConcern)(command, options)) {
            command.readConcern = command.readConcern || {};
            Object.assign(command.readConcern, { afterClusterTime: session.operationTime });
        }
        else if (session[kSnapshotEnabled]) {
            command.readConcern = command.readConcern || { level: read_concern_1.ReadConcernLevel.snapshot };
            if (session[kSnapshotTime] != null) {
                Object.assign(command.readConcern, { atClusterTime: session[kSnapshotTime] });
            }
        }
        return;
    }
    // now attempt to apply transaction-specific sessions data
    // `autocommit` must always be false to differentiate from retryable writes
    command.autocommit = false;
    if (session.transaction.state === transactions_1.TxnState.STARTING_TRANSACTION) {
        session.transaction.transition(transactions_1.TxnState.TRANSACTION_IN_PROGRESS);
        command.startTransaction = true;
        const readConcern = session.transaction.options.readConcern || ((_c = session === null || session === void 0 ? void 0 : session.clientOptions) === null || _c === void 0 ? void 0 : _c.readConcern);
        if (readConcern) {
            command.readConcern = readConcern;
        }
        if (session.supports.causalConsistency && session.operationTime) {
            command.readConcern = command.readConcern || {};
            Object.assign(command.readConcern, { afterClusterTime: session.operationTime });
        }
    }
    return;
}
exports.applySession = applySession;
function updateSessionFromResponse(session, document) {
    var _b;
    if (document.$clusterTime) {
        (0, common_1._advanceClusterTime)(session, document.$clusterTime);
    }
    if (document.operationTime && session && session.supports.causalConsistency) {
        session.advanceOperationTime(document.operationTime);
    }
    if (document.recoveryToken && session && session.inTransaction()) {
        session.transaction._recoveryToken = document.recoveryToken;
    }
    if ((session === null || session === void 0 ? void 0 : session[kSnapshotEnabled]) && session[kSnapshotTime] == null) {
        // find and aggregate commands return atClusterTime on the cursor
        // distinct includes it in the response body
        const atClusterTime = ((_b = document.cursor) === null || _b === void 0 ? void 0 : _b.atClusterTime) || document.atClusterTime;
        if (atClusterTime) {
            session[kSnapshotTime] = atClusterTime;
        }
    }
}
exports.updateSessionFromResponse = updateSessionFromResponse;
//# sourceMappingURL=sessions.js.map