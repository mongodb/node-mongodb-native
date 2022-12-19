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
function executeOperation(client, operation, callback) {
    return (0, utils_1.maybeCallback)(() => executeOperationAsync(client, operation), callback);
}
exports.executeOperation = executeOperation;
async function executeOperationAsync(client, operation) {
    var _a, _b;
    if (!(operation instanceof operation_1.AbstractOperation)) {
        // TODO(NODE-3483): Extend MongoRuntimeError
        throw new error_1.MongoRuntimeError('This method requires a valid operation instance');
    }
    if (client.topology == null) {
        // Auto connect on operation
        if (client.s.hasBeenClosed) {
            throw new error_1.MongoNotConnectedError('Client must be connected before running operations');
        }
        client.s.options[Symbol.for('@@mdb.skipPingOnConnect')] = true;
        try {
            await client.connect();
        }
        finally {
            delete client.s.options[Symbol.for('@@mdb.skipPingOnConnect')];
        }
    }
    const { topology } = client;
    if (topology == null) {
        throw new error_1.MongoRuntimeError('client.connect did not create a topology but also did not throw');
    }
    if (topology.shouldCheckForSessionSupport()) {
        await topology.selectServerAsync(read_preference_1.ReadPreference.primaryPreferred, {});
    }
    // The driver sessions spec mandates that we implicitly create sessions for operations
    // that are not explicitly provided with a session.
    let session = operation.session;
    let owner;
    if (topology.hasSessionSupport()) {
        if (session == null) {
            owner = Symbol();
            session = client.startSession({ owner, explicit: false });
        }
        else if (session.hasEnded) {
            throw new error_1.MongoExpiredSessionError('Use of expired sessions is not permitted');
        }
        else if (session.snapshotEnabled && !topology.capabilities.supportsSnapshotReads) {
            throw new error_1.MongoCompatibilityError('Snapshot reads require MongoDB 5.0 or later');
        }
    }
    else {
        // no session support
        if (session && session.explicit) {
            // If the user passed an explicit session and we are still, after server selection,
            // trying to run against a topology that doesn't support sessions we error out.
            throw new error_1.MongoCompatibilityError('Current topology does not support sessions');
        }
        else if (session && !session.explicit) {
            // We do not have to worry about ending the session because the server session has not been acquired yet
            delete operation.options.session;
            operation.clearSession();
            session = undefined;
        }
    }
    const readPreference = (_a = operation.readPreference) !== null && _a !== void 0 ? _a : read_preference_1.ReadPreference.primary;
    const inTransaction = !!(session === null || session === void 0 ? void 0 : session.inTransaction());
    if (inTransaction && !readPreference.equals(read_preference_1.ReadPreference.primary)) {
        throw new error_1.MongoTransactionError(`Read preference in a transaction must be primary, not: ${readPreference.mode}`);
    }
    if ((session === null || session === void 0 ? void 0 : session.isPinned) && session.transaction.isCommitted && !operation.bypassPinningCheck) {
        session.unpin();
    }
    let selector;
    if (operation.hasAspect(operation_1.Aspect.MUST_SELECT_SAME_SERVER)) {
        // GetMore and KillCursor operations must always select the same server, but run through
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
    const server = await topology.selectServerAsync(selector, { session });
    if (session == null) {
        // No session also means it is not retryable, early exit
        return operation.executeAsync(server, undefined);
    }
    if (!operation.hasAspect(operation_1.Aspect.RETRYABLE)) {
        // non-retryable operation, early exit
        try {
            return await operation.executeAsync(server, session);
        }
        finally {
            if ((session === null || session === void 0 ? void 0 : session.owner) != null && session.owner === owner) {
                await session.endSession().catch(() => null);
            }
        }
    }
    const willRetryRead = topology.s.options.retryReads && !inTransaction && operation.canRetryRead;
    const willRetryWrite = topology.s.options.retryWrites &&
        !inTransaction &&
        (0, utils_1.supportsRetryableWrites)(server) &&
        operation.canRetryWrite;
    const hasReadAspect = operation.hasAspect(operation_1.Aspect.READ_OPERATION);
    const hasWriteAspect = operation.hasAspect(operation_1.Aspect.WRITE_OPERATION);
    const willRetry = (hasReadAspect && willRetryRead) || (hasWriteAspect && willRetryWrite);
    if (hasWriteAspect && willRetryWrite) {
        operation.options.willRetryWrite = true;
        session.incrementTransactionNumber();
    }
    try {
        return await operation.executeAsync(server, session);
    }
    catch (operationError) {
        if (willRetry && operationError instanceof error_1.MongoError) {
            return await retryOperation(operation, operationError, {
                session,
                topology,
                selector
            });
        }
        throw operationError;
    }
    finally {
        if ((session === null || session === void 0 ? void 0 : session.owner) != null && session.owner === owner) {
            await session.endSession().catch(() => null);
        }
    }
}
async function retryOperation(operation, originalError, { session, topology, selector }) {
    const isWriteOperation = operation.hasAspect(operation_1.Aspect.WRITE_OPERATION);
    const isReadOperation = operation.hasAspect(operation_1.Aspect.READ_OPERATION);
    if (isWriteOperation && originalError.code === MMAPv1_RETRY_WRITES_ERROR_CODE) {
        throw new error_1.MongoServerError({
            message: MMAPv1_RETRY_WRITES_ERROR_MESSAGE,
            errmsg: MMAPv1_RETRY_WRITES_ERROR_MESSAGE,
            originalError
        });
    }
    if (isWriteOperation && !(0, error_1.isRetryableWriteError)(originalError)) {
        throw originalError;
    }
    if (isReadOperation && !(0, error_1.isRetryableReadError)(originalError)) {
        throw originalError;
    }
    if (originalError instanceof error_1.MongoNetworkError &&
        session.isPinned &&
        !session.inTransaction() &&
        operation.hasAspect(operation_1.Aspect.CURSOR_CREATING)) {
        // If we have a cursor and the initial command fails with a network error,
        // we can retry it on another connection. So we need to check it back in, clear the
        // pool for the service id, and retry again.
        session.unpin({ force: true, forceClear: true });
    }
    // select a new server, and attempt to retry the operation
    const server = await topology.selectServerAsync(selector, { session });
    if (isWriteOperation && !(0, utils_1.supportsRetryableWrites)(server)) {
        throw new error_1.MongoUnexpectedServerResponseError('Selected server does not support retryable writes');
    }
    try {
        return await operation.executeAsync(server, session);
    }
    catch (retryError) {
        if (retryError instanceof error_1.MongoError &&
            retryError.hasErrorLabel(error_1.MongoErrorLabel.NoWritesPerformed)) {
            throw originalError;
        }
        throw retryError;
    }
}
//# sourceMappingURL=execute_operation.js.map