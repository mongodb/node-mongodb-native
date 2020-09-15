import type { TopologyVersion } from './sdam/server_description';
import type { Document } from './bson';
import type { TopologyDescription } from './sdam/topology_description';

/** @public */
export type AnyError = MongoError | Error;

const kErrorLabels = Symbol('errorLabels');

// From spec@https://github.com/mongodb/specifications/blob/f93d78191f3db2898a59013a7ed5650352ef6da8/source/change-streams/change-streams.rst#resumable-error
export const GET_MORE_RESUMABLE_CODES = new Set([
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

/** @public */
export interface ErrorDescription {
  message?: string;
  errmsg?: string;
  $err?: string;
  errorLabels?: string[];
  [key: string]: any;
}

/**
 * @public
 * @category Error
 */
export class MongoError extends Error {
  [kErrorLabels]: Set<string>;
  code?: number;
  codeName?: string;
  writeConcernError?: Document;
  topologyVersion?: TopologyVersion;

  constructor(message: string | Error | ErrorDescription) {
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

        for (const name in message) {
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

  /** Legacy name for server error responses */
  get errmsg(): string {
    return this.message;
  }

  /**
   * Creates a new MongoError object
   *
   * @param options - The options used to create the error.
   * @deprecated Use `new MongoError()` instead.
   */
  static create(options: string | Error | ErrorDescription): MongoError {
    return new MongoError(options);
  }

  /**
   * Checks the error to see if it has an error label
   *
   * @param label - The error label to check for
   * @returns returns true if the error has the provided error label
   */
  hasErrorLabel(label: string): boolean {
    if (this[kErrorLabels] == null) {
      return false;
    }

    return this[kErrorLabels].has(label);
  }

  addErrorLabel(label: string): void {
    if (this[kErrorLabels] == null) {
      this[kErrorLabels] = new Set();
    }

    this[kErrorLabels].add(label);
  }

  get errorLabels(): string[] {
    return this[kErrorLabels] ? Array.from(this[kErrorLabels]) : [];
  }
}

const kBeforeHandshake = Symbol('beforeHandshake');
export function isNetworkErrorBeforeHandshake(err: MongoNetworkError): boolean {
  return err[kBeforeHandshake] === true;
}

/**
 * An error indicating an issue with the network, including TCP errors and timeouts.
 * @public
 * @category Error
 */
export class MongoNetworkError extends MongoError {
  [kBeforeHandshake]?: boolean;

  constructor(message: string | Error, options?: { beforeHandshake?: boolean }) {
    super(message);
    this.name = 'MongoNetworkError';

    if (options && options.beforeHandshake === true) {
      this[kBeforeHandshake] = true;
    }
  }
}

interface MongoNetworkTimeoutErrorOptions {
  /** Indicates the timeout happened before a connection handshake completed */
  beforeHandshake: boolean;
}

/**
 * An error indicating a network timeout occurred
 * @public
 * @category Error
 */
export class MongoNetworkTimeoutError extends MongoNetworkError {
  constructor(message: string, options?: MongoNetworkTimeoutErrorOptions) {
    super(message, options);
    this.name = 'MongoNetworkTimeoutError';
  }
}

/**
 * An error used when attempting to parse a value (like a connection string)
 * @public
 * @category Error
 */
export class MongoParseError extends MongoError {
  constructor(message: string) {
    super(message);
    this.name = 'MongoParseError';
  }
}

/**
 * An error signifying a client-side timeout event
 * @public
 * @category Error
 */
export class MongoTimeoutError extends MongoError {
  /** An optional reason context for the timeout, generally an error saved during flow of monitoring and selecting servers */
  reason?: TopologyDescription;

  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  constructor(message: string, reason: TopologyDescription) {
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
 * @public
 * @category Error
 */
export class MongoServerSelectionError extends MongoTimeoutError {
  constructor(message: string, reason: TopologyDescription) {
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
 * @public
 * @category Error
 */
export class MongoWriteConcernError extends MongoError {
  /** The result document (provided if ok: 1) */
  result?: Document;

  constructor(message: string, result: Document) {
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

export function isRetryableWriteError(error: MongoError): boolean {
  if (error instanceof MongoWriteConcernError) {
    return RETRYABLE_WRITE_ERROR_CODES.has(error.result?.code ?? error.code ?? 0);
  }
  return RETRYABLE_WRITE_ERROR_CODES.has(error.code ?? 0);
}

/** Determines whether an error is something the driver should attempt to retry */
export function isRetryableError(error: MongoError): boolean {
  return (
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    RETRYABLE_ERROR_CODES.has(error.code!) ||
    error instanceof MongoNetworkError ||
    !!error.message.match(/not master/) ||
    !!error.message.match(/node is recovering/)
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

function isRecoveringError(err: MongoError) {
  if (err.code && SDAM_RECOVERING_CODES.has(err.code)) {
    return true;
  }

  return err.message.match(/not master or secondary/) || err.message.match(/node is recovering/);
}

function isNotMasterError(err: MongoError) {
  if (err.code && SDAM_NOTMASTER_CODES.has(err.code)) {
    return true;
  }

  if (isRecoveringError(err)) {
    return false;
  }

  return err.message.match(/not master/);
}

export function isNodeShuttingDownError(err: MongoError): boolean {
  return !!(err.code && SDAM_NODE_SHUTTING_DOWN_ERROR_CODES.has(err.code));
}

/**
 * Determines whether SDAM can recover from a given error. If it cannot
 * then the pool will be cleared, and server state will completely reset
 * locally.
 *
 * @see https://github.com/mongodb/specifications/blob/master/source/server-discovery-and-monitoring/server-discovery-and-monitoring.rst#not-master-and-node-is-recovering
 */
export function isSDAMUnrecoverableError(error: MongoError): boolean {
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

export function isNetworkTimeoutError(err: MongoError): err is MongoNetworkError {
  return !!(err instanceof MongoNetworkError && err.message.match(/timed out/));
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

export function isResumableError(error?: MongoError, wireVersion?: number): boolean {
  if (error instanceof MongoNetworkError) {
    return true;
  }

  if (typeof wireVersion !== 'undefined' && wireVersion >= 9) {
    // DRIVERS-1308: For 4.4 drivers running against 4.4 servers, drivers will add a special case to treat the CursorNotFound error code as resumable
    if (error && error instanceof MongoError && error.code === 43) {
      return true;
    }
    return error instanceof MongoError && error.hasErrorLabel('ResumableChangeStreamError');
  }

  if (error && typeof error.code === 'number') {
    return GET_MORE_RESUMABLE_CODES.has(error.code);
  }
  return false;
}
