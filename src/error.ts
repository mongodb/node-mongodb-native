import type { TopologyVersion } from './sdam/server_description';
import type { Document } from './types';

const kErrorLabels = Symbol('errorLabels');

// From spec@https://github.com/mongodb/specifications/blob/f93d78191f3db2898a59013a7ed5650352ef6da8/source/change-streams/change-streams.rst#resumable-error
const GET_MORE_RESUMABLE_CODES = new Set([
  6, // HostUnreachable
  7, // HostNotFound
  89, // NetworkTimeout
  91, // ShutdownInProgress
  189, // PrimarySteppedDown
  262, // ExceededTimeLimit
  9001, // SocketException
  10107, // NotMaster
  11600, // InterruptedAtShutdown
  11602, // InterruptedDueToReplStateChange
  13435, // NotMasterNoSlaveOk
  13436, // NotMasterOrSecondary
  63, // StaleShardVersion
  150, // StaleEpoch
  13388, // StaleConfig
  234, // RetryChangeStream
  133, // FailedToSatisfyReadPreference
  43 // CursorNotFound
]);

/**
 * Creates a new MongoError
 *
 * @param {Error|string|object} message The error message
 * @property {string} message The error message
 * @property {string} stack The error call stack
 */
class MongoError extends Error {
  [kErrorLabels]: Set<string>;
  code?: number;
  codeName?: string;
  writeConcernError?: Document;
  topologyVersion?: TopologyVersion;

  constructor(message: any) {
    if (message instanceof Error) {
      super(message.message);
      this.stack = message.stack;
    } else {
      if (typeof message === 'string') {
        super(message);
      } else {
        super(message.message || message.errmsg || message.$err || 'n/a');
        if (message.errorLabels) {
          this[kErrorLabels] = new Set(message.errorLabels);
        }

        for (let name in message) {
          if (name === 'errorLabels' || name === 'errmsg') {
            continue;
          }

          (this as any)[name] = message[name];
        }
      }

      Error.captureStackTrace(this, this.constructor);
    }

    this.name = 'MongoError';
  }

  /**
   * Legacy name for server error responses
   */
  get errmsg() {
    return this.message;
  }

  /**
   * Creates a new MongoError object
   *
   * @param {Error|string|object} options The options used to create the error.
   * @returns {MongoError} A MongoError instance
   * @deprecated Use `new MongoError()` instead.
   */
  static create(options: any): MongoError {
    return new MongoError(options);
  }

  /**
   * Checks the error to see if it has an error label
   *
   * @param {string} label The error label to check for
   * @returns {boolean} returns true if the error has the provided error label
   */
  hasErrorLabel(label: string): boolean {
    if (this[kErrorLabels] == null) {
      return false;
    }

    return this[kErrorLabels].has(label);
  }

  addErrorLabel(label: any) {
    if (this[kErrorLabels] == null) {
      this[kErrorLabels] = new Set();
    }

    this[kErrorLabels].add(label);
  }

  get errorLabels() {
    return this[kErrorLabels] ? Array.from(this[kErrorLabels]) : [];
  }
}

const kBeforeHandshake = Symbol('beforeHandshake');
function isNetworkErrorBeforeHandshake(err: any) {
  return err[kBeforeHandshake] === true;
}

/**
 * An error indicating an issue with the network, including TCP
 * errors and timeouts.
 *
 * @param {Error|string|object} message The error message
 * @property {string} message The error message
 * @property {string} stack The error call stack
 * @extends MongoError
 */
class MongoNetworkError extends MongoError {
  [kBeforeHandshake]?: boolean;

  /**
   * Create a network error
   *
   * @param {any} message
   * @param {any} [options]
   */
  constructor(message: any, options?: any) {
    super(message);
    this.name = 'MongoNetworkError';

    if (options && options.beforeHandshake === true) {
      this[kBeforeHandshake] = true;
    }
  }
}

/**
 * An error indicating a network timeout occurred
 *
 * @param {Error|string|object} message The error message
 * @property {string} message The error message
 * @property {any} [options] Optional details of the error
 * @property {boolean} [options.beforeHandshake] Indicates the timeout happened before a connection handshake completed
 * @extends MongoError
 */
class MongoNetworkTimeoutError extends MongoNetworkError {
  /**
   * Create a network timeout error
   *
   * @param {any} message
   * @param {object} [options]
   */
  constructor(message: any, options?: object) {
    super(message, options);
    this.name = 'MongoNetworkTimeoutError';
  }
}

/**
 * An error used when attempting to parse a value (like a connection string)
 *
 * @param {Error|string|object} message The error message
 * @property {string} message The error message
 * @extends MongoError
 */
class MongoParseError extends MongoError {
  constructor(message: any) {
    super(message);
    this.name = 'MongoParseError';
  }
}

/**
 * An error signifying a client-side timeout event
 *
 * @param {Error|string|object} message The error message
 * @param {string|object} [reason] The reason the timeout occured
 * @property {string} message The error message
 * @property {string} [reason] An optional reason context for the timeout, generally an error saved during flow of monitoring and selecting servers
 * @extends MongoError
 */
class MongoTimeoutError extends MongoError {
  reason?: string;

  constructor(message: any, reason: any) {
    if (reason && reason.error) {
      super(reason.error.message || reason.error);
    } else {
      super(message);
    }

    this.name = 'MongoTimeoutError';
    if (reason) {
      this.reason = reason;
    }
  }
}

/**
 * An error signifying a client-side server selection error
 *
 * @param {Error|string|object} message The error message
 * @param {string|object} [reason] The reason the timeout occured
 * @property {string} message The error message
 * @property {string} [reason] An optional reason context for the timeout, generally an error saved during flow of monitoring and selecting servers
 * @extends MongoError
 */
class MongoServerSelectionError extends MongoTimeoutError {
  constructor(message: any, reason: any) {
    super(message, reason);
    this.name = 'MongoServerSelectionError';
  }
}

function makeWriteConcernResultObject(input: any) {
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
 *
 * @param {Error|string|object} message The error message
 * @param {object} result The result document (provided if ok: 1)
 * @property {string} message The error message
 * @property {object} [result] The result document (provided if ok: 1)
 * @extends MongoError
 */
class MongoWriteConcernError extends MongoError {
  result?: any;

  constructor(message: any, result: any) {
    super(message);
    this.name = 'MongoWriteConcernError';

    if (result && Array.isArray(result.errorLabels)) {
      this[kErrorLabels] = new Set(result.errorLabels);
    }

    if (result != null) {
      this.result = makeWriteConcernResultObject(result);
    }
  }
}

// see: https://github.com/mongodb/specifications/blob/master/source/retryable-writes/retryable-writes.rst#terms
const RETRYABLE_ERROR_CODES = new Set([
  6, // HostUnreachable
  7, // HostNotFound
  89, // NetworkTimeout
  91, // ShutdownInProgress
  189, // PrimarySteppedDown
  9001, // SocketException
  10107, // NotMaster
  11600, // InterruptedAtShutdown
  11602, // InterruptedDueToReplStateChange
  13435, // NotMasterNoSlaveOk
  13436 // NotMasterOrSecondary
]);

const RETRYABLE_WRITE_ERROR_CODES = new Set([
  11600, // InterruptedAtShutdown
  11602, // InterruptedDueToReplStateChange
  10107, // NotMaster
  13435, // NotMasterNoSlaveOk
  13436, // NotMasterOrSecondary
  189, // PrimarySteppedDown
  91, // ShutdownInProgress
  7, // HostNotFound
  6, // HostUnreachable
  89, // NetworkTimeout
  9001, // SocketException
  262 // ExceededTimeLimit
]);

function isRetryableWriteError(error: any) {
  if (error instanceof MongoWriteConcernError) {
    return RETRYABLE_WRITE_ERROR_CODES.has(error.result.code);
  }

  return RETRYABLE_WRITE_ERROR_CODES.has(error.code);
}

/**
 * Determines whether an error is something the driver should attempt to retry
 *
 * @param {MongoError|Error} error
 */
function isRetryableError(error: any) {
  return (
    RETRYABLE_ERROR_CODES.has(error.code) ||
    error instanceof MongoNetworkError ||
    error.message.match(/not master/) ||
    error.message.match(/node is recovering/)
  );
}

const SDAM_RECOVERING_CODES = new Set([
  91, // ShutdownInProgress
  189, // PrimarySteppedDown
  11600, // InterruptedAtShutdown
  11602, // InterruptedDueToReplStateChange
  13436 // NotMasterOrSecondary
]);

const SDAM_NOTMASTER_CODES = new Set([
  10107, // NotMaster
  13435 // NotMasterNoSlaveOk
]);

const SDAM_NODE_SHUTTING_DOWN_ERROR_CODES = new Set([
  11600, // InterruptedAtShutdown
  91 // ShutdownInProgress
]);

function isRecoveringError(err: any) {
  if (err.code && SDAM_RECOVERING_CODES.has(err.code)) {
    return true;
  }

  return err.message.match(/not master or secondary/) || err.message.match(/node is recovering/);
}

function isNotMasterError(err: any) {
  if (err.code && SDAM_NOTMASTER_CODES.has(err.code)) {
    return true;
  }

  if (isRecoveringError(err)) {
    return false;
  }

  return err.message.match(/not master/);
}

function isNodeShuttingDownError(err: any) {
  return err.code && SDAM_NODE_SHUTTING_DOWN_ERROR_CODES.has(err.code);
}

/**
 * Determines whether SDAM can recover from a given error. If it cannot
 * then the pool will be cleared, and server state will completely reset
 * locally.
 *
 * @see https://github.com/mongodb/specifications/blob/master/source/server-discovery-and-monitoring/server-discovery-and-monitoring.rst#not-master-and-node-is-recovering
 * @param {MongoError|Error} error
 */
function isSDAMUnrecoverableError(error: any) {
  // NOTE: null check is here for a strictly pre-CMAP world, a timeout or
  //       close event are considered unrecoverable
  if (error instanceof MongoParseError || error == null) {
    return true;
  }

  if (isRecoveringError(error) || isNotMasterError(error)) {
    return true;
  }

  return false;
}

function isNetworkTimeoutError(err: any) {
  return err instanceof MongoNetworkError && err.message.match(/timed out/);
}

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

function isResumableError(error?: any, wireVersion?: any) {
  if (error instanceof MongoNetworkError) {
    return true;
  }

  if (wireVersion >= 9) {
    // DRIVERS-1308: For 4.4 drivers running against 4.4 servers, drivers will add a special case to treat the CursorNotFound error code as resumable
    if (error.code === 43) {
      return true;
    }
    return error.hasErrorLabel('ResumableChangeStreamError');
  }

  return GET_MORE_RESUMABLE_CODES.has(error.code);
}

export {
  GET_MORE_RESUMABLE_CODES,
  MongoError,
  MongoNetworkError,
  MongoNetworkTimeoutError,
  MongoParseError,
  MongoTimeoutError,
  MongoServerSelectionError,
  MongoWriteConcernError,
  isRetryableError,
  isSDAMUnrecoverableError,
  isNodeShuttingDownError,
  isNetworkTimeoutError,
  isRetryableWriteError,
  isResumableError,
  isNetworkErrorBeforeHandshake
};
