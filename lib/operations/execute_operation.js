"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.executeOperation = void 0;
const error_1 = require("../error");
const read_preference_1 = require("../read_preference");
const server_selection_1 = require("../sdam/server_selection");
const utils_1 = require("../utils");
const operation_1 = require("./operation");
const MMAPv1_RETRY_WRITES_ERROR_CODE = error_1.MONGODB_ERROR_CODES.IllegalOperation;
const MMAPv1_RETRY_WRITES_ERROR_MESSAGE = 'This MongoDB deployment does not support retryable writes. Please add retryWrites=false to your connection string.';
function executeOperation(topologyProvider, operation, callback) {
    if (!(operation instanceof operation_1.AbstractOperation)) {
        // TODO(NODE-3483): Extend MongoRuntimeError
        throw new error_1.MongoRuntimeError('This method requires a valid operation instance');
    }
    return (0, utils_1.maybePromise)(callback, callback => {
        let topology;
        try {
            topology = (0, utils_1.getTopology)(topologyProvider);
        }
        catch (error) {
            return callback(error);
        }
        if (topology.shouldCheckForSessionSupport()) {
            return topology.selectServer(read_preference_1.ReadPreference.primaryPreferred, {}, err => {
                if (err)
                    return callback(err);
                executeOperation(topologyProvider, operation, callback);
            });
        }
        // The driver sessions spec mandates that we implicitly create sessions for operations
        // that are not explicitly provided with a session.
        let session = operation.session;
        let owner;
        if (topology.hasSessionSupport()) {
            if (session == null) {
                owner = Symbol();
                session = topology.startSession({ owner, explicit: false });
            }
            else if (session.hasEnded) {
                return callback(new error_1.MongoExpiredSessionError('Use of expired sessions is not permitted'));
            }
            else if (session.snapshotEnabled && !topology.capabilities.supportsSnapshotReads) {
                return callback(new error_1.MongoCompatibilityError('Snapshot reads require MongoDB 5.0 or later'));
            }
        }
        else if (session) {
            // If the user passed an explicit session and we are still, after server selection,
            // trying to run against a topology that doesn't support sessions we error out.
            return callback(new error_1.MongoCompatibilityError('Current topology does not support sessions'));
        }
        try {
            executeWithServerSelection(topology, session, operation, (error, result) => {
                if ((session === null || session === void 0 ? void 0 : session.owner) != null && session.owner === owner) {
                    return session.endSession(endSessionError => callback(endSessionError !== null && endSessionError !== void 0 ? endSessionError : error, result));
                }
                callback(error, result);
            });
        }
        catch (error) {
            if ((session === null || session === void 0 ? void 0 : session.owner) != null && session.owner === owner) {
                session.endSession();
            }
            throw error;
        }
    });
}
exports.executeOperation = executeOperation;
function executeWithServerSelection(topology, session, operation, callback) {
    var _a, _b;
    const readPreference = (_a = operation.readPreference) !== null && _a !== void 0 ? _a : read_preference_1.ReadPreference.primary;
    const inTransaction = !!(session === null || session === void 0 ? void 0 : session.inTransaction());
    if (inTransaction && !readPreference.equals(read_preference_1.ReadPreference.primary)) {
        return callback(new error_1.MongoTransactionError(`Read preference in a transaction must be primary, not: ${readPreference.mode}`));
    }
    if ((session === null || session === void 0 ? void 0 : session.isPinned) && session.transaction.isCommitted && !operation.bypassPinningCheck) {
        session.unpin();
    }
    let selector;
    if (operation.hasAspect(operation_1.Aspect.CURSOR_ITERATING)) {
        // Get more operations must always select the same server, but run through
        // server selection to potentially force monitor checks if the server is
        // in an unknown state.
        selector = (0, server_selection_1.sameServerSelector)((_b = operation.server) === null || _b === void 0 ? void 0 : _b.description);
    }
    else if (operation.trySecondaryWrite) {
        // If operation should try to write to secondary use the custom server selector
        // otherwise provide the read preference.
        selector = (0, server_selection_1.secondaryWritableServerSelector)(topology.commonWireVersion, readPreference);
    }
    else {
        selector = readPreference;
    }
    const serverSelectionOptions = { session };
    function retryOperation(originalError) {
        const isWriteOperation = operation.hasAspect(operation_1.Aspect.WRITE_OPERATION);
        const isReadOperation = operation.hasAspect(operation_1.Aspect.READ_OPERATION);
        if (isWriteOperation && originalError.code === MMAPv1_RETRY_WRITES_ERROR_CODE) {
            return callback(new error_1.MongoServerError({
                message: MMAPv1_RETRY_WRITES_ERROR_MESSAGE,
                errmsg: MMAPv1_RETRY_WRITES_ERROR_MESSAGE,
                originalError
            }));
        }
        if (isWriteOperation && !originalError.hasErrorLabel(error_1.MongoErrorLabel.RetryableWriteError)) {
            return callback(originalError);
        }
        if (isReadOperation && !(0, error_1.isRetryableReadError)(originalError)) {
            return callback(originalError);
        }
        if (originalError instanceof error_1.MongoNetworkError &&
            (session === null || session === void 0 ? void 0 : session.isPinned) &&
            !session.inTransaction() &&
            operation.hasAspect(operation_1.Aspect.CURSOR_CREATING)) {
            // If we have a cursor and the initial command fails with a network error,
            // we can retry it on another connection. So we need to check it back in, clear the
            // pool for the service id, and retry again.
            session.unpin({ force: true, forceClear: true });
        }
        // select a new server, and attempt to retry the operation
        topology.selectServer(selector, serverSelectionOptions, (error, server) => {
            if (!error && isWriteOperation && !(0, utils_1.supportsRetryableWrites)(server)) {
                return callback(new error_1.MongoUnexpectedServerResponseError('Selected server does not support retryable writes'));
            }
            if (error || !server) {
                return callback(error !== null && error !== void 0 ? error : new error_1.MongoUnexpectedServerResponseError('Server selection failed without error'));
            }
            operation.execute(server, session, callback);
        });
    }
    if (readPreference &&
        !readPreference.equals(read_preference_1.ReadPreference.primary) &&
        (session === null || session === void 0 ? void 0 : session.inTransaction())) {
        callback(new error_1.MongoTransactionError(`Read preference in a transaction must be primary, not: ${readPreference.mode}`));
        return;
    }
    // select a server, and execute the operation against it
    topology.selectServer(selector, serverSelectionOptions, (error, server) => {
        if (error || !server) {
            return callback(error);
        }
        if (session && operation.hasAspect(operation_1.Aspect.RETRYABLE)) {
            const willRetryRead = topology.s.options.retryReads && !inTransaction && operation.canRetryRead;
            const willRetryWrite = topology.s.options.retryWrites &&
                !inTransaction &&
                (0, utils_1.supportsRetryableWrites)(server) &&
                operation.canRetryWrite;
            const hasReadAspect = operation.hasAspect(operation_1.Aspect.READ_OPERATION);
            const hasWriteAspect = operation.hasAspect(operation_1.Aspect.WRITE_OPERATION);
            if ((hasReadAspect && willRetryRead) || (hasWriteAspect && willRetryWrite)) {
                if (hasWriteAspect && willRetryWrite) {
                    operation.options.willRetryWrite = true;
                    session.incrementTransactionNumber();
                }
                return operation.execute(server, session, (error, result) => {
                    if (error instanceof error_1.MongoError) {
                        return retryOperation(error);
                    }
                    else if (error) {
                        return callback(error);
                    }
                    callback(undefined, result);
                });
            }
        }
        return operation.execute(server, session, callback);
    });
}
//# sourceMappingURL=execute_operation.js.map