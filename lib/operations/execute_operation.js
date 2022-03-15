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
function executeOperation(topology, operation, callback) {
    if (!(operation instanceof operation_1.AbstractOperation)) {
        // TODO(NODE-3483)
        throw new error_1.MongoRuntimeError('This method requires a valid operation instance');
    }
    return (0, utils_1.maybePromise)(callback, cb => {
        if (topology.shouldCheckForSessionSupport()) {
            return topology.selectServer(read_preference_1.ReadPreference.primaryPreferred, err => {
                if (err)
                    return cb(err);
                executeOperation(topology, operation, cb);
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
                return cb(new error_1.MongoExpiredSessionError('Use of expired sessions is not permitted'));
            }
            else if (session.snapshotEnabled && !topology.capabilities.supportsSnapshotReads) {
                return cb(new error_1.MongoCompatibilityError('Snapshot reads require MongoDB 5.0 or later'));
            }
        }
        else if (session) {
            // If the user passed an explicit session and we are still, after server selection,
            // trying to run against a topology that doesn't support sessions we error out.
            return cb(new error_1.MongoCompatibilityError('Current topology does not support sessions'));
        }
        try {
            executeWithServerSelection(topology, session, operation, (err, result) => {
                if (session && session.owner && session.owner === owner) {
                    return session.endSession(err2 => cb(err2 || err, result));
                }
                cb(err, result);
            });
        }
        catch (e) {
            if (session && session.owner && session.owner === owner) {
                session.endSession();
            }
            throw e;
        }
    });
}
exports.executeOperation = executeOperation;
function supportsRetryableReads(server) {
    return (0, utils_1.maxWireVersion)(server) >= 6;
}
function executeWithServerSelection(topology, session, operation, callback) {
    var _a;
    const readPreference = operation.readPreference || read_preference_1.ReadPreference.primary;
    const inTransaction = session && session.inTransaction();
    if (inTransaction && !readPreference.equals(read_preference_1.ReadPreference.primary)) {
        callback(new error_1.MongoTransactionError(`Read preference in a transaction must be primary, not: ${readPreference.mode}`));
        return;
    }
    if (session &&
        session.isPinned &&
        session.transaction.isCommitted &&
        !operation.bypassPinningCheck) {
        session.unpin();
    }
    let selector;
    if (operation.hasAspect(operation_1.Aspect.CURSOR_ITERATING)) {
        // Get more operations must always select the same server, but run through
        // server selection to potentially force monitor checks if the server is
        // in an unknown state.
        selector = (0, server_selection_1.sameServerSelector)((_a = operation.server) === null || _a === void 0 ? void 0 : _a.description);
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
    function callbackWithRetry(err, result) {
        if (err == null) {
            return callback(undefined, result);
        }
        const hasReadAspect = operation.hasAspect(operation_1.Aspect.READ_OPERATION);
        const hasWriteAspect = operation.hasAspect(operation_1.Aspect.WRITE_OPERATION);
        const itShouldRetryWrite = shouldRetryWrite(err);
        if ((hasReadAspect && !(0, error_1.isRetryableError)(err)) || (hasWriteAspect && !itShouldRetryWrite)) {
            return callback(err);
        }
        if (hasWriteAspect &&
            itShouldRetryWrite &&
            err.code === MMAPv1_RETRY_WRITES_ERROR_CODE &&
            err.errmsg.match(/Transaction numbers/)) {
            callback(new error_1.MongoServerError({
                message: MMAPv1_RETRY_WRITES_ERROR_MESSAGE,
                errmsg: MMAPv1_RETRY_WRITES_ERROR_MESSAGE,
                originalError: err
            }));
            return;
        }
        // select a new server, and attempt to retry the operation
        topology.selectServer(selector, serverSelectionOptions, (e, server) => {
            if (e ||
                (operation.hasAspect(operation_1.Aspect.READ_OPERATION) && !supportsRetryableReads(server)) ||
                (operation.hasAspect(operation_1.Aspect.WRITE_OPERATION) && !(0, utils_1.supportsRetryableWrites)(server))) {
                callback(e);
                return;
            }
            // If we have a cursor and the initial command fails with a network error,
            // we can retry it on another connection. So we need to check it back in, clear the
            // pool for the service id, and retry again.
            if (err &&
                err instanceof error_1.MongoNetworkError &&
                server.loadBalanced &&
                session &&
                session.isPinned &&
                !session.inTransaction() &&
                operation.hasAspect(operation_1.Aspect.CURSOR_CREATING)) {
                session.unpin({ force: true, forceClear: true });
            }
            operation.execute(server, session, callback);
        });
    }
    if (readPreference &&
        !readPreference.equals(read_preference_1.ReadPreference.primary) &&
        session &&
        session.inTransaction()) {
        callback(new error_1.MongoTransactionError(`Read preference in a transaction must be primary, not: ${readPreference.mode}`));
        return;
    }
    // select a server, and execute the operation against it
    topology.selectServer(selector, serverSelectionOptions, (err, server) => {
        if (err) {
            callback(err);
            return;
        }
        if (session && operation.hasAspect(operation_1.Aspect.RETRYABLE)) {
            const willRetryRead = topology.s.options.retryReads !== false &&
                !inTransaction &&
                supportsRetryableReads(server) &&
                operation.canRetryRead;
            const willRetryWrite = topology.s.options.retryWrites === true &&
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
                operation.execute(server, session, callbackWithRetry);
                return;
            }
        }
        operation.execute(server, session, callback);
    });
}
function shouldRetryWrite(err) {
    return err instanceof error_1.MongoError && err.hasErrorLabel('RetryableWriteError');
}
//# sourceMappingURL=execute_operation.js.map