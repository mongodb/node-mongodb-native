"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isResumableError = exports.isNetworkTimeoutError = exports.isSDAMUnrecoverableError = exports.isNodeShuttingDownError = exports.isRetryableError = exports.isRetryableWriteError = exports.isRetryableEndTransactionError = exports.MongoWriteConcernError = exports.MongoServerSelectionError = exports.MongoSystemError = exports.MongoMissingDependencyError = exports.MongoMissingCredentialsError = exports.MongoCompatibilityError = exports.MongoInvalidArgumentError = exports.MongoParseError = exports.MongoNetworkTimeoutError = exports.MongoNetworkError = exports.isNetworkErrorBeforeHandshake = exports.MongoTopologyClosedError = exports.MongoCursorExhaustedError = exports.MongoServerClosedError = exports.MongoCursorInUseError = exports.MongoGridFSChunkError = exports.MongoGridFSStreamError = exports.MongoTailableCursorError = exports.MongoChangeStreamError = exports.MongoKerberosError = exports.MongoExpiredSessionError = exports.MongoTransactionError = exports.MongoNotConnectedError = exports.MongoDecompressionError = exports.MongoBatchReExecutionError = exports.MongoRuntimeError = exports.MongoAPIError = exports.MongoDriverError = exports.MongoServerError = exports.MongoError = exports.GET_MORE_RESUMABLE_CODES = exports.MONGODB_ERROR_CODES = exports.NODE_IS_RECOVERING_ERROR_MESSAGE = exports.LEGACY_NOT_PRIMARY_OR_SECONDARY_ERROR_MESSAGE = exports.LEGACY_NOT_WRITABLE_PRIMARY_ERROR_MESSAGE = void 0;
/** @internal */
const kErrorLabels = Symbol('errorLabels');
/**
 * @internal
 * The legacy error message from the server that indicates the node is not a writable primary
 * https://github.com/mongodb/specifications/blob/b07c26dc40d04ac20349f989db531c9845fdd755/source/server-discovery-and-monitoring/server-discovery-and-monitoring.rst#not-writable-primary-and-node-is-recovering
 */
exports.LEGACY_NOT_WRITABLE_PRIMARY_ERROR_MESSAGE = 'not master';
/**
 * @internal
 * The legacy error message from the server that indicates the node is not a primary or secondary
 * https://github.com/mongodb/specifications/blob/b07c26dc40d04ac20349f989db531c9845fdd755/source/server-discovery-and-monitoring/server-discovery-and-monitoring.rst#not-writable-primary-and-node-is-recovering
 */
exports.LEGACY_NOT_PRIMARY_OR_SECONDARY_ERROR_MESSAGE = 'not master or secondary';
/**
 * @internal
 * The error message from the server that indicates the node is recovering
 * https://github.com/mongodb/specifications/blob/b07c26dc40d04ac20349f989db531c9845fdd755/source/server-discovery-and-monitoring/server-discovery-and-monitoring.rst#not-writable-primary-and-node-is-recovering
 */
exports.NODE_IS_RECOVERING_ERROR_MESSAGE = 'node is recovering';
/** @internal MongoDB Error Codes */
exports.MONGODB_ERROR_CODES = Object.freeze({
    HostUnreachable: 6,
    HostNotFound: 7,
    NetworkTimeout: 89,
    ShutdownInProgress: 91,
    PrimarySteppedDown: 189,
    ExceededTimeLimit: 262,
    SocketException: 9001,
    NotWritablePrimary: 10107,
    InterruptedAtShutdown: 11600,
    InterruptedDueToReplStateChange: 11602,
    NotPrimaryNoSecondaryOk: 13435,
    NotPrimaryOrSecondary: 13436,
    StaleShardVersion: 63,
    StaleEpoch: 150,
    StaleConfig: 13388,
    RetryChangeStream: 234,
    FailedToSatisfyReadPreference: 133,
    CursorNotFound: 43,
    LegacyNotPrimary: 10058,
    WriteConcernFailed: 64,
    NamespaceNotFound: 26,
    IllegalOperation: 20,
    MaxTimeMSExpired: 50,
    UnknownReplWriteConcern: 79,
    UnsatisfiableWriteConcern: 100
});
// From spec@https://github.com/mongodb/specifications/blob/f93d78191f3db2898a59013a7ed5650352ef6da8/source/change-streams/change-streams.rst#resumable-error
exports.GET_MORE_RESUMABLE_CODES = new Set([
    exports.MONGODB_ERROR_CODES.HostUnreachable,
    exports.MONGODB_ERROR_CODES.HostNotFound,
    exports.MONGODB_ERROR_CODES.NetworkTimeout,
    exports.MONGODB_ERROR_CODES.ShutdownInProgress,
    exports.MONGODB_ERROR_CODES.PrimarySteppedDown,
    exports.MONGODB_ERROR_CODES.ExceededTimeLimit,
    exports.MONGODB_ERROR_CODES.SocketException,
    exports.MONGODB_ERROR_CODES.NotWritablePrimary,
    exports.MONGODB_ERROR_CODES.InterruptedAtShutdown,
    exports.MONGODB_ERROR_CODES.InterruptedDueToReplStateChange,
    exports.MONGODB_ERROR_CODES.NotPrimaryNoSecondaryOk,
    exports.MONGODB_ERROR_CODES.NotPrimaryOrSecondary,
    exports.MONGODB_ERROR_CODES.StaleShardVersion,
    exports.MONGODB_ERROR_CODES.StaleEpoch,
    exports.MONGODB_ERROR_CODES.StaleConfig,
    exports.MONGODB_ERROR_CODES.RetryChangeStream,
    exports.MONGODB_ERROR_CODES.FailedToSatisfyReadPreference,
    exports.MONGODB_ERROR_CODES.CursorNotFound
]);
/**
 * @public
 * @category Error
 *
 * @privateRemarks
 * CSFLE has a dependency on this error, it uses the constructor with a string argument
 */
class MongoError extends Error {
    constructor(message) {
        if (message instanceof Error) {
            super(message.message);
        }
        else {
            super(message);
        }
    }
    get name() {
        return 'MongoError';
    }
    /** Legacy name for server error responses */
    get errmsg() {
        return this.message;
    }
    /**
     * Checks the error to see if it has an error label
     *
     * @param label - The error label to check for
     * @returns returns true if the error has the provided error label
     */
    hasErrorLabel(label) {
        if (this[kErrorLabels] == null) {
            return false;
        }
        return this[kErrorLabels].has(label);
    }
    addErrorLabel(label) {
        if (this[kErrorLabels] == null) {
            this[kErrorLabels] = new Set();
        }
        this[kErrorLabels].add(label);
    }
    get errorLabels() {
        return this[kErrorLabels] ? Array.from(this[kErrorLabels]) : [];
    }
}
exports.MongoError = MongoError;
/**
 * An error coming from the mongo server
 *
 * @public
 * @category Error
 */
class MongoServerError extends MongoError {
    constructor(message) {
        super(message.message || message.errmsg || message.$err || 'n/a');
        if (message.errorLabels) {
            this[kErrorLabels] = new Set(message.errorLabels);
        }
        for (const name in message) {
            if (name !== 'errorLabels' && name !== 'errmsg' && name !== 'message')
                this[name] = message[name];
        }
    }
    get name() {
        return 'MongoServerError';
    }
}
exports.MongoServerError = MongoServerError;
/**
 * An error generated by the driver
 *
 * @public
 * @category Error
 */
class MongoDriverError extends MongoError {
    constructor(message) {
        super(message);
    }
    get name() {
        return 'MongoDriverError';
    }
}
exports.MongoDriverError = MongoDriverError;
/**
 * An error generated when the driver API is used incorrectly
 *
 * @privateRemarks
 * Should **never** be directly instantiated
 *
 * @public
 * @category Error
 */
class MongoAPIError extends MongoDriverError {
    constructor(message) {
        super(message);
    }
    get name() {
        return 'MongoAPIError';
    }
}
exports.MongoAPIError = MongoAPIError;
/**
 * An error generated when the driver encounters unexpected input
 * or reaches an unexpected/invalid internal state
 *
 * @privateRemarks
 * Should **never** be directly instantiated.
 *
 * @public
 * @category Error
 */
class MongoRuntimeError extends MongoDriverError {
    constructor(message) {
        super(message);
    }
    get name() {
        return 'MongoRuntimeError';
    }
}
exports.MongoRuntimeError = MongoRuntimeError;
/**
 * An error generated when a batch command is reexecuted after one of the commands in the batch
 * has failed
 *
 * @public
 * @category Error
 */
class MongoBatchReExecutionError extends MongoAPIError {
    constructor(message = 'This batch has already been executed, create new batch to execute') {
        super(message);
    }
    get name() {
        return 'MongoBatchReExecutionError';
    }
}
exports.MongoBatchReExecutionError = MongoBatchReExecutionError;
/**
 * An error generated when the driver fails to decompress
 * data received from the server.
 *
 * @public
 * @category Error
 */
class MongoDecompressionError extends MongoRuntimeError {
    constructor(message) {
        super(message);
    }
    get name() {
        return 'MongoDecompressionError';
    }
}
exports.MongoDecompressionError = MongoDecompressionError;
/**
 * An error thrown when the user attempts to operate on a database or collection through a MongoClient
 * that has not yet successfully called the "connect" method
 *
 * @public
 * @category Error
 */
class MongoNotConnectedError extends MongoAPIError {
    constructor(message) {
        super(message);
    }
    get name() {
        return 'MongoNotConnectedError';
    }
}
exports.MongoNotConnectedError = MongoNotConnectedError;
/**
 * An error generated when the user makes a mistake in the usage of transactions.
 * (e.g. attempting to commit a transaction with a readPreference other than primary)
 *
 * @public
 * @category Error
 */
class MongoTransactionError extends MongoAPIError {
    constructor(message) {
        super(message);
    }
    get name() {
        return 'MongoTransactionError';
    }
}
exports.MongoTransactionError = MongoTransactionError;
/**
 * An error generated when the user attempts to operate
 * on a session that has expired or has been closed.
 *
 * @public
 * @category Error
 */
class MongoExpiredSessionError extends MongoAPIError {
    constructor(message = 'Cannot use a session that has ended') {
        super(message);
    }
    get name() {
        return 'MongoExpiredSessionError';
    }
}
exports.MongoExpiredSessionError = MongoExpiredSessionError;
/**
 * A error generated when the user attempts to authenticate
 * via Kerberos, but fails to connect to the Kerberos client.
 *
 * @public
 * @category Error
 */
class MongoKerberosError extends MongoRuntimeError {
    constructor(message) {
        super(message);
    }
    get name() {
        return 'MongoKerberosError';
    }
}
exports.MongoKerberosError = MongoKerberosError;
/**
 * An error generated when a ChangeStream operation fails to execute.
 *
 * @public
 * @category Error
 */
class MongoChangeStreamError extends MongoRuntimeError {
    constructor(message) {
        super(message);
    }
    get name() {
        return 'MongoChangeStreamError';
    }
}
exports.MongoChangeStreamError = MongoChangeStreamError;
/**
 * An error thrown when the user calls a function or method not supported on a tailable cursor
 *
 * @public
 * @category Error
 */
class MongoTailableCursorError extends MongoAPIError {
    constructor(message = 'Tailable cursor does not support this operation') {
        super(message);
    }
    get name() {
        return 'MongoTailableCursorError';
    }
}
exports.MongoTailableCursorError = MongoTailableCursorError;
/** An error generated when a GridFSStream operation fails to execute.
 *
 * @public
 * @category Error
 */
class MongoGridFSStreamError extends MongoRuntimeError {
    constructor(message) {
        super(message);
    }
    get name() {
        return 'MongoGridFSStreamError';
    }
}
exports.MongoGridFSStreamError = MongoGridFSStreamError;
/**
 * An error generated when a malformed or invalid chunk is
 * encountered when reading from a GridFSStream.
 *
 * @public
 * @category Error
 */
class MongoGridFSChunkError extends MongoRuntimeError {
    constructor(message) {
        super(message);
    }
    get name() {
        return 'MongoGridFSChunkError';
    }
}
exports.MongoGridFSChunkError = MongoGridFSChunkError;
/**
 * An error thrown when the user attempts to add options to a cursor that has already been
 * initialized
 *
 * @public
 * @category Error
 */
class MongoCursorInUseError extends MongoAPIError {
    constructor(message = 'Cursor is already initialized') {
        super(message);
    }
    get name() {
        return 'MongoCursorInUseError';
    }
}
exports.MongoCursorInUseError = MongoCursorInUseError;
/**
 * An error generated when an attempt is made to operate
 * on a closed/closing server.
 *
 * @public
 * @category Error
 */
class MongoServerClosedError extends MongoAPIError {
    constructor(message = 'Server is closed') {
        super(message);
    }
    get name() {
        return 'MongoServerClosedError';
    }
}
exports.MongoServerClosedError = MongoServerClosedError;
/**
 * An error thrown when an attempt is made to read from a cursor that has been exhausted
 *
 * @public
 * @category Error
 */
class MongoCursorExhaustedError extends MongoAPIError {
    constructor(message) {
        super(message || 'Cursor is exhausted');
    }
    get name() {
        return 'MongoCursorExhaustedError';
    }
}
exports.MongoCursorExhaustedError = MongoCursorExhaustedError;
/**
 * An error generated when an attempt is made to operate on a
 * dropped, or otherwise unavailable, database.
 *
 * @public
 * @category Error
 */
class MongoTopologyClosedError extends MongoAPIError {
    constructor(message = 'Topology is closed') {
        super(message);
    }
    get name() {
        return 'MongoTopologyClosedError';
    }
}
exports.MongoTopologyClosedError = MongoTopologyClosedError;
/** @internal */
const kBeforeHandshake = Symbol('beforeHandshake');
function isNetworkErrorBeforeHandshake(err) {
    return err[kBeforeHandshake] === true;
}
exports.isNetworkErrorBeforeHandshake = isNetworkErrorBeforeHandshake;
/**
 * An error indicating an issue with the network, including TCP errors and timeouts.
 * @public
 * @category Error
 */
class MongoNetworkError extends MongoError {
    constructor(message, options) {
        super(message);
        if (options && typeof options.beforeHandshake === 'boolean') {
            this[kBeforeHandshake] = options.beforeHandshake;
        }
    }
    get name() {
        return 'MongoNetworkError';
    }
}
exports.MongoNetworkError = MongoNetworkError;
/**
 * An error indicating a network timeout occurred
 * @public
 * @category Error
 *
 * @privateRemarks
 * CSFLE has a dependency on this error with an instanceof check
 */
class MongoNetworkTimeoutError extends MongoNetworkError {
    constructor(message, options) {
        super(message, options);
    }
    get name() {
        return 'MongoNetworkTimeoutError';
    }
}
exports.MongoNetworkTimeoutError = MongoNetworkTimeoutError;
/**
 * An error used when attempting to parse a value (like a connection string)
 * @public
 * @category Error
 */
class MongoParseError extends MongoDriverError {
    constructor(message) {
        super(message);
    }
    get name() {
        return 'MongoParseError';
    }
}
exports.MongoParseError = MongoParseError;
/**
 * An error generated when the user supplies malformed or unexpected arguments
 * or when a required argument or field is not provided.
 *
 *
 * @public
 * @category Error
 */
class MongoInvalidArgumentError extends MongoAPIError {
    constructor(message) {
        super(message);
    }
    get name() {
        return 'MongoInvalidArgumentError';
    }
}
exports.MongoInvalidArgumentError = MongoInvalidArgumentError;
/**
 * An error generated when a feature that is not enabled or allowed for the current server
 * configuration is used
 *
 *
 * @public
 * @category Error
 */
class MongoCompatibilityError extends MongoAPIError {
    constructor(message) {
        super(message);
    }
    get name() {
        return 'MongoCompatibilityError';
    }
}
exports.MongoCompatibilityError = MongoCompatibilityError;
/**
 * An error generated when the user fails to provide authentication credentials before attempting
 * to connect to a mongo server instance.
 *
 *
 * @public
 * @category Error
 */
class MongoMissingCredentialsError extends MongoAPIError {
    constructor(message) {
        super(message);
    }
    get name() {
        return 'MongoMissingCredentialsError';
    }
}
exports.MongoMissingCredentialsError = MongoMissingCredentialsError;
/**
 * An error generated when a required module or dependency is not present in the local environment
 *
 * @public
 * @category Error
 */
class MongoMissingDependencyError extends MongoAPIError {
    constructor(message) {
        super(message);
    }
    get name() {
        return 'MongoMissingDependencyError';
    }
}
exports.MongoMissingDependencyError = MongoMissingDependencyError;
/**
 * An error signifying a general system issue
 * @public
 * @category Error
 */
class MongoSystemError extends MongoError {
    constructor(message, reason) {
        var _a;
        if (reason && reason.error) {
            super(reason.error.message || reason.error);
        }
        else {
            super(message);
        }
        if (reason) {
            this.reason = reason;
        }
        this.code = (_a = reason.error) === null || _a === void 0 ? void 0 : _a.code;
    }
    get name() {
        return 'MongoSystemError';
    }
}
exports.MongoSystemError = MongoSystemError;
/**
 * An error signifying a client-side server selection error
 * @public
 * @category Error
 */
class MongoServerSelectionError extends MongoSystemError {
    constructor(message, reason) {
        super(message, reason);
    }
    get name() {
        return 'MongoServerSelectionError';
    }
}
exports.MongoServerSelectionError = MongoServerSelectionError;
function makeWriteConcernResultObject(input) {
    const output = Object.assign({}, input);
    if (output.ok === 0) {
        output.ok = 1;
        delete output.errmsg;
        delete output.code;
        delete output.codeName;
    }
    return output;
}
/**
 * An error thrown when the server reports a writeConcernError
 * @public
 * @category Error
 */
class MongoWriteConcernError extends MongoServerError {
    constructor(message, result) {
        if (result && Array.isArray(result.errorLabels)) {
            message.errorLabels = result.errorLabels;
        }
        super(message);
        this.errInfo = message.errInfo;
        if (result != null) {
            this.result = makeWriteConcernResultObject(result);
        }
    }
    get name() {
        return 'MongoWriteConcernError';
    }
}
exports.MongoWriteConcernError = MongoWriteConcernError;
// see: https://github.com/mongodb/specifications/blob/master/source/retryable-writes/retryable-writes.rst#terms
const RETRYABLE_ERROR_CODES = new Set([
    exports.MONGODB_ERROR_CODES.HostUnreachable,
    exports.MONGODB_ERROR_CODES.HostNotFound,
    exports.MONGODB_ERROR_CODES.NetworkTimeout,
    exports.MONGODB_ERROR_CODES.ShutdownInProgress,
    exports.MONGODB_ERROR_CODES.PrimarySteppedDown,
    exports.MONGODB_ERROR_CODES.SocketException,
    exports.MONGODB_ERROR_CODES.NotWritablePrimary,
    exports.MONGODB_ERROR_CODES.InterruptedAtShutdown,
    exports.MONGODB_ERROR_CODES.InterruptedDueToReplStateChange,
    exports.MONGODB_ERROR_CODES.NotPrimaryNoSecondaryOk,
    exports.MONGODB_ERROR_CODES.NotPrimaryOrSecondary
]);
const RETRYABLE_WRITE_ERROR_CODES = new Set([
    exports.MONGODB_ERROR_CODES.InterruptedAtShutdown,
    exports.MONGODB_ERROR_CODES.InterruptedDueToReplStateChange,
    exports.MONGODB_ERROR_CODES.NotWritablePrimary,
    exports.MONGODB_ERROR_CODES.NotPrimaryNoSecondaryOk,
    exports.MONGODB_ERROR_CODES.NotPrimaryOrSecondary,
    exports.MONGODB_ERROR_CODES.PrimarySteppedDown,
    exports.MONGODB_ERROR_CODES.ShutdownInProgress,
    exports.MONGODB_ERROR_CODES.HostNotFound,
    exports.MONGODB_ERROR_CODES.HostUnreachable,
    exports.MONGODB_ERROR_CODES.NetworkTimeout,
    exports.MONGODB_ERROR_CODES.SocketException,
    exports.MONGODB_ERROR_CODES.ExceededTimeLimit
]);
function isRetryableEndTransactionError(error) {
    return error.hasErrorLabel('RetryableWriteError');
}
exports.isRetryableEndTransactionError = isRetryableEndTransactionError;
function isRetryableWriteError(error) {
    var _a, _b, _c;
    if (error instanceof MongoWriteConcernError) {
        return RETRYABLE_WRITE_ERROR_CODES.has((_c = (_b = (_a = error.result) === null || _a === void 0 ? void 0 : _a.code) !== null && _b !== void 0 ? _b : error.code) !== null && _c !== void 0 ? _c : 0);
    }
    return typeof error.code === 'number' && RETRYABLE_WRITE_ERROR_CODES.has(error.code);
}
exports.isRetryableWriteError = isRetryableWriteError;
/** Determines whether an error is something the driver should attempt to retry */
function isRetryableError(error) {
    return (
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    (typeof error.code === 'number' && RETRYABLE_ERROR_CODES.has(error.code)) ||
        error instanceof MongoNetworkError ||
        !!error.message.match(new RegExp(exports.LEGACY_NOT_WRITABLE_PRIMARY_ERROR_MESSAGE)) ||
        !!error.message.match(new RegExp(exports.NODE_IS_RECOVERING_ERROR_MESSAGE)));
}
exports.isRetryableError = isRetryableError;
const SDAM_RECOVERING_CODES = new Set([
    exports.MONGODB_ERROR_CODES.ShutdownInProgress,
    exports.MONGODB_ERROR_CODES.PrimarySteppedDown,
    exports.MONGODB_ERROR_CODES.InterruptedAtShutdown,
    exports.MONGODB_ERROR_CODES.InterruptedDueToReplStateChange,
    exports.MONGODB_ERROR_CODES.NotPrimaryOrSecondary
]);
const SDAM_NOTPRIMARY_CODES = new Set([
    exports.MONGODB_ERROR_CODES.NotWritablePrimary,
    exports.MONGODB_ERROR_CODES.NotPrimaryNoSecondaryOk,
    exports.MONGODB_ERROR_CODES.LegacyNotPrimary
]);
const SDAM_NODE_SHUTTING_DOWN_ERROR_CODES = new Set([
    exports.MONGODB_ERROR_CODES.InterruptedAtShutdown,
    exports.MONGODB_ERROR_CODES.ShutdownInProgress
]);
function isRecoveringError(err) {
    if (typeof err.code === 'number') {
        // If any error code exists, we ignore the error.message
        return SDAM_RECOVERING_CODES.has(err.code);
    }
    return (new RegExp(exports.LEGACY_NOT_PRIMARY_OR_SECONDARY_ERROR_MESSAGE).test(err.message) ||
        new RegExp(exports.NODE_IS_RECOVERING_ERROR_MESSAGE).test(err.message));
}
function isNotWritablePrimaryError(err) {
    if (typeof err.code === 'number') {
        // If any error code exists, we ignore the error.message
        return SDAM_NOTPRIMARY_CODES.has(err.code);
    }
    if (isRecoveringError(err)) {
        return false;
    }
    return new RegExp(exports.LEGACY_NOT_WRITABLE_PRIMARY_ERROR_MESSAGE).test(err.message);
}
function isNodeShuttingDownError(err) {
    return !!(typeof err.code === 'number' && SDAM_NODE_SHUTTING_DOWN_ERROR_CODES.has(err.code));
}
exports.isNodeShuttingDownError = isNodeShuttingDownError;
/**
 * Determines whether SDAM can recover from a given error. If it cannot
 * then the pool will be cleared, and server state will completely reset
 * locally.
 *
 * @see https://github.com/mongodb/specifications/blob/master/source/server-discovery-and-monitoring/server-discovery-and-monitoring.rst#not-master-and-node-is-recovering
 */
function isSDAMUnrecoverableError(error) {
    // NOTE: null check is here for a strictly pre-CMAP world, a timeout or
    //       close event are considered unrecoverable
    if (error instanceof MongoParseError || error == null) {
        return true;
    }
    return isRecoveringError(error) || isNotWritablePrimaryError(error);
}
exports.isSDAMUnrecoverableError = isSDAMUnrecoverableError;
function isNetworkTimeoutError(err) {
    return !!(err instanceof MongoNetworkError && err.message.match(/timed out/));
}
exports.isNetworkTimeoutError = isNetworkTimeoutError;
// From spec@https://github.com/mongodb/specifications/blob/7a2e93d85935ee4b1046a8d2ad3514c657dc74fa/source/change-streams/change-streams.rst#resumable-error:
//
// An error is considered resumable if it meets any of the following criteria:
// - any error encountered which is not a server error (e.g. a timeout error or network error)
// - any server error response from a getMore command excluding those containing the error label
//   NonRetryableChangeStreamError and those containing the following error codes:
//   - Interrupted: 11601
//   - CappedPositionLost: 136
//   - CursorKilled: 237
//
// An error on an aggregate command is not a resumable error. Only errors on a getMore command may be considered resumable errors.
function isResumableError(error, wireVersion) {
    if (error instanceof MongoNetworkError) {
        return true;
    }
    if (wireVersion != null && wireVersion >= 9) {
        // DRIVERS-1308: For 4.4 drivers running against 4.4 servers, drivers will add a special case to treat the CursorNotFound error code as resumable
        if (error && error instanceof MongoError && error.code === 43) {
            return true;
        }
        return error instanceof MongoError && error.hasErrorLabel('ResumableChangeStreamError');
    }
    if (error && typeof error.code === 'number') {
        return exports.GET_MORE_RESUMABLE_CODES.has(error.code);
    }
    return false;
}
exports.isResumableError = isResumableError;
//# sourceMappingURL=error.js.map